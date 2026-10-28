"""Serve the Thermoplan frontend: sidebar panel and the Lovelace card.

Files are served by a small view with ``Cache-Control: no-cache`` and every relative
module import is rewritten to carry a content hash, so a changed file is never served
from a stale browser cache.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from aiohttp import web
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

URL_BASE = "/thermoplan_static"
PANEL_PATH = "thermoplan"
_FLAG = "frontend_registered"
_DIR = Path(__file__).parent / "frontend"
_IMPORT = re.compile(r'(from\s+")\./([\w-]+\.js)(")')


def _build() -> tuple[str, dict[str, bytes]]:
    """Read all JS files and return (content hash, {name: rewritten bytes})."""
    sources = {path.name: path.read_text(encoding="utf-8") for path in sorted(_DIR.glob("*.js"))}
    digest = hashlib.sha1("".join(sources.values()).encode()).hexdigest()[:10]
    files = {
        name: _IMPORT.sub(rf"\g<1>./\g<2>?v={digest}\g<3>", text).encode()
        for name, text in sources.items()
    }
    return digest, files


class ThermoplanFrontendView(HomeAssistantView):
    """Serve the bundled JS files without caching."""

    url = URL_BASE + "/{filename}"
    name = "api:thermoplan:static"
    requires_auth = False

    def __init__(self, files: dict[str, bytes]) -> None:
        self._files = files

    async def get(self, request: web.Request, filename: str) -> web.Response:
        body = self._files.get(filename)
        if body is None:
            raise web.HTTPNotFound
        return web.Response(
            body=body,
            content_type="text/javascript",
            headers={"Cache-Control": "no-cache"},
        )


async def async_register(hass: HomeAssistant) -> str:
    """Register the view, the card module and the sidebar panel; returns the content hash."""
    digest, files = await hass.async_add_executor_job(_build)
    store = hass.data.setdefault(DOMAIN, {})
    if not store.get(_FLAG):
        hass.http.register_view(ThermoplanFrontendView(files))
        store[_FLAG] = True

    frontend.add_extra_js_url(hass, f"{URL_BASE}/thermoplan-card.js?v={digest}")
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="thermoplan-panel",
        frontend_url_path=PANEL_PATH,
        module_url=f"{URL_BASE}/thermoplan-panel.js?v={digest}",
        sidebar_title="Thermoplan",
        sidebar_icon="mdi:radiator",
        require_admin=True,
        config={},
    )
    return digest


@callback
def async_unregister(hass: HomeAssistant, digest: str) -> None:
    """Remove the panel and card module (the view stays registered)."""
    frontend.async_remove_panel(hass, PANEL_PATH)
    frontend.remove_extra_js_url(hass, f"{URL_BASE}/thermoplan-card.js?v={digest}")
