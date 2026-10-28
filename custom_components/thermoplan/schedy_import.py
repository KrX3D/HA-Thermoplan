"""Import a Schedy (AppDaemon) configuration.

Pure Python apart from PyYAML. Converts what maps cleanly onto Thermoplan and reports
everything else as warnings.

Schedy semantics assumed: within a schedule the first matching rule wins, and times
without matching rule fall through to ``schedule_append`` (usually OFF). Thermoplan
treats uncovered times as off, which is equivalent for a trailing ``OFF`` append.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import yaml

from .engine.schedule import MINUTES_PER_DAY, Block, Schedule, validate

_UNSET = object()
_WEEK = 7 * MINUTES_PER_DAY
_TIME = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\+(\d+)d)?$")
_INCLUDE = re.compile(
    r"IncludeSchedule\(\s*schedule_snippets\[\s*'([^']+)'\s*\]\s*\)\s*if\s*heating_mode\(\)\s*==\s*'([^']+)'"
)


@dataclass
class ImportedRoom:
    """A Schedy room."""

    key: str
    climate_entity: str | None
    override_minutes: int | None
    plan: dict[str, str] = field(default_factory=dict)  # profile -> schedule name


@dataclass
class ImportResult:
    """Everything extracted from the Schedy file."""

    profiles: list[str] = field(default_factory=list)
    schedules: dict[str, Schedule] = field(default_factory=dict)
    rooms: list[ImportedRoom] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class ImportFailed(ValueError):
    """The text is not a usable Schedy configuration."""


def _weekdays(value: Any) -> list[int]:
    """Parse '1-4,7' style specs (1 = Monday) into Python weekdays (0 = Monday)."""
    days: set[int] = set()
    for part in str(value).replace(" ", "").split(","):
        if not part:
            continue
        low, _, high = part.partition("-")
        first, last = int(low), int(high or low)
        if not (1 <= first <= 7 and 1 <= last <= 7 and first <= last):
            raise ValueError(f"invalid weekdays {value!r}")
        days.update(range(first - 1, last))
    return sorted(days)


def _minutes(value: Any, *, is_end: bool) -> int:
    """Parse 'HH:MM[:SS][+Nd]' into minutes from the start day.

    An end like 07:59:59 means "until the end of that minute", so it rounds up.
    """
    match = _TIME.match(str(value).strip())
    if not match:
        raise ValueError(f"invalid time {value!r}")
    hours, minutes, seconds, plus_days = match.groups()
    total = int(hours) * 60 + int(minutes) + int(plus_days or 0) * MINUTES_PER_DAY
    if is_end and int(seconds or 0) >= 59:
        total += 1
    return total


def _target(value: Any) -> float | None:
    if isinstance(value, str) and value.strip().upper() == "OFF":
        return None
    return float(value)


def convert_snippet(name: str, rules: list[dict[str, Any]]) -> Schedule:
    """Convert one Schedy schedule snippet into a Thermoplan schedule."""
    week: list[Any] = [_UNSET] * _WEEK

    def paint(start: int, end: int, value: float | None) -> None:
        for minute in range(start, min(end, start + MINUTES_PER_DAY)):
            week[minute % _WEEK] = value

    # Reverse order so that earlier rules (higher priority) overwrite later ones.
    for rule in reversed(rules):
        value = _target(rule["v"])
        subrules = rule.get("rules")
        if not subrules:
            for day in range(7):
                paint(day * MINUTES_PER_DAY, (day + 1) * MINUTES_PER_DAY, value)
            continue
        for sub in subrules:
            days = _weekdays(sub.get("weekdays", "1-7"))
            for span in sub.get("rules") or [{"start": "00:00", "end": "24:00"}]:
                start = _minutes(span["start"], is_end=False)
                end = _minutes(span["end"], is_end=True) if span["end"] != "24:00" else 1440
                for day in days:
                    paint(day * MINUTES_PER_DAY + start, day * MINUTES_PER_DAY + end, value)

    runs: dict[int, list[list[Any]]] = {}
    for day in range(7):
        day_runs: list[list[Any]] = []
        for minute in range(MINUTES_PER_DAY):
            value = week[day * MINUTES_PER_DAY + minute]
            if value is _UNSET:
                continue
            if day_runs and day_runs[-1][1] == minute and day_runs[-1][2] == value:
                day_runs[-1][1] = minute + 1
            else:
                day_runs.append([minute, minute + 1, value])
        runs[day] = day_runs

    # Let a block that ends at midnight continue into the next day's first block.
    for day in range(7):
        following = runs[(day + 1) % 7]
        if not runs[day] or not following:
            continue
        last, first = runs[day][-1], following[0]
        if (
            last[1] == MINUTES_PER_DAY
            and first[0] == 0
            and first[1] <= MINUTES_PER_DAY
            and last[2] == first[2]
            and MINUTES_PER_DAY + first[1] - last[0] <= MINUTES_PER_DAY
        ):
            last[1] = MINUTES_PER_DAY + first[1]
            following.pop(0)

    days = {
        day: tuple(Block(s, e, t) for s, e, t in day_runs)
        for day, day_runs in runs.items()
        if day_runs
    }
    return Schedule(name=name, days=days, default_target=None)


def _find_app(document: Any) -> dict[str, Any]:
    """Return the app dict holding ``rooms``; accept a bare app or a named app."""
    if isinstance(document, dict):
        if "rooms" in document:
            return document
        for value in document.values():
            if isinstance(value, dict) and "rooms" in value:
                return value
    raise ImportFailed("No Schedy app with a 'rooms' section found")


def parse_schedy(text: str) -> ImportResult:
    """Parse Schedy YAML into an :class:`ImportResult`."""
    try:
        document = yaml.safe_load(text)
    except yaml.YAMLError as err:
        raise ImportFailed(f"Invalid YAML: {err}") from err
    app = _find_app(document)
    result = ImportResult()
    warnings = result.warnings

    for key in ("expression_environment", "schedule_prepend", "watched_entities"):
        if app.get(key):
            warnings.append(
                f"'{key}' is not imported (heating_mode() is replaced by the Thermoplan profile)"
                if key == "expression_environment"
                else f"'{key}' is not imported"
            )
    if app.get("schedule_append"):
        warnings.append(
            "'schedule_append' is not imported; times without a block are treated as off"
        )

    for name, rules in (app.get("schedule_snippets") or {}).items():
        try:
            schedule = convert_snippet(name, rules)
        except (KeyError, TypeError, ValueError) as err:
            warnings.append(f"Snippet '{name}' skipped: {err}")
            continue
        if problems := validate(schedule):
            warnings.append(f"Snippet '{name}' skipped: {'; '.join(problems)}")
            continue
        result.schedules[name] = schedule

    for key, room in (app.get("rooms") or {}).items():
        actors = list(room.get("actors") or [])  # a list, or a mapping of entity ids
        if len(actors) > 1:
            warnings.append(f"Room '{key}': only the first actor is imported")
        for extra in ("watched_entities", "schedule_prepend", "rescheduling_delay_rules"):
            if room.get(extra):
                warnings.append(f"Room '{key}': '{extra}' is not imported")
        delay = room.get("rescheduling_delay")
        imported = ImportedRoom(
            key=key,
            climate_entity=str(actors[0]) if actors else None,
            override_minutes=int(delay) if isinstance(delay, (int, float)) else None,
        )
        if not actors:
            warnings.append(f"Room '{key}' has no actors")
        for rule in room.get("schedule") or []:
            expression = str(rule.get("x", "")) if isinstance(rule, dict) else ""
            match = _INCLUDE.search(expression)
            if not match:
                warnings.append(f"Room '{key}': unsupported schedule rule {expression or rule!r}")
                continue
            snippet, profile = match.groups()
            if profile not in result.profiles:
                result.profiles.append(profile)
            if snippet not in result.schedules:
                warnings.append(f"Room '{key}': snippet '{snippet}' for '{profile}' is missing")
                continue
            imported.plan[profile] = snippet
        result.rooms.append(imported)

    if not result.rooms:
        warnings.append("No rooms found")
    return result
