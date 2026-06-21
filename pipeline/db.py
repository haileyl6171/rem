# ============================================================================
#  DB writes from the GPU (pipeline side of CONTRACT C).
#  Owned by P3. The pipeline updates the SAME `memories` row the backend created.
#  Uses the Supabase service-role key (set as a Modal secret).
# ============================================================================

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def _client():
    """Lazily create the Supabase client so importing this module doesn't require
    SUPABASE_* env (handy for local tests that stub the DB)."""
    from supabase import create_client  # pip: supabase

    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def set_status(memory_id: str, status: str, progress: int = 0) -> None:
    """status ∈ GENERATING | RECONSTRUCTING | TRAINING  (Contract C enum)."""
    _client().table("memories").update(
        {"status": status, "progress": progress}
    ).eq("id", memory_id).execute()


def set_ready(memory_id: str, splat_url: str) -> None:
    """Final success: store the splat URL and flip to READY."""
    _client().table("memories").update(
        {"status": "READY", "progress": 100, "splat_url": splat_url}
    ).eq("id", memory_id).execute()


def set_failed(memory_id: str, error: str) -> None:
    """Any failure: record a human-readable error and flip to FAILED."""
    _client().table("memories").update(
        {"status": "FAILED", "error": error[:2000]}
    ).eq("id", memory_id).execute()


# --- coherence layer (read past memories, cache this scene's analysis) -------

def get_past_memories(exclude_id: str) -> list[dict]:
    """
    Prior memories for the (single) user — every row except the current one,
    oldest first. Used by the Past Memory Analyzer. Returns
    [{id, description, analysis, created_at}, ...].
    """
    resp = (
        _client().table("memories")
        .select("id, description, analysis, created_at")
        .neq("id", exclude_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def save_analysis(memory_id: str, analysis: dict) -> None:
    """Cache this memory's structured scene read so future memories stay coherent."""
    _client().table("memories").update(
        {"analysis": analysis}
    ).eq("id", memory_id).execute()


def get_vision(memory_id: str) -> dict | None:
    """The one-time photo analysis for this memory, or None if not yet computed."""
    resp = (
        _client().table("memories")
        .select("vision")
        .eq("id", memory_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0].get("vision") if rows else None


def save_vision(memory_id: str, vision: dict) -> None:
    """Persist the one-time photo analysis so the images are never re-sent to Gemini."""
    _client().table("memories").update(
        {"vision": vision}
    ).eq("id", memory_id).execute()
