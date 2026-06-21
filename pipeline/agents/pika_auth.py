# ============================================================================
#  Pika MCP OAuth — the Pika MCP server is OAuth-only, so we can't just send a
#  static bearer. The flow:
#
#    1. ONCE, interactively (browser):  python -m agents.pika_auth authorize
#       → completes the OAuth code flow and writes tokens (incl. a refresh token)
#         to PIKA_MCP_TOKEN_PATH.
#    2. AT RUNTIME (headless, e.g. Modal): build_runtime_provider() loads those
#       tokens and the mcp SDK silently refreshes the access token as needed —
#       no browser, no human. Ship the token file (or its contents) to Modal as
#       a secret / mounted file via PIKA_MCP_TOKEN_PATH.
#
#  All of this is OPTIONAL: if it isn't set up, agents/creative.py degrades to no
#  creative vision and the pipeline still runs.
# ============================================================================

import asyncio
import json
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.session import ClientSession
from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

# Pika's protected-resource metadata declares the resource as the FULL endpoint
# path, so server_url (used for RFC 8707 resource validation) must include it —
# not just the host root — or the OAuth flow fails with a resource mismatch.
MCP_URL = os.environ.get("PIKA_MCP_URL", "https://mcp.pika.me/api/mcp")
SERVER_URL = os.environ.get("PIKA_MCP_SERVER", MCP_URL)
_TOKEN_PATH = Path(
    os.environ.get("PIKA_MCP_TOKEN_PATH", str(Path.home() / ".pika" / "pika_mcp_tokens.json"))
)
_REDIRECT_PORT = int(os.environ.get("PIKA_MCP_REDIRECT_PORT", "8765"))
_REDIRECT_URI = f"http://localhost:{_REDIRECT_PORT}/callback"


class FileTokenStorage(TokenStorage):
    """Persists OAuth tokens + dynamic client registration as JSON on disk."""

    def __init__(self, path: Path = _TOKEN_PATH):
        self.path = path
        self._data = json.loads(path.read_text()) if path.exists() else {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._data, indent=2))

    async def get_tokens(self) -> OAuthToken | None:
        tok = self._data.get("tokens")
        if not tok and os.environ.get("PIKA_MCP_REFRESH_TOKEN"):
            # Seed from a refresh token supplied via env (e.g. a Modal secret).
            tok = {"access_token": "", "token_type": "Bearer",
                   "refresh_token": os.environ["PIKA_MCP_REFRESH_TOKEN"]}
        return OAuthToken.model_validate(tok) if tok else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self._data["tokens"] = tokens.model_dump(mode="json")
        self._save()

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        info = self._data.get("client_info")
        return OAuthClientInformationFull.model_validate(info) if info else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self._data["client_info"] = client_info.model_dump(mode="json")
        self._save()


def _client_metadata() -> OAuthClientMetadata:
    return OAuthClientMetadata(
        client_name="Rem memory pipeline",
        redirect_uris=[_REDIRECT_URI],
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
    )


def has_credentials() -> bool:
    """True if a one-time authorization (or an env refresh token) is available."""
    return _TOKEN_PATH.exists() or bool(os.environ.get("PIKA_MCP_REFRESH_TOKEN"))


async def _headless_unauthorized(*_args, **_kwargs):
    raise RuntimeError(
        "Pika MCP is not authorized. Run `python -m agents.pika_auth authorize` "
        "once, then provide PIKA_MCP_TOKEN_PATH (or PIKA_MCP_REFRESH_TOKEN)."
    )


def build_runtime_provider() -> OAuthClientProvider:
    """Headless provider: refreshes silently from stored tokens. The redirect/
    callback handlers raise — they must never fire once tokens exist."""
    return OAuthClientProvider(
        server_url=SERVER_URL,
        client_metadata=_client_metadata(),
        storage=FileTokenStorage(),
        redirect_handler=_headless_unauthorized,
        callback_handler=_headless_unauthorized,
    )


# --- one-time interactive authorization -------------------------------------

def _capture_code() -> tuple[str, str | None]:
    """Spin up a one-shot local server to catch the OAuth redirect."""
    result: dict[str, str | None] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            qs = parse_qs(urlparse(self.path).query)
            result["code"] = (qs.get("code") or [None])[0]
            result["state"] = (qs.get("state") or [None])[0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Pika authorized. You can close this tab.")

        def log_message(self, *_):  # silence the default logging
            pass

    server = HTTPServer(("localhost", _REDIRECT_PORT), Handler)
    server.handle_request()  # blocks until the single callback arrives
    server.server_close()
    return result.get("code") or "", result.get("state")


async def _authorize_async() -> None:
    storage = FileTokenStorage()

    async def redirect_handler(authorization_url: str) -> None:
        print(f"\nOpen this URL to authorize Pika:\n{authorization_url}\n")
        webbrowser.open(authorization_url)

    async def callback_handler() -> tuple[str, str | None]:
        return await asyncio.to_thread(_capture_code)

    provider = OAuthClientProvider(
        server_url=SERVER_URL,
        client_metadata=_client_metadata(),
        storage=storage,
        redirect_handler=redirect_handler,
        callback_handler=callback_handler,
    )

    # Connecting triggers the OAuth flow; success persists tokens via storage.
    async with streamablehttp_client(MCP_URL, auth=provider) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
    print(f"Authorized. Tokens saved to {_TOKEN_PATH}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "authorize":
        asyncio.run(_authorize_async())
    else:
        print("usage: python -m agents.pika_auth authorize")
