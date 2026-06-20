# ============================================================================
#  STEP 3 — video → image frames for COLMAP.   [P3]
#  Plain ffmpeg. This is the handoff to P4 (frames live at CONTRACT D path).
# ============================================================================

import os
import subprocess


def extract_frames(video_path: str, frames_dir: str, fps: int = 4) -> str:
    """
    Sample frames from the video.

    CONTRACT:
      in : video_path str, frames_dir str
      out: frames_dir (now full of frame_0001.jpg, frame_0002.jpg, ...)

    Notes:
      • ~2–6 fps is usually right — enough overlap for COLMAP, not too many.
      • Tune fps for reconstruction quality vs. training time.
    """
    os.makedirs(frames_dir, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", f"fps={fps}",
            os.path.join(frames_dir, "frame_%04d.jpg"),
        ],
        check=True,
    )
    return frames_dir
