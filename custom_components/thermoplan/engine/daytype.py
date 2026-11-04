"""Free days: public holidays and days off, from sensors or calendar events."""

from __future__ import annotations

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def calendar_matches(message: str | None, match: str | None) -> bool:
    """Whether a calendar event title matches; ``match`` is a comma separated list, empty = any event."""
    wanted = [m.strip().casefold() for m in (match or "").split(",") if m.strip()]
    if not wanted:
        return True
    return (message or "").strip().casefold() in wanted


def workday_sensor_says_holiday(state: str | None, workdays: list[str] | None, weekday: int) -> bool:
    """A workday sensor that is off on a day it normally works means a holiday.

    The Workday integration lists its normal working days in the ``workdays`` attribute. Without
    that attribute Monday to Friday are assumed. Weekends are not holidays: they have their own schedule.
    """
    if state != "off":
        return False
    days = [d.strip().lower() for d in workdays] if workdays else WEEKDAYS[:5]
    return WEEKDAYS[weekday] in days
