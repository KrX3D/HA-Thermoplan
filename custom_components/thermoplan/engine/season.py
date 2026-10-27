"""Heating season defined by start and end (month, day), possibly wrapping the new year."""

from __future__ import annotations

from datetime import date

MonthDay = tuple[int, int]


def in_season(today: date, start: MonthDay, end: MonthDay) -> bool:
    """Whether ``today`` lies within [start, end], both inclusive.

    A season such as 1 Oct - 30 Apr wraps over the new year.
    """
    current = (today.month, today.day)
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end
