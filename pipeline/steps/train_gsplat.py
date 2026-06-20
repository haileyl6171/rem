# ============================================================================
#  STEP 5 — frames + poses → a trained gaussian splat.   [P4]
#  GPU-heavy. Needs a CUDA build of gsplat (see image note in app.py).
# ============================================================================

import os
# import subprocess  # uncomment when implementing


def train_gsplat(frames_dir: str, colmap_dir: str, out_dir: str) -> str:
    """
    Train a 3D Gaussian Splatting model from the images + COLMAP poses.

    CONTRACT:
      in : frames_dir str, colmap_dir str (COLMAP output), out_dir str
      out: model_path str — the trained model (e.g. a .ply of gaussians)

    TODO(P4): run your chosen trainer (gsplat / nerfstudio `ns-train splatfacto`
      / Inria 3DGS). Cap iterations so it finishes in demo time. Return the
      path to the trained gaussians.
    """
    os.makedirs(out_dir, exist_ok=True)
    raise NotImplementedError("gsplat training — P4")
    # return model_path
