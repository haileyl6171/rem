# ============================================================================
#  Storage I/O from the GPU (pipeline side of CONTRACT D).
#  Owned by P3. Bridges Modal's local /tmp disk and the Supabase "memories"
#  bucket. The backend uploads inputs; here we download them and upload outputs.
# ============================================================================

import os
from supabase import create_client

_client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

BUCKET = "memories"


def download(key: str, dest_dir: str) -> str:
    """Download a storage object to dest_dir. Returns the local file path."""
    os.makedirs(dest_dir, exist_ok=True)
    local_path = os.path.join(dest_dir, os.path.basename(key))
    data = _client.storage.from_(BUCKET).download(key)
    with open(local_path, "wb") as f:
        f.write(data)
    return local_path


def upload(local_path: str, key: str) -> None:
    """Upload a local file to the bucket at `key` (e.g. memories/<id>/scene.splat)."""
    with open(local_path, "rb") as f:
        _client.storage.from_(BUCKET).upload(
            key,
            f,
            {"content-type": "application/octet-stream", "upsert": "true"},
        )


def public_url(key: str) -> str:
    """Public HTTPS URL for a key (bucket must be public). Stored as splat_url."""
    return _client.storage.from_(BUCKET).get_public_url(key)
