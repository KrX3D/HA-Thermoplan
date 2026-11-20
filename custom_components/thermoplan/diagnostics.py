"""Download diagnostics: configuration, current state, learned models and the end of the log."""

from __future__ import annotations

import re
from dataclasses import asdict
from datetime import datetime
from typing import Any

from homeassistant.components.diagnostics import REDACTED, async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN
from .controller import Controller, local_now
from .model import entity_references, settings_to_dict, schedule_to_dict

LOG_EVENTS = 300  # newest events in the file
STATS_DAYS = 14  # newest heating statistics days per room
SAMPLES = 40  # newest learning samples per room

# These files usually end up in public issues: hide who lives here, where they go and what is in
# their calendar. Presence states "home"/"not_home" are not personal and stay readable.
SETTINGS_REDACT = {"person_entity", "match"}  # match = calendar event text (free day, calendar away)
GLOBAL_REDACT = {"free_reason", "event"}  # free day reason and calendar away event title
PERSON_ATTR_REDACT = {
    "friendly_name", "latitude", "longitude", "gps_accuracy", "altitude", "user_id", "id",
    "device_trackers", "source", "entity_picture", "in_zones",
}
CALENDAR_ATTR_REDACT = {"message", "description", "location"}
PLAIN_STATES = {None, "home", "not_home"}
# Quoted person states / zone names and calendar titles in our own log messages.
_LOG_PATTERNS = (
    (re.compile(r"changed from '.*?' to '.*?'(?=;|$)"), f"changed from '{REDACTED}' to '{REDACTED}'"),
    (re.compile(r"calendar event '.*?'(?=;|$)"), f"calendar event '{REDACTED}'"),
    (re.compile(r"Away from calendar started \('.*?'(?=, until|\))"), f"Away from calendar started ('{REDACTED}'"),
)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value is not None else None


def _room(controller: Controller, room_id: str, now: datetime) -> dict[str, Any]:
    room = controller.rooms[room_id]
    rt = controller.runtime.get(room_id)
    model = controller.models.get(room_id)
    min_samples = int(controller.data.settings.feature("learning")["min_samples"])
    learning = controller.data.learning.get(room_id, {})
    stats = controller.data.stats.get(room_id, {})
    out: dict[str, Any] = {
        "id": room.id,
        "name": room.name,
        "config": dict(controller.entry.subentries[room_id].data) if room_id in controller.entry.subentries else None,
        "plan": controller.data.room_plans.get(room_id, {}),
        "room_temperature": controller.room_temperature(room),
        "device_window_open": controller.device_window_open(room),
        "model": None if model is None else {**asdict(model), "ready": model.ready(min_samples)},
        "learning_samples": learning.get("samples", [])[-SAMPLES:],
        "learning_sample_count": len(learning.get("samples", [])),
        "stats": {day: stats[day] for day in sorted(stats)[-STATS_DAYS:]},
        "warnings": {k: v for k, v in controller.warnings.items() if k.startswith(f"{room_id}:")},
    }
    if rt is not None:
        decision = rt.decision
        out["runtime"] = {
            "decision": None if decision is None else {
                "target": decision.target, "reason": str(decision.reason), "hold": decision.hold,
            },
            "target": rt.target,
            "base_target": rt.base_target,
            "prev_target": rt.prev_target,
            "adjustments": rt.adjustments,
            "last_sent": rt.last_sent,
            "sent_off": rt.sent_off,
            "last_command": _iso(rt.last_command),
            "take_control": rt.take_control,
            "override": None if rt.override is None else {
                "started": _iso(rt.override.started),
                "minutes": rt.override.minutes,
                "active": rt.override.active(now),
            },
            "cutoff": {
                "heating_allowed": rt.cutoff.heating_allowed,
                "offset": rt.cutoff.offset,
                "threshold": rt.cutoff.threshold,
                "since": _iso(rt.cutoff._since),  # noqa: SLF001
            },
            "learning": rt.learning,
            "learn_note": rt.learn_note,
            "learn_state": rt.learn_state,
            "window_since": _iso(rt.window_since),
            "window_notified": rt.window_notified,
            "device_window": rt.device_window,
            "occupancy_raw": rt.occ_raw,
            "occupancy_raw_since": _iso(rt.occ_raw_since),
            "occupancy_settled": rt.occ_settled,
            "unavailable_since": _iso(rt.unavail_since),
            "unreached_since": _iso(rt.unreach_since),
            "mismatch_since": _iso(rt.mismatch_since),
            "heating": rt.stat_heating,
        }
    return out


def _settings(controller: Controller) -> dict[str, Any]:
    out = async_redact_data(settings_to_dict(controller.data.settings), SETTINGS_REDACT)
    for rule in out["presence_rules"]:  # zone names
        for key in ("state", "from_state"):
            if rule.get(key) not in PLAIN_STATES:
                rule[key] = REDACTED
    return out


def _entity_states(hass: HomeAssistant, controller: Controller) -> dict[str, Any]:
    """State and attributes of every entity the configuration uses."""
    out: dict[str, Any] = {}
    for ref in entity_references(controller.data.settings, list(controller.rooms.values())):
        state = hass.states.get(ref.entity)
        value = None if state is None else state.state
        attributes = None if state is None else dict(state.attributes)
        key = ref.entity
        if ref.kind == "person":
            key = f"person.{REDACTED}"
            if value not in PLAIN_STATES:
                value = REDACTED  # a zone name
            attributes = async_redact_data(attributes, PERSON_ATTR_REDACT)
        elif ref.entity.startswith("calendar."):
            attributes = async_redact_data(attributes, CALENDAR_ATTR_REDACT)
        out[key] = {
            "kind": ref.kind,
            "room": ref.room_name,
            "state": value,
            "attributes": attributes,
            "last_changed": None if state is None else _iso(state.last_changed),
        }
    return out


def _redact_text(text: str, controller: Controller) -> str:
    person = controller.data.settings.person_entity
    if person:
        text = text.replace(person, f"person.{REDACTED}")
    for pattern, replacement in _LOG_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _log(controller: Controller) -> list[dict[str, Any]]:
    out = []
    for event in list(controller.events)[-LOG_EVENTS:]:
        event = dict(event)
        for key in ("message", "detail"):
            if isinstance(event.get(key), str):
                event[key] = _redact_text(event[key], controller)
        out.append(event)
    return out


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    """One JSON file with everything needed to follow a report from a real house."""
    controller: Controller = entry.runtime_data
    integration = await async_get_integration(hass, DOMAIN)
    now = local_now()
    data = controller.data
    global_state = async_redact_data({
        "active_profile": data.state.active_profile,
        "season_active": controller.season_active,
        "away": controller.away_active,
        "away_info": controller.away_info,
        "away_days": controller.away_days,
        "free_day": controller.free_day,
        "free_reason": controller.free_reason,
        "calendar_away": controller.calendar_away,
        "forecast_warm": controller.forecast_warm,
        "forecast_max": controller.forecast_max,
        "holds": [h.to_dict() for h in controller.holds],
        "warnings": controller.warnings,
    }, GLOBAL_REDACT)
    return {
        "version": str(integration.version),
        "now": _iso(now),
        "global": global_state,
        "profiles": data.profiles,
        "settings": _settings(controller),
        "schedules": {name: schedule_to_dict(s) for name, s in data.schedules.items()},
        "state": vars(data.state).copy(),
        "rooms": [_room(controller, room_id, now) for room_id in controller.rooms],
        "entities": _entity_states(hass, controller),
        "log": _log(controller),
    }
