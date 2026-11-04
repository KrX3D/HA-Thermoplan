"""Room occupancy from the state of a presence / motion / person entity."""

from __future__ import annotations

_PRESENT = {"on", "home", "true", "detected", "occupied", "present"}
_ABSENT = {"off", "not_home", "false", "clear", "unoccupied", "absent"}


def occupied(state: str | None) -> bool | None:
    """True when someone is in the room, False when nobody is, None when unknown."""
    value = (state or "").strip().lower()
    if value in _PRESENT:
        return True
    if value in _ABSENT:
        return False
    return None
