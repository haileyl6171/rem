# ============================================================================
#  STEP 6 — trained model → a .splat the web viewer can load.   [P4]
#  The browser uses @mkkellogg/gaussian-splats-3d, which reads .ply / .splat /
#  .ksplat. Produce whatever format your viewer loads; the repo viewer uses
#  /sample_memory.splat as a reference for the target format.
# ============================================================================

import os
# import shutil  # uncomment when implementing


def export_splat(model_path: str, out_path: str) -> str:
    """
    Convert the trained gaussians into the viewer's format.

    CONTRACT:
      in : model_path str (trainer output), out_path str (e.g. .../scene.splat)
      out: out_path (the file run_pipeline uploads to Storage as scene.splat)

    TODO(P4):
      • If the trainer already emits .ply, convert to the same format as
        public/sample_memory.splat (match what memory-viewer.tsx loads).
      • Optionally downsample to keep the file small enough to stream fast.
    """
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    raise NotImplementedError("export to .splat — P4")
    # return out_path
