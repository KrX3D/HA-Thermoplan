"""Thermoplan: schedule-based thermostat control with global heating profiles.

Home Assistant imports are kept inside functions so the pure-Python engine can be
imported and tested without Home Assistant installed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the websocket API."""
    from .websocket_api import async_register

    async_register(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Thermoplan from a config entry."""
    from .const import PLATFORMS
    from .controller import Controller

    controller = Controller(hass, entry)
    await controller.async_load()
    entry.runtime_data = controller

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    controller.async_start()
    entry.async_on_unload(controller.async_stop)
    await _async_setup_frontend(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    from .const import PLATFORMS

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload when rooms (subentries) change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_setup_frontend(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register panel and card when the frontend is available (not in bare test setups)."""
    from homeassistant.loader import async_get_loaded_integration

    from . import frontend

    if not {"frontend", "http", "panel_custom"} <= hass.config.components:
        return
    version = async_get_loaded_integration(hass, entry.domain).version or "0"
    await frontend.async_register(hass, str(version))
    entry.async_on_unload(lambda: frontend.async_unregister(hass, str(version)))
