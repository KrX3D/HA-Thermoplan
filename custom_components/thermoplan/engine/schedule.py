"""Weekly schedule model and resolution.

Weekdays follow Python (0 = Monday ... 6 = Sunday). Times are minutes since
midnight. A block may end after 1440 (up to 2880) to continue into the next day.
A target of None means "off" (the room decides what off means).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

MINUTES_PER_DAY = 1440
MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY


@dataclass(frozen=True)
class Block:
    """A time block with a target temperature, on the day it starts."""

    start: int
    end: int
    target: float | None


@dataclass(frozen=True)
class Schedule:
    """Named weekly plan: non-overlapping blocks per weekday plus a gap default."""

    name: str
    days: dict[int, tuple[Block, ...]] = field(default_factory=dict)
    default_target: float | None = None


@dataclass(frozen=True)
class Resolved:
    """Result of resolving a schedule at a point in time."""

    target: float | None
    from_block: bool


def validate(schedule: Schedule) -> list[str]:
    """Return human-readable problems; an empty list means the schedule is valid."""
    errors: list[str] = []
    intervals: list[tuple[int, int, str]] = []

    for day, blocks in schedule.days.items():
        if not 0 <= day <= 6:
            errors.append(f"invalid weekday {day}")
            continue
        for block in blocks:
            label = f"day {day} {block.start}-{block.end}"
            if not 0 <= block.start < MINUTES_PER_DAY:
                errors.append(f"{label}: start must be within the day")
            elif not block.start < block.end <= 2 * MINUTES_PER_DAY:
                errors.append(f"{label}: end must be after start and at most 48:00")
            elif block.end - block.start > MINUTES_PER_DAY:
                errors.append(f"{label}: longer than 24 hours")
            else:
                begin = day * MINUTES_PER_DAY + block.start
                end = day * MINUTES_PER_DAY + block.end
                if end > MINUTES_PER_WEEK:  # Sunday spilling into Monday
                    intervals.append((begin, MINUTES_PER_WEEK, label))
                    intervals.append((0, end - MINUTES_PER_WEEK, label))
                else:
                    intervals.append((begin, end, label))

    intervals.sort()
    for (_, prev_end, prev_label), (start, _, label) in zip(
        intervals, intervals[1:], strict=False
    ):
        if start < prev_end and prev_label != label:
            errors.append(f"{prev_label} overlaps {label}")
    return errors


def resolve(schedule: Schedule, when: datetime) -> Resolved:
    """Return the target for ``when`` (naive local time)."""
    minute = when.hour * 60 + when.minute
    today = when.weekday()

    for block in schedule.days.get(today, ()):
        if block.start <= minute < min(block.end, MINUTES_PER_DAY):
            return Resolved(block.target, True)

    # A block from yesterday that runs past midnight.
    for block in schedule.days.get((today - 1) % 7, ()):
        if block.end > MINUTES_PER_DAY and minute < block.end - MINUTES_PER_DAY:
            return Resolved(block.target, True)

    return Resolved(schedule.default_target, False)
