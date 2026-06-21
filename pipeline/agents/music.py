# ============================================================================
#  MUSIC SUPERVISOR — choose music for a memory's scene and lay it under the
#  video, via the Pika MCP music tools.
#
#  Same shape as agents/creative.py / fix_look.py: an LLM (Gemini) connected to
#  the Pika MCP server picks the musical direction FROM THE SCENE (the memory's
#  description + structured analysis: mood, palette, motifs) and the prompt, then
#  uses Pika's tools to source it — search_music for a fitting licensed track or
#  generate_music for an original cue — and edit_audio_mix it under the clip.
#
#  Gated behind PIKA_MCP_ENABLED + a Pika authorization; never raises — scoring
#  is an enhancement, so any failure just leaves the video unscored.
# ============================================================================

import asyncio
import json
import os

from agents import pika_auth

_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_SYSTEM = """You are the Music Supervisor for a memory app. Given a memory's SCENE
(its description + structured analysis: mood, palette, motifs) and a VIDEO URL,
CHOOSE music that fits the scene and lay it under the video.

1. Decide the musical direction from the scene's mood and content (e.g. calm /
   nostalgic → soft ambient or piano; joyful → warm acoustic; tense → low drones).
   Match tempo and energy to the mood.
2. Source the track with the Pika tools — pick ONE that best fits:
   - search_music to find a fitting licensed track, OR
   - generate_music to create an original cue.
3. Mix it UNDER the video with edit_audio_mix (keep any original audio audible;
   music sits lower as a bed). If the video has no meaningful audio, you may
   edit_audio_replace instead.
4. If a tool returns a task_id, poll task_status in a tight loop until completed.

Do not ask anything. When finished, reply with ONLY one line:
VIDEO_URL: <https url of the scored video>
If you cannot finish, reply with: ERROR: <short reason>"""

import re

_URL_RE = re.compile(r"VIDEO_URL:\s*(\S+)")


def is_enabled() -> bool:
    return os.environ.get("PIKA_MCP_ENABLED", "0") == "1" and pika_auth.has_credentials()


def score_video(
    video: str,
    description: str,
    analysis: dict,
    prompt: str | None = None,
    out_path: str | None = None,
) -> str | None:
    """Choose scene-appropriate music and mix it under `video` (local path or URL).
    Returns the scored video's local path (if out_path given) or URL, else None."""
    if not is_enabled():
        return None
    try:
        result_url = asyncio.run(_run_async(video, description, analysis, prompt))
        if not result_url:
            return None
        if out_path:
            _download(result_url, out_path)
            return out_path
        return result_url
    except Exception as e:  # noqa: BLE001 — scoring is optional, never fatal
        print(f"[music] Pika music scoring unavailable: {e}")
        return None


async def _run_async(
    video: str, description: str, analysis: dict, prompt: str | None
) -> str | None:
    from google import genai
    from google.genai import types
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    auth = pika_auth.build_runtime_provider()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    async with streamablehttp_client(pika_auth.MCP_URL, auth=auth) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # The model can't read local bytes, so stage a local file ourselves.
            video_url = video if video.startswith("http") else await _upload(session, video)

            user = (
                f"VIDEO: {video_url}\n\nSCENE DESCRIPTION:\n{(description or '').strip()}"
                f"\n\nSCENE ANALYSIS:\n{json.dumps(analysis, indent=2)}"
            )
            if (prompt or "").strip():
                user += f"\n\nGENERATION PROMPT:\n{prompt.strip()}"

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


async def _upload(session, path: str) -> str:
    """Stage a local video on Pika's CDN via upload_asset, return its public URL."""
    import requests

    size = os.path.getsize(path)
    res = await session.call_tool(
        "upload_asset",
        {"filename": os.path.basename(path), "mime_type": "video/mp4", "size_bytes": size},
    )
    data = res.structuredContent or json.loads(res.content[0].text)
    presigned, public = data.get("presigned_url"), data["public_url"]
    if presigned:
        ctype = data.get("content_type", "video/mp4")

        def _put():
            with open(path, "rb") as f:
                requests.put(presigned, data=f, headers={"Content-Type": ctype}, timeout=600).raise_for_status()

        await asyncio.to_thread(_put)
    return public


def _download(url: str, out_path: str) -> None:
    import requests

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
