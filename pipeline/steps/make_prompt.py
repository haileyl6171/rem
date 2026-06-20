# ============================================================================
#  STEP 1 — journal text → a video-generation prompt.   [P3]
#  The ONLY "AI text" call in the core pipeline. Not an agent: one API call.
#
#  Goal: turn a freeform journal entry into a prompt that makes Pika produce
#  footage that reconstructs well (slow camera motion, consistent geometry,
#  parallax — NOT fast cuts or wild motion).
# ============================================================================

import os
from anthropic import Anthropic  # pip: anthropic

_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Model per the claude-api guidance: default to claude-opus-4-8.
_MODEL = "claude-opus-4-8"

_SYSTEM = (
    "You convert a personal journal entry into a single, vivid prompt for a "
    "text-to-video model. The video will be fed to photogrammetry (COLMAP) to "
    "build a 3D scene, so the described shot MUST be a slow, smooth camera move "
    "(gentle dolly or orbit) through a coherent, static environment with strong "
    "parallax. No fast motion, no cuts, no people moving. Describe the place, "
    "light, and mood. Return ONLY the prompt text, no preamble."
)


def make_prompt(description: str) -> str:
    """description -> a single video-generation prompt string."""
    if not description.strip():
        description = "a quiet, memorable place"

    resp = _client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        system=_SYSTEM,
        messages=[{"role": "user", "content": description}],
    )
    # resp.content is a list of blocks; grab the text.
    return "".join(b.text for b in resp.content if b.type == "text").strip()
