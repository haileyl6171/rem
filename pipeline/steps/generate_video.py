# ============================================================================
#  STEP 2 — prompt (+ optional photos) → a video file.   [P3]
#  Calls the sponsor video API (Pika). Save the result to `out_path`.
# ============================================================================

import os
# import requests  # uncomment when implementing


def generate_video(prompt: str, image_paths: list[str], out_path: str) -> str:
    """
    Generate a short, COLMAP-friendly video.

    CONTRACT:
      in : prompt str, image_paths list[str] (may be empty), out_path str
      out: out_path (the saved .mp4)

    TODO(P3):
      1. POST prompt (+ first image as init frame, if provided) to the Pika API
         using os.environ["PIKA_API_KEY"].
      2. Poll Pika until the job is done (it's async too).
      3. Download the resulting mp4 to out_path.
      4. Aim for a slow orbit/dolly, a few seconds, decent resolution.

    Until implemented, you can drop a fixed sample.mp4 here so P4 can work on
    the COLMAP→gsplat half without waiting for generation.
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    raise NotImplementedError("Pika integration — P3")
    # return out_path
