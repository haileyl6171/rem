# ============================================================================
#  STEP 4 — frames → camera poses (structure-from-motion).   [P4]
#  Wraps COLMAP (installed via apt in app.py). The riskiest part — spike early.
# ============================================================================

import os
# import subprocess  # uncomment when implementing


def run_colmap(frames_dir: str, work_dir: str) -> str:
    """
    Recover camera intrinsics/poses + a sparse point cloud from the frames.

    CONTRACT:
      in : frames_dir str (the extracted frames), work_dir str (scratch)
      out: colmap_dir str — the directory train_gsplat() will read
           (the COLMAP "sparse" model: cameras/images/points3D)

    TODO(P4): run the COLMAP automatic pipeline, e.g.:
        feature_extractor  → exhaustive_matcher  → mapper
      (or `colmap automatic_reconstructor`). Output the sparse model into
      work_dir in the layout your gsplat trainer expects.

    DE-RISK: get this working on a pre-recorded phone video (slow pan of a
    desk/room) on DAY 1, before generation exists.
    """
    os.makedirs(work_dir, exist_ok=True)
    raise NotImplementedError("COLMAP SfM — P4")
    # return work_dir
