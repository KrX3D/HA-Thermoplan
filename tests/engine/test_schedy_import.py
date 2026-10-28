from datetime import datetime
from pathlib import Path

import pytest

pytest.importorskip("yaml")

from custom_components.thermoplan.engine.schedule import resolve  # noqa: E402
from custom_components.thermoplan.schedy_import import (  # noqa: E402
    ImportFailed,
    convert_snippet,
    parse_schedy,
)

SAMPLE = (Path(__file__).parent.parent / "fixtures" / "schedy_sample.yaml").read_text(
    encoding="utf-8"
)
MON = datetime(2026, 10, 26)


def at(day: int, hour: int, minute: int = 0) -> datetime:
    return MON.replace(day=MON.day + day, hour=hour, minute=minute)


def test_profiles_rooms_and_plans():
    result = parse_schedy(SAMPLE)
    assert result.profiles == ["Heizen (Frei / HomeOffice)", "Aus", "Heizen (Arbeiten)"]
    rooms = {r.key: r for r in result.rooms}
    assert rooms["badezimmer"].climate_entity == "climate.better_thermostat_bz"
    assert rooms["badezimmer"].override_minutes == 60
    assert rooms["badezimmer"].plan["Aus"] == "alles_aus_preset2"
    assert rooms["schlafzimmer"].override_minutes == 0


def test_warnings_for_unsupported_parts():
    text = "\n".join(parse_schedy(SAMPLE).warnings)
    assert "expression_environment" in text
    assert "schedule_append" in text
    assert "watched_entities" in text
    assert "unsupported schedule rule" in text


def test_snippet_with_seconds_and_midnight_crossing():
    sched = parse_schedy(SAMPLE).schedules["grundwaerme_preset1"]
    assert resolve(sched, at(0, 7, 30)).target == 19
    assert resolve(sched, at(0, 8, 0)).target == 20
    assert resolve(sched, at(0, 12, 0)).target is None  # gap -> off
    assert resolve(sched, at(0, 23, 0)).target == 18
    assert resolve(sched, at(1, 6, 59)).target == 18
    assert resolve(sched, at(1, 7, 0)).target == 19
    # 19:00 -> 06:59:59 next day is one block crossing midnight
    assert any(b.end > 1440 for b in sched.days[0])


def test_weekday_specs_and_off_snippet():
    sched = parse_schedy(SAMPLE).schedules["grundwaerme_preset3"]
    assert resolve(sched, at(0, 20)).target == 18  # Monday evening
    assert resolve(sched, at(4, 20)).target is None  # Friday not listed
    assert resolve(sched, at(3, 13)).target == 18  # Wednesday block runs until Thursday 15:00
    assert resolve(sched, at(3, 15, 30)).target is None
    assert resolve(sched, at(4, 12, 29)).target == 18  # Thursday block ends Friday 12:30
    assert resolve(sched, at(4, 12, 30)).target is None
    off = parse_schedy(SAMPLE).schedules["alles_aus_preset2"]
    assert resolve(off, at(2, 10)).target is None


def test_first_matching_rule_wins():
    rules = [
        {"v": 20, "rules": [{"weekdays": "1-7", "rules": [{"start": "08:00", "end": "10:00"}]}]},
        {"v": 16, "rules": [{"weekdays": "1-7", "rules": [{"start": "00:00", "end": "23:59:59"}]}]},
    ]
    sched = convert_snippet("s", rules)
    assert resolve(sched, at(0, 9)).target == 20
    assert resolve(sched, at(0, 11)).target == 16
    assert resolve(sched, at(0, 7, 59)).target == 16


def test_invalid_input():
    with pytest.raises(ImportFailed):
        parse_schedy("foo: [1, 2")
    with pytest.raises(ImportFailed):
        parse_schedy("a: 1")
