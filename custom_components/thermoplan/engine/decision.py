"""Per-room decision: combine all inputs into one action."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Reason(StrEnum):
    """Why a room is in its current state (exposed as a diagnostic)."""

    WINDOW = "window"
    HOLD = "hold"
    OVERRIDE = "override"
    OUTSIDE_SEASON = "outside_season"
    AWAY = "away"
    OUTDOOR_CUTOFF = "outdoor_cutoff"
    FORECAST = "forecast"
    SCHEDULE_OFF = "schedule_off"
    SCHEDULE = "schedule"
    DEFAULT = "default"


@dataclass(frozen=True)
class Decision:
    """``target`` of None means off (the room defines what off means); hold means do nothing."""

    target: float | None
    reason: Reason
    hold: bool = False


def decide(
    *,
    window_open: bool,
    override_active: bool,
    season_active: bool,
    away: bool,
    heating_allowed: bool,
    schedule_target: float | None,
    from_block: bool,
    window_target: float | None = None,
    forecast_warm: bool = False,
    hold_target: float | None = None,
) -> Decision:
    """Pick the action; the first matching rule wins.

    A running manual override holds the room as it is, except when a window opens.
    """
    if window_open:
        return Decision(window_target, Reason.WINDOW)  # None = off, a number = lowered target
    if hold_target is not None:
        return Decision(hold_target, Reason.HOLD)  # an explicit hold or boost beats everything but a window
    if override_active:
        return Decision(None, Reason.OVERRIDE, hold=True)
    if not season_active:
        return Decision(None, Reason.OUTSIDE_SEASON)
    if away:
        return Decision(None, Reason.AWAY)
    if forecast_warm:
        return Decision(None, Reason.FORECAST)
    if not heating_allowed:
        return Decision(None, Reason.OUTDOOR_CUTOFF)
    if schedule_target is None:
        return Decision(None, Reason.SCHEDULE_OFF)
    return Decision(schedule_target, Reason.SCHEDULE if from_block else Reason.DEFAULT)
