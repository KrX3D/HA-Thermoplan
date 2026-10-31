"""Websocket API used by the editor frontend."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .engine.schedule import validate
from .model import (
    CUTOFF_GLOBAL,
    CUTOFF_NONE,
    CUTOFF_ROOM,
    OFF_FIXED,
    OFF_HVAC,
    schedule_from_dict,
    settings_from_dict,
)
from .schedy_import import ImportFailed, parse_schedy

if TYPE_CHECKING:
    from .controller import Controller

_LOGGER = logging.getLogger(__name__)


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
    for handler in (ws_get, ws_set_profiles, ws_set_schedule, ws_delete_schedule, ws_set_room_plan, ws_set_settings, ws_import_schedy, ws_save_room, ws_delete_room, ws_get_log):
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
        vol.Optional("dry_run", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_import_schedy(hass, connection, msg, controller) -> None:
    dry_run = msg["dry_run"]
    if not dry_run:
        controller.log(f"Schedy import started ({len(msg['yaml'])} characters)")
    try:
        result = await hass.async_add_executor_job(parse_schedy, msg["yaml"])
        report = await controller.async_import(result, msg["create_rooms"], dry_run)
    except ImportFailed as err:
        if not dry_run:
            controller.log(f"Schedy import failed: {err}", level=logging.WARNING)
        connection.send_error(msg["id"], "invalid", str(err))
        return
    except Exception as err:  # noqa: BLE001 - report every failure to the UI instead of a silent hang
        _LOGGER.exception("Schedy import failed")
        controller.log(f"Schedy import failed: {type(err).__name__}: {err}", level=logging.ERROR)
        connection.send_error(msg["id"], "import_failed", f"{type(err).__name__}: {err}")
        return
    if not dry_run:
        controller.log(
            f"Schedy import done: {len(report['profiles'])} profiles, {len(report['schedules'])} schedules, "
            f"{len(report['rooms_created'])} rooms created, {len(report['rooms_matched'])} matched, "
            f"{len(report['warnings'])} warnings"
        )
    connection.send_result(msg["id"], report)


_OPT_STR = vol.Any(None, str)
ROOM_DATA = vol.Schema(
    {
        vol.Required("climate_entity"): vol.All(str, vol.Match(r"^climate\.")),
        vol.Optional("off_mode", default=OFF_HVAC): vol.In([OFF_HVAC, OFF_FIXED]),
        vol.Optional("off_target", default=4.5): vol.All(vol.Coerce(float), vol.Range(min=0, max=35)),
        vol.Optional("override_minutes", default=60): vol.All(int, vol.Range(min=0, max=1440)),
        vol.Optional("window_sensors", default=[]): [str],
        vol.Optional("cutoff_scope", default=CUTOFF_GLOBAL): vol.In(
            [CUTOFF_GLOBAL, CUTOFF_ROOM, CUTOFF_NONE]
        ),
        vol.Optional("outdoor_sensor"): _OPT_STR,
        vol.Optional("weather_entity"): _OPT_STR,
        vol.Optional("threshold"): vol.Any(None, vol.Coerce(float)),
        vol.Optional("off_after_minutes", default=30): vol.All(int, vol.Range(min=0)),
        vol.Optional("on_after_minutes", default=10): vol.All(int, vol.Range(min=0)),
        vol.Optional("offset", default=0.0): vol.Coerce(float),
    }
)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "thermoplan/save_room",
        vol.Optional("room_id"): str,
        vol.Required("name"): vol.All(str, vol.Length(min=1)),
        vol.Required("data"): ROOM_DATA,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_save_room(hass, connection, msg, controller) -> None:
    room_id = msg.get("room_id")
    if room_id and room_id not in controller.entry.subentries:
        connection.send_error(msg["id"], "not_found", "Unknown room")
        return
    new_id = await controller.async_save_room(room_id, msg["name"].strip(), dict(msg["data"]))
    connection.send_result(msg["id"], {"room_id": new_id})


@websocket_api.websocket_command(
    {vol.Required("type"): "thermoplan/delete_room", vol.Required("room_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_delete_room(hass, connection, msg, controller) -> None:
    if msg["room_id"] not in controller.entry.subentries:
        connection.send_error(msg["id"], "not_found", "Unknown room")
        return
    await controller.async_delete_room(msg["room_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "thermoplan/get_log"})
@websocket_api.require_admin
@websocket_api.async_response
@_with_controller
async def ws_get_log(hass, connection, msg, controller) -> None:
    connection.send_result(msg["id"], list(reversed(controller.events)))
