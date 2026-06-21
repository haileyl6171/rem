# ============================================================================
#  STEP 1 (legacy) — journal text → a video-generation prompt.   [P3]
#  Superseded by steps/compose_scene.py (the agentic, persona-coherent version
#  the pipeline actually runs). Kept as the simple one-shot fallback; it now
#  delegates to the shared Gemini client so there's a single LLM dependency.
#
#  Goal: turn a freeform journal entry into a prompt that makes Pika produce
#  footage that reconstructs well (slow camera motion, consistent geometry,
#  parallax — NOT fast cuts or wild motion).
# ============================================================================

from agents.client import complete_text

_SYSTEM = (
    "You convert a personal journal entry into a single, vivid prompt for a "
    "text-to-video model. The video will be fed to photogrammetry (COLMAP) to "
    "build a 3D scene, so the described shot MUST be a slow, smooth camera move "
    "(gentle dolly or orbit) through a coherent, static environment with strong "
    "parallax. No fast motion, no cuts, no people moving. Describe the place, "
    "light, and mood. Return ONLY the prompt text, no preamble."
)


def make_prompt(description: str) -> str:
    """description -> a single video-generation prompt string."""
    if not description.strip():
        description = "a quiet, memorable place"
    return complete_text(_SYSTEM, description, max_tokens=1024)
