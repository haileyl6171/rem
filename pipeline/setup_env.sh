#!/usr/bin/env bash
# ============================================================================
#  Reproduces the VERIFIED reconstruction environment — compiles NOTHING.   [P4]
#
#  This is the exact stack that works:
#    Python 3.10 + torch 2.4.1/cu121 + PREBUILT gsplat 1.5.3 wheel + a
#    pure-Python fused_ssim shim. No nvcc, no CUDA header hunts, no 2-hour
#    build tar pit.
#
#  Prereqs:
#    - conda available
#    - run from the repo root
#    - submodule populated:   git submodule update --init    (pinned to v1.5.3)
#
#  Usage:   bash pipeline/setup_env.sh           # creates env "splat310"
#           bash pipeline/setup_env.sh myenv     # custom name
# ============================================================================
set -eo pipefail

ENV="${1:-splat310}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

source "$(conda info --base)/etc/profile.d/conda.sh"
conda create -y -n "$ENV" python=3.10
conda activate "$ENV"

# system tools (no sudo needed — conda-forge)
conda install -y -c conda-forge colmap ffmpeg

# PyTorch 2.4 + CUDA 12.1 — MUST match the prebuilt gsplat wheel below
pip install torch==2.4.1 torchvision==0.19.1 --index-url https://download.pytorch.org/whl/cu121

# gsplat: deps from PyPI FIRST, then the PREBUILT wheel (no compilation).
# Prebuilt wheels are Python-3.10 only — that's why this env pins 3.10.
pip install ninja "numpy<2.0.0" jaxtyping rich
pip install gsplat==1.5.3 --index-url https://docs.gsplat.studio/whl/pt24cu121

# our pipeline deps
pip install -r "$REPO/pipeline/requirements.txt"

# gsplat example-trainer deps, MINUS everything that compiles CUDA
# (fused-ssim → shim below; fused-bilagrid/ppisp/ncore → unused by us)
grep -vE "fused-ssim|fused_ssim|fused-bilagrid|ppisp|nvidia-ncore|rahul-goel|harry7557558|nv-tlabs" \
    "$REPO/vendor/gsplat/examples/requirements.txt" > /tmp/gsplat-examples-nocompile.txt
pip install -r /tmp/gsplat-examples-nocompile.txt

# pure-Python fused_ssim shim → into the examples dir so the import resolves
cp "$REPO/pipeline/fused_ssim_shim.py" "$REPO/vendor/gsplat/examples/fused_ssim.py"

python - <<'PY'
from gsplat import rasterization  # noqa: F401
print("\xe2\x9c\x93 gsplat import OK \xe2\x80\x94 prebuilt wheel, no compile")
PY

echo ""
echo "Environment '$ENV' is ready. Activate it with:"
echo "    conda activate $ENV"
