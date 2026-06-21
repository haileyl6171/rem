# ============================================================================
#  STEP 4 — frames → COLMAP camera poses + sparse point cloud.   [P4]
#
#  Produces the canonical 3DGS / gsplat dataset layout under <work_dir>:
#
#      <work_dir>/
#        input/              raw frames (staged in)
#        distorted/          intermediate COLMAP db + distorted sparse model
#        images/             UNDISTORTED images        ← gsplat trains on these
#        sparse/0/           cameras.bin, images.bin, points3D.bin  ← + these
#
#  This mirrors the reference INRIA gaussian-splatting `convert.py`, and the
#  result loads directly with gsplat's COLMAP parser
#  (examples/datasets/colmap.py), which expects `images/` + `sparse/0/`.
#
#  Requires the COLMAP BINARY on PATH (a system package, NOT pip):
#      Ubuntu:  apt install colmap          (build w/ CUDA for GPU SIFT)
#      macOS:   brew install colmap
#  (The `pycolmap` in gsplat's requirements only READS colmap files — it does
#   not run reconstruction.)
# ============================================================================

import glob
import logging
import os
import shutil
import subprocess

log = logging.getLogger(__name__)

_IMG_EXT = (".jpg", ".jpeg", ".png")


def _run(cmd: list[str]) -> None:
    log.info("colmap ▸ %s", " ".join(cmd))
    subprocess.run(cmd, check=True)


def run_colmap(
    frames_dir: str,
    work_dir: str,
    *,
    camera_model: str = "OPENCV",
    matcher: str = "exhaustive",  # "exhaustive" (robust) | "sequential" (fast, ordered video)
    sift_use_gpu: bool = True,    # set False on headless boxes w/o an X/EGL context (e.g. Modal)
    colmap_bin: str = "colmap",
) -> str:
    """
    frames_dir  → <work_dir> containing images/ + sparse/0/.  Returns work_dir
    (the data_dir you hand to gsplat).
    """
    use_gpu = "1" if sift_use_gpu else "0"
    src = os.path.abspath(work_dir)
    inp = os.path.join(src, "input")
    distorted = os.path.join(src, "distorted")
    db = os.path.join(distorted, "database.db")
    os.makedirs(inp, exist_ok=True)
    os.makedirs(distorted, exist_ok=True)

    # 0. stage frames into <work>/input -------------------------------------
    frames = sorted(
        f for f in glob.glob(os.path.join(frames_dir, "*"))
        if f.lower().endswith(_IMG_EXT)
    )
    if len(frames) < 8:
        raise RuntimeError(
            f"Only {len(frames)} frames in {frames_dir}; COLMAP needs ~20+ "
            "overlapping frames with parallax to reconstruct."
        )
    for f in frames:
        dst = os.path.join(inp, os.path.basename(f))
        if not os.path.exists(dst):
            shutil.copy2(f, dst)
    log.info("staged %d frames", len(frames))

    # 1. feature extraction (one shared camera, OPENCV distortion model) -----
    _run([
        colmap_bin, "feature_extractor",
        "--database_path", db,
        "--image_path", inp,
        "--ImageReader.single_camera", "1",
        "--ImageReader.camera_model", camera_model,
        "--SiftExtraction.use_gpu", use_gpu,
    ])

    # 2. feature matching ----------------------------------------------------
    matcher_cmd = {
        "exhaustive": "exhaustive_matcher",
        "sequential": "sequential_matcher",
    }[matcher]
    _run([
        colmap_bin, matcher_cmd,
        "--database_path", db,
        "--SiftMatching.use_gpu", use_gpu,
    ])

    # 3. sparse reconstruction (SfM) → distorted/sparse/0 --------------------
    sparse_distorted = os.path.join(distorted, "sparse")
    os.makedirs(sparse_distorted, exist_ok=True)
    _run([
        colmap_bin, "mapper",
        "--database_path", db,
        "--image_path", inp,
        "--output_path", sparse_distorted,
        "--Mapper.ba_global_function_tolerance=0.000001",
    ])
    model0 = os.path.join(sparse_distorted, "0")
    if not os.path.exists(os.path.join(model0, "cameras.bin")):
        raise RuntimeError(
            "COLMAP mapper produced no reconstruction (distorted/sparse/0 missing). "
            "The frames likely lack overlap/parallax — use slower camera motion, "
            "more frames, or try matcher='sequential'."
        )

    # 4. undistort → images/ + sparse/, then move sparse/* → sparse/0/ -------
    _run([
        colmap_bin, "image_undistorter",
        "--image_path", inp,
        "--input_path", model0,
        "--output_path", src,
        "--output_type", "COLMAP",
    ])
    final_sparse = os.path.join(src, "sparse")
    final_sparse0 = os.path.join(final_sparse, "0")
    os.makedirs(final_sparse0, exist_ok=True)
    for fn in os.listdir(final_sparse):
        if fn == "0":
            continue
        shutil.move(os.path.join(final_sparse, fn), os.path.join(final_sparse0, fn))

    n_imgs = len(os.listdir(os.path.join(src, "images")))
    log.info("COLMAP done — %d undistorted images, model at %s", n_imgs, final_sparse0)
    return src
