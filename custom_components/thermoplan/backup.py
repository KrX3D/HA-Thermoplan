"""Export and restore of the whole Thermoplan setup as JSON (no Home Assistant imports).

An export holds profiles, schedules, rooms with their plans and all settings including
presence rules. Learned data, heating statistics and runtime state (holds, away) are not
part of it: they belong to the house, not to the configuration.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .engine.schedule import Schedule, validate
from .model import Settings, StoreData, schedule_from_dict, schedule_to_dict, settings_from_dict, settings_to_dict

FORMAT = "thermoplan"
VERSION = 1


class BackupInvalid(ValueError):
    """The file is not a Thermoplan export or cannot be restored."""


def build_export(data: StoreData, rooms: list[dict[str, Any]], exported: str) -> dict[str, Any]:
    """``rooms``: ``{"id", "name", "data"}`` per room (``data`` = the subentry data)."""
    return {
        "format": FORMAT,
        "version": VERSION,
        "exported": exported,
        "profiles": list(data.profiles),
        "active_profile": data.state.active_profile,
        "schedules": {name: schedule_to_dict(s) for name, s in data.schedules.items()},
        "settings": settings_to_dict(data.settings),
        "rooms": [
            {
                "id": room["id"],
                "name": room["name"],
                "data": dict(room["data"]),
                "plan": dict(data.room_plans.get(room["id"], {})),
            }
            for room in rooms
        ],
    }


@dataclass
class RestoreRoom:
    """A room from the file; ``target_id`` is the existing room it replaces (None = create)."""

    name: str
    data: dict[str, Any]
    plan: dict[str, str]
    target_id: str | None = None


@dataclass
class RestorePlan:
    profiles: list[str]
    active_profile: str | None
    schedules: dict[str, Schedule]
    settings: Settings
    rooms: list[RestoreRoom]
    remove: list[str] = field(default_factory=list)  # existing room ids to delete
    keep: dict[str, dict[str, str]] = field(default_factory=dict)  # existing rooms not in the file -> their cleaned plan
    warnings: list[str] = field(default_factory=list)

    def report(self, names: dict[str, str], dry_run: bool) -> dict[str, Any]:
        return {
            "dry_run": dry_run,
            "profiles": list(self.profiles),
            "schedules": list(self.schedules),
            "rooms_updated": [r.name for r in self.rooms if r.target_id],
            "rooms_created": [r.name for r in self.rooms if not r.target_id],
            "rooms_removed": [names.get(i, i) for i in self.remove],
            "rooms_kept": [names.get(i, i) for i in self.keep],
            "warnings": list(self.warnings),
        }


def plan_restore(
    payload: Any,
    existing: list[dict[str, Any]],
    current_plans: dict[str, dict[str, str]],
    remove_missing: bool = False,
    validate_room: Callable[[dict[str, Any]], dict[str, Any]] = dict,
) -> RestorePlan:
    """Check an export and work out what restoring it changes.

    ``existing``: the current rooms as ``{"id", "name", "data"}``. A room in the file replaces the
    room with the same id (same instance), else the one with the same main thermostat, else it is
    created. ``validate_room`` normalises room data and raises ``ValueError`` when it is invalid.
    """
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise BackupInvalid("This is not a Thermoplan export")
    version = payload.get("version")
    if not isinstance(version, int) or version > VERSION:
        raise BackupInvalid(f"Unsupported export version {version!r}; update Thermoplan first")

    warnings: list[str] = []

    profiles = payload.get("profiles")
    if not isinstance(profiles, list) or not all(isinstance(p, str) and p.strip() for p in profiles):
        raise BackupInvalid("Profiles must be a list of names")
    if len(set(profiles)) != len(profiles):
        raise BackupInvalid("Profile names must be unique")

    raw_schedules = payload.get("schedules") or {}
    if not isinstance(raw_schedules, dict):
        raise BackupInvalid("Schedules must be an object")
    schedules: dict[str, Schedule] = {}
    for name, raw in raw_schedules.items():
        try:
            schedule = schedule_from_dict({**raw, "name": name})
        except (KeyError, TypeError, ValueError, AttributeError) as err:
            raise BackupInvalid(f"Schedule '{name}' is malformed: {err}") from err
        if errors := validate(schedule):
            raise BackupInvalid(f"Schedule '{name}': " + "; ".join(errors))
        schedules[name] = schedule

    try:
        settings = settings_from_dict(payload.get("settings") or {})
    except (KeyError, TypeError, ValueError, AttributeError) as err:
        raise BackupInvalid(f"Settings are malformed: {err}") from err
    if settings.away_profile is not None and settings.away_profile not in profiles:
        warnings.append(f"Away profile '{settings.away_profile}' does not exist; rooms will be off while away")
        settings.away_profile = None
    rules = []
    for rule in settings.presence_rules:
        if rule.profile in profiles:
            rules.append(rule)
        else:
            warnings.append(f"Presence rule '{rule.state}' skipped: profile '{rule.profile}' does not exist")
    settings.presence_rules = rules

    active = payload.get("active_profile")
    if active not in profiles:
        active = profiles[0] if profiles else None

    def clean_plan(plan: dict[str, str], room: str) -> dict[str, str]:
        result = {}
        for profile, schedule in plan.items():
            if profile in profiles and schedule in schedules:
                result[profile] = schedule
            else:
                warnings.append(f"Room '{room}': plan entry '{profile}' -> '{schedule}' skipped (unknown profile or schedule)")
        return result

    by_id = {room["id"]: room for room in existing}
    by_entity = {room["data"].get("climate_entity"): room["id"] for room in existing}
    used: set[str] = set()
    rooms: list[RestoreRoom] = []
    raw_rooms = payload.get("rooms") or []
    if not isinstance(raw_rooms, list):
        raise BackupInvalid("Rooms must be a list")
    for index, raw in enumerate(raw_rooms):
        if not isinstance(raw, dict) or not isinstance(raw.get("data"), dict):
            raise BackupInvalid(f"Room {index + 1} is malformed")
        name = str(raw.get("name") or "").strip() or f"Room {index + 1}"
        try:
            data = validate_room(dict(raw["data"]))
        except ValueError as err:
            raise BackupInvalid(f"Room '{name}': {err}") from err
        raw_id = raw.get("id") if isinstance(raw.get("id"), str) else None
        target = raw_id if raw_id in by_id else by_entity.get(data.get("climate_entity"))
        if target in used:
            warnings.append(f"Room '{name}' uses the same thermostat as another room in the file; created as a new room")
            target = None
        if target:
            used.add(target)
        plan = raw.get("plan") or {}
        if not isinstance(plan, dict):
            raise BackupInvalid(f"Room '{name}': plan is malformed")
        rooms.append(RestoreRoom(name=name, data=data, plan=clean_plan(plan, name), target_id=target))

    remove: list[str] = []
    keep: dict[str, dict[str, str]] = {}
    for room in existing:
        if room["id"] in used:
            continue
        if remove_missing:
            remove.append(room["id"])
        else:
            plan = current_plans.get(room["id"], {})
            keep[room["id"]] = {p: s for p, s in plan.items() if p in profiles and s in schedules}

    return RestorePlan(
        profiles=list(profiles),
        active_profile=active,
        schedules=schedules,
        settings=settings,
        rooms=rooms,
        remove=remove,
        keep=keep,
        warnings=warnings,
    )
