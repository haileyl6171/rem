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
import media
import storage
from agents import fix_look
from steps.compose_scene import compose_scene
from steps.generate_video import generate_video
from steps.extract_frames import extract_frames
from steps.colmap import run_colmap
from steps.train_gsplat import train_gsplat
from steps.export import export_splat


def _look_from_analysis(analysis: dict) -> str:
    """Distill the memory's persona look (palette/lighting/mood/motifs) into a
    short style instruction for fix-my-look — the LOOK, not the scene."""
    palette = ", ".join((analysis.get("palette") or [])[:4])
    motifs = ", ".join((analysis.get("motifs") or [])[:3])
    parts = [
        analysis.get("lighting"),
        f"{palette} palette" if palette else None,
        analysis.get("mood"),
        motifs or None,
    ]
    look = "; ".join(p for p in parts if p)
    return look or "a warm, cinematic, gently nostalgic grade"


def run_pipeline(memory_id: str, input_keys: list[str], description: str) -> None:
    """text/photos  →  scene.splat in Storage  →  status=READY in the DB."""
    work = f"/tmp/{memory_id}"
    os.makedirs(work, exist_ok=True)

    try:
        # ---- GENERATE: journal → coherent prompt → video → frames ----------
        db.set_status(memory_id, "GENERATING", progress=10)
        input_paths = [storage.download(k, work) for k in input_keys]
        photo_paths = [p for p in input_paths if media.is_image(p)]
        video_paths = [p for p in input_paths if media.is_video(p)]
        video_keys = [k for k in input_keys if media.is_video(k)]

        # Vision grounding: photos directly, or a still pulled from the video so
        # a video-only memory still feeds the persona layer.
        vision_inputs = list(photo_paths)
        if not photo_paths and video_paths:
            frame = media.extract_first_frame(video_paths[0], f"{work}/vision_frame.jpg")
            if frame:
                vision_inputs.append(frame)

        # Agent layer: analyze past memories, evolve the persona, and compose a
        # prompt/creative look that keeps this scene coherent with the person's
        # world. Caches this memory's scene analysis for future runs.
        prompt, analysis = compose_scene(description, vision_inputs, memory_id)
        db.save_analysis(memory_id, analysis)

        if video_paths:
            # VIDEO modality: restyle the user's clip to the memory's LOOK
            # (palette/lighting/mood), preserving its geometry + camera motion,
            # with Pika fix-my-look. If that's off or fails, fall back to the raw
            # clip — video still reconstructs.
            styled = fix_look.fix_look(
                storage.public_url(video_keys[0]),
                _look_from_analysis(analysis),
                out_path=f"{work}/generated.mp4",
            )
            video_path = styled or video_paths[0]
        else:
            # PHOTO/TEXT modality: synthesize a video with Veo 3.
            video_path = generate_video(
                prompt, photo_paths, out_path=f"{work}/generated.mp4"
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
