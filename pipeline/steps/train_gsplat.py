# ============================================================================
#  STEP 5 — COLMAP dataset → trained 3D Gaussian Splat (gsplat).   [P4]
#
#  We shell out to gsplat's official examples/simple_trainer.py with the
#  `default` densification strategy (the maintained, battle-tested trainer)
#  rather than reimplementing the training loop. It loads the COLMAP data,
#  trains, and exports a standard 3DGS .ply.
#
#  SETUP (local + Modal) — you need the gsplat repo's examples on disk:
#      pip install gsplat                                   # CUDA lib (after torch)
#      git clone https://github.com/nerfstudio-project/gsplat vendor/gsplat
#      pip install -r vendor/gsplat/examples/requirements.txt
#  Point GSPLAT_REPO at the clone (defaults to ./vendor/gsplat).
#
#  Verified flags (gsplat main): `default` subcommand, --data_dir, --data_factor,
#  --result_dir, --max_steps, --save_ply, --ply_steps, --save_steps,
#  --eval_steps, --disable_viewer. PLY is written to
#  {result_dir}/ply/point_cloud_{step}.ply.
# ============================================================================

import glob
import logging
import os
import subprocess
import sys

log = logging.getLogger(__name__)


def _simple_trainer_path() -> str:
    repo = os.environ.get("GSPLAT_REPO", os.path.join(os.getcwd(), "vendor", "gsplat"))
    path = os.path.join(repo, "examples", "simple_trainer.py")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"simple_trainer.py not found at {path}. Clone gsplat and/or set "
            "GSPLAT_REPO:  git clone https://github.com/nerfstudio-project/gsplat vendor/gsplat"
        )
    return path


def train_gsplat(
    frames_dir: str,      # unused — colmap_dir already holds the undistorted images/
    colmap_dir: str,      # output of run_colmap: has images/ + sparse/0/
    out_dir: str,
    *,
    max_steps: int = 7000,   # 7k looks great + ~4x cheaper than 30k; raise for more quality
    data_factor: int = 1,    # 1 → train on full-res images/ (we already undistorted there)
    python_bin: str = sys.executable,
) -> str:
    """Train and return the path to the exported .ply of gaussians."""
    os.makedirs(out_dir, exist_ok=True)
    trainer = _simple_trainer_path()

    cmd = [
        python_bin, trainer, "default",
        "--data_dir", os.path.abspath(colmap_dir),
        "--data_factor", str(data_factor),
        "--result_dir", os.path.abspath(out_dir),
        "--max_steps", str(max_steps),
        "--save_ply",
        "--ply_steps", str(max_steps),   # ensure a .ply is written at the FINAL step
        "--save_steps", str(max_steps),
        "--eval_steps", "-1",            # no held-out eval split for our captures
        "--disable_viewer",              # headless
    ]
    log.info("gsplat ▸ %s", " ".join(cmd))
    # cwd = examples/ so simple_trainer's relative imports (datasets, utils) resolve.
    subprocess.run(cmd, check=True, cwd=os.path.dirname(trainer))

    plys = sorted(glob.glob(os.path.join(out_dir, "ply", "point_cloud_*.ply")))
    if not plys:
        raise RuntimeError(
            f"No .ply under {out_dir}/ply. Check the trainer log; ensure --save_ply "
            "and --ply_steps matched --max_steps for your gsplat version."
        )
    log.info("trained ply: %s", plys[-1])
    return plys[-1]
