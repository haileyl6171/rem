# ============================================================================
#  STEP 2 — creative prompt (+ optional photos) → a video file.   [P3]
#  Delegates to the guarded Veo 3 client (pipeline/veo.py). The actual API call
#  is gated behind VEO_ENABLED so this is a no-op cost until it's turned on.
#
#  Division of labour: Pika (pika-mcp, agent-side) owns the CREATIVE VISION that
#  produced `prompt`; Veo 3 renders it here.
# ============================================================================

import veo


def generate_video(prompt: str, image_paths: list[str], out_path: str) -> str:
    """
    Generate a short, COLMAP-friendly video (slow orbit/dolly, a few seconds).

    CONTRACT:
      in : prompt str, image_paths list[str] (may be empty), out_path str
      out: out_path (the saved .mp4)

    Uses the first input photo as Veo's start frame when one is provided (else
    pure text-to-video). Raises veo.VeoDisabled if VEO_ENABLED != 1 — the
    upstream creative prompt + persona work has already succeeded by then, so
    only rendering is blocked.
    """
    init_image = image_paths[0] if image_paths else None
    return veo.generate_reference_video(prompt, init_image, out_path)
