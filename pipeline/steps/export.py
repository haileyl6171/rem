# ============================================================================
#  STEP 6 — trained gaussians → the ONE web-viewer artifact: scene.ply   [P4]
#
#  gsplat emits a standard 3D Gaussian Splatting .ply. The web viewer
#  (@mkkellogg/gaussian-splats-3d) loads .ply directly, and we've VERIFIED .ply
#  renders correctly (SuperSplat / the raw point_cloud_*.ply). So .ply is the
#  canonical output — no lossy/unverified conversion in the default path.
#
#  Pass an out_path ending in .ply (the pipeline does). A .splat converter is
#  still here for later size optimization, but it's OPT-IN and unverified —
#  only used if you explicitly pass a .splat out_path.
# ============================================================================

import logging
import os
import shutil

log = logging.getLogger(__name__)

# 0th-order spherical-harmonic coefficient → base (view-independent) color.
SH_C0 = 0.28209479177387814


def export_splat(model_path: str, out_path: str) -> str:
    """
    model_path : the trained 3DGS .ply (from train_gsplat).
    out_path   : the artifact to write. .ply (recommended) → copied as-is;
                 .splat → converted (opt-in, unverified). Returns the path written.
    """
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    if out_path.lower().endswith(".ply"):
        if os.path.abspath(model_path) != os.path.abspath(out_path):
            shutil.copy2(model_path, out_path)
        log.info("exported → %s", out_path)
        return out_path

    # opt-in compact binary (smaller, but our converter is unverified — prefer .ply)
    _ply_to_splat(model_path, out_path)
    log.info("exported → %s (compact .splat — verify against the .ply before trusting)", out_path)
    return out_path


def _ply_to_splat(ply_path: str, splat_path: str) -> None:
    """INRIA-format 3DGS .ply → antimatter15/.splat binary (32 bytes/gaussian)."""
    import numpy as np
    from plyfile import PlyData  # only needed for the opt-in .splat path

    v = PlyData.read(ply_path)["vertex"]
    n = v.count
    xyz = np.ascontiguousarray(np.stack([v["x"], v["y"], v["z"]], axis=1).astype(np.float32))
    scales = np.ascontiguousarray(
        np.exp(np.stack([v["scale_0"], v["scale_1"], v["scale_2"]], axis=1)).astype(np.float32)
    )
    rots = np.stack([v["rot_0"], v["rot_1"], v["rot_2"], v["rot_3"]], axis=1).astype(np.float32)
    rots /= np.linalg.norm(rots, axis=1, keepdims=True) + 1e-9
    rot_u8 = np.clip(rots * 128 + 128, 0, 255).astype(np.uint8)
    opacity = 1.0 / (1.0 + np.exp(-np.asarray(v["opacity"], dtype=np.float32)))
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
