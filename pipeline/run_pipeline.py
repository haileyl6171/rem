# ============================================================================
#  THE RECIPE — input → generation → COLMAP → gsplat → scene.ply.   [P3 + P4]
#  A plain sequential script (not an agent). After each stage it writes status
#  to the DB so the browser's progress bar can move.
#
#  GENERATE (P3 agent front-end):
#    • video      → restyled to the memory's look (Pika fix-my-look), geometry kept
#    • photo/text → coherent prompt (persona agents) → video (Veo 3)
#  RECONSTRUCT (P4): frames → COLMAP → gsplat → scene.ply → Storage.
#
#  NOTE: the reconstruction steps (run_colmap / train_gsplat / export_splat /
#  extract_frames) are the SAME functions the standalone pipeline runs — this
#  file only wraps them with generation + DB status + Storage upload.
# ============================================================================

import logging
import os
import shutil

import db
import media
import storage
from agents import fix_look
from agents import music
from steps.compose_scene import compose_scene
from steps.generate_video import generate_video
from steps.extract_frames import extract_frames
from steps.colmap import run_colmap
from steps.train_gsplat import train_gsplat
from steps.export import export_splat

log = logging.getLogger(__name__)


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
    """(video | photo | text) → scene.ply in Storage → status=READY in the DB."""
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

        # Optional: an LLM picks scene-appropriate music (Pika MCP) and lays it
        # under the clip. No-op unless Pika MCP is enabled. (COLMAP uses frames,
        # so audio doesn't affect reconstruction — this scores the memory video.)
        scored = music.score_video(
            video_path, description, analysis, prompt, out_path=f"{work}/scored.mp4"
        )
        if scored:
            video_path = scored

        frames_dir = extract_frames(video_path, frames_dir=f"{work}/frames")  # all frames

        # ---- RECONSTRUCT: frames → COLMAP poses ---------------------------
        #  GPU SIFT matching runs headless on a CUDA colmap build; high_quality
        #  forces CPU DSP-SIFT for EXTRACTION (slower, better). sequential matcher
        #  because frames are an ordered video.
        db.set_status(memory_id, "RECONSTRUCTING", progress=40)
        colmap_dir = run_colmap(
            frames_dir, os.path.join(work, "colmap"),
            matcher="sequential", high_quality=True, sift_use_gpu=True,
        )

        # ---- TRAIN → export → upload --------------------------------------
        db.set_status(memory_id, "TRAINING", progress=60)
        model = train_gsplat(frames_dir, colmap_dir, os.path.join(work, "gsplat"), max_steps=30000)
        scene = export_splat(model, os.path.join(work, "scene.ply"))

        key = f"memories/{memory_id}/scene.ply"   # Contract D path (verified .ply)
        storage.upload(scene, key)
        db.set_ready(memory_id, storage.public_url(key))

    except Exception as e:  # noqa: BLE001 — surface ANY failure to the user
        db.set_failed(memory_id, str(e))
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)
