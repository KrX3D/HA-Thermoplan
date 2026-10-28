"""Serve the Thermoplan frontend: sidebar panel and the Lovelace card."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

URL_BASE = "/thermoplan_static"
PANEL_PATH = "thermoplan"
_FLAG = "frontend_registered"


async def async_register(hass: HomeAssistant, version: str) -> None:
    """Register static files, the card module and the sidebar panel (once per run)."""
    store = hass.data.setdefault(DOMAIN, {})
    if not store.get(_FLAG):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(URL_BASE, str(Path(__file__).parent / "frontend"), False)]
        )
        store[_FLAG] = True

    frontend.add_extra_js_url(hass, f"{URL_BASE}/thermoplan-card.js?v={version}")
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="thermoplan-panel",
        frontend_url_path=PANEL_PATH,
        module_url=f"{URL_BASE}/thermoplan-panel.js?v={version}",
        sidebar_title="Thermoplan",
        sidebar_icon="mdi:radiator",
        require_admin=True,
        config={},
    )


@callback
def async_unregister(hass: HomeAssistant, version: str) -> None:
    """Remove the panel and card module (static path stays registered)."""
    frontend.async_remove_panel(hass, PANEL_PATH)
    frontend.remove_extra_js_url(hass, f"{URL_BASE}/thermoplan-card.js?v={version}")
