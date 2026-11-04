"""Runtime controller: evaluates every room and applies targets to thermostats."""

from __future__ import annotations

import logging
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from types import MappingProxyType
from typing import TYPE_CHECKING

from homeassistant.config_entries import ConfigSubentry
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.start import async_at_started
from homeassistant.util import dt as dt_util

from .engine import away
from .engine.adjust import adjust
from .engine.daytype import calendar_matches, workday_sensor_says_holiday
from .engine.occupancy import occupied
from .engine.cutoff import OutdoorCutoff
from .engine.decision import Decision, Reason, decide
from .engine.override import DEFAULT_TOLERANCE, Override, is_manual_change
from .engine.schedule import Resolved, Schedule, resolve
from .engine.season import in_season
from .model import (
    CUTOFF_GLOBAL,
    CUTOFF_NONE,
    OFF_HVAC,
    CutoffSettings,
    RoomConfig,
    Settings,
    StoreData,
    store_to_dict,
)
from .schedy_import import ImportResult
from .store import ThermoplanStore

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry

_LOGGER = logging.getLogger(__name__)

SEND_TOLERANCE = 0.3
# Thermostat updates this soon after our own command are not manual changes.
COMMAND_GRACE = timedelta(seconds=45)
EVAL_INTERVAL = timedelta(minutes=1)


@dataclass
class Hold:
    """A temporary fixed target (or offset) for some rooms; ``rooms`` None means every room."""

    rooms: list[str] | None
    mode: str  # "fixed" or "offset"
    value: float
    started: datetime
    until: datetime

    def covers(self, room_id: str) -> bool:
        return self.rooms is None or room_id in self.rooms

    def to_dict(self) -> dict:
        return {"rooms": self.rooms, "mode": self.mode, "value": self.value,
                "started": self.started.isoformat(), "until": self.until.isoformat()}

    @classmethod
    def from_dict(cls, raw: dict) -> Hold:
        return cls(raw.get("rooms"), raw["mode"], float(raw["value"]),
                   datetime.fromisoformat(raw["started"]), datetime.fromisoformat(raw["until"]))


@dataclass
class RoomRuntime:
    """Mutable per-room state that is not persisted."""

    cutoff: OutdoorCutoff
    last_sent: float | None = None
    sent_off: bool = False
    override: Override | None = None
    last_command: datetime | None = None
    decision: Decision | None = None
    target: float | None = None
    logged: tuple | None = None  # last (reason, target) written to the log
    prev_target: float | None = None  # target before the last logged change
    take_control: bool = False  # switch the thermostat on even if someone else turned it off
    current_event: dict | None = None  # decision event of this evaluation; commands attach to it
    off_noted: bool = False
    cutoff_logged: bool | None = None
    base_target: float | None = None  # scheduled target before adjustments
    adjustments: str = ""
    window_since: datetime | None = None
    window_notified: bool = False


_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _hm(minutes: int) -> str:
    return f"{minutes // 60 % 24:02d}:{minutes % 60:02d}"


def _block_text(block: tuple[int, int] | None) -> str:
    if block is None:
        return ""
    start, end = block
    return f", block {_hm(start)}-{_hm(end)}{' (+1 day)' if end >= 1440 else ''}"


REASON_TEXT = {
    Reason.WINDOW: "a window is open",
    Reason.OUTSIDE_SEASON: "outside the heating season",
    Reason.AWAY: "away period (no away profile set)",
    Reason.OUTDOOR_CUTOFF: "outdoor cutoff",
    Reason.FORECAST: "the forecast is warm",
    Reason.HOLD: "hold",
    Reason.SCHEDULE_OFF: "the schedule says off",
    Reason.SCHEDULE: "schedule",
    Reason.DEFAULT: "no block is active, using the schedule's default",
}


def local_now() -> datetime:
    """Naive local time, as used by the engine."""
    return dt_util.now().replace(tzinfo=None)


class Controller:
    """Owns the data and drives all rooms."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.data = StoreData()
        self.rooms: dict[str, RoomConfig] = {}
        self.runtime: dict[str, RoomRuntime] = {}
        self.season_active = False
        self._store = ThermoplanStore(hass)
        self._listeners: list[Callable[[], None]] = []
        self.events: deque[dict] = deque(maxlen=300)
        self._last_season: bool | None = None
        self._last_away: bool | None = None
        self.free_day = False
        self.free_reason = ""
        self._last_free: str | None = None
        self.calendar_away = False
        self.calendar_away_end: datetime | None = None
        self.calendar_away_text = ""
        self.forecast_warm = False
        self.forecast_max: float | None = None
        self._forecast_at: datetime | None = None
        self._forecast_failed = False
        self._presence_cancel: Callable[[], None] | None = None
        self.holds: list[Hold] = []
        self._unsubs: list[Callable[[], None]] = []

    def log(self, message: str, room: str | None = None, level: int = logging.INFO) -> dict:
        """Record an event for the Log tab and the Home Assistant log; returns the event."""
        event = {"time": dt_util.now().isoformat(timespec="seconds"), "room": room, "message": message}
        self.events.append(event)
        _LOGGER.log(level, "%s%s", f"[{room}] " if room else "", message)
        return event

    # --- lifecycle -------------------------------------------------------

    async def async_load(self) -> None:
        self.data = await self._store.async_load()
        if self.data.state.active_profile not in self.data.profiles:
            self.data.state.active_profile = (
                self.data.profiles[0] if self.data.profiles else None
            )
        self.rooms = {
            sub.subentry_id: RoomConfig.from_data(sub.subentry_id, sub.title, dict(sub.data))
            for sub in self.entry.subentries.values()
            if sub.subentry_type == "room"
        }
        for room in self.rooms.values():
            self.runtime[room.id] = RoomRuntime(cutoff=self._make_cutoff(self._cutoff_for(room)))
        self.holds = []
        for raw in self.data.state.holds:
            try:
                self.holds.append(Hold.from_dict(raw))
            except (KeyError, ValueError):
                continue

    @callback
    def async_start(self) -> None:
        climate = {room.climate_entity for room in self.rooms.values()}
        other: set[str] = set(filter(None, [self.data.settings.person_entity]))
        for name in ("workday", "holiday", "free_calendar", "calendar_away", "forecast"):
            feature = self.data.settings.feature(name)
            if feature.get("entity"):
                other.add(feature["entity"])
        for room in self.rooms.values():
            cutoff = self._cutoff_for(room)
            other.update(room.window_sensors)
            other.update(filter(None, [room.occupancy_entity if room.occupancy_enabled else None, room.real_entity if room.real_enabled else None]))
            other.update(filter(None, [cutoff.outdoor_sensor, cutoff.weather_entity]))
        if climate:
            self._unsubs.append(
                async_track_state_change_event(self.hass, list(climate), self._climate_changed)
            )
        if other:
            self._unsubs.append(
                async_track_state_change_event(self.hass, list(other), self._other_changed)
            )
        self._unsubs.append(async_track_time_interval(self.hass, self._tick, EVAL_INTERVAL))
        async_at_started(self.hass, self._tick)
        self.log(
            f"Started with {len(self.rooms)} room(s), profile '{self.data.state.active_profile}'"
        )

    @callback
    def async_stop(self) -> None:
        self._cancel_presence_timer()
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    # --- listeners for entities -----------------------------------------

    def add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    # --- public actions ---------------------------------------------------

    async def async_set_profile(self, profile: str, source: str = "user") -> None:
        if profile not in self.data.profiles:
            return
        if source != "user" and profile == self.data.state.active_profile:
            return  # a presence rule that changes nothing must not wipe manual changes
        cleared = sum(1 for rt in self.runtime.values() if rt.override is not None)
        self.log(
            f"Profile changed from '{self.data.state.active_profile}' to '{profile}' ({source})"
            + (f"; {cleared} manual change(s) cleared" if cleared else "")
        )
        self.data.state.active_profile = profile
        for rt in self.runtime.values():
            rt.override = None  # an explicit profile change wins over manual changes
            rt.take_control = True
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_clear_overrides(self, room_id: str | None = None) -> None:
        """Drop manual overrides (one room, or all) so the schedule applies again."""
        for rid, rt in self.runtime.items():
            if room_id is None or rid == room_id:
                if rt.override is not None:
                    self.log("Manual override reset", self.rooms[rid].name)
                rt.override = None
                rt.take_control = True
        await self.async_cancel_holds(None if room_id is None else [room_id], evaluate=False)
        await self.async_evaluate()

    # --- hold / boost ---------------------------------------------------------

    def room_ids(self, names: list[str] | None) -> list[str] | None:
        """Room ids for room names (None = every room). Unknown names raise ValueError."""
        if not names:
            return None
        by_name = {r.name.casefold(): r.id for r in self.rooms.values()}
        missing = [n for n in names if n.casefold() not in by_name]
        if missing:
            raise ValueError(f"Unknown room(s): {', '.join(missing)}")
        return [by_name[n.casefold()] for n in names]

    def _hold_for(self, room_id: str) -> Hold | None:
        now = local_now()
        active = [h for h in self.holds if h.covers(room_id) and h.until > now]
        return max(active, key=lambda h: h.started) if active else None

    async def _save_holds(self) -> None:
        self.data.state.holds = [h.to_dict() for h in self.holds]
        await self._store.async_save(self.data)

    async def async_hold(self, room_ids: list[str] | None, mode: str, value: float, minutes: int) -> None:
        """Hold rooms at a fixed temperature, or raise them by an offset, for a while."""
        now = local_now()
        # a new hold replaces an older one for the same rooms
        for existing in list(self.holds):
            if existing.rooms == room_ids:
                self.holds.remove(existing)
        self.holds.append(Hold(room_ids, mode, float(value), now, now + timedelta(minutes=minutes)))
        names = "all rooms" if room_ids is None else ", ".join(self.rooms[i].name for i in room_ids)
        what = f"{value:g} °C" if mode == "fixed" else f"{value:+g} °C"
        self.log(f"Hold started for {names}: {what} for {minutes} min")
        await self._save_holds()
        await self.async_evaluate()

    async def async_cancel_holds(self, room_ids: list[str] | None = None, evaluate: bool = True) -> None:
        """Cancel holds for some rooms (None = all)."""
        changed = False
        for existing in list(self.holds):
            if room_ids is None:
                self.holds.remove(existing)
                changed = True
            elif any(existing.covers(r) for r in room_ids):
                remaining = [r for r in (existing.rooms if existing.rooms is not None else list(self.rooms)) if r not in room_ids]
                changed = True
                if remaining:
                    existing.rooms = remaining
                else:
                    self.holds.remove(existing)
        if changed:
            self.log("Hold cancelled")
            await self._save_holds()
        if evaluate:
            await self.async_evaluate()

    async def async_set_away_days(self, days: int) -> None:
        reset = time.fromisoformat(self.data.settings.away_reset_time)
        resume = away.resume_at(local_now(), days, reset)
        self.data.state.away_resume = resume.isoformat() if resume else None
        self.log(f"Away until {resume:%Y-%m-%d %H:%M}" if resume else "Away period cleared")
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_set_away_until(self, until: date | None) -> None:
        """Away until a date; heating resumes on that date at the reset time."""
        reset = time.fromisoformat(self.data.settings.away_reset_time)
        resume = datetime.combine(until, reset) if until else None
        if resume is not None and resume <= local_now():
            resume = None
        self.data.state.away_resume = resume.isoformat() if resume else None
        self.log(f"Away until {resume:%Y-%m-%d %H:%M}" if resume else "Away period cleared")
        await self._store.async_save(self.data)
        await self.async_evaluate()

    @property
    def away_days(self) -> int:
        return away.remaining_days(local_now(), self._resume())

    @property
    def away_until(self) -> date | None:
        resume = self._resume()
        return resume.date() if resume and away.is_away(local_now(), resume) else None

    @property
    def away_active(self) -> bool:
        return away.is_away(local_now(), self._resume()) or self.calendar_away

    @property
    def away_info(self) -> dict:
        """Where the away state comes from, for the Away sensor."""
        resume = self._resume()
        if away.is_away(local_now(), resume):
            return {"source": "manual", "until": resume.isoformat()}
        if self.calendar_away:
            return {
                "source": "calendar",
                "event": self.calendar_away_text,
                "until": self.calendar_away_end.isoformat() if self.calendar_away_end else None,
            }
        return {"source": None, "until": None}


    # --- editing (used by the websocket API and options flow) ----------------

    def snapshot(self) -> dict:
        """Everything the editor needs."""
        data = store_to_dict(self.data)
        data["rooms"] = [
            {"id": r.id, "name": r.name, **dict(self.entry.subentries[r.id].data)}
            for r in self.rooms.values()
        ]
        data["holds"] = [
            {**h.to_dict(), "room_names": [self.rooms[i].name for i in (h.rooms or self.rooms) if i in self.rooms]}
            for h in self.holds
        ]
        return data

    async def _save_and_reload(self) -> None:
        """Persist and rebuild listeners (needed when profiles or settings change)."""
        await self._store.async_save(self.data)
        self.hass.config_entries.async_schedule_reload(self.entry.entry_id)

    async def async_set_profiles(
        self, profiles: list[str], renames: dict[str, str] | None = None
    ) -> None:
        """Replace the profile list; ``renames`` (old -> new) keeps plans, rules and selection."""
        self.log("Profiles changed: " + ", ".join(profiles) + (f" (renamed: {renames})" if renames else ""))
        data = self.data
        for old, new in (renames or {}).items():
            for plan in data.room_plans.values():
                if old in plan:
                    plan[new] = plan.pop(old)
            if data.state.active_profile == old:
                data.state.active_profile = new
            if data.settings.away_profile == old:
                data.settings.away_profile = new
            for rule in data.settings.presence_rules:
                if rule.profile == old:
                    rule.profile = new
        data.profiles = profiles
        if data.settings.away_profile not in profiles:
            data.settings.away_profile = None
        for plan in data.room_plans.values():
            for name in [p for p in plan if p not in profiles]:
                del plan[name]
        for rule in data.settings.presence_rules:
            if rule.profile not in profiles:
                rule.profile = profiles[0] if profiles else ""
        await self._save_and_reload()

    async def async_set_schedule(self, schedule: Schedule) -> None:
        self.log(f"Schedule '{schedule.name}' saved")
        self.data.schedules[schedule.name] = schedule
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_delete_schedule(self, name: str) -> None:
        self.log(f"Schedule '{name}' deleted")
        self.data.schedules.pop(name, None)
        for plan in self.data.room_plans.values():
            for profile in [p for p, sched in plan.items() if sched == name]:
                del plan[profile]
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_set_room_plan(self, room_id: str, plan: dict[str, str]) -> None:
        self.log("Plan changed: " + (", ".join(f"{p} = {s}" for p, s in plan.items()) or "empty"), self.rooms[room_id].name if room_id in self.rooms else None)
        self.data.room_plans[room_id] = plan
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_set_settings(self, settings: Settings) -> None:
        self.log("Settings changed")
        self.data.settings = settings
        await self._save_and_reload()

    async def async_save_room(self, room_id: str | None, name: str, data: dict) -> str:
        """Create or update a room (a config subentry); the entry reloads afterwards."""
        self.log(f"Room '{name}' {'updated' if room_id else 'created'}")
        if room_id:
            self.hass.config_entries.async_update_subentry(
                self.entry,
                self.entry.subentries[room_id],
                data=MappingProxyType(data),
                title=name,
            )
            return room_id
        subentry = ConfigSubentry(
            data=MappingProxyType(data), subentry_type="room", title=name, unique_id=None
        )
        self.hass.config_entries.async_add_subentry(self.entry, subentry)
        return subentry.subentry_id

    async def async_delete_room(self, room_id: str) -> None:
        self.log(f"Room '{self.rooms[room_id].name if room_id in self.rooms else room_id}' deleted")
        self.data.room_plans.pop(room_id, None)
        await self._store.async_save(self.data)
        self.hass.config_entries.async_remove_subentry(self.entry, room_id)

    async def async_import(
        self, result: ImportResult, create_rooms: bool, dry_run: bool = False
    ) -> dict:
        """Merge an imported Schedy configuration; returns a report. A dry run changes nothing."""
        data = self.data
        by_entity = {room.climate_entity: room.id for room in self.rooms.values()}
        report: dict = {
            "dry_run": dry_run,
            "profiles": result.profiles,
            "schedules": list(result.schedules),
            "rooms_matched": [],
            "rooms_created": [],
            "rooms_skipped": [],
            "warnings": list(result.warnings),
        }
        new_subentries: list[ConfigSubentry] = []
        plans: dict[str, dict[str, str]] = {}
        for room in result.rooms:
            if room.climate_entity in by_entity:
                room_id = by_entity[room.climate_entity]
                report["rooms_matched"].append(room.key)
            elif create_rooms and room.climate_entity:
                subentry = ConfigSubentry(
                    data=MappingProxyType(
                        {
                            "climate_entity": room.climate_entity,
                            "override_minutes": (
                                60 if room.override_minutes is None else room.override_minutes
                            ),
                        }
                    ),
                    subentry_type="room",
                    title=room.key.replace("_", " ").title(),
                    unique_id=None,
                )
                new_subentries.append(subentry)
                room_id = subentry.subentry_id
                report["rooms_created"].append(room.key)
            else:
                report["rooms_skipped"].append(room.key)
                continue
            plans[room_id] = dict(room.plan)
        if dry_run:
            return report

        for profile in result.profiles:
            if profile not in data.profiles:
                data.profiles.append(profile)
        data.schedules.update(result.schedules)
        data.room_plans.update(plans)

        await self._store.async_save(data)
        if new_subentries:
            # Adding a subentry reloads the entry, which picks up the saved store.
            for subentry in new_subentries:
                self.hass.config_entries.async_add_subentry(self.entry, subentry)
        else:
            self.hass.config_entries.async_schedule_reload(self.entry.entry_id)
        return report

    # --- evaluation -------------------------------------------------------

    async def _tick(self, _now: object = None) -> None:
        await self.async_evaluate()

    def _resume(self) -> datetime | None:
        raw = self.data.state.away_resume
        return datetime.fromisoformat(raw) if raw else None

    async def async_evaluate(self) -> None:
        now = local_now()
        resume = self._resume()
        if resume is not None and not away.is_away(now, resume):
            self.data.state.away_resume = None
            resume = None
            await self._store.async_save(self.data)
        expired = [h for h in self.holds if h.until <= now]
        if expired:
            self.holds = [h for h in self.holds if h.until > now]
            self.log("Hold ended, the schedule applies again")
            await self._save_holds()
        settings = self.data.settings
        self._update_calendar_away(now)
        self._update_free_day(now)
        await self._update_forecast(now)
        away_now = away.is_away(now, resume) or self.calendar_away
        self.season_active = in_season(now.date(), settings.season_start, settings.season_end)
        if self.season_active != self._last_season:
            if self._last_season is not None:
                self.log("Heating season started" if self.season_active else "Heating season ended")
            self._last_season = self.season_active
        if away_now != self._last_away:
            if self._last_away is not None:
                self.log("Away period started" if away_now else "Away period ended")
            self._last_away = away_now

        for room in self.rooms.values():
            await self._evaluate_room(room, now, away_now)
        self._notify()

    # --- optional global features ------------------------------------------

    def _calendar_event(self, entity: str, match: str) -> tuple[bool, datetime | None, str]:
        """Whether the calendar currently has an event with a matching title; returns its end and title."""
        state = self.hass.states.get(entity)
        if state is None or state.state != STATE_ON:
            return False, None, ""
        title = state.attributes.get("message") or ""
        if not calendar_matches(title, match):
            return False, None, title
        end = None
        raw = state.attributes.get("end_time")
        if raw:
            try:
                end = datetime.fromisoformat(str(raw))
            except ValueError:
                end = None
        return True, end, title

    def _update_calendar_away(self, now: datetime) -> None:
        feature = self.data.settings.feature("calendar_away")
        active, end, title = (False, None, "")
        if feature["enabled"] and feature["entity"]:
            active, end, title = self._calendar_event(feature["entity"], feature["match"])
        if active != self.calendar_away:
            self.log(
                f"Away from calendar started ('{title}'" + (f", until {end:%Y-%m-%d %H:%M})" if end else ")")
                if active else "Away from calendar ended"
            )
        self.calendar_away, self.calendar_away_end, self.calendar_away_text = active, end, title

    def _update_free_day(self, now: datetime) -> None:
        settings = self.data.settings
        reasons: list[str] = []
        workday = settings.feature("workday")
        if workday["enabled"] and workday["entity"]:
            state = self.hass.states.get(workday["entity"])
            if state is not None and workday_sensor_says_holiday(
                state.state, state.attributes.get("workdays"), now.weekday()
            ):
                reasons.append(f"workday sensor is off on a working weekday ({workday['entity']})")
        holiday = settings.feature("holiday")
        if holiday["enabled"] and holiday["entity"]:
            state = self.hass.states.get(holiday["entity"])
            if state is not None and state.state == STATE_ON:
                reasons.append(f"holiday sensor is on ({holiday['entity']})")
        calendar = settings.feature("free_calendar")
        if calendar["enabled"] and calendar["entity"]:
            active, _end, title = self._calendar_event(calendar["entity"], calendar["match"])
            if active:
                reasons.append(f"calendar event '{title}'")
        self.free_day = bool(reasons)
        self.free_reason = "; ".join(reasons)
        key = self.free_reason if self.free_day else ""
        if key != self._last_free:
            if self._last_free is not None or self.free_day:
                weekday = settings.feature("free_day")["weekday"]
                self.log(
                    f"Free day: {self.free_reason}; using the blocks of {_DAY_NAMES[int(weekday) % 7]}"
                    if self.free_day
                    else "Free day ended, normal weekday schedule"
                )
            self._last_free = key

    async def _update_forecast(self, now: datetime) -> None:
        feature = self.data.settings.feature("forecast")
        if not (feature["enabled"] and feature["entity"]):
            self.forecast_warm, self.forecast_max = False, None
            return
        if self._forecast_at is None or now - self._forecast_at > timedelta(minutes=30):
            self._forecast_at = now
            try:
                response = await self.hass.services.async_call(
                    "weather", "get_forecasts", {"type": "daily", "entity_id": feature["entity"]},
                    blocking=True, return_response=True,
                )
                items = (response or {}).get(feature["entity"], {}).get("forecast", [])
                today = now.date().isoformat()
                item = next((i for i in items if str(i.get("datetime", "")).startswith(today)), items[0] if items else None)
                self.forecast_max = float(item["temperature"]) if item and item.get("temperature") is not None else None
                self._forecast_failed = False
            except (HomeAssistantError, KeyError, TypeError, ValueError) as err:
                if not self._forecast_failed:
                    self.log(f"Forecast unavailable ({feature['entity']}): {err}", level=logging.WARNING)
                self._forecast_failed = True
                self.forecast_max = None
        warm = self.forecast_max is not None and self.forecast_max >= float(feature["max_temp"])
        if warm != self.forecast_warm:
            self.log(
                f"Forecast cutoff: today's maximum {self.forecast_max:g} °C is "
                + (f"at or above {float(feature['max_temp']):g} °C, heating paused" if warm else f"below {float(feature['max_temp']):g} °C, heating allowed")
                if self.forecast_max is not None else "Forecast cutoff ended"
            )
        self.forecast_warm = warm

    def _cancel_presence_timer(self) -> None:
        if self._presence_cancel is not None:
            self._presence_cancel()
            self._presence_cancel = None

    async def _evaluate_room(self, room: RoomConfig, now: datetime, away_now: bool) -> None:
        rt = self.runtime[room.id]
        settings = self.data.settings
        use_away_profile = away_now and settings.away_profile in self.data.profiles
        profile = settings.away_profile if use_away_profile else self.data.state.active_profile
        schedule_name = self.data.room_plans.get(room.id, {}).get(profile or "")

        # optional: room occupancy changes the target, the profile or the schedule used for this room
        notes: list[str] = []
        occ_offset = 0.0
        if room.occupancy_enabled and room.occupancy_entity:
            occ_state = self.hass.states.get(room.occupancy_entity)
            present = occupied(occ_state.state if occ_state else None)
            if present is not None:
                kind, value = (
                    (room.occ_present_type, room.occ_present_value)
                    if present
                    else (room.occ_absent_type, room.occ_absent_value)
                )
                label = "occupied" if present else "empty"
                if kind == "offset" and value not in (None, ""):
                    occ_offset = float(value)
                    notes.append(f"room {label}: {occ_offset:+g} °C")
                elif kind == "profile" and value in self.data.profiles:
                    schedule_name = self.data.room_plans.get(room.id, {}).get(value)
                    notes.append(f"room {label}: using profile '{value}'")
                elif kind == "schedule" and value in self.data.schedules:
                    schedule_name = value
                    notes.append(f"room {label}: using schedule '{value}'")

        schedule = self.data.schedules.get(schedule_name or "")
        free_weekday = self.data.settings.feature("free_day")["weekday"] if self.free_day else None
        resolved = resolve(schedule, now, free_weekday) if schedule else Resolved(None, False)
        rt.base_target = resolved.target
        offset = occ_offset + (room.adjust if room.adjust_enabled else 0.0)
        adjusted, adjust_notes = adjust(
            resolved.target,
            offset=offset,
            minimum=room.min_temp if room.limits_enabled else None,
            maximum=room.max_temp if room.limits_enabled else None,
        )
        if room.adjust_enabled and room.adjust:
            notes.append(f"room adjustment {room.adjust:+g} °C")
        notes += [n for n in adjust_notes if "adjustment" not in n]  # limits only; offsets are named above
        rt.adjustments = ", ".join(notes)
        resolved = Resolved(adjusted, resolved.from_block, resolved.block)
        rt.target = resolved.target

        cutoff = self._cutoff_for(room)
        outdoor = self._outdoor(cutoff) if cutoff.enabled else None
        if cutoff.enabled:
            rt.cutoff.update(now, outdoor, resolved.target)
        allowed = rt.cutoff.heating_allowed if cutoff.enabled else True
        limit = None
        if cutoff.enabled:
            reference = cutoff.threshold if cutoff.threshold is not None else resolved.target
            limit = None if reference is None else reference + cutoff.offset
            if rt.cutoff_logged is not None and rt.cutoff_logged != allowed:
                self.log(
                    "Outdoor cutoff: heating "
                    + ("allowed again" if allowed else "switched off")
                    + f" (outdoor {outdoor if outdoor is not None else '?'} °C, limit {limit if limit is not None else '?'} °C)",
                    room.name,
                )
            rt.cutoff_logged = allowed

        if rt.override is not None and not rt.override.active(now):
            self.log("Manual override expired, schedule applies again", room.name)
            rt.override = None
        window_active = await self._track_window(room, rt, now)
        hold = self._hold_for(room.id)
        hold_target = None
        if hold is not None:
            if hold.mode == "fixed":
                hold_target = hold.value
            else:
                boost = self.data.settings.feature("boost")
                basis = resolved.target if resolved.target is not None else float(boost["fallback"])
                hold_target = round(basis + hold.value, 1)
        decision = decide(
            window_open=window_active,
            window_target=room.window_target if room.window_mode == "lower" else None,
            forecast_warm=self.forecast_warm and room.cutoff_scope != CUTOFF_NONE,
            hold_target=hold_target,
            override_active=rt.override is not None,
            season_active=self.season_active,
            away=away_now and not use_away_profile,
            heating_allowed=allowed,
            schedule_target=resolved.target,
            from_block=resolved.from_block,
        )
        rt.decision = decision
        rt.current_event = None
        key = (str(decision.reason), decision.target, decision.hold)
        if key != rt.logged:
            rt.logged = key
            detail = (
                f"profile '{profile}', schedule '{schedule_name}'{_block_text(resolved.block)}"
                if schedule_name
                else f"profile '{profile}', no schedule assigned"
            )
            if rt.adjustments:
                detail += f"; {rt.adjustments}"
            why = REASON_TEXT.get(decision.reason, str(decision.reason))
            if decision.reason is Reason.HOLD and hold is not None:
                why = f"hold until {hold.until:%H:%M}"
            if decision.reason is Reason.FORECAST:
                why += f": today's maximum {self.forecast_max:g} °C"
            if self.free_day and decision.reason in (Reason.SCHEDULE, Reason.DEFAULT, Reason.SCHEDULE_OFF):
                detail += "; free day"
            if decision.reason is Reason.OUTDOOR_CUTOFF:
                why += f": outdoor {outdoor if outdoor is not None else '?'} °C is at or above {limit if limit is not None else '?'} °C"
            if decision.hold:
                until = (rt.override.started + timedelta(minutes=rt.override.minutes)) if rt.override else None
                rt.current_event = self.log(
                    f"Holding: manual override until {until:%H:%M}, schedule paused ({detail})" if until else f"Holding ({detail})",
                    room.name,
                )
            elif decision.target is None:
                rt.current_event = self.log(f"Off: {why} ({detail})", room.name)
            else:
                was = f" (was {rt.prev_target:g} °C)" if rt.prev_target is not None and rt.prev_target != decision.target else ""
                rt.current_event = self.log(f"Target {decision.target:g} °C{was}: {why} ({detail})", room.name)
            rt.prev_target = decision.target if decision.target is not None else rt.prev_target
        await self._apply(room, rt, decision)

    async def _track_window(self, room: RoomConfig, rt: RoomRuntime, now: datetime) -> bool:
        """Log window changes and return whether the window should act on the thermostat now."""
        if not room.window_enabled or not room.window_sensors:
            rt.window_since = None
            return False
        open_names = [
            (s.attributes.get("friendly_name") or s.entity_id)
            for e in room.window_sensors
            if (s := self.hass.states.get(e)) is not None and s.state == STATE_ON
        ]
        if open_names and rt.window_since is None:
            rt.window_since = now
            rt.window_notified = False
            self.log(f"Window opened ({', '.join(open_names)})", room.name)
        elif not open_names and rt.window_since is not None:
            minutes = int((now - rt.window_since).total_seconds() // 60)
            self.log(f"Window closed after {minutes} min", room.name)
            rt.window_since = None
        if rt.window_since is None:
            return False
        open_for = now - rt.window_since
        if room.window_too_long and not rt.window_notified and open_for >= timedelta(minutes=room.window_too_long):
            rt.window_notified = True
            text = f"Window open for {int(open_for.total_seconds() // 60)} min ({', '.join(open_names)})"
            self.log(text, room.name, logging.WARNING)
            if room.window_notify:
                await self.async_notify(f"Thermoplan: {room.name}", text)
        if room.window_mode == "observe":
            return False
        return open_for >= timedelta(minutes=room.window_open_delay)

    async def async_notify(self, title: str, message: str) -> None:
        """Send a notification when notifications are switched on in the settings."""
        settings = self.data.settings
        if not settings.notify_enabled:
            return
        service = settings.notify_service or "persistent_notification.create"
        domain, _, name = service.partition(".")
        try:
            await self.hass.services.async_call(
                domain, name or "create", {"title": title, "message": message}, blocking=True
            )
        except HomeAssistantError as err:
            self.log(f"Notification via {service} failed: {err}", level=logging.WARNING)

    def _cutoff_for(self, room: RoomConfig) -> CutoffSettings:
        if room.cutoff_scope == CUTOFF_NONE:
            return CutoffSettings(enabled=False)
        if room.cutoff_scope == CUTOFF_GLOBAL:
            return self.data.settings.cutoff
        return room.cutoff

    @staticmethod
    def _make_cutoff(settings: CutoffSettings) -> OutdoorCutoff:
        return OutdoorCutoff(
            off_after=timedelta(minutes=settings.off_after_minutes),
            on_after=timedelta(minutes=settings.on_after_minutes),
            offset=settings.offset,
            threshold=settings.threshold,
        )

    def _outdoor(self, cutoff: CutoffSettings) -> float | None:
        """Outdoor sensor first; fall back to the weather entity when it is unusable."""
        if cutoff.outdoor_sensor:
            state = self.hass.states.get(cutoff.outdoor_sensor)
            if state is not None and state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                try:
                    return float(state.state)
                except ValueError:
                    pass
        if cutoff.weather_entity:
            state = self.hass.states.get(cutoff.weather_entity)
            if state is not None:
                try:
                    return float(state.attributes["temperature"])
                except (KeyError, TypeError, ValueError):
                    pass
        return None

    # --- applying ---------------------------------------------------------

    async def _apply(self, room: RoomConfig, rt: RoomRuntime, decision: Decision) -> None:
        if decision.hold:
            return
        state = self.hass.states.get(room.climate_entity)
        if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            if rt.logged != ("unavailable",):
                self.log(f"Thermostat {room.climate_entity} is unavailable, nothing sent", room.name, logging.WARNING)
                rt.logged = ("unavailable",)
            return
        current = state.attributes.get("temperature")
        if state.state != STATE_OFF:
            await self._mark_off(room, False)  # it is on again, whoever did that
        try:
            if decision.target is None:
                if room.off_mode == OFF_HVAC:
                    rt.last_sent, rt.sent_off = None, True
                    if state.state != STATE_OFF:
                        await self._call("set_hvac_mode", room, hvac_mode="off")
                    await self._mark_off(room, True)  # we want it off, so this off state is ours
                else:
                    rt.last_sent, rt.sent_off = room.off_target, True
                    await self._ensure_target(room, state.state, current, room.off_target)
            else:
                rt.last_sent, rt.sent_off = decision.target, False
                await self._ensure_target(room, state.state, current, decision.target)
        except HomeAssistantError as err:
            self.log(f"Could not control {room.climate_entity}: {err}", room.name, logging.WARNING)

    async def _ensure_target(
        self, room: RoomConfig, hvac: str, current: object, target: float
    ) -> None:
        rt = self.runtime[room.id]
        if hvac == STATE_OFF:
            if room.id in self.data.state.off_by_us or rt.take_control:
                await self._call("set_hvac_mode", room, hvac_mode="heat")
                await self._mark_off(room, False)
                rt.take_control = False
            else:
                # Switched off by something else (e.g. Better Thermostat's window handling, or by hand).
                if not rt.off_noted:
                    rt.off_noted = True
                    self.log(
                        "Thermostat is off but was not switched off by Thermoplan (window handling "
                        "of Better Thermostat, or by hand); leaving it alone until it is on again "
                        "or you reset the manual change",
                        room.name,
                    )
                return
        rt.off_noted = False
        try:
            if abs(float(current) - target) <= SEND_TOLERANCE:
                return
        except (TypeError, ValueError):
            pass
        await self._call("set_temperature", room, temperature=target)

    async def _mark_off(self, room: RoomConfig, ours: bool) -> None:
        """Remember (persistently) whether a thermostat that is off was switched off by us."""
        off = self.data.state.off_by_us
        if ours and room.id not in off:
            off.append(room.id)
        elif not ours and room.id in off:
            off.remove(room.id)
        else:
            return
        await self._store.async_save(self.data)

    async def _call(self, service: str, room: RoomConfig, **data: object) -> None:
        self.runtime[room.id].last_command = local_now()
        current = self.hass.states.get(room.climate_entity)
        was = (
            f"thermostat was {current.state}, target {current.attributes.get('temperature')}"
            if current is not None
            else "thermostat state unknown"
        )
        text = f"Sent climate.{service} {data} ({was})"
        event = self.runtime[room.id].current_event
        if event is not None:  # show it under the decision that caused it
            event["detail"] = f"{event['detail']}; {text}" if event.get("detail") else text
            _LOGGER.info("[%s] %s", room.name, text)
        else:
            self.log(text, room.name)
        await self.hass.services.async_call(
            "climate",
            service,
            {"entity_id": room.climate_entity, **data},
            blocking=True,
        )

    # --- state change handlers -------------------------------------------

    @callback
    def _other_changed(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        new = event.data["new_state"]
        if entity_id == self.data.settings.person_entity and new is not None:
            old = event.data.get("old_state")
            if old is not None and old.state == new.state:
                return  # only attributes changed (e.g. GPS position)
            self._cancel_presence_timer()  # a new state replaces a pending switch
            for rule in self.data.settings.presence_rules:
                if rule.state.casefold() == new.state.casefold():
                    before = old.state if old is not None else "unknown"
                    source = f"presence rule: {entity_id} changed from '{before}' to '{new.state}'"
                    delay = self.data.settings.feature("presence_delay")
                    minutes = int(delay["minutes"]) if delay["enabled"] else 0
                    if minutes > 0 and new.state.casefold() != "home":  # only leaving is delayed
                        self.log(f"{source}; switching to '{rule.profile}' in {minutes} min unless it changes back")
                        self._presence_cancel = async_call_later(
                            self.hass, minutes * 60,
                            lambda _now, r=rule, s=source, st=new.state: self.hass.async_create_task(
                                self._presence_fire(r.profile, s, st)
                            ),
                        )
                    else:
                        self.hass.async_create_task(self.async_set_profile(rule.profile, source))
                    return
        self.hass.async_create_task(self.async_evaluate())

    async def _presence_fire(self, profile: str, source: str, expected_state: str) -> None:
        self._presence_cancel = None
        person = self.hass.states.get(self.data.settings.person_entity or "")
        if person is not None and person.state.casefold() == expected_state.casefold():
            await self.async_set_profile(profile, source + f" (kept for the delay)")

    @callback
    def _climate_changed(self, event: Event) -> None:
        new = event.data["new_state"]
        room = next(
            (r for r in self.rooms.values() if r.climate_entity == event.data["entity_id"]),
            None,
        )
        if room is None or new is None or room.override_minutes <= 0:
            return
        rt = self.runtime[room.id]
        old = event.data.get("old_state")
        own = rt.last_command is not None and local_now() - rt.last_command < COMMAND_GRACE
        if (
            old is not None and not own and old.state != new.state
            and STATE_UNAVAILABLE not in (old.state, new.state) and STATE_UNKNOWN not in (old.state, new.state)
        ):
            window = ""
            if room.window_sensors:
                window = "; window " + ("open" if rt.window_since is not None else "closed")
            self.log(f"Thermostat changed from {old.state} to {new.state} (not by Thermoplan{window})", room.name)
        if new.state in (STATE_OFF, STATE_UNAVAILABLE, STATE_UNKNOWN):
            return  # window logic or our own off command
        try:
            temp = float(new.attributes.get("temperature"))
        except (TypeError, ValueError):
            return
        if rt.last_command is not None and local_now() - rt.last_command < COMMAND_GRACE:
            if rt.last_sent is not None and abs(temp - rt.last_sent) > DEFAULT_TOLERANCE:
                self.log(
                    f"Thermostat reports {temp:g} °C shortly after our command ({rt.last_sent:g} °C); ignored",
                    room.name,
                )
            return  # the thermostat is still reacting to our own command
        if rt.sent_off:
            if room.off_mode != OFF_HVAC and abs(temp - room.off_target) < 0.01:
                return
            manual = True  # turned on while we had it off
        else:
            manual = is_manual_change(rt.last_sent, temp, DEFAULT_TOLERANCE)
        if manual and rt.decision is not None and rt.decision.reason is Reason.HOLD:
            self.log(f"Manual change detected ({temp:g} °C on the thermostat); hold cancelled for this room", room.name)
            self.hass.async_create_task(self.async_cancel_holds([room.id]))
            return
        if manual and rt.decision is not None and rt.decision.reason is not Reason.WINDOW:
            rt.override = Override(local_now(), room.override_minutes)
            self.log(
                f"Manual change detected ({temp:g} °C on the thermostat, expected "
                f"{'off' if rt.sent_off else rt.last_sent}); schedule paused for {room.override_minutes} min",
                room.name,
            )
            rt.sent_off = False
            rt.last_sent = temp
            self.hass.async_create_task(self.async_evaluate())
