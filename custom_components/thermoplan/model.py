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
    threshold: float | None = None  # fixed outdoor temperature; None = use the room target


@dataclass
class Settings:
    """Global settings."""

    season_start: tuple[int, int] = (10, 1)
    season_end: tuple[int, int] = (4, 30)
    away_reset_time: str = "13:00"
    away_profile: str | None = None  # profile used while away; None = rooms off
    cutoff: CutoffSettings = field(default_factory=CutoffSettings)
    person_entity: str | None = None
    presence_rules: list[PresenceRule] = field(default_factory=list)


@dataclass
class State:
    """Runtime state that must survive restarts."""

    active_profile: str | None = None
    previous_profile: str | None = None
    away_resume: str | None = None  # ISO datetime
    off_by_us: list[str] = field(default_factory=list)  # room ids whose thermostat Thermoplan switched off


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


def settings_to_dict(s: Settings) -> dict[str, Any]:
    return {
        "season_start": list(s.season_start),
        "season_end": list(s.season_end),
        "away_reset_time": s.away_reset_time,
        "away_profile": s.away_profile,
        "cutoff": vars(s.cutoff).copy(),
        "person_entity": s.person_entity,
        "presence_rules": [vars(r).copy() for r in s.presence_rules],
    }


def settings_from_dict(s: dict[str, Any]) -> Settings:
    return Settings(
        season_start=tuple(s.get("season_start", (10, 1))),
        season_end=tuple(s.get("season_end", (4, 30))),
        away_reset_time=s.get("away_reset_time", "13:00"),
        away_profile=s.get("away_profile"),
        cutoff=CutoffSettings(**s.get("cutoff", {})),
        person_entity=s.get("person_entity"),
        presence_rules=[PresenceRule(**r) for r in s.get("presence_rules", [])],
    )


def store_to_dict(data: StoreData) -> dict[str, Any]:
    return {
        "profiles": data.profiles,
        "schedules": {n: schedule_to_dict(v) for n, v in data.schedules.items()},
        "room_plans": data.room_plans,
        "settings": settings_to_dict(data.settings),
        "state": vars(data.state).copy(),
    }


def store_from_dict(raw: dict[str, Any]) -> StoreData:
    settings = settings_from_dict(raw.get("settings", {}))
    return StoreData(
        profiles=list(raw.get("profiles", [])),
        schedules={n: schedule_from_dict(v) for n, v in raw.get("schedules", {}).items()},
        room_plans={k: dict(v) for k, v in raw.get("room_plans", {}).items()},
        settings=settings,
        state=State(**raw.get("state", {})),
    )


OFF_HVAC = "hvac_off"
OFF_FIXED = "fixed"
CUTOFF_GLOBAL = "global"
CUTOFF_ROOM = "room"
CUTOFF_NONE = "off"


@dataclass
class RoomConfig:
    """Per-room settings, stored in the room's config subentry."""

    id: str
    name: str
    climate_entity: str
    off_mode: str = OFF_HVAC
    off_target: float = 4.5
    override_minutes: int = 60
    window_sensors: list[str] = field(default_factory=list)
    cutoff_scope: str = CUTOFF_GLOBAL
    cutoff: CutoffSettings = field(default_factory=CutoffSettings)

    @classmethod
    def from_data(cls, room_id: str, name: str, data: dict[str, Any]) -> RoomConfig:
        cutoff = CutoffSettings(
            enabled=True,
            outdoor_sensor=data.get("outdoor_sensor"),
            weather_entity=data.get("weather_entity"),
            off_after_minutes=int(data.get("off_after_minutes", 30)),
            on_after_minutes=int(data.get("on_after_minutes", 10)),
            offset=float(data.get("offset", 0.0)),
            threshold=(
                float(data["threshold"]) if data.get("threshold") is not None else None
            ),
        )
        return cls(
            id=room_id,
            name=name,
            climate_entity=data["climate_entity"],
            off_mode=data.get("off_mode", OFF_HVAC),
            off_target=float(data.get("off_target", 4.5)),
            override_minutes=int(data.get("override_minutes", 60)),
            window_sensors=list(data.get("window_sensors", [])),
            cutoff_scope=data.get("cutoff_scope", CUTOFF_GLOBAL),
            cutoff=cutoff,
        )
