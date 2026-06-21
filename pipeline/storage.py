# ============================================================================
#  Storage I/O from the GPU (pipeline side of CONTRACT D).
#  Owned by P3. Bridges Modal's local /tmp disk and the Supabase "memories"
#  bucket. The backend uploads inputs; here we download them and upload outputs.
# ============================================================================

import json
import os
from functools import lru_cache

BUCKET = "memories"


@lru_cache(maxsize=1)
def _client():
    """Lazily create the Supabase client so importing this module doesn't require
    SUPABASE_* env (handy for local tests that stub storage)."""
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def download(key: str, dest_dir: str) -> str:
    """Download a storage object to dest_dir. Returns the local file path."""
    os.makedirs(dest_dir, exist_ok=True)
    local_path = os.path.join(dest_dir, os.path.basename(key))
    data = _client().storage.from_(BUCKET).download(key)
    with open(local_path, "wb") as f:
        f.write(data)
    return local_path


def upload(local_path: str, key: str) -> None:
    """Upload a local file to the bucket at `key` (e.g. memories/<id>/scene.splat)."""
    with open(local_path, "rb") as f:
        _client().storage.from_(BUCKET).upload(
            key,
            f,
            {"content-type": "application/octet-stream", "upsert": "true"},
        )


def public_url(key: str) -> str:
    """Public HTTPS URL for a key (bucket must be public). Stored as splat_url."""
    return _client().storage.from_(BUCKET).get_public_url(key)


# --- small-JSON helpers (used by the persona store) -------------------------
# These keep tiny JSON docs (e.g. the singleton persona) in the same bucket,
# so the agent layer doesn't need its own storage wiring.

def read_json(key: str) -> dict | None:
    """Read a JSON object stored at `key`. Returns None if it doesn't exist."""
    try:
        data = _client().storage.from_(BUCKET).download(key)
    except Exception:  # noqa: BLE001 — "not found" surfaces as an exception
        return None
    return json.loads(data)


def write_json(key: str, obj: dict) -> None:
    """Write a JSON object to `key` (upsert)."""
    payload = json.dumps(obj, indent=2).encode("utf-8")
    _client().storage.from_(BUCKET).upload(
        key,
        payload,
        {"content-type": "application/json", "upsert": "true"},
    )
