"""Thermoplan: schedule-based thermostat control with global heating profiles.

Home Assistant imports are kept inside functions so the pure-Python engine can be
imported and tested without Home Assistant installed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .const import DOMAIN

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

try:
    from homeassistant.helpers import config_validation as cv

    CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
except ImportError:  # the engine tests run without Home Assistant installed
    CONFIG_SCHEMA = None


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the websocket API."""
    from .websocket_api import async_register

    async_register(hass)
    from .services import async_register_services

    async_register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Thermoplan from a config entry."""
    from .const import PLATFORMS
    from .controller import Controller

    controller = Controller(hass, entry)
    await controller.async_load()
    _async_register_devices(hass, entry)
    entry.runtime_data = controller

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    controller.async_start()
    entry.async_on_unload(controller.async_stop)
    await _async_setup_frontend(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


def _async_register_devices(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Create the Thermoplan hub device and one device per room under it.

    The entities then refer to these devices by identifier only; passing ``via_device`` in their DeviceInfo
    is deprecated (breaks in Home Assistant 2027.8).
    """
    import inspect

    from homeassistant.helpers import device_registry as dr

    from .const import SUBENTRY_ROOM

    registry = dr.async_get(hass)
    hub = registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        name="Thermoplan",
        entry_type=dr.DeviceEntryType.SERVICE,
    )
    by_id = "via_device_id" in inspect.signature(registry.async_get_or_create).parameters
    for subentry in entry.subentries.values():
        if subentry.subentry_type != SUBENTRY_ROOM:
            continue
        parent = {"via_device_id": hub.id} if by_id else {"via_device": (DOMAIN, entry.entry_id)}
        registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            config_subentry_id=subentry.subentry_id,
            identifiers={(DOMAIN, subentry.subentry_id)},
            name=subentry.title,
            **parent,
        )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    from .const import PLATFORMS

    await entry.runtime_data.async_flush_log()  # a reload must not lose the latest events
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload when rooms (subentries) change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_setup_frontend(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register panel and card when the frontend is available (not in bare test setups)."""
    from . import frontend

    if not {"frontend", "http", "panel_custom"} <= hass.config.components:
        return
    await frontend.async_register(hass)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove the sidebar panel when the integration is deleted (not on reload)."""
    from . import frontend

    frontend.async_unregister(hass)
