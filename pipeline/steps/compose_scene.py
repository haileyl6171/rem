# ============================================================================
#  STEP 1 (agentic) — journal entry  →  a COHERENT video-generation prompt.
#
#  Replaces the old flat make_prompt() call. Orchestrates three subagents so the
#  new memory's scene stays consistent with the person's past memories:
#
#     past memories ─► Analyzer ─► world summary
#                                      │
#     new entry ───────────────► Extractor ─► relevant slice
#                                      │
#     persona  ◄──────────────── Persona Creator (merges slice in) ──► saved
#                                      │
#     persona + slice + entry ─► compose final prompt ─► (Pika renders later)
#
#  Returns the final prompt string AND the scene's structured analysis (cached
#  on the memory row so future memories stay coherent without re-analysis).
#
#  Runs entirely on the Gemini API — no Pika credits required.
# ============================================================================

import json

import db
import persona_store
from agents.analyzer import analyze_past_memories
from agents.extractor import extract_context
from agents.persona import update_persona
from agents.vision import analyze_photos
from agents.creative import creative_vision
from agents.client import complete_text

# The hard constraints from the original make_prompt: the shot MUST reconstruct
# well in COLMAP (slow, smooth camera; static, parallax-rich scene; no cuts).
_PROMPT_SYSTEM = """You convert a personal memory into a single, vivid prompt for
a text-to-video model. The video is fed to photogrammetry (COLMAP) to build a 3D
scene, so the described shot MUST be a slow, smooth camera move (gentle dolly or
orbit) through a coherent, STATIC environment with strong parallax. No fast
motion, no cuts, no moving people. Describe the place, light, and mood.

You are also given a PERSONA (the person's established visual world) and the
CONTEXT linking this memory to it. Honor them for coherence: reuse the canonical
descriptions of any connected places/objects, the carry-over palette, and the
lighting register, so this scene looks like it belongs in the same world as
their other memories. Do not contradict the persona.

You may also be given CREATIVE_DIRECTION — the creative vision for this shot,
authored by Pika. When present, treat it as the lead idea and realize it, while
still respecting the persona and the COLMAP camera constraints above.

Return ONLY the prompt text, no preamble."""


def compose_scene(
    description: str,
    image_paths: list[str],
    memory_id: str,
    creative_direction: str | None = None,
) -> tuple[str, dict]:
    """
    Returns (prompt, analysis).
      prompt   — the COLMAP-friendly, persona-coherent video prompt.
      analysis — this scene's structured read, to cache on the memory row.

    creative_direction — the creative vision for the shot, owned by Pika via the
    pika-mcp tools. When None (the default), it is authored here by connecting to
    the Pika MCP server (see agents/creative.py); pass a value to override that.
    If Pika MCP is disabled/unavailable the persona-coherent prompt stands alone.
    """
    if not (description or "").strip():
        description = "a quiet, memorable place"

    # 0. Photo Analyzer — read the uploaded images EXACTLY ONCE, then cache it.
    #    On any later run (e.g. a retry) the cached read is reused, so the images
    #    are never sent to the model twice.
    vision = db.get_vision(memory_id)
    if vision is None and image_paths:
        vision = analyze_photos(image_paths)
        db.save_vision(memory_id, vision)

    # 1. Analyzer — summarize the recurring world from past memories + this
    #    memory's cached photo read (text only).
    past = db.get_past_memories(exclude_id=memory_id)
    world_summary = analyze_past_memories(past, vision)

    # 2. Extractor — pull the slice of that world relevant to this entry.
    persona = persona_store.load()
    context = extract_context(description, world_summary, persona)

    # 3. Persona Creator — merge the slice in and persist the evolved persona.
    persona = update_persona(persona, context)
    persona_store.save(persona)

    # 3b. Creative Director — let an LLM use the Pika MCP server to author the
    #     creative vision for the shot. No-op (None) unless Pika MCP is enabled.
    if creative_direction is None:
        creative_direction = creative_vision(description, vision, persona)

    # 4. Compose the final prompt, conditioned on persona + context, and led by
    #    Pika's creative direction when one was produced.
    user = (
        "MEMORY:\n" + description.strip()
        + "\n\nPERSONA:\n" + json.dumps(persona, indent=2)
        + "\n\nCONTEXT:\n" + json.dumps(context, indent=2)
    )
    if (creative_direction or "").strip():
        user += "\n\nCREATIVE_DIRECTION (from Pika):\n" + creative_direction.strip()
    prompt = complete_text(_PROMPT_SYSTEM, user, max_tokens=1024)

    # 5. Build this memory's cached analysis from the extracted context, enriched
    #    with the one-time photo read so future memories inherit what was seen.
    analysis = _analysis_from_context(context, vision)

    return prompt, analysis


def _dedup(items: list) -> list:
    """Order-preserving de-duplication of a list of strings."""
    seen, out = set(), []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _analysis_from_context(context: dict, vision: dict | None = None) -> dict:
    """Flatten the extractor output (+ the cached photo read) into SceneAnalysis."""
    style = context.get("carry_over_style") or {}
    vision = vision or {}

    people = context.get("connected_people", []) + [
        p.get("name") for p in context.get("new_people", [])
    ] + vision.get("people", [])
    places = context.get("connected_places", []) + [
        p.get("name") for p in context.get("new_places", [])
    ] + vision.get("places", [])
    objects = context.get("connected_objects", []) + [
        o.get("name") for o in context.get("new_objects", [])
    ] + vision.get("objects", [])

    return {
        "people": _dedup(people),
        "places": _dedup(places),
        "objects": _dedup(objects),
        "palette": _dedup(style.get("palette", []) + vision.get("palette", [])),
        "lighting": style.get("lighting") or vision.get("lighting"),
        "mood": style.get("mood") or vision.get("mood"),
        "motifs": [],
    }
