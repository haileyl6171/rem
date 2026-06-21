# ============================================================================
#  SUBAGENT 2 — Memory Context Extractor.
#
#  Given the NEW journal entry plus the analyzer's world summary and the current
#  persona, it pulls only the RELEVANT slice: which known people/places/objects
#  this new memory connects to, which style cues to carry over for coherence,
#  and which entities are genuinely NEW (so the persona can grow).
#
#  This keeps the final prompt grounded — it inherits "grandma's kitchen" and
#  the golden-hour palette when relevant, and ignores unrelated history.
# ============================================================================

import json

from agents.client import complete_json

_SYSTEM = """You are the Memory Context Extractor in a memory-reconstruction
system. You receive:
  1. NEW_ENTRY     — the journal entry we are about to turn into a scene.
  2. WORLD_SUMMARY — the recurring people/places/style across past memories.
  3. PERSONA       — the current canonical world spec.

Decide what from the established world this new entry actually connects to, and
what is new. Only carry over what genuinely fits the new entry — do not force
unrelated people or places in. If the entry stands alone, say so.

Output JSON with exactly these keys:
{
  "connected_people":  [str],   // names from PERSONA/WORLD this entry involves
  "connected_places":  [str],   // recurring settings this entry takes place in
  "connected_objects": [str],   // recurring props that belong in this scene
  "carry_over_style":  {        // coherence cues to reuse (null if none apply)
      "palette":  [str],
      "lighting": str | null,
      "mood":     str | null
  },
  "new_people":  [{"name": str, "description": str}],
  "new_places":  [{"name": str, "description": str}],
  "new_objects": [{"name": str, "description": str}],
  "scene_summary": str          // 1-2 sentences: what this scene literally shows
}"""


def extract_context(description: str, world_summary: dict, persona: dict) -> dict:
    user = (
        "NEW_ENTRY:\n" + (description or "(empty)").strip()
        + "\n\nWORLD_SUMMARY:\n" + json.dumps(world_summary, indent=2)
        + "\n\nPERSONA:\n" + json.dumps(persona, indent=2)
    )
    return complete_json(_SYSTEM, user)
