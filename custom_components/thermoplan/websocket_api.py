"""Websocket API used by the editor frontend."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .engine.schedule import validate
from .model import schedule_from_dict, settings_from_dict
from .schedy_import import ImportFailed, parse_schedy

if TYPE_CHECKING:
    from .controller import Controller


def _controller(hass: HomeAssistant) -> Controller | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0].runtime_data if entries else None


def _with_controller(func):
    """Resolve the controller or answer with an error."""

    async def wrapper(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
        controller = _controller(hass)
        if controller is None:
            connection.send_error(msg["id"], "not_loaded", "Thermoplan is not set up")
            return
        await func(hass, connection, msg, controller)

    return wrapper


@callback
def async_register(hass: HomeAssistant) -> None:
    for handler in (ws_get, ws_set_profiles, ws_set_schedule, ws_delete_schedule, ws_set_room_plan, ws_set_settings, ws_import_schedy):
        websocket_api.async_register_command(hass, handler)


@websocket_api.websocket_command({vol.Required("type"): "thermoplan/get"})
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_get(hass, connection, msg, controller) -> None:
    connection.send_result(msg["id"], controller.snapshot())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "thermoplan/set_profiles",
        vol.Required("profiles"): [str],
        vol.Optional("renames", default={}): {str: str},
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_set_profiles(hass, connection, msg, controller) -> None:
    profiles = msg["profiles"]
    if len(set(profiles)) != len(profiles) or not all(p.strip() for p in profiles):
        connection.send_error(msg["id"], "invalid", "Profile names must be unique and not empty")
        return
    await controller.async_set_profiles(profiles, msg["renames"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "thermoplan/set_schedule", vol.Required("schedule"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_set_schedule(hass, connection, msg, controller) -> None:
    try:
        schedule = schedule_from_dict(msg["schedule"])
    except (KeyError, TypeError, ValueError) as err:
        connection.send_error(msg["id"], "invalid", f"Malformed schedule: {err}")
        return
    if errors := validate(schedule):
        connection.send_error(msg["id"], "invalid", "; ".join(errors))
        return
    await controller.async_set_schedule(schedule)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "thermoplan/delete_schedule", vol.Required("name"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_delete_schedule(hass, connection, msg, controller) -> None:
    await controller.async_delete_schedule(msg["name"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "thermoplan/set_room_plan",
        vol.Required("room_id"): str,
        vol.Required("plan"): {str: str},
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_set_room_plan(hass, connection, msg, controller) -> None:
    if msg["room_id"] not in controller.rooms:
        connection.send_error(msg["id"], "not_found", "Unknown room")
        return
    data = controller.data
    if any(p not in data.profiles or s not in data.schedules for p, s in msg["plan"].items()):
        connection.send_error(msg["id"], "invalid", "Unknown profile or schedule")
        return
    await controller.async_set_room_plan(msg["room_id"], msg["plan"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "thermoplan/set_settings", vol.Required("settings"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_set_settings(hass, connection, msg, controller) -> None:
    try:
        settings = settings_from_dict(msg["settings"])
    except (KeyError, TypeError, ValueError) as err:
        connection.send_error(msg["id"], "invalid", f"Malformed settings: {err}")
        return
    await controller.async_set_settings(settings)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): "thermoplan/import_schedy",
        vol.Required("yaml"): str,
        vol.Optional("create_rooms", default=True): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_import_schedy(hass, connection, msg, controller) -> None:
    try:
        result = parse_schedy(msg["yaml"])
    except ImportFailed as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], await controller.async_import(result, msg["create_rooms"]))
