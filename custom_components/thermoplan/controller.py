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
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.start import async_at_started
from homeassistant.util import dt as dt_util

from .engine import away
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
    cutoff_logged: bool | None = None


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
        self._unsubs: list[Callable[[], None]] = []

    def log(self, message: str, room: str | None = None, level: int = logging.INFO) -> None:
        """Record an event for the Log tab and the Home Assistant log."""
        self.events.append(
            {"time": dt_util.now().isoformat(timespec="seconds"), "room": room, "message": message}
        )
        _LOGGER.log(level, "%s%s", f"[{room}] " if room else "", message)

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

    @callback
    def async_start(self) -> None:
        climate = {room.climate_entity for room in self.rooms.values()}
        other: set[str] = set(filter(None, [self.data.settings.person_entity]))
        for room in self.rooms.values():
            cutoff = self._cutoff_for(room)
            other.update(room.window_sensors)
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
        self.log(f"Profile set to '{profile}' ({source}); manual overrides cleared")
        self.data.state.active_profile = profile
        for rt in self.runtime.values():
            rt.override = None  # an explicit profile change wins over manual changes
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_clear_overrides(self, room_id: str | None = None) -> None:
        """Drop manual overrides (one room, or all) so the schedule applies again."""
        for rid, rt in self.runtime.items():
            if room_id is None or rid == room_id:
                if rt.override is not None:
                    self.log("Manual override reset", self.rooms[rid].name)
                rt.override = None
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
        return away.is_away(local_now(), self._resume())


    # --- editing (used by the websocket API and options flow) ----------------

    def snapshot(self) -> dict:
        """Everything the editor needs."""
        data = store_to_dict(self.data)
        data["rooms"] = [
            {"id": r.id, "name": r.name, **dict(self.entry.subentries[r.id].data)}
            for r in self.rooms.values()
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
        self.data.schedules[schedule.name] = schedule
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_delete_schedule(self, name: str) -> None:
        self.data.schedules.pop(name, None)
        for plan in self.data.room_plans.values():
            for profile in [p for p, sched in plan.items() if sched == name]:
                del plan[profile]
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_set_room_plan(self, room_id: str, plan: dict[str, str]) -> None:
        self.data.room_plans[room_id] = plan
        await self._store.async_save(self.data)
        await self.async_evaluate()

    async def async_set_settings(self, settings: Settings) -> None:
        self.data.settings = settings
        await self._save_and_reload()

    async def async_save_room(self, room_id: str | None, name: str, data: dict) -> str:
        """Create or update a room (a config subentry); the entry reloads afterwards."""
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
        self.data.room_plans.pop(room_id, None)
        await self._store.async_save(self.data)
        self.hass.config_entries.async_remove_subentry(self.entry, room_id)

    async def async_import(self, result: ImportResult, create_rooms: bool) -> dict:
        """Merge an imported Schedy configuration; returns a report."""
        data = self.data
        for profile in result.profiles:
            if profile not in data.profiles:
                data.profiles.append(profile)
        data.schedules.update(result.schedules)

        by_entity = {room.climate_entity: room.id for room in self.rooms.values()}
        report: dict = {
            "profiles": result.profiles,
            "schedules": list(result.schedules),
            "rooms_matched": [],
            "rooms_created": [],
            "rooms_skipped": [],
            "warnings": list(result.warnings),
        }
        new_subentries: list[ConfigSubentry] = []
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
            data.room_plans[room_id] = dict(room.plan)

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
        away_now = away.is_away(now, resume)
        settings = self.data.settings
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

    async def _evaluate_room(self, room: RoomConfig, now: datetime, away_now: bool) -> None:
        rt = self.runtime[room.id]
        settings = self.data.settings
        use_away_profile = away_now and settings.away_profile in self.data.profiles
        profile = settings.away_profile if use_away_profile else self.data.state.active_profile
        schedule_name = self.data.room_plans.get(room.id, {}).get(profile or "")
        schedule = self.data.schedules.get(schedule_name or "")
        resolved = resolve(schedule, now) if schedule else Resolved(None, False)
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
        decision = decide(
            window_open=any(
                (s := self.hass.states.get(e)) is not None and s.state == STATE_ON
                for e in room.window_sensors
            ),
            override_active=rt.override is not None,
            season_active=self.season_active,
            away=away_now and not use_away_profile,
            heating_allowed=allowed,
            schedule_target=resolved.target,
            from_block=resolved.from_block,
        )
        rt.decision = decision
        key = (str(decision.reason), decision.target, decision.hold)
        if key != rt.logged:
            rt.logged = key
            detail = (
                f"profile '{profile}', schedule '{schedule_name}'{_block_text(resolved.block)}"
                if schedule_name
                else f"profile '{profile}', no schedule assigned"
            )
            why = REASON_TEXT.get(decision.reason, str(decision.reason))
            if decision.reason is Reason.OUTDOOR_CUTOFF:
                why += f": outdoor {outdoor if outdoor is not None else '?'} °C is at or above {limit if limit is not None else '?'} °C"
            if decision.hold:
                until = (rt.override.started + timedelta(minutes=rt.override.minutes)) if rt.override else None
                self.log(
                    f"Holding: manual override until {until:%H:%M}, schedule paused ({detail})" if until else f"Holding ({detail})",
                    room.name,
                )
            elif decision.target is None:
                self.log(f"Off: {why} ({detail})", room.name)
            else:
                was = f" (was {rt.prev_target:g} °C)" if rt.prev_target is not None and rt.prev_target != decision.target else ""
                self.log(f"Target {decision.target:g} °C{was}: {why} ({detail})", room.name)
            rt.prev_target = decision.target if decision.target is not None else rt.prev_target
        await self._apply(room, rt, decision)

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
        try:
            if decision.target is None:
                if room.off_mode == OFF_HVAC:
                    rt.last_sent, rt.sent_off = None, True
                    if state.state != STATE_OFF:
                        await self._call("set_hvac_mode", room, hvac_mode="off")
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
        if hvac == STATE_OFF:
            await self._call("set_hvac_mode", room, hvac_mode="heat")
        try:
            if abs(float(current) - target) <= SEND_TOLERANCE:
                return
        except (TypeError, ValueError):
            pass
        await self._call("set_temperature", room, temperature=target)

    async def _call(self, service: str, room: RoomConfig, **data: object) -> None:
        self.runtime[room.id].last_command = local_now()
        current = self.hass.states.get(room.climate_entity)
        was = (
            f"thermostat was {current.state}, target {current.attributes.get('temperature')}"
            if current is not None
            else "thermostat state unknown"
        )
        self.log(f"Sent climate.{service} {data} ({was})", room.name)
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
            for rule in self.data.settings.presence_rules:
                if rule.state.casefold() == new.state.casefold():
                    self.hass.async_create_task(
                        self.async_set_profile(
                            rule.profile, f"presence rule: {entity_id} is now '{new.state}'"
                        )
                    )
                    return
        self.hass.async_create_task(self.async_evaluate())

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
