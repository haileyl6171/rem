# ============================================================================
#  PHOTO ANALYZER — the ONE-TIME read of the user's uploaded images.
#
#  Runs exactly once per memory, the first time its photos arrive: Gemini
#  (multimodal) looks at the actual pixels and returns a structured description.
#  The orchestrator caches the result on the memory row (`vision` column), so the
#  images are NEVER sent to Gemini again — every later step and every future
#  memory reads the cached text instead. This is what keeps the expensive vision
#  pass to a single call while still grounding the whole persona in real photos.
# ============================================================================

from agents.client import complete_json

_SYSTEM = """You are the Photo Analyzer in a memory-reconstruction system.
You are shown the photo(s) a person uploaded for a single memory. Describe ONLY
what is actually visible — do not invent details that aren't in the images.

Be concrete and visual: "warm window light across a wood-floored kitchen" beats
"cozy". Capture the setting, the people present, notable objects, the dominant
colors, the lighting, and the overall mood.

Output JSON with exactly these keys:
{
  "summary":  str,            // 1-2 sentences: what the photos literally show
  "people":   [str],          // people visible (roles/appearance, not guessed names)
  "places":   [str],          // settings visible
  "objects":  [str],          // notable objects/subjects in frame
  "palette":  [str],          // dominant colors/tones
  "lighting": str | null,     // observed lighting
  "mood":     str | null      // emotional register
}"""


def _empty() -> dict:
    return {
        "summary": "", "people": [], "places": [], "objects": [],
        "palette": [], "lighting": None, "mood": None,
    }


def analyze_photos(image_paths: list[str]) -> dict:
    """One Gemini vision call over the uploaded photos → structured PhotoAnalysis.

    Returns an empty analysis if there are no photos. The caller is responsible
    for persisting the result so this is never run twice for the same memory.
    """
    if not image_paths:
        return _empty()
    user = (
        "Analyze the attached photo(s) for this memory and return the JSON described."
    )
    return complete_json(_SYSTEM, user, images=image_paths)
