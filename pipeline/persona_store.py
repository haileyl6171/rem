# ============================================================================
#  Persona store — the single, evolving "world spec" for the memories.
#
#  Single-user deployment: there is exactly ONE persona doc, kept as a small
#  JSON object in the same Storage bucket at persona/persona.json. The Persona
#  Creator subagent reads it, merges in each new memory, and writes it back.
#
#  It is the lightweight persona spec (NOT the Pika PDF kit): canonical
#  descriptions of recurring people/places, the locked palette/lighting/camera
#  language, and motifs — exactly the fields needed to condition each new
#  video prompt for visual coherence.
# ============================================================================

import storage

PERSONA_KEY = "persona/persona.json"


def default_persona() -> dict:
    """The empty persona used on the very first memory (cold start)."""
    return {
        "version": 1,
        "memory_count": 0,
        "people": [],      # [{name, description, aliases}]
        "places": [],      # [{name, description}]
        "objects": [],     # [{name, description}]
        "palette": [],     # ["warm amber", "deep navy", ...]
        "lighting": None,  # dominant lighting register across memories
        "camera_language": "slow dolly or gentle orbit through a static scene",
        "motifs": [],      # recurring visual ideas
        "mood": None,      # the overall emotional register
        "reference_frame_key": None,  # storage key of an init frame to reuse
    }


def load() -> dict:
    """Load the persona, or a fresh default if none exists yet."""
    existing = storage.read_json(PERSONA_KEY)
    return existing if existing else default_persona()


def save(persona: dict) -> None:
    """Persist the persona singleton."""
    storage.write_json(PERSONA_KEY, persona)
