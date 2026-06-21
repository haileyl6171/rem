# ============================================================================
#  Local smoke test for the Gemini agent layer — no Supabase, Pika, or Veo.
#
#  1. Put your key in pipeline/.env :  GEMINI_API_KEY=...
#  2. From the pipeline/ dir:
#         pip install google-genai
#         python smoke_test.py                 # text completion check
#         python smoke_test.py photo1.jpg ...  # also runs the photo vision pass
# ============================================================================

import json
import os
import sys
from pathlib import Path


def load_env(path: str = ".env") -> None:
    """Minimal .env loader (KEY=VALUE per line); does not override real env."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def main() -> int:
    load_env()

    if not os.environ.get("GEMINI_API_KEY"):
        print("✗ GEMINI_API_KEY is empty. Add it to pipeline/.env and re-run.")
        return 1

    try:
        from agents.client import complete_text  # imported after env is loaded
    except ModuleNotFoundError as e:
        print(f"✗ Missing dependency: {e}. Run:  pip install google-genai")
        return 1

    print(f"Model: {os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')}")
    print("→ Testing Gemini text completion...")
    reply = complete_text("You are a connectivity test.", "Reply with exactly: OK", max_tokens=20)
    print(f"  Gemini said: {reply!r}")
    if not reply:
        print("✗ Empty reply — check the key / model id.")
        return 1
    print("✓ Gemini text works.")

    images = [a for a in sys.argv[1:] if Path(a).exists()]
    missing = [a for a in sys.argv[1:] if not Path(a).exists()]
    for m in missing:
        print(f"  (skipping missing image: {m})")
    if images:
        from agents.vision import analyze_photos

        print(f"→ Testing photo vision on {len(images)} image(s)...")
        result = analyze_photos(images)
        print(json.dumps(result, indent=2))
        print("✓ Photo vision works.")

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
