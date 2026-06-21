# ============================================================================
#  SUBAGENT 1 — Past Memory Analyzer.
#
#  Reads the person's prior memories (journal text + each memory's cached
#  `analysis`) and produces ONE structured summary of their recurring world:
#  the people, places, objects, palette, lighting, camera language, and motifs
#  that keep showing up. This is the raw material the extractor draws from.
#
#  It runs on TEXT alone. The new memory's photos were already read once by the
#  Photo Analyzer (agents/vision.py) and cached; that structured `vision` read is
#  passed in here as text, so the world summary is grounded in what the new photos
#  show without ever re-sending the images to Gemini.
# ============================================================================

import json

from agents.client import complete_json

_SYSTEM = """You are the Past Memory Analyzer in a memory-reconstruction system.
You are given a person's prior memories — each with a journal description and,
when available, a cached structured `analysis` of that memory's scene.

Summarize the RECURRING WORLD across these memories. Identify what persists:
the people who reappear, the places that recur, signature objects, the dominant
color palette, the lighting that defines their memories, and recurring visual
motifs and mood. Prefer things seen in 2+ memories; note strong one-offs too.

Be concrete and visual — "warm window light in a wood-floored kitchen" beats
"cozy". Do not invent people or places not supported by the inputs.

Output JSON with exactly these keys:
{
  "people":   [{"name": str, "description": str}],
  "places":   [{"name": str, "description": str}],
  "objects":  [{"name": str, "description": str}],
  "palette":  [str],
  "lighting": str | null,
  "camera_language": str | null,
  "motifs":   [str],
  "mood":     str | null
}"""


def _empty() -> dict:
    return {
        "people": [], "places": [], "objects": [], "palette": [],
        "lighting": None, "camera_language": None, "motifs": [], "mood": None,
    }


def analyze_past_memories(past: list[dict], vision: dict | None = None) -> dict:
    """
    past:   list of {id, description, analysis} for prior memories (newest last).
    vision: the cached one-time photo read of the NEW memory (agents/vision.py),
            or None when this memory has no photos. Passed as text — never images.
    Returns the structured world summary. Empty summary on cold start.
    """
    if not past and not vision:
        return _empty()

    digest = [
        {
            "id": m.get("id"),
            "description": m.get("description") or "",
            "analysis": m.get("analysis"),  # may be None for old rows
        }
        for m in past
    ]
    user = "PRIOR MEMORIES:\n" + json.dumps(digest, indent=2)
    if vision:
        user += (
            "\n\nVISION OF THE NEW MEMORY'S PHOTOS (already read once from the "
            "images):\n" + json.dumps(vision, indent=2)
            + "\n\nFold what genuinely recurs from this into the world summary."
        )

    return complete_json(_SYSTEM, user)
