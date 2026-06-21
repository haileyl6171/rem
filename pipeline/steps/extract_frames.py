# ============================================================================
#  STEP 3 — video → image frames for COLMAP.   [P3]
#  Plain ffmpeg. Only used for VIDEO input; image-set input skips this.
# ============================================================================

import glob
import logging
import os
import subprocess

log = logging.getLogger(__name__)

_IMG_EXT = (".jpg", ".jpeg", ".png")


def extract_frames(video_path: str, frames_dir: str, fps: int | None = None) -> str:
    """
    Extract frames from a video into frames_dir (creates it). Returns frames_dir.

    fps=None (default) keeps EVERY frame. Maximum overlap between consecutive
    views is what COLMAP needs to chain them; sparse sampling (e.g. 12 fps) leaves
    too little overlap on normal handheld motion, so frames fail to match and you
    get gaps / unregistered images. The cost of all-frames is speed (more images
    to match + map) — video defaults to `--matcher sequential`, and `--sfm global`
    (COLMAP 4.x) helps further. Pass an integer fps to downsample only if a run is
    too slow.

    `-q:v 2` writes high-quality JPEGs (less compression noise → sharper, more
    matchable SIFT features).
    """
    os.makedirs(frames_dir, exist_ok=True)  # ffmpeg won't create this itself
    for stale in glob.glob(os.path.join(frames_dir, "*")):   # clear a previous run's frames
        if stale.lower().endswith(_IMG_EXT):                 # (old naming/fps) so they don't mix in
            os.remove(stale)
    cmd = ["ffmpeg", "-y", "-i", video_path]
    if fps:
        cmd += ["-vf", f"fps={fps}"]
    cmd += ["-q:v", "2", os.path.join(frames_dir, "frame_%05d.jpg")]
    subprocess.run(cmd, check=True)

    n = len([f for f in os.listdir(frames_dir) if f.lower().endswith(_IMG_EXT)])
    log.info("extracted %d frames (%s) → %s", n, f"{fps} fps" if fps else "all frames", frames_dir)
    if n == 0:
        raise RuntimeError(
            f"ffmpeg produced no frames from {video_path} — check the file is a valid video."
        )
    return frames_dir
