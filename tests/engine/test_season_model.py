import json
from datetime import date

from custom_components.thermoplan.engine.schedule import Block, Schedule
from custom_components.thermoplan.engine.season import in_season
from custom_components.thermoplan.model import (
    PresenceRule,
    StoreData,
    store_from_dict,
    store_to_dict,
)


def test_season_wrapping_year():
    start, end = (10, 1), (4, 30)
    assert in_season(date(2026, 10, 1), start, end)
    assert in_season(date(2027, 1, 15), start, end)
    assert in_season(date(2027, 4, 30), start, end)
    assert not in_season(date(2027, 5, 1), start, end)
    assert not in_season(date(2026, 9, 30), start, end)


def test_season_within_year():
    assert in_season(date(2026, 6, 1), (5, 1), (9, 30))
    assert not in_season(date(2026, 10, 1), (5, 1), (9, 30))


def test_store_roundtrip():
    data = StoreData(
        profiles=["Home", "Away"],
        schedules={"s": Schedule("s", {0: (Block(0, 1500, 19.5), Block(1500, 1600, None))}, 16.0)},
        room_plans={"room1": {"Home": "s"}},
    )
    data.settings.presence_rules.append(PresenceRule("work", "Away"))
    data.settings.cutoff.enabled = True
    data.state.active_profile = "Home"
    raw = json.loads(json.dumps(store_to_dict(data)))
    assert store_from_dict(raw) == data


def test_store_defaults():
    assert store_from_dict({}) == StoreData()
