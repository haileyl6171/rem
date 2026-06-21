# ============================================================================
#  THE RECIPE — runs the steps in order. This is the "pipeline."
#  Owned by P3 (skeleton) with steps filled in by P3 (generation) + P4 (3D).
#
#  It is a PLAIN SCRIPT, not an agent: each line feeds the next, top to bottom.
#  After each stage it writes status to the DB so the browser's bar can move.
# ============================================================================

import os
import shutil

import db
import storage
from steps.compose_scene import compose_scene
from steps.generate_video import generate_video
from steps.extract_frames import extract_frames
from steps.colmap import run_colmap
from steps.train_gsplat import train_gsplat
from steps.export import export_splat


def run_pipeline(memory_id: str, input_keys: list[str], description: str) -> None:
    """text/photos  →  scene.splat in Storage  →  status=READY in the DB."""
    work = f"/tmp/{memory_id}"
    os.makedirs(work, exist_ok=True)

    try:
        # ---- GENERATE: journal → coherent prompt → video → frames ----------
        db.set_status(memory_id, "GENERATING", progress=10)
        image_paths = [storage.download(k, work) for k in input_keys]

        # Agent layer: analyze past memories (Gemini reads the new photos
        # directly for grounding), evolve the persona, and compose a prompt that
        # keeps this scene coherent with the person's world. Caches this memory's
        # scene analysis for future runs. (No Pika/fal credits used here.)
        prompt, analysis = compose_scene(description, image_paths, memory_id)
        db.save_analysis(memory_id, analysis)

        video_path = generate_video(                          # [P3] Pika
            prompt, image_paths, out_path=f"{work}/generated.mp4"
        )
        frames_dir = extract_frames(                          # [P3] ffmpeg
            video_path, frames_dir=f"{work}/frames"
        )

        # ---- RECONSTRUCT: frames → camera poses ---------------------------
        db.set_status(memory_id, "RECONSTRUCTING", progress=40)
        colmap_dir = run_colmap(frames_dir, work_dir=f"{work}/colmap")  # [P4]

        # ---- TRAIN: poses → gaussian splat → .splat -----------------------
        db.set_status(memory_id, "TRAINING", progress=60)
        model_path = train_gsplat(                            # [P4]
            frames_dir, colmap_dir, out_dir=f"{work}/gsplat"
        )
        splat_path = export_splat(model_path, out_path=f"{work}/scene.splat")  # [P4]

        # ---- PUBLISH: upload + mark READY ---------------------------------
        key = f"memories/{memory_id}/scene.splat"             # CONTRACT D path
        storage.upload(splat_path, key)
        splat_url = storage.public_url(key)
        db.set_ready(memory_id, splat_url)

    except Exception as e:  # noqa: BLE001 — surface ANY failure to the user
        db.set_failed(memory_id, str(e))
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)  # the machine dies anyway; tidy up
