"""Stored data from older and newer Thermoplan versions loads without errors."""

import json

from custom_components.thermoplan.model import (
    STORE_MINOR_VERSION,
    STORE_VERSION,
    CutoffSettings,
    PresenceRule,
    State,
    StoreData,
    migrate_store,
    store_from_dict,
    store_to_dict,
)

# Written before presence rules had from_state/delay, the cutoff had a threshold and state had holds.
OLDER = {
    "profiles": ["Home", "Away"],
    "schedules": {"s": {"name": "s", "default_target": 18.0, "days": {"0": [[360, 1320, 21.0]]}}},
    "room_plans": {"room1": {"Home": "s"}},
    "settings": {
        "season_start": [10, 1],
        "season_end": [4, 30],
        "away_reset_time": "13:00",
        "cutoff": {"enabled": True, "outdoor_sensor": "sensor.out", "off_after_minutes": 20},
        "person_entity": "person.me",
        "presence_rules": [{"state": "not_home", "profile": "Away"}],
    },
    "state": {"active_profile": "Home", "off_by_us": ["room1"]},
}

# Written by a newer version: unknown keys at every level.
NEWER = {
    **OLDER,
    "future_top": {"x": 1},
    "settings": {
        **OLDER["settings"],
        "future_setting": True,
        "cutoff": {**OLDER["settings"]["cutoff"], "hysteresis": 0.5},
        "presence_rules": [
            {"state": "not_home", "profile": "Away", "from_state": "home", "delay": 5, "priority": 2},
        ],
        "features": {"new_feature": {"enabled": True}, "log": {"days": 3, "level": "debug"}},
    },
    "state": {**OLDER["state"], "holds": [], "future_state": "x"},
}


def test_older_store_loads_with_defaults():
    data = store_from_dict(OLDER)
    assert data.profiles == ["Home", "Away"]
    assert data.settings.cutoff == CutoffSettings(
        enabled=True, outdoor_sensor="sensor.out", off_after_minutes=20
    )
    assert data.settings.presence_rules == [PresenceRule("not_home", "Away")]
    assert data.state == State(active_profile="Home", off_by_us=["room1"])
    assert data.schedules["s"].default_target == 18.0


def test_newer_store_ignores_unknown_keys():
    data = store_from_dict(NEWER)
    assert data.settings.cutoff == CutoffSettings(
        enabled=True, outdoor_sensor="sensor.out", off_after_minutes=20
    )
    assert data.settings.presence_rules == [PresenceRule("not_home", "Away", "home", 5)]
    assert data.state == State(active_profile="Home", off_by_us=["room1"])
    assert data.settings.feature("log")["days"] == 3
    # what is saved again only holds known fields and loads the same
    raw = json.loads(json.dumps(store_to_dict(data)))
    assert "hysteresis" not in raw["settings"]["cutoff"]
    assert "future_state" not in raw["state"]
    assert store_from_dict(raw) == data


def test_broken_presence_rules_are_skipped():
    raw = {"settings": {"presence_rules": [{"state": "home"}, "junk", {"state": "home", "profile": "Home"}]}}
    assert store_from_dict(raw).settings.presence_rules == [PresenceRule("home", "Home")]


def test_null_sections_load_as_defaults():
    raw = {"settings": {"cutoff": None, "presence_rules": None}, "state": None}
    assert store_from_dict(raw) == StoreData()


def test_migrate_store_keeps_data():
    assert (STORE_VERSION, STORE_MINOR_VERSION) == (1, 1)
    migrated = migrate_store(1, 0, OLDER)
    assert migrated == OLDER
    assert migrated is not OLDER
    assert migrate_store(1, 0, None) == {}
