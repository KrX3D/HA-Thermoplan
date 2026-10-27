"""Outdoor-temperature cutoff with time-based hysteresis.

Heating is switched off once the outdoor temperature has stayed at or above the
room's current target (plus offset) for ``off_after``. It is allowed again once the
outdoor temperature has stayed below that threshold for ``on_after``. Because the
threshold follows the current target, a lower night target works without special cases.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass
class OutdoorCutoff:
    """Stateful cutoff for one scope (global or one room)."""

    off_after: timedelta
    on_after: timedelta
    offset: float = 0.0
    heating_allowed: bool = True
    _since: datetime | None = None

    def update(
        self, now: datetime, outdoor: float | None, target: float | None
    ) -> bool:
        """Feed a new reading and return whether heating is allowed."""
        if outdoor is None or target is None:
            return self.heating_allowed

        warm = outdoor >= target + self.offset
        # The timer runs only while the reading opposes the current state.
        opposing = warm if self.heating_allowed else not warm
        if not opposing:
            self._since = None
            return self.heating_allowed

        if self._since is None:
            self._since = now
        needed = self.off_after if self.heating_allowed else self.on_after
        if now - self._since >= needed:
            self.heating_allowed = not self.heating_allowed
            self._since = None
        return self.heating_allowed
