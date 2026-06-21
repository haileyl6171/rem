# P4 — Reconstruction: frames → COLMAP → gsplat → splat

The 3D core of the pipeline. Turns a folder of image frames into a Gaussian-splat
scene file the web viewer can load. Built on
[gsplat](https://github.com/nerfstudio-project/gsplat) (the required library) +
[COLMAP](https://colmap.github.io/) for camera poses.

```
frames/ ──COLMAP──► images/ + sparse/0/ ──gsplat──► point_cloud.ply ──export──► scene.splat (+ scene.ply)
```

| File | Role |
|---|---|
| `steps/colmap.py` | frames → `images/` + `sparse/0/` (canonical 3DGS layout) |
| `steps/train_gsplat.py` | runs gsplat's `simple_trainer.py default` → a 3DGS `.ply` |
| `steps/export.py` | `.ply` → `.splat` (+ keeps the `.ply` as a fallback) |
| `reconstruct_local.py` | CLI that runs all three locally, no Modal/Supabase |

## How it works (the research, condensed)

- **COLMAP** (`colmap.py`) follows the reference INRIA `convert.py` flow:
  `feature_extractor` (OPENCV model, single camera) → `exhaustive_matcher` →
  `mapper` (SfM) → `image_undistorter`, then moves `sparse/* → sparse/0/`. Output
  is `<work>/images/` + `<work>/sparse/0/{cameras,images,points3D}.bin` — exactly
  what gsplat's COLMAP parser (`examples/datasets/colmap.py`) loads.
- **gsplat** (`train_gsplat.py`) shells out to the official, maintained
  `examples/simple_trainer.py default` with `--save_ply`. It initializes from the
  COLMAP SfM points and trains with the paper's densification strategy. Output:
  `{result_dir}/ply/point_cloud_{step}.ply`.
- **Export** (`export.py`) — the viewer (`@mkkellogg/gaussian-splats-3d`) reads
  `.ply` directly, so that's the safe artifact. We also pack it into the compact
  `.splat` binary (32 bytes/gaussian) for faster web loading.

## Local setup (your home GPU)

Prereqs: an **NVIDIA GPU + CUDA**, Python 3.10/3.11, and the **COLMAP binary**.

```bash
# 1. COLMAP (system package)
sudo apt install colmap            # Ubuntu  (or: brew install colmap on macOS)

# 2. PyTorch matching YOUR CUDA (check `nvidia-smi`)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 3. gsplat + our export deps
pip install -r pipeline/requirements.txt

# 4. gsplat's training script + its deps (vendored next to the repo)
git clone https://github.com/nerfstudio-project/gsplat vendor/gsplat
pip install -r vendor/gsplat/examples/requirements.txt
# train_gsplat.py finds it via GSPLAT_REPO (defaults to ./vendor/gsplat)
```

## Get test frames (before Pika exists)

Don't wait on generation — record your own. Take a **slow** phone video panning
around a static object/room (good parallax, no motion blur, ~10–20s), then:

```bash
mkdir -p frames
ffmpeg -i my_video.mp4 -vf fps=3 frames/frame_%04d.jpg     # ~30–60 frames
```

## Run it end-to-end

```bash
python pipeline/reconstruct_local.py --frames ./frames --out ./out --max-steps 7000
# → ./out/scene.splat  and  ./out/scene.ply
```

Check the result: drop `out/scene.ply` into the web viewer (`memory-viewer.tsx`,
point it at the file) or any 3DGS viewer (e.g. the gsplat `simple_viewer.py`, or
antimatter15/SuperSplat online).

## What "good" looks like

- COLMAP registers **most** of your frames into a single model (`distorted/sparse/0`).
  If it splits into `sparse/0`, `sparse/1`, … only model 0 is used — that means weak
  matching (see troubleshooting).
- Training runs ~3–6 min for 7k steps on a 3090/4090-class GPU.
- The exported scene looks coherent from the captured viewpoints (splats smear when
  you move far outside the camera path — that's expected for 3DGS).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `mapper produced no reconstruction` | Frames lack overlap/parallax. Use slower camera motion, more frames, or `--matcher sequential` (good for ordered video). |
| COLMAP hangs / `use_gpu` error on a **headless** box | GPU SIFT needs an OpenGL/EGL context. Run with `--no-gpu-colmap` (CPU SIFT, slower) or run COLMAP under `xvfb-run`. |
| `simple_trainer.py not found` | Clone gsplat and set `GSPLAT_REPO` (see setup step 4). |
| CUDA OOM during training | Pre-downsample frames (lower `fps` or resize), or pass `--data_factor 2` (edit `train_gsplat.py`). |
| `.splat` looks wrong in the viewer | Use the sibling `scene.ply` instead — it's guaranteed-correct gsplat output. Tell P3 to upload `scene.ply` and set `splat_url`'s extension to `.ply`. |
| gsplat flag rejected (`--disable_viewer`, `--ply_steps`) | Flag names can drift between gsplat versions — check `python vendor/gsplat/examples/simple_trainer.py default --help` and adjust `train_gsplat.py`. |

## Then → Modal (P3 wires this in)

The same three `steps/` functions run unchanged on Modal — only the image needs
the system deps. Two Modal-specific notes:
- Use a **CUDA devel base image** so `gsplat` and COLMAP build/run (see the image
  note in `app.py`). `colmap` must be installed in the image (`apt_install("colmap")`).
- COLMAP GPU SIFT is headless on Modal → call `run_colmap(..., sift_use_gpu=False)`
  or install `xvfb` in the image. CPU SIFT is fine for our small frame counts.

## Contract note for the team

`export.py` writes both `scene.splat` and `scene.ply`. `run_pipeline.py` currently
uploads `scene.splat` (Contract D). If we end up serving `.ply`, that's a
one-line change to the upload key + the `splat_url` extension — flag it to P3/P2.
