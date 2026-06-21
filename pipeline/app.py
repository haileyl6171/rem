# ============================================================================
#  Modal app + trigger endpoint  (GPU side of CONTRACT B)
#  Owned by P3.
#
#  Deploy:   modal deploy pipeline/app.py    → prints the URL for MODAL_URL
#  Dev:      modal serve  pipeline/app.py     → live-reloading dev URL
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
#  Container image. The reconstruction steps need real system tools + CUDA.
#  COLMAP + ffmpeg come from apt; Python deps from requirements.txt.
#
#  ⚠️ gsplat needs a CUDA toolchain to build. If `train_gsplat` fails to import,
#     switch the base to an NVIDIA CUDA devel image, e.g.:
#       modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04",
#                                  add_python="3.11")
#     then .apt_install(...).pip_install_from_requirements(...).  [P4 owns this]
# ---------------------------------------------------------------------------
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("colmap", "ffmpeg", "git")
    .pip_install_from_requirements("requirements.txt")
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
