# ============================================================================
#  SUBAGENT 3 — Persona Creator.
#
#  Merges the extracted context for the new memory into the persistent persona
#  spec. New people/places/objects get added (deduplicated, canonical names);
#  the palette/lighting/mood/motifs are updated to reflect the world as it now
#  stands. Returns the FULL updated persona, which the orchestrator saves.
#
#  This is what makes coherence accumulate: memory #7 is conditioned on a
#  persona shaped by memories #1–#6.
# ============================================================================

import json

from agents.client import complete_json

_SYSTEM = """You are the Persona Creator in a memory-reconstruction system.
You maintain a single evolving persona spec describing the person's visual
world across all their memories.

You receive the CURRENT_PERSONA and the EXTRACTED_CONTEXT for a new memory.
Merge the context in and return the COMPLETE updated persona.

Rules:
- Add genuinely new people/places/objects; do NOT duplicate ones already present
  (match on name/meaning, merge descriptions, keep the richer wording).
- Keep canonical, stable names ("Grandma", not "my grandmother" one time and
  "grandma" the next).
- Update palette/lighting/mood/motifs to reflect the world as a whole — evolve
  them, don't thrash them on a single off-theme memory.
- Increment "memory_count" by 1. Keep "version", "camera_language", and
  "reference_frame_key" unless the context clearly warrants a change.

Output JSON: the full persona object with exactly these keys:
{
  "version": int,
  "memory_count": int,
  "people":  [{"name": str, "description": str, "aliases": [str]}],
  "places":  [{"name": str, "description": str}],
  "objects": [{"name": str, "description": str}],
  "palette": [str],
  "lighting": str | null,
  "camera_language": str,
  "motifs": [str],
  "mood": str | null,
  "reference_frame_key": str | null
}"""


def update_persona(persona: dict, context: dict) -> dict:
    user = (
        "CURRENT_PERSONA:\n" + json.dumps(persona, indent=2)
        + "\n\nEXTRACTED_CONTEXT:\n" + json.dumps(context, indent=2)
    )
    updated = complete_json(_SYSTEM, user)
    # Defensive: guarantee the counter advances even if the model forgets.
    if updated.get("memory_count", 0) <= persona.get("memory_count", 0):
        updated["memory_count"] = persona.get("memory_count", 0) + 1
    return updated
