# ============================================================================
#  Modal app + trigger endpoint  (GPU side of CONTRACT B)
#  Owned by P3.
#
#  Deploy:   cd pipeline && modal deploy app.py   → prints the URL for MODAL_URL
#  Dev:      cd pipeline && modal serve  app.py    → live-reloading dev URL
#  (run from the pipeline/ dir so the image's relative paths resolve)
#
#  This file does TWO things:
#    1. `start`  — a tiny HTTPS endpoint the backend POSTs to. It verifies the
#                  secret, spawns the heavy job, and returns immediately.
#    2. `run`    — the heavy GPU function that actually runs the pipeline.
# ============================================================================

import os
import modal

app = modal.App("rem-pipeline")

# ---------------------------------------------------------------------------
#  Container image — mirrors pipeline/setup_env.sh (the VERIFIED, no-compile
#  stack). Deploy/serve FROM the pipeline/ dir so relative paths resolve:
#       cd pipeline && modal deploy app.py
#
#  Why NOT debian_slim + apt colmap + pip gsplat (the old, broken version):
#    • gsplat has no clean source build here — we must use the PREBUILT wheel,
#      which exists ONLY for Python 3.10 + torch 2.4/cu121 (pip would otherwise
#      try to compile gsplat → the build tar pit).
#    • apt colmap is CPU-only; setup_env.sh uses the conda-forge CUDA build.
#  So: micromamba (py3.10) + conda-forge colmap/ffmpeg + pip torch + gsplat wheel.
# ---------------------------------------------------------------------------
image = (
    modal.Image.micromamba(python_version="3.10")
    # The build node has no GPU, so conda's __cuda probe is empty and it would
    # resolve the CPU colmap. Declaring a driver CUDA lets it prefer the CUDA
    # build (and fall back to CPU if no compatible CUDA build exists — which is
    # fine: high_quality extraction is CPU DSP-SIFT anyway, GPU only speeds
    # matching). Bump this if you want to force a newer CUDA colmap.
    .env({"CONDA_OVERRIDE_CUDA": "12.4"})
    .micromamba_install("colmap", "ffmpeg", channels=["conda-forge"])
    # torch from its own index, THEN the prebuilt gsplat wheel. Deps are
    # pre-installed first so gsplat's single-index install doesn't need to
    # resolve them. Nothing compiles.
    .pip_install("torch==2.4.1", "torchvision==0.19.1",
                 index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("ninja", "numpy<2.0.0", "jaxtyping", "rich")
    .pip_install("gsplat==1.5.3", index_url="https://docs.gsplat.studio/whl/pt24cu121")
    .pip_install_from_requirements("requirements.txt")
    # simple_trainer.py ships in the gsplat REPO (not the wheel) — clone it pinned
    # to the wheel's version, and install its example deps MINUS everything that
    # compiles CUDA (fused_ssim is shimmed just below).
    .run_commands(
        "git clone --depth 1 --branch v1.5.3 "
        "https://github.com/nerfstudio-project/gsplat.git /opt/gsplat",
        "grep -vE 'fused-ssim|fused_ssim|fused-bilagrid|ppisp|nvidia-ncore|"
        "rahul-goel|harry7557558|nv-tlabs' /opt/gsplat/examples/requirements.txt "
        "> /tmp/ex.txt && pip install -r /tmp/ex.txt",
    )
    # our pipeline source + the pure-Python fused_ssim shim (so the trainer's
    # `from fused_ssim import fused_ssim` resolves without compiling).
    .add_local_dir(".", "/root/pipeline", copy=True,
                   ignore=["**/__pycache__", "**/*.pyc", "third_party/**"])
    .run_commands("cp /root/pipeline/fused_ssim_shim.py /opt/gsplat/examples/fused_ssim.py")
    # train_gsplat reads GSPLAT_REPO; run() imports run_pipeline from here.
    .env({"GSPLAT_REPO": "/opt/gsplat", "PYTHONPATH": "/root/pipeline"})
    .workdir("/root/pipeline")
)

# Secrets (set once):
#   modal secret create rem-secrets SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
#     GEMINI_API_KEY=... MODAL_SECRET=...
#   (video generation, when enabled: add VEO_ENABLED=1 — Veo 3 reuses GEMINI_API_KEY)
secrets = [modal.Secret.from_name("rem-secrets")]


@app.function(image=image, gpu="A10G", timeout=3600, secrets=secrets)
def run(memory_id: str, input_keys: list[str], description: str) -> None:
    """The heavy job. Runs for minutes on a GPU, then the machine is torn down."""
    # Imported here so the endpoint container doesn't need the heavy deps.
    from run_pipeline import run_pipeline

    run_pipeline(memory_id, input_keys, description)


@app.function(image=image, secrets=secrets)
@modal.fastapi_endpoint(method="POST")
def start(body: dict):
    """
    CONTRACT B endpoint. Backend POSTs { memoryId, inputKeys, description }
    with header X-Secret. We verify, spawn the job, and return right away.

    NOTE: header access depends on the Modal/FastAPI version. If you need the
    header, switch the signature to accept a fastapi.Request and read
    request.headers["x-secret"]. For a hackathon you may also pass the secret
    in the JSON body. Verify the secret either way — don't leave it open.
    """
    # TODO(P3): verify X-Secret == os.environ["MODAL_SECRET"]; 401 if mismatch.
    run.spawn(
        body["memoryId"],
        body.get("inputKeys", []),
        body.get("description", ""),
    )
    return {"ok": True}
