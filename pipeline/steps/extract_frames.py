# ============================================================================
#  STEP 3 — video → image frames for COLMAP.   [P3]
#  Plain ffmpeg. Only used for VIDEO input; image-set input skips this.
# ============================================================================

import logging
import os
import subprocess

log = logging.getLogger(__name__)

_IMG_EXT = (".jpg", ".jpeg", ".png")


def extract_frames(video_path: str, frames_dir: str, fps: int = 12) -> str:
    """
    Sample frames from a video into frames_dir (creates it). Returns frames_dir.

    fps=12 is a good default: dense enough overlap for COLMAP, but NOT every
    frame — near-duplicate 30/60fps frames have ~zero baseline, which makes
    bundle adjustment ill-conditioned (the CHOLMOD failures) and slow. Raise
    fps only if the camera moved fast; 10–15 is the sweet spot.
    """
    os.makedirs(frames_dir, exist_ok=True)  # ffmpeg won't create this itself
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"fps={fps}",
            os.path.join(frames_dir, "frame_%05d.jpg"),
        ],
        check=True,
    )
    n = len([f for f in os.listdir(frames_dir) if f.lower().endswith(_IMG_EXT)])
    log.info("extracted %d frames at %d fps → %s", n, fps, frames_dir)
    if n == 0:
        raise RuntimeError(
            f"ffmpeg produced no frames from {video_path} — check the file is a valid video."
        )
    return frames_dir
