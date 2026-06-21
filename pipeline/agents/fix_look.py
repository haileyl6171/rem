# ============================================================================
#  FIX-MY-LOOK — restyle a user's input VIDEO to match the memory's creative
#  look, via Pika's "fix-my-look" skill, while preserving the person's exact
#  identity, motion, speech and audio.
#
#  Same shape as agents/creative.py: an LLM (Gemini) is connected to the Pika
#  MCP server as a client and drives the skill's tools (normalize_video →
#  edit first frame with gpt-image-2 → propagate with Kling reference-video →
#  restore audio / lipsync → concat). Runs HEADLESS, so it auto-approves the
#  skill's interactive gates and reports the final video URL.
#
#  The source must be reachable by URL (we pass the clip's Supabase public URL),
#  since the model can't read local file bytes. Gated behind PIKA_MCP_ENABLED +
#  a Pika authorization; never raises — on any failure the caller falls back to
#  the raw uploaded clip.
# ============================================================================

import asyncio
import os
import re

from agents import pika_auth

_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_SYSTEM = """You are running Pika's "fix-my-look" skill, HEADLESS (no human in the
loop). Given a SOURCE video URL and a LOOK prompt, RESTYLE the source — its
palette, lighting and mood — to match the LOOK, while preserving EVERYTHING
structural: the exact camera movement, the scene's geometry and layout, the
spatial arrangement of every object, and (if a person is present) their identity,
pose and motion. This footage is fed to photogrammetry, so structure and the
original camera path MUST be preserved frame-to-frame; only the styling changes.
Do NOT replace the scene or move things around — recolor/relight it.

Use the Pika MCP tools, in order:
1. normalize_video(video_url=SOURCE, max_duration_s=14.8, extract_audio=true,
   extract_face_frame=true). Carry aspect_ratio from the result through later calls.
2. generate_image(provider="gpt-image-2", reference_images=[face_frame_url],
   aspect_ratio=<aspect>, resolution="2K", quality="high") with the prompt:
   "Recolor and relight this reference frame to: <LOOK>. CRITICAL: keep the exact
   composition, geometry, perspective and the position/orientation/scale of every
   object and surface identical to the reference; if a person is present keep their
   face, identity and pose exactly. Change only palette, lighting and mood — do not
   move, add, remove, or restyle the shapes of objects, and do not change the scene."
3. DO NOT pause for approval — proceed straight to video.
4. generate_reference_video(provider="kling", reference_videos=[normalized video_url],
   reference_images=[edited frame url], aspect_ratio=<aspect>, sound=false,
   video_keep_sounds=[true]) to propagate the new look while locking the original
   geometry and camera motion.
5. If a tool returns a task_id, poll task_status(task_id) in a tight loop until it
   is completed (or failed/cancelled). Reuse the task_id verbatim.
6. Keep the original audio.

Do not ask the user anything. When finished, reply with ONLY one line:
VIDEO_URL: <https url of the final video>
If you cannot finish, reply with: ERROR: <short reason>"""

_URL_RE = re.compile(r"VIDEO_URL:\s*(\S+)")


def is_enabled() -> bool:
    return os.environ.get("PIKA_MCP_ENABLED", "0") == "1" and pika_auth.has_credentials()


def fix_look(source_url: str, look_prompt: str, out_path: str) -> str | None:
    """Restyle source_url to the LOOK (palette/lighting/mood), preserving its
    geometry + camera motion, and save to out_path. Returns the local path, or
    None if disabled/unavailable (caller falls back to the raw clip)."""
    if not is_enabled():
        return None
    try:
        video_url = asyncio.run(_run_async(source_url, look_prompt))
        if not video_url:
            return None
        _download(video_url, out_path)
        return out_path
    except Exception as e:  # noqa: BLE001 — never break the run over a restyle
        print(f"[fix_look] Pika fix-my-look unavailable: {e}")
        return None


async def _run_async(source_url: str, look_prompt: str) -> str | None:
    from google import genai
    from google.genai import types
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    auth = pika_auth.build_runtime_provider()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    user = f"SOURCE: {source_url}\n\nLOOK: {look_prompt.strip()}"

    async with streamablehttp_client(pika_auth.MCP_URL, auth=auth) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            resp = await client.aio.models.generate_content(
                model=_MODEL,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM,
                    tools=[session],
                    max_output_tokens=4096,
                ),
            )
    text = (resp.text or "").strip()
    m = _URL_RE.search(text)
    return m.group(1) if m else None


def _download(url: str, out_path: str) -> None:
    import requests

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
