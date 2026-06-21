# ============================================================================
#  Veo 3 client — the ONLY place paid video generation lives.
#
#  The CREATIVE VISION (what the shot should be) is authored upstream by an LLM
#  driving the Pika MCP server (see agents/creative.py). This module is purely
#  the renderer: it takes the finished creative prompt (+ the first photo as a
#  start frame) and asks Google Veo 3 to generate the video.
#
#  Veo runs through the SAME google-genai SDK + GEMINI_API_KEY the agent layer
#  already uses, so the whole pipeline needs just one model SDK.
#
#  Generation spends money, so it stays gated behind VEO_ENABLED:
#    • is_enabled()               → False while unset/0
#    • generate_reference_video() → raises VeoDisabled (the pipeline catches it)
#
#  To turn video on: set VEO_ENABLED=1 (GEMINI_API_KEY is already required).
# ============================================================================

import os
import time

# Veo model id on the Gemini API; override with VEO_MODEL (e.g. a -fast variant).
_VEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.0-generate-001")

# Keep the shot photogrammetry-friendly: COLMAP needs a slow, smooth move through
# a static scene, never cuts or fast motion.
_NEGATIVE_PROMPT = "fast motion, camera shake, hard cuts, scene transitions, moving people, motion blur"


class VeoDisabled(RuntimeError):
    """Raised when a paid Veo call is attempted while VEO_ENABLED is off."""


def is_enabled() -> bool:
    return os.environ.get("VEO_ENABLED", "0") == "1"


def generate_reference_video(
    prompt: str,
    init_image_path: str | None,
    out_path: str,
) -> str:
    """Generate a video to out_path via Veo 3. Raises VeoDisabled if off.

    The first input photo (when present) is used as Veo's start frame so the
    scene matches the user's actual memory; otherwise it's pure text-to-video.
    """
    if not is_enabled():
        raise VeoDisabled(
            "Video generation is disabled (VEO_ENABLED != 1). "
            "The creative prompt was composed successfully; enable it to render."
        )

    # Imported lazily so personalization-only runs don't pay the import cost.
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    image = None
    if init_image_path:
        with open(init_image_path, "rb") as f:
            mime = "image/png" if init_image_path.lower().endswith(".png") else "image/jpeg"
            image = types.Image(image_bytes=f.read(), mime_type=mime)

    operation = client.models.generate_videos(
        model=_VEO_MODEL,
        prompt=prompt,
        image=image,
        config=types.GenerateVideosConfig(
            aspect_ratio="16:9",
            number_of_videos=1,
            negative_prompt=_NEGATIVE_PROMPT,
        ),
    )

    # Veo is async: poll the long-running operation until the video is ready.
    while not operation.done:
        time.sleep(10)
        operation = client.operations.get(operation)

    if operation.error:
        raise RuntimeError(f"Veo generation failed: {operation.error}")

    videos = (operation.response.generated_videos or [])
    if not videos:
        raise RuntimeError("Veo returned no video")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    video = videos[0].video
    client.files.download(file=video)
    video.save(out_path)
    return out_path
