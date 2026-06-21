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

import functools
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


@functools.lru_cache(maxsize=None)
def _supports(colmap_bin: str, command: str, option: str) -> bool:
    """True if `colmap <command> --help` advertises <option>. Keeps us compatible
    with COLMAP builds that omit the GPU-SIFT options — e.g. headless conda-forge
    builds that ship CPU/VLFeat SIFT only and reject --SiftExtraction.use_gpu."""
    try:
        r = subprocess.run(
            [colmap_bin, command, "--help"], capture_output=True, text=True
        )
        return option in (r.stdout + r.stderr)
    except Exception:
        return False


@functools.lru_cache(maxsize=None)
def _has_subcommand(colmap_bin: str, command: str) -> bool:
    """True if this COLMAP build offers <command> (e.g. global_mapper — 4.x only)."""
    try:
        r = subprocess.run([colmap_bin, "help"], capture_output=True, text=True)
        return command in (r.stdout + r.stderr)
    except Exception:
        return False


def _gpu_opt(colmap_bin: str, command: str, candidates: list[str], value: str) -> list[str]:
    """Return [flag, value] using whichever GPU-toggle name this build advertises.
    The name changed across versions: newer COLMAP uses --FeatureExtraction /
    --FeatureMatching.use_gpu, older uses --SiftExtraction / --SiftMatching.use_gpu.
    Probing means a CUDA build actually gets the flag (and --no-gpu actually works)
    instead of us silently passing an unknown option and falling back to a default."""
    for opt in candidates:
        if _supports(colmap_bin, command, opt):
            return [opt, value]
    log.info("COLMAP advertises none of %s; leaving GPU at its build default", candidates)
    return []


def run_colmap(
    frames_dir: str,
    work_dir: str,
    *,
    camera_model: str = "OPENCV",
    matcher: str = "exhaustive",  # "exhaustive" (robust) | "sequential" (fast, ordered video)
    sfm: str = "incremental",     # "incremental" (robust) | "global" (GLOMAP, ~10-50x faster, COLMAP 4.x only)
    sift_use_gpu: bool = True,    # GPU SIFT runs headless on a CUDA COLMAP build (no X/display needed)
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
    feat_cmd = [
        colmap_bin, "feature_extractor",
        "--database_path", db,
        "--image_path", inp,
        "--ImageReader.single_camera", "1",
        "--ImageReader.camera_model", camera_model,
    ]
    feat_cmd += _gpu_opt(colmap_bin, "feature_extractor",
                         ["--FeatureExtraction.use_gpu", "--SiftExtraction.use_gpu"], use_gpu)
    _run(feat_cmd)

    # 2. feature matching ----------------------------------------------------
    matcher_cmd = {
        "exhaustive": "exhaustive_matcher",
        "sequential": "sequential_matcher",
    }[matcher]
    match_cmd = [colmap_bin, matcher_cmd, "--database_path", db]
    match_cmd += _gpu_opt(colmap_bin, matcher_cmd,
                          ["--FeatureMatching.use_gpu", "--SiftMatching.use_gpu"], use_gpu)
    _run(match_cmd)

    # 3. sparse reconstruction (SfM) → distorted/sparse/0 --------------------
    #    incremental = COLMAP's classic image-by-image mapper (robust, CPU-bound,
    #    the slow part of a big run). global = GLOMAP, merged into COLMAP 4.x as
    #    `global_mapper`: 1-2 orders of magnitude faster on many-frame captures,
    #    but needs decent focal priors. GPU does NOT materially speed up either
    #    (bundle adjustment is CPU unless Ceres is built with CUDA+cuDSS).
    sparse_distorted = os.path.join(distorted, "sparse")
    os.makedirs(sparse_distorted, exist_ok=True)
    use_global = sfm == "global" and _has_subcommand(colmap_bin, "global_mapper")
    if sfm == "global" and not use_global:
        log.warning("sfm='global' requested but this COLMAP build has no global_mapper "
                    "(needs 4.x) — falling back to the incremental mapper.")
    if use_global:
        _run([
            colmap_bin, "global_mapper",
            "--database_path", db,
            "--image_path", inp,
            "--output_path", sparse_distorted,
        ])
    else:
        _run([
            colmap_bin, "mapper",
            "--database_path", db,
            "--image_path", inp,
            "--output_path", sparse_distorted,
            "--Mapper.ba_global_function_tolerance=0.000001",
        ])
    # COLMAP can emit SEVERAL models (sparse/0, sparse/1, ...) when the video
    # fragments — and the numbering is by CREATION ORDER, so sparse/0 is NOT
    # guaranteed to be the biggest. Pick the model with the most registered
    # images (largest images.bin) so we never train on a tiny fragment.
    model_dirs = [
        d for d in glob.glob(os.path.join(sparse_distorted, "*"))
        if os.path.exists(os.path.join(d, "images.bin"))
    ]
    if not model_dirs:
        raise RuntimeError(
            "COLMAP mapper produced no reconstruction (no sparse/* model). "
            "The frames likely lack overlap/parallax — use slower camera motion "
            "with real translation, more frames, or matcher='sequential'."
        )
    model0 = max(model_dirs, key=lambda d: os.path.getsize(os.path.join(d, "images.bin")))
    log.info("COLMAP produced %d model(s); using the largest: %s", len(model_dirs), model0)

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
