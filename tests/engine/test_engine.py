from datetime import datetime, time, timedelta

from custom_components.thermoplan.engine import away, override
from custom_components.thermoplan.engine.cutoff import OutdoorCutoff
from custom_components.thermoplan.engine.schedule import (
    Block,
    Schedule,
    resolve,
    validate,
)

MON = datetime(2026, 10, 26)  # a Monday


def at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    return MON.replace(hour=hour, minute=minute) + timedelta(days=day_offset)


def test_resolve_block_and_default():
    sched = Schedule("s", {0: (Block(420, 720, 20.0),)}, default_target=16.0)
    assert resolve(sched, at(0, 8)).target == 20.0
    assert resolve(sched, at(0, 8)).from_block
    assert resolve(sched, at(0, 12)).target == 16.0  # end is exclusive
    assert not resolve(sched, at(0, 12)).from_block
    assert resolve(sched, at(1, 8)).target == 16.0


def test_block_crossing_midnight():
    sched = Schedule("s", {0: (Block(1320, 1440 + 420, 18.0),)}, default_target=None)
    assert resolve(sched, at(0, 23)).target == 18.0
    assert resolve(sched, at(1, 6, 59)).target == 18.0
    assert resolve(sched, at(1, 7)).target is None


def test_sunday_spills_into_monday():
    sched = Schedule("s", {6: (Block(1380, 1440 + 120, 19.0),)}, default_target=10.0)
    assert resolve(sched, at(7, 1)).target == 19.0  # next Monday 01:00
    assert resolve(sched, at(7, 2)).target == 10.0


def test_off_block():
    sched = Schedule("s", {0: (Block(0, 1440, None),)}, default_target=20.0)
    assert resolve(sched, at(0, 12)).target is None
    assert resolve(sched, at(0, 12)).from_block


def test_validate_overlap_and_ranges():
    ok = Schedule("s", {0: (Block(0, 600, 20), Block(600, 1500, 18))})
    assert validate(ok) == []
    overlap = Schedule("s", {0: (Block(0, 600, 20), Block(500, 700, 18))})
    assert validate(overlap)
    spill = Schedule("s", {0: (Block(1300, 1500, 20),), 1: (Block(0, 100, 18),)})
    assert validate(spill)
    assert validate(Schedule("s", {0: (Block(600, 600, 20),)}))
    assert validate(Schedule("s", {0: (Block(0, 3000, 20),)}))
    wrap = Schedule("s", {6: (Block(1300, 1500, 20),), 0: (Block(0, 100, 18),)})
    assert validate(wrap)


def test_away_resume_time():
    now = datetime(2026, 10, 1, 10)
    resume = away.resume_at(now, 3, time(13))
    assert resume == datetime(2026, 10, 4, 13)
    assert away.is_away(datetime(2026, 10, 4, 12, 59), resume)
    assert not away.is_away(datetime(2026, 10, 4, 13), resume)
    assert away.remaining_days(now, resume) == 3
    assert away.remaining_days(datetime(2026, 10, 4, 9), resume) == 1
    assert away.remaining_days(datetime(2026, 10, 4, 13), resume) == 0
    assert away.resume_at(now, 0, time(13)) is None
    assert not away.is_away(now, None)


def test_cutoff_hysteresis():
    cut = OutdoorCutoff(off_after=timedelta(minutes=30), on_after=timedelta(minutes=10))
    assert cut.update(at(0, 12, 0), 20.0, 19.0)  # warm, timer starts
    assert cut.update(at(0, 12, 29), 20.0, 19.0)
    assert not cut.update(at(0, 12, 30), 20.0, 19.0)  # off after 30 min
    assert not cut.update(at(0, 12, 40), 18.0, 19.0)  # cold, timer starts
    assert cut.update(at(0, 12, 50), 18.0, 19.0)  # on again after 10 min


def test_cutoff_timer_resets_and_follows_target():
    cut = OutdoorCutoff(off_after=timedelta(minutes=30), on_after=timedelta(minutes=10))
    cut.update(at(0, 12, 0), 20.0, 19.0)
    cut.update(at(0, 12, 20), 18.0, 19.0)  # cooled down, timer resets
    assert cut.update(at(0, 12, 40), 20.0, 19.0)
    # Night target 18 makes 18.5 outdoor warm enough to cut off.
    night = OutdoorCutoff(off_after=timedelta(minutes=120), on_after=timedelta(minutes=10))
    night.update(at(0, 22, 0), 18.5, 18.0)
    assert not night.update(at(1, 0, 0), 18.5, 18.0)


def test_cutoff_ignores_missing_data():
    cut = OutdoorCutoff(off_after=timedelta(0), on_after=timedelta(0), offset=1.0)
    assert cut.update(at(0, 1), None, 19.0)
    assert cut.update(at(0, 1), 25.0, None)
    assert cut.update(at(0, 1), 19.5, 19.0)  # below target + offset
    assert not cut.update(at(0, 2), 20.0, 19.0)


def test_override():
    start = at(0, 10)
    ov = override.Override(start, 60)
    assert ov.active(at(0, 10, 59))
    assert not ov.active(at(0, 11))
    assert not override.Override(start, 0).active(start)
    assert override.is_manual_change(20.0, 21.0)
    assert not override.is_manual_change(20.0, 20.4)
    assert not override.is_manual_change(None, 20.0)
