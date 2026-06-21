# ============================================================================
#  Local end-to-end test of the GENERATE phase — no Supabase, no Modal, no GPU.
#
#  It runs the REAL compose_scene (photo vision → persona → Pika-MCP creative
#  vision → prompt), then optionally Veo 3 → frames. Only the DB is stubbed
#  in-memory, so this is a single-memory dry run from scratch.
#
#  Usage (from the pipeline/ dir):
#     pip install google-genai mcp
#     python full_test.py "your memory text" [photo1.jpg photo2.jpg ...]
#
#  By default it stops after composing the prompt (no credits spent). To also
#  render the video set VEO_ENABLED=1 (Veo costs money). To include Pika's
#  creative vision set PIKA_MCP_ENABLED=1 after running `agents.pika_auth authorize`.
# ============================================================================

import os
import sys
from pathlib import Path

OUT_DIR = Path("_localtest")


def _open(path: str) -> None:
    """Best-effort: open the file in the OS default app so you can watch it."""
    import subprocess

    try:
        if sys.platform.startswith("win"):
            os.startfile(path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.run(["open", path], check=False)
        else:
            subprocess.run(["xdg-open", path], check=False)
    except Exception:  # noqa: BLE001 — opening is a nicety, never fatal
        pass


def load_env(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
    load_env()
    if not os.environ.get("GEMINI_API_KEY"):
        print("✗ GEMINI_API_KEY missing — add it to pipeline/.env")
        return 1

    args = sys.argv[1:]
    description = args[0] if args else "A quiet golden-hour afternoon in grandma's kitchen."
    images = [a for a in args[1:] if Path(a).exists()]
    for a in args[1:]:
        if not Path(a).exists():
            print(f"  (skipping missing image: {a})")

    # --- stub the DB so no Supabase is needed (fresh, single memory) ----------
    import db
    import persona_store

    db.get_past_memories = lambda exclude_id: []
    db.get_vision = lambda memory_id: None
    db.save_vision = lambda memory_id, vision: None
    persona_store.load = lambda: persona_store.default_persona()
    persona_store.save = lambda persona: None

    from steps.compose_scene import compose_scene
    from agents import creative

    print(f"\nMemory:  {description}")
    print(f"Photos:  {images or '(none)'}")
    print(f"Pika MCP creative vision: {'ON' if creative.is_enabled() else 'off'}")
    print(f"Veo render: {'ON' if os.environ.get('VEO_ENABLED') == '1' else 'off (dry run)'}")

    print("\n→ Composing scene (vision → persona → creative vision → prompt)...")
    prompt, analysis = compose_scene(description, images, memory_id="local-test")

    print("\n================ PROMPT ================\n" + prompt)
    print("\n================ ANALYSIS ==============")
    import json
    print(json.dumps(analysis, indent=2))

    if os.environ.get("VEO_ENABLED") != "1":
        print("\n✓ Dry run complete. Set VEO_ENABLED=1 in .env to also render the video.")
        return 0

    OUT_DIR.mkdir(exist_ok=True)
    from steps.generate_video import generate_video

    video_path = str(OUT_DIR / "generated.mp4")
    print(f"\n→ Rendering with Veo 3 → {video_path} (this can take a few minutes)...")
    generate_video(prompt, images, out_path=video_path)
    print(f"✓ Video saved: {video_path}")
    _open(video_path)  # pop it open so you can watch the AI video before any splatting

    try:
        from steps.extract_frames import extract_frames

        frames_dir = str(OUT_DIR / "frames")
        print(f"→ Extracting frames → {frames_dir} ...")
        extract_frames(video_path, frames_dir)
        n = len(list(Path(frames_dir).glob("frame_*.jpg")))
        print(f"✓ {n} frames extracted (ready for COLMAP on the GPU).")
    except FileNotFoundError:
        print("  (ffmpeg not found — skip frames; install ffmpeg to test this step.)")

    print("\n✓ GENERATE phase complete. Reconstruction (COLMAP→splat) runs on Modal/GPU.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
