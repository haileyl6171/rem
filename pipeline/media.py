# ============================================================================
#  Media modality helpers — tell photos from videos, and pull a still from a
#  video so the (image-based) vision/persona layer still has something to see.
# ============================================================================

import os
import subprocess

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"}


def _ext(path: str) -> str:
    return os.path.splitext(path)[1].lower()


def is_image(path: str) -> bool:
    return _ext(path) in IMAGE_EXTS


def is_video(path: str) -> bool:
    return _ext(path) in VIDEO_EXTS


def extract_first_frame(video_path: str, out_path: str) -> str | None:
    """Grab a single representative frame from a video (for the vision pass).
    Returns the jpg path, or None if ffmpeg can't read it."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-frames:v", "1", "-q:v", "2", out_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return out_path if os.path.exists(out_path) else None
