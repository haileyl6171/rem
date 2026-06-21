# P4 — Reconstruction: (video | images) → COLMAP → gsplat → splat

Turns a video clip **or** a set of photos into a 3D Gaussian-splat scene.
Built on [gsplat](https://github.com/nerfstudio-project/gsplat) (the trainer) +
[COLMAP](https://colmap.github.io/) (camera poses).

```
video ──ffmpeg──┐
                ├─► frames ──COLMAP──► images/ + sparse/0/ ──gsplat──► point_cloud.ply ──► scene.ply
images ─────────┘
```

| File | Role |
|---|---|
| `reconstruct_local.py` | CLI: takes `--video` or `--images`, runs the whole thing locally |
| `steps/extract_frames.py` | video → frames (ffmpeg) — only for `--video` |
| `steps/colmap.py` | frames → `images/` + `sparse/0/`; **auto-picks the largest model** |
| `steps/train_gsplat.py` | runs gsplat `simple_trainer.py default` → a 3DGS `.ply` |
| `steps/export.py` | copies the trained `.ply` → `scene.ply` (the one artifact to view) |
| `fused_ssim_shim.py` | pure-Python `fused_ssim` (so nothing compiles) |
| `setup_env.sh` | one-shot reproducible environment |

## Setup (the verified, no-compile path)

The hard-won lesson: use **Python 3.10 + the prebuilt gsplat wheel**, and shim
`fused_ssim`, so **nothing compiles** (no nvcc, no CUDA-header tar pit). `setup_env.sh`
does exactly that.

```bash
sudo apt install -y colmap ffmpeg          # OR: conda installs them (setup_env.sh does)
git submodule update --init               # populates vendor/gsplat (pinned to v1.5.3)
bash pipeline/setup_env.sh                 # creates conda env "splat310" — compiles nothing
conda activate splat310
```
No sudo? `setup_env.sh` installs COLMAP + ffmpeg via conda-forge too — just run it.

## Run

```bash
# from a video (gets split into frames):
python pipeline/reconstruct_local.py --video my_clip.mp4 --out ./out

# from a folder of photos (used directly):
python pipeline/reconstruct_local.py --images ./my_photos --out ./out

# options: --fps N (downsample; default = ALL frames), --max-steps 7000,
#          --matcher sequential|exhaustive, --sfm incremental|global, --no-gpu-colmap
```
**Output (the one artifact):** `./out/scene.ply` — view it in
[superspl.at/editor](https://superspl.at/editor) or your `memory-viewer`.

> Heads-up on files: the raw trainer output is `out/gsplat/ply/point_cloud_6999.ply`
> (gsplat names by 0-indexed final step → **6999**, not 7000). `export.py` copies it
> to `out/scene.ply` — **always view `scene.ply`** (or that `point_cloud_*.ply`), never a
> stale leftover.

## GPU & speed

COLMAP already uses the GPU for the parts that can: **feature extraction + matching**
run on CUDA, and that works **headless** (no display) on a CUDA build — check yours
with `conda list colmap` (build string contains `cuda`) and
`colmap feature_extractor --help | grep use_gpu` (defaults to `=1`). These were never
the bottleneck.

The slow stage is the **incremental mapper** (pose solving / bundle adjustment), which
is **CPU-bound** — GPU doesn't help it (BA only uses the GPU if Ceres is built with
CUDA+cuDSS, which the stock binaries aren't). To cut wall-clock:

- **`--sfm global`** → COLMAP's `global_mapper` (GLOMAP), **1–2 orders of magnitude
  faster** on many-frame captures. Needs **COLMAP 4.x** (3.13 logs a warning and falls
  back to incremental) and decent focal priors. Get it in a fresh env:
  `conda install -c conda-forge "colmap=4.*=*cuda*"`.
- fewer frames (`--fps 8`), or `--matcher sequential` for ordered video (much cheaper
  than exhaustive's O(N²)).

## What "good" looks like

- COLMAP registers **most** of your frames into **one** model. The mapper log shows
  `num_reg_frames` climbing into the hundreds and `Image sees ~1200/1600 points` (high overlap).
- It ends with `COLMAP produced N model(s); using the largest: …` then
  `COLMAP done — N undistorted images` with N close to your frame count.
- `out/scene.ply` is tens-to-hundreds of MB and looks like your scene in SuperSplat.

## Troubleshooting (everything we learned the hard way)

| Symptom | Cause / fix |
|---|---|
| Splat is **spikes/clouds**, COLMAP only registered **2–3** images | Frames don't overlap/match — usually the **capture**. Need a slow capture with **translation** (see below). More fps does **not** fix this. |
| `CHOLMOD: Matrix not positive definite` flooding the log | Bundle adjustment is **ill-conditioned = degenerate geometry** → the camera **rotated in place** (no parallax). No code/matcher fixes pure rotation — re-shoot with translation. |
| COLMAP made several `sparse/0,1,2…` and the splat was tiny | The **fragment bug** — `sparse/0` isn't always the biggest. Already fixed: `colmap.py` auto-picks the largest model. |
| Run takes too long | All frames is the default (best overlap). For speed, trade some quality: `--fps 12` to downsample, `--matcher sequential` (video), or `--sfm global` (COLMAP 4.x). |
| Gaps / many unregistered images at low fps | Frames didn't overlap enough — that's why all-frames is now the default. Don't downsample. |
| Viewing junk even after a good run | You're viewing a **stale** file. Use `out/scene.ply` / `out/gsplat/ply/point_cloud_*.ply`, not old leftovers. |
| `gsplat.color_correct` ImportError | Library↔examples version mismatch. The submodule is pinned to **v1.5.3** to match the prebuilt wheel — run `git submodule update --init`. |

## Capture requirements (the #1 thing that determines success)

COLMAP needs **parallax** — it recovers 3D from the camera *moving through space*:
- **Translate**, don't rotate: walk a slow arc **around** the subject; don't pan from one spot.
- Sharp frames (no motion blur), good light, **static** scene (only the camera moves), textured subject.
- For `--images`: provide a **set** (~20+) of overlapping photos from different positions.

Validate the pipeline independent of your capture by running the known-good `garden`
dataset (poses pre-solved) — if it looks great, the pipeline is correct and any
bad result is the capture:
```bash
cd vendor/gsplat/examples
python datasets/download_dataset.py        # only if data/360_v2/garden/ isn't already there
python simple_trainer.py default --data_dir data/360_v2/garden/ --data_factor 4 \
    --result_dir ~/hack-berkeley/out/garden --max_steps 7000 \
    --save_ply --ply_steps 7000 --eval_steps -1 --disable_viewer
```

## → Modal (P3)

Same steps run on Modal; the image must reproduce this env: **Python 3.10**, the
**prebuilt gsplat wheel** (`pt24cu121`), the `fused_ssim` shim, COLMAP/ffmpeg, and
`run_colmap(..., sift_use_gpu=False)` (headless). `setup_env.sh` is the source of
truth for what to install. `run_pipeline.py` already branches on video vs image
input and emits `scene.ply` (Contract D).
