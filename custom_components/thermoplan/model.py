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
    from_state: str | None = None  # only when coming from this state (e.g. "work" for pre-warming)
    delay: int | None = None  # minutes to wait first; None = the general leave delay


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


# Optional global features. Each has its own "enabled" switch; the configured entity stays when it is off.
FEATURE_DEFAULTS: dict[str, dict[str, Any]] = {
    "presence_delay": {"enabled": False, "minutes": 10},
    "workday": {"enabled": False, "entity": None},
    "holiday": {"enabled": False, "entity": None},
    "free_calendar": {"enabled": False, "entity": None, "match": "Frei"},
    "free_day": {"weekday": 6},  # free days use the blocks of this weekday (0 = Monday ... 6 = Sunday)
    "calendar_away": {"enabled": False, "entity": None, "match": "Urlaub"},
    "forecast": {"enabled": False, "entity": None, "max_temp": 18.0},
    "learning": {"enabled": False, "preheat": True, "coast": True, "max_lead": 120, "coast_margin": 0.3, "min_samples": 3, "coast_min_block": 45},
    "warnings": {"enabled": True, "notify": False, "unreachable_hours": 3, "unavailable_minutes": 30, "mismatch": 2.0},
    "log": {"days": 7},  # how many days the Log tab keeps (1 to 30), kept across restarts
    "boost": {"enabled": True, "offset": 2.0, "minutes": 60, "fallback": 20.0},  # one-tap boost on the Overview
}


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
    notify_enabled: bool = False
    notify_service: str | None = None  # e.g. notify.mobile_app_x; None = persistent notification
    features: dict[str, dict[str, Any]] = field(default_factory=dict)

    def feature(self, name: str) -> dict[str, Any]:
        """The settings of an optional feature, with defaults filled in."""
        return {**FEATURE_DEFAULTS.get(name, {}), **self.features.get(name, {})}


@dataclass
class State:
    """Runtime state that must survive restarts."""

    active_profile: str | None = None
    previous_profile: str | None = None
    away_resume: str | None = None  # ISO datetime
    off_by_us: list[str] = field(default_factory=list)  # room ids whose thermostat Thermoplan switched off
    holds: list[dict] = field(default_factory=list)  # running holds / boosts, see controller.Hold


@dataclass
class StoreData:
    """Everything kept in the Thermoplan store."""

    profiles: list[str] = field(default_factory=list)
    schedules: dict[str, Schedule] = field(default_factory=dict)
    # room id -> {profile -> schedule name}
    room_plans: dict[str, dict[str, str]] = field(default_factory=dict)
    settings: Settings = field(default_factory=Settings)
    state: State = field(default_factory=State)
    # room id -> {"samples": [Sample dicts]}; what was learned about how fast rooms heat and cool
    learning: dict[str, dict] = field(default_factory=dict)
    # room id -> {"YYYY-MM-DD": minutes of heating}; kept long term for the heating statistics
    stats: dict[str, dict[str, float]] = field(default_factory=dict)
    stats_seeded: bool = False  # recent days were filled in from the recorder once


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
        "notify_enabled": s.notify_enabled,
        "notify_service": s.notify_service,
        "features": {k: dict(v) for k, v in s.features.items()},
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
        notify_enabled=bool(s.get("notify_enabled", False)),
        notify_service=s.get("notify_service"),
        features={k: dict(v) for k, v in (s.get("features") or {}).items()},
    )


def store_to_dict(data: StoreData) -> dict[str, Any]:
    return {
        "profiles": data.profiles,
        "schedules": {n: schedule_to_dict(v) for n, v in data.schedules.items()},
        "room_plans": data.room_plans,
        "settings": settings_to_dict(data.settings),
        "state": vars(data.state).copy(),
        "learning": data.learning,
        "stats": data.stats,
        "stats_seeded": data.stats_seeded,
    }


def store_from_dict(raw: dict[str, Any]) -> StoreData:
    settings = settings_from_dict(raw.get("settings", {}))
    return StoreData(
        profiles=list(raw.get("profiles", [])),
        schedules={n: schedule_from_dict(v) for n, v in raw.get("schedules", {}).items()},
        room_plans={k: dict(v) for k, v in raw.get("room_plans", {}).items()},
        settings=settings,
        state=State(**raw.get("state", {})),
        learning={k: dict(v) for k, v in (raw.get("learning") or {}).items()},
        stats={k: dict(v) for k, v in (raw.get("stats") or {}).items()},
        stats_seeded=bool(raw.get("stats_seeded", False)),
    )


def _opt_float(value: Any) -> float | None:
    return None if value is None or value == "" else float(value)


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
    # optional features, each with its own on/off switch so an entity can stay configured while switched off
    adjust_enabled: bool = False
    adjust: float = 0.0
    limits_enabled: bool = False
    min_temp: float | None = None
    max_temp: float | None = None
    occupancy_enabled: bool = False
    occupancy_entity: str | None = None
    occ_present_type: str = "none"  # none | offset | profile | schedule
    occ_present_value: Any = None
    occ_absent_type: str = "none"
    occ_absent_value: Any = None
    window_enabled: bool = True
    window_mode: str = "off"  # off (switch off) | lower (to window_target) | observe (only log)
    window_target: float = 15.0
    window_open_delay: int = 0  # minutes the window must be open before acting
    window_too_long: int = 0  # minutes after which an open window is reported (0 = never)
    window_notify: bool = False
    real_enabled: bool = False
    real_entity: str | None = None  # the real thermostat behind e.g. Better Thermostat
    learn_enabled: bool = True  # take part in learning (preheating / coasting) when it is switched on globally
    extra_climates: list[str] = field(default_factory=list)  # more thermostats in the same room
    temp_sensor_enabled: bool = False
    temp_sensor: str | None = None  # external room temperature, used for display, learning and warnings
    occ_present_delay: int = 0  # minutes the room must be occupied before the present action applies
    occ_absent_delay: int = 0  # minutes the room must be empty before the absent action applies

    @property
    def climates(self) -> list[str]:
        """All thermostats of the room, the main one first."""
        return list(dict.fromkeys([self.climate_entity, *self.extra_climates]))

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
            adjust_enabled=bool(data.get("adjust_enabled", False)),
            adjust=float(data.get("adjust") or 0.0),
            limits_enabled=bool(data.get("limits_enabled", False)),
            min_temp=_opt_float(data.get("min_temp")),
            max_temp=_opt_float(data.get("max_temp")),
            occupancy_enabled=bool(data.get("occupancy_enabled", False)),
            occupancy_entity=data.get("occupancy_entity") or None,
            occ_present_type=data.get("occ_present_type", "none"),
            occ_present_value=data.get("occ_present_value"),
            occ_absent_type=data.get("occ_absent_type", "none"),
            occ_absent_value=data.get("occ_absent_value"),
            window_enabled=bool(data.get("window_enabled", True)),
            window_mode=data.get("window_mode", "off"),
            window_target=float(data.get("window_target", 15.0)),
            window_open_delay=int(data.get("window_open_delay", 0)),
            window_too_long=int(data.get("window_too_long", 0)),
            window_notify=bool(data.get("window_notify", False)),
            real_enabled=bool(data.get("real_enabled", False)),
            real_entity=data.get("real_entity") or None,
            learn_enabled=bool(data.get("learn_enabled", True)),
            extra_climates=[e for e in (data.get("extra_climates") or []) if e],
            temp_sensor_enabled=bool(data.get("temp_sensor_enabled", False)),
            temp_sensor=data.get("temp_sensor") or None,
            occ_present_delay=int(data.get("occ_present_delay") or 0),
            occ_absent_delay=int(data.get("occ_absent_delay") or 0),
        )
