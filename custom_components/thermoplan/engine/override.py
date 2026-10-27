"""Manual override detection and timeout."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

DEFAULT_TOLERANCE = 0.5


def is_manual_change(
    last_sent: float | None, current: float | None, tolerance: float = DEFAULT_TOLERANCE
) -> bool:
    """Whether a thermostat target differs from what Thermoplan last sent.

    Callers must not call this for changes caused by window logic (off / 4.5).
    """
    if last_sent is None or current is None:
        return False
    return abs(current - last_sent) > tolerance


@dataclass(frozen=True)
class Override:
    """A running manual override; ``minutes`` of 0 disables overrides."""

    started: datetime
    minutes: int

    def active(self, now: datetime) -> bool:
        """Whether the override still holds off the schedule."""
        return self.minutes > 0 and now < self.started + timedelta(minutes=self.minutes)
