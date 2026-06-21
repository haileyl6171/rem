# ============================================================================
#  THE RECIPE — input → COLMAP → gsplat → scene.ply.   [P3]
#  A plain sequential script (not an agent). After each stage it writes status
#  to the DB so the browser's progress bar can move.
#
#  Accepts THREE input shapes (detected from the uploaded files):
#    • a video           → split into frames
#    • a set of images    → used directly as frames
#    • text only / 1 image → GENERATE a video with Pika, then split into frames
# ============================================================================

import logging
import os
import shutil

import db
import storage
from steps.make_prompt import make_prompt
from steps.generate_video import generate_video
from steps.extract_frames import extract_frames
from steps.colmap import run_colmap
from steps.train_gsplat import train_gsplat
from steps.export import export_splat

log = logging.getLogger(__name__)

_VIDEO_EXT = (".mp4", ".mov", ".m4v", ".avi", ".webm")
_IMG_EXT = (".jpg", ".jpeg", ".png")


def run_pipeline(memory_id: str, input_keys: list[str], description: str) -> None:
    """(video | images | text) → scene.ply in Storage → status=READY in the DB."""
    work = f"/tmp/{memory_id}"
    frames_dir = os.path.join(work, "frames")
    os.makedirs(work, exist_ok=True)

    try:
        # ---- GET FRAMES: branch on what the user actually gave us -----------
        db.set_status(memory_id, "GENERATING", progress=10)
        local = [storage.download(k, os.path.join(work, "inputs")) for k in input_keys]
        videos = [p for p in local if p.lower().endswith(_VIDEO_EXT)]
        images = [p for p in local if p.lower().endswith(_IMG_EXT)]

        if videos:                                   # VIDEO input
            extract_frames(videos[0], frames_dir, fps=12)
        elif len(images) >= 8:                       # IMAGE-SET input (enough to reconstruct)
            os.makedirs(frames_dir, exist_ok=True)
            for p in images:
                shutil.copy2(p, frames_dir)
            log.info("using %d uploaded images directly as frames", len(images))
        else:                                        # TEXT / too-few images → GENERATE
            prompt = make_prompt(description)
            video = generate_video(prompt, images, out_path=os.path.join(work, "generated.mp4"))
            extract_frames(video, frames_dir, fps=12)

        # ---- RECONSTRUCT (COLMAP is headless on Modal → CPU SIFT) ----------
        db.set_status(memory_id, "RECONSTRUCTING", progress=40)
        colmap_dir = run_colmap(
            frames_dir, os.path.join(work, "colmap"),
            matcher="sequential", sift_use_gpu=False,
        )

        # ---- TRAIN → export → upload --------------------------------------
        db.set_status(memory_id, "TRAINING", progress=60)
        model = train_gsplat(frames_dir, colmap_dir, os.path.join(work, "gsplat"))
        scene = export_splat(model, os.path.join(work, "scene.ply"))   # CONTRACT D: scene.ply

        key = f"memories/{memory_id}/scene.ply"
        storage.upload(scene, key)
        db.set_ready(memory_id, storage.public_url(key))

    except Exception as e:  # noqa: BLE001 — surface ANY failure to the user
        db.set_failed(memory_id, str(e))
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)
