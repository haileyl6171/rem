# ============================================================================
#  Shared Gemini client for the agent layer.
#
#  One client, one model, two helpers: free-text and strict-JSON completions.
#  Each "subagent" is just a focused system prompt fed through here. Gemini is
#  multimodal, so the same helpers take optional local image paths (used by the
#  one-time Photo Analyzer in agents/vision.py).
# ============================================================================

import json
import mimetypes
import os
import re

from google import genai
from google.genai import types

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Default to a fast, capable, multimodal Gemini model; override with GEMINI_MODEL.
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Bound per-call vision cost: only the first few photos shape the persona.
_MAX_IMAGES = 6
_DEFAULT_MEDIA_TYPE = "image/jpeg"

# These are mechanical extraction tasks, so turn Gemini's "thinking" off for
# predictable output within the token budget (flash supports a 0 budget; a Pro
# model needs >=128, so bump this if you switch GEMINI_MODEL to a Pro variant).
_THINKING = types.ThinkingConfig(thinking_budget=0)


def _image_part(path: str):
    """Read a local image into a Gemini Part, or None if unreadable."""
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return None
    media_type = mimetypes.guess_type(path)[0] or _DEFAULT_MEDIA_TYPE
    if not media_type.startswith("image/"):
        media_type = _DEFAULT_MEDIA_TYPE
    return types.Part.from_bytes(data=data, mime_type=media_type)


def _contents(user: str, images: list[str] | None):
    """Plain string when there are no images; a list of parts otherwise."""
    if not images:
        return user
    parts = []
    for p in images[:_MAX_IMAGES]:
        part = _image_part(p)
        if part:
            parts.append(part)
    if not parts:
        return user
    parts.append(types.Part.from_text(text=user))
    return parts


def complete_text(
    system: str, user: str, max_tokens: int = 1024, images: list[str] | None = None
) -> str:
    """
    Plain text completion. Returns the model's text, stripped.
    Pass `images` (local file paths) to let Gemini SEE them alongside the prompt.
    """
    resp = _client.models.generate_content(
        model=MODEL,
        contents=_contents(user, images),
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            thinking_config=_THINKING,
        ),
    )
    return (resp.text or "").strip()


def complete_json(
    system: str, user: str, max_tokens: int = 2048, images: list[str] | None = None
) -> dict | list:
    """
    JSON completion. Asks Gemini for a JSON response and parses it. Tolerates
    ```json fences and surrounding prose by extracting the outermost JSON value.
    Raises ValueError if nothing parseable comes back.
    Pass `images` (local file paths) to ground the JSON in what Gemini sees.
    """
    resp = _client.models.generate_content(
        model=MODEL,
        contents=_contents(user, images),
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
            thinking_config=_THINKING,
        ),
    )
    return _parse_json(resp.text or "")


def _parse_json(raw: str) -> dict | list:
    raw = raw.strip()
    # Strip a leading ```json / ``` fence if the model added one anyway.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: grab the first {...} or [...] span.
        m = re.search(r"(\{.*\}|\[.*\])", raw, re.DOTALL)
        if not m:
            raise ValueError(f"No JSON found in model output: {raw[:200]!r}")
        return json.loads(m.group(1))
