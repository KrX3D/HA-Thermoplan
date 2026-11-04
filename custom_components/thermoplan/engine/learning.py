"""Learning how fast a room heats up and cools down.

Model (one per room):  dT/dt = P - k * (T - T_out)

* ``k``      cooling constant in 1/min: how fast the room drifts towards the outside temperature
* ``power``  heating gain in degrees per minute with the heating on, at T = T_out

Observed from "segments": stretches of time in which the thermostat was heating, or idle, and the
temperature moved. From the model we can predict how long a room needs to reach a temperature
(preheating) and how far it falls without heating (coasting).
"""

from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass
from datetime import datetime

HEAT = "heat"
IDLE = "idle"

MIN_SEGMENT_MINUTES = 20
MIN_HEAT_DELTA = 0.4
MIN_IDLE_DELTA = 0.3
MAX_GAP_MINUTES = 10
MIN_OUTDOOR_GAP = 3.0  # room must be this much warmer than outside to learn k from an idle segment
DEFAULT_OUTDOOR = 10.0
MAX_SAMPLES = 40


def classify(hvac_state: str | None, current: float | None, setpoint: float | None) -> str | None:
    """Is the thermostat clearly heating up, idle, or somewhere in between (None)?

    Only a clear heat-up (setpoint at least 1 degree above the room) counts as heating: keeping a room
    at its target heats a little now and then and says nothing about how fast the room can warm up.
    """
    if current is None:
        return None
    if hvac_state == "off":
        return IDLE
    if setpoint is None:
        return None
    if setpoint >= current + 1.0:
        return HEAT
    if setpoint <= current - 0.2:
        return IDLE
    return None


@dataclass
class Sample:
    """One finished segment."""

    kind: str
    minutes: float
    delta: float  # temperature change over the segment
    t_avg: float
    t_out: float | None
    rate: float  # degrees per minute (negative when cooling)
    at: str  # ISO time the segment ended

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: dict) -> Sample:
        return cls(raw["kind"], float(raw["minutes"]), float(raw["delta"]), float(raw["t_avg"]),
                   None if raw.get("t_out") is None else float(raw["t_out"]), float(raw["rate"]), raw["at"])


class SegmentTracker:
    """Cuts a stream of (time, kind, temperature) observations into samples."""

    def __init__(self) -> None:
        self._reset()

    def _reset(self) -> None:
        self.kind: str | None = None
        self._start: datetime | None = None
        self._start_temp = 0.0
        self._last: datetime | None = None
        self._last_temp = 0.0
        self._temps: list[float] = []
        self._outdoors: list[float | None] = []

    def update(
        self, now: datetime, kind: str | None, temp: float | None, outdoor: float | None, valid: bool = True
    ) -> Sample | None:
        """Feed one observation; returns a sample when a segment has just ended."""
        gap = self._last is not None and (now - self._last).total_seconds() > MAX_GAP_MINUTES * 60
        if temp is None or not valid:
            kind = None
        if kind == self.kind and kind is not None and not gap:
            self._last, self._last_temp = now, temp
            self._temps.append(temp)
            self._outdoors.append(outdoor)
            return None
        finished = self._finish()
        self._reset()
        if kind is not None:
            self.kind = kind
            self._start = self._last = now
            self._start_temp = self._last_temp = temp  # type: ignore[assignment]
            self._temps = [temp]  # type: ignore[list-item]
            self._outdoors = [outdoor]
        return finished

    def _finish(self) -> Sample | None:
        if self.kind is None or self._start is None or self._last is None:
            return None
        minutes = (self._last - self._start).total_seconds() / 60
        delta = self._last_temp - self._start_temp
        if minutes < MIN_SEGMENT_MINUTES:
            return None
        if self.kind == HEAT and delta < MIN_HEAT_DELTA:
            return None
        if self.kind == IDLE and -delta < MIN_IDLE_DELTA:
            return None
        known = [o for o in self._outdoors if o is not None]
        return Sample(
            kind=self.kind,
            minutes=round(minutes, 1),
            delta=round(delta, 2),
            t_avg=round(statistics.fmean(self._temps), 2),
            t_out=round(statistics.fmean(known), 2) if known else None,
            rate=delta / minutes,
            at=self._last.isoformat(timespec="seconds"),
        )


@dataclass
class Model:
    k: float | None  # 1/min, None until an idle segment was seen
    power: float | None  # degrees per minute, None until a heating segment was seen
    n_heat: int
    n_idle: int

    def ready(self, min_samples: int) -> bool:
        return self.power is not None and self.n_heat >= min_samples


def fit(samples: list[Sample]) -> Model:
    """Estimate k and power from the samples (medians, so single bad segments do little harm)."""
    idle = [s for s in samples if s.kind == IDLE]
    heat = [s for s in samples if s.kind == HEAT]
    ks = [
        -s.rate / (s.t_avg - s.t_out)
        for s in idle
        if s.t_out is not None and s.t_avg - s.t_out >= MIN_OUTDOOR_GAP and s.rate < 0
    ]
    k = statistics.median(ks) if ks else None
    powers = [
        s.rate + (k or 0.0) * ((s.t_avg - s.t_out) if s.t_out is not None else 0.0)
        for s in heat
    ]
    power = statistics.median(powers) if powers else None
    if power is not None and power <= 0:
        power = None
    return Model(k=k, power=power, n_heat=len(heat), n_idle=len(idle))


def time_to_reach(model: Model, t0: float, t1: float, t_out: float | None) -> float | None:
    """Minutes the heating needs to bring the room from t0 to t1; None if it cannot get there."""
    if t1 <= t0:
        return 0.0
    if model.power is None:
        return None
    out = DEFAULT_OUTDOOR if t_out is None else t_out
    k = model.k or 0.0
    if k <= 1e-6:
        return (t1 - t0) / model.power
    t_eq = out + model.power / k
    if t_eq <= t1:
        return None
    return math.log((t_eq - t0) / (t_eq - t1)) / k


def temp_after(model: Model, t0: float, minutes: float, t_out: float | None, heating: bool = False) -> float | None:
    """Room temperature after some minutes with the heating on or off; None without a cooling constant."""
    if model.k is None or model.k <= 1e-6:
        return None
    out = DEFAULT_OUTDOOR if t_out is None else t_out
    power = (model.power or 0.0) if heating else 0.0
    t_eq = out + power / model.k
    return t_eq + (t0 - t_eq) * math.exp(-model.k * minutes)
