#!/usr/bin/env python
# ============================================================================
#  LOCAL end-to-end test: frames → COLMAP → gsplat → scene.splat (+ scene.ply)
#  Runs the P4 reconstruction on YOUR GPU with NO Modal / NO Supabase.
#
#  Usage:
#      python pipeline/reconstruct_local.py --frames /path/to/frames --out ./out
#      python pipeline/reconstruct_local.py --frames ./frames --max-steps 7000 \
#             --matcher sequential
#
#  Then open ./out/scene.ply (or scene.splat) in the viewer to check the result.
#  See pipeline/README_RECONSTRUCTION.md for setup + how to get test frames.
# ============================================================================

import argparse
import logging
import os
import sys

# Allow `python pipeline/reconstruct_local.py` from the repo root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from steps.colmap import run_colmap          # noqa: E402
from steps.train_gsplat import train_gsplat  # noqa: E402
from steps.export import export_splat        # noqa: E402


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
    )
    ap = argparse.ArgumentParser(description="frames → COLMAP → gsplat → splat")
    ap.add_argument("--frames", required=True, help="directory of extracted frames (.jpg/.png)")
    ap.add_argument("--out", default="./out", help="output directory")
    ap.add_argument("--max-steps", type=int, default=7000, help="gsplat training iterations")
    ap.add_argument("--matcher", choices=["exhaustive", "sequential"], default="exhaustive",
                    help="exhaustive = robust; sequential = faster for ordered video frames")
    ap.add_argument("--no-gpu-colmap", action="store_true",
                    help="use CPU SIFT (headless boxes without an X/EGL context)")
    args = ap.parse_args()

    log = logging.getLogger("reconstruct")
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    log.info("[1/3] COLMAP …")
    colmap_dir = run_colmap(
        args.frames,
        os.path.join(out, "colmap"),
        matcher=args.matcher,
        sift_use_gpu=not args.no_gpu_colmap,
    )

    log.info("[2/3] gsplat training (%d steps) …", args.max_steps)
    ply = train_gsplat(args.frames, colmap_dir, os.path.join(out, "gsplat"),
                       max_steps=args.max_steps)

    log.info("[3/3] export …")
    final = export_splat(ply, os.path.join(out, "scene.splat"))

    log.info("DONE → %s", final)
    log.info("fallback .ply → %s", os.path.splitext(final)[0] + ".ply")


if __name__ == "__main__":
    main()
