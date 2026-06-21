#!/usr/bin/env python
# ============================================================================
#  LOCAL end-to-end test: (video OR images) → COLMAP → gsplat → scene.ply
#  Runs the P4 reconstruction on YOUR GPU, no Modal / no Supabase.
#
#  Two input modes:
#    --video FILE   a video clip      → split into frames (ffmpeg) → reconstruct
#    --images DIR   a folder of stills → used directly as frames → reconstruct
#
#  Examples:
#    python pipeline/reconstruct_local.py --video my.mp4   --out ./out
#    python pipeline/reconstruct_local.py --images ./pics  --out ./out
#    python pipeline/reconstruct_local.py --video my.mp4   --fps 15 --max-steps 7000
#
#  Output (the one artifact to view): ./out/scene.ply
#  Setup: bash pipeline/setup_env.sh   (see pipeline/README_RECONSTRUCTION.md)
# ============================================================================

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # allow `python pipeline/reconstruct_local.py`

from steps.extract_frames import extract_frames  # noqa: E402
from steps.colmap import run_colmap              # noqa: E402
from steps.train_gsplat import train_gsplat      # noqa: E402
from steps.export import export_splat            # noqa: E402


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
    )
    ap = argparse.ArgumentParser(description="(video|images) → COLMAP → gsplat → scene.ply")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--video", help="a video file → split into frames")
    src.add_argument("--images", help="a folder of input images → used directly")
    src.add_argument("--frames", help="alias for --images (a folder of frames)")
    ap.add_argument("--out", default="./out", help="output directory")
    ap.add_argument("--fps", type=int, default=12, help="frames/sec to sample from --video")
    ap.add_argument("--max-steps", type=int, default=7000, help="gsplat training iterations")
    ap.add_argument("--matcher", choices=["exhaustive", "sequential"], default=None,
                    help="default: sequential for --video, exhaustive for --images")
    ap.add_argument("--sfm", choices=["incremental", "global"], default="incremental",
                    help="incremental (robust default) | global (GLOMAP, ~10-50x faster; needs COLMAP 4.x)")
    ap.add_argument("--no-gpu-colmap", action="store_true",
                    help="force CPU SIFT (GPU SIFT otherwise runs headless on a CUDA colmap build)")
    args = ap.parse_args()

    log = logging.getLogger("reconstruct")
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    # ---- resolve the input → a frames directory ----------------------------
    images_dir = args.images or args.frames
    if args.video:
        log.info("[1/4] extracting frames from video (%d fps) …", args.fps)
        frames_dir = extract_frames(args.video, os.path.join(out, "frames"), fps=args.fps)
        matcher = args.matcher or "sequential"   # ordered video → neighbour matching
    else:
        if not os.path.isdir(images_dir):
            ap.error(f"--images dir not found: {images_dir}")
        frames_dir = images_dir
        matcher = args.matcher or "exhaustive"    # unordered stills → all-pairs
        log.info("[1/4] using %s as the input frames", frames_dir)

    # ---- COLMAP → gsplat → export -----------------------------------------
    log.info("[2/4] COLMAP (matcher=%s) …", matcher)
    colmap_dir = run_colmap(frames_dir, os.path.join(out, "colmap"),
                            matcher=matcher, sfm=args.sfm,
                            sift_use_gpu=not args.no_gpu_colmap)

    log.info("[3/4] gsplat training (%d steps) …", args.max_steps)
    ply = train_gsplat(frames_dir, colmap_dir, os.path.join(out, "gsplat"),
                       max_steps=args.max_steps)

    log.info("[4/4] export …")
    final = export_splat(ply, os.path.join(out, "scene.ply"))
    log.info("DONE → %s", final)


if __name__ == "__main__":
    main()
