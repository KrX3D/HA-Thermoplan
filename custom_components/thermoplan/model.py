"""Plain data model persisted by Thermoplan (no Home Assistant imports)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .engine.schedule import Block, Schedule


@dataclass
class PresenceRule:
    """Switch to ``profile`` when the person entity changes to ``state`` (home or a zone name)."""

    state: str
    profile: str


@dataclass
class CutoffSettings:
    """Outdoor cutoff; used globally or as a per-room override."""

    enabled: bool = False
    outdoor_sensor: str | None = None
    weather_entity: str | None = None
    off_after_minutes: int = 30
    on_after_minutes: int = 10
    offset: float = 0.0


@dataclass
class Settings:
    """Global settings."""

    season_start: tuple[int, int] = (10, 1)
    season_end: tuple[int, int] = (4, 30)
    away_reset_time: str = "13:00"
    cutoff: CutoffSettings = field(default_factory=CutoffSettings)
    person_entity: str | None = None
    presence_rules: list[PresenceRule] = field(default_factory=list)


@dataclass
class State:
    """Runtime state that must survive restarts."""

    active_profile: str | None = None
    previous_profile: str | None = None
    away_resume: str | None = None  # ISO datetime


@dataclass
class StoreData:
    """Everything kept in the Thermoplan store."""

    profiles: list[str] = field(default_factory=list)
    schedules: dict[str, Schedule] = field(default_factory=dict)
    # room id -> {profile -> schedule name}
    room_plans: dict[str, dict[str, str]] = field(default_factory=dict)
    settings: Settings = field(default_factory=Settings)
    state: State = field(default_factory=State)


def schedule_to_dict(schedule: Schedule) -> dict[str, Any]:
    return {
        "name": schedule.name,
        "default_target": schedule.default_target,
        "days": {
            str(day): [[b.start, b.end, b.target] for b in blocks]
            for day, blocks in schedule.days.items()
        },
    }


def schedule_from_dict(data: dict[str, Any]) -> Schedule:
    return Schedule(
        name=data["name"],
        default_target=data.get("default_target"),
        days={
            int(day): tuple(Block(s, e, t) for s, e, t in blocks)
            for day, blocks in data.get("days", {}).items()
        },
    )


def store_to_dict(data: StoreData) -> dict[str, Any]:
    s = data.settings
    return {
        "profiles": data.profiles,
        "schedules": {n: schedule_to_dict(v) for n, v in data.schedules.items()},
        "room_plans": data.room_plans,
        "settings": {
            "season_start": list(s.season_start),
            "season_end": list(s.season_end),
            "away_reset_time": s.away_reset_time,
            "cutoff": vars(s.cutoff).copy(),
            "person_entity": s.person_entity,
            "presence_rules": [vars(r).copy() for r in s.presence_rules],
        },
        "state": vars(data.state).copy(),
    }


def store_from_dict(raw: dict[str, Any]) -> StoreData:
    s = raw.get("settings", {})
    settings = Settings(
        season_start=tuple(s.get("season_start", (10, 1))),
        season_end=tuple(s.get("season_end", (4, 30))),
        away_reset_time=s.get("away_reset_time", "13:00"),
        cutoff=CutoffSettings(**s.get("cutoff", {})),
        person_entity=s.get("person_entity"),
        presence_rules=[PresenceRule(**r) for r in s.get("presence_rules", [])],
    )
    return StoreData(
        profiles=list(raw.get("profiles", [])),
        schedules={n: schedule_from_dict(v) for n, v in raw.get("schedules", {}).items()},
        room_plans={k: dict(v) for k, v in raw.get("room_plans", {}).items()},
        settings=settings,
        state=State(**raw.get("state", {})),
    )
