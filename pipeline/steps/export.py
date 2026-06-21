# ============================================================================
#  STEP 6 — trained gaussians (.ply) → web-viewer file.   [P4]
#
#  gsplat already exports a standard 3D Gaussian Splatting .ply. The web viewer
#  (@mkkellogg/gaussian-splats-3d) loads .ply directly, so the SAFE output is the
#  .ply. We also convert to the compact `.splat` binary (~half the size, also
#  supported by the viewer) since Contract D names the output scene.splat.
#
#  Both files are written. If .splat ever renders wrong, point the viewer at the
#  sibling .ply — it's guaranteed-correct gsplat output.
# ============================================================================

import logging
import os
import shutil

import numpy as np
from plyfile import PlyData  # pip: plyfile

log = logging.getLogger(__name__)

# 0th-order spherical-harmonic coefficient → base (view-independent) color.
SH_C0 = 0.28209479177387814


def export_splat(model_path: str, out_path: str) -> str:
    """
    model_path : the trained 3DGS .ply (from train_gsplat).
    out_path   : desired output (e.g. .../scene.splat).
    Writes out_path AND a sibling .ply. Returns out_path.
    """
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    # Always keep a known-good .ply next to the requested output.
    ply_sibling = os.path.splitext(out_path)[0] + ".ply"
    if os.path.abspath(model_path) != os.path.abspath(ply_sibling):
        shutil.copy2(model_path, ply_sibling)

    if out_path.lower().endswith(".ply"):
        log.info("exported .ply → %s", ply_sibling)
        return ply_sibling

    _ply_to_splat(model_path, out_path)
    return out_path


def _ply_to_splat(ply_path: str, splat_path: str) -> None:
    """
    Convert an INRIA-format 3DGS .ply to the antimatter15/.splat binary that
    the web viewer reads. Layout per gaussian = 32 bytes:
        position  3 × float32   (12)
        scale     3 × float32   (12)   exp(log-scale)
        color     4 × uint8     ( 4)   RGB from SH DC, A from sigmoid(opacity)
        rotation  4 × uint8     ( 4)   normalized quaternion → 0..255
    """
    v = PlyData.read(ply_path)["vertex"]
    n = v.count

    xyz = np.ascontiguousarray(
        np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32)
    )
    scales = np.ascontiguousarray(
        np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], axis=1)).astype(np.float32)
    )

    rots = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], axis=1).astype(np.float32)
    rots /= np.linalg.norm(rots, axis=1, keepdims=True) + 1e-9
    rot_u8 = np.clip(rots * 128 + 128, 0, 255).astype(np.uint8)

    opacity = 1.0 / (1.0 + np.exp(-np.asarray(v["opacity"], dtype=np.float32)))  # sigmoid
    rgb = 0.5 + SH_C0 * np.stack([v["f_dc_0"], v["f_dc_1"], v["f_dc_2"]], axis=1)
    rgba = np.clip(np.concatenate([rgb, opacity[:, None]], axis=1) * 255, 0, 255).astype(np.uint8)

    buf = bytearray(n * 32)
    out = np.frombuffer(buf, dtype=np.uint8).reshape(n, 32)
    out[:, 0:12] = xyz.view(np.uint8)
    out[:, 12:24] = scales.view(np.uint8)
    out[:, 24:28] = rgba
    out[:, 28:32] = rot_u8

    with open(splat_path, "wb") as f:
        f.write(buf)
    log.info("exported .splat → %s  (%d gaussians, %.1f MB)", splat_path, n, len(buf) / 1e6)
