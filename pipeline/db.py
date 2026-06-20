# ============================================================================
#  DB writes from the GPU (pipeline side of CONTRACT C).
#  Owned by P3. The pipeline updates the SAME `memories` row the backend created.
#  Uses the Supabase service-role key (set as a Modal secret).
# ============================================================================

import os
from supabase import create_client  # pip: supabase

_client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


def set_status(memory_id: str, status: str, progress: int = 0) -> None:
    """status ∈ GENERATING | RECONSTRUCTING | TRAINING  (Contract C enum)."""
    _client.table("memories").update(
        {"status": status, "progress": progress}
    ).eq("id", memory_id).execute()


def set_ready(memory_id: str, splat_url: str) -> None:
    """Final success: store the splat URL and flip to READY."""
    _client.table("memories").update(
        {"status": "READY", "progress": 100, "splat_url": splat_url}
    ).eq("id", memory_id).execute()


def set_failed(memory_id: str, error: str) -> None:
    """Any failure: record a human-readable error and flip to FAILED."""
    _client.table("memories").update(
        {"status": "FAILED", "error": error[:2000]}
    ).eq("id", memory_id).execute()
