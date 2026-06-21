# ============================================================================
#  CREATIVE DIRECTOR — the creative vision, authored by Pika via its MCP server.
#
#  An LLM (Gemini) is connected to the Pika MCP server (https://mcp.pika.me) as
#  an MCP *client* and given Pika's tools. It uses them to develop the CREATIVE
#  VISION for this memory's video — the look, motion idea, and mood. That vision
#  is then handed to compose_scene (→ Veo 3) to actually render.
#
#  The Modal pipeline can't be an MCP *host* (that's Claude Code's job), but it
#  can be an MCP *client* over the server's HTTP transport — which is all we need.
#  Pika's server is OAuth-only, so auth goes through agents/pika_auth.py (a one-
#  time browser authorization, then silent refresh).
#
#  Gated: returns None unless PIKA_MCP_ENABLED=1 and a Pika authorization exists,
#  and never raises — the creative vision is an enhancement, so any failure just
#  falls back to the persona-coherent prompt compose_scene builds on its own.
# ============================================================================

import asyncio
import json
import os

from agents import pika_auth

_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_SYSTEM = """You are the Creative Director for a memory-reconstruction app. Given
a person's memory (their words, what their photos show, and their established
visual world), develop the CREATIVE VISION for a short cinematic video of it.

You have Pika's creative tools available — use them to ground and sharpen the
vision (trends, hooks, briefs, references) as helpful.

Hard constraint: the video is reconstructed into 3D with photogrammetry (COLMAP),
so the shot MUST be a slow, smooth camera move (gentle dolly or orbit) through a
coherent, STATIC scene with strong parallax — no cuts, no fast motion, no moving
people. Stay true to the person's persona and palette.

Return ONLY the final creative direction as one vivid paragraph — the look, the
camera move, the light, the mood. No preamble, no tool talk, no lists."""


def is_enabled() -> bool:
    return os.environ.get("PIKA_MCP_ENABLED", "0") == "1" and pika_auth.has_credentials()


def creative_vision(
    description: str, vision: dict | None = None, persona: dict | None = None
) -> str | None:
    """Synchronous entrypoint. Returns the creative direction, or None if Pika MCP
    is disabled/unavailable (the pipeline then proceeds without it)."""
    if not is_enabled():
        return None
    try:
        return asyncio.run(_creative_vision_async(description, vision, persona))
    except Exception as e:  # noqa: BLE001 — an enhancement must never break the run
        print(f"[creative] Pika MCP creative vision unavailable: {e}")
        return None


async def _creative_vision_async(
    description: str, vision: dict | None, persona: dict | None
) -> str | None:
    # Imported lazily so personalization-only runs need neither dep.
    from google import genai
    from google.genai import types
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client

    auth = pika_auth.build_runtime_provider()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    user = "MEMORY:\n" + (description or "").strip()
    if vision:
        user += "\n\nWHAT THE PHOTOS SHOW:\n" + json.dumps(vision, indent=2)
    if persona:
        user += "\n\nPERSONA (the person's visual world):\n" + json.dumps(persona, indent=2)

    async with streamablehttp_client(pika_auth.MCP_URL, auth=auth) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            # Passing the MCP session as a tool enables Gemini's automatic
            # function-calling against Pika's tools.
            resp = await client.aio.models.generate_content(
                model=_MODEL,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM,
                    tools=[session],
                    max_output_tokens=2048,
                ),
            )
    return (resp.text or "").strip() or None
