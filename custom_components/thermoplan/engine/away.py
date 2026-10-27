"""Away counter: skip heating for N days, resume at a configurable time."""

from __future__ import annotations

from datetime import datetime, time, timedelta


def resume_at(now: datetime, days: int, reset_time: time) -> datetime | None:
    """Return when heating resumes, or None if it resumes immediately.

    Set on the 1st with 3 days and a reset time of 13:00 -> resumes on the 4th at 13:00.
    """
    if days <= 0:
        return None
    return datetime.combine(now.date() + timedelta(days=days), reset_time)


def is_away(now: datetime, resume: datetime | None) -> bool:
    """Whether the away period is still running."""
    return resume is not None and now < resume


def remaining_days(now: datetime, resume: datetime | None) -> int:
    """Days left for display; 1 on the resume day until the reset time passes."""
    if not is_away(now, resume):
        return 0
    assert resume is not None
    return max(1, (resume.date() - now.date()).days)
