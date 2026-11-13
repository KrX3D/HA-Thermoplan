import json

import pytest

from custom_components.thermoplan.backup import BackupInvalid, build_export, plan_restore
from custom_components.thermoplan.engine.schedule import Block, Schedule
from custom_components.thermoplan.model import PresenceRule, Settings, State, StoreData

ROOMS = [
    {"id": "r1", "name": "Bad", "data": {"climate_entity": "climate.bad"}},
    {"id": "r2", "name": "Kueche", "data": {"climate_entity": "climate.kueche", "off_mode": "fixed"}},
]


def _data() -> StoreData:
    return StoreData(
        profiles=["Home", "Off"],
        schedules={"day": Schedule("day", {0: (Block(420, 1320, 21.0),)}, 17.0)},
        room_plans={"r1": {"Home": "day"}, "r2": {"Home": "day"}},
        settings=Settings(away_profile="Off", presence_rules=[PresenceRule("not_home", "Off")]),
        state=State(active_profile="Home"),
        learning={"r1": {"samples": [1]}},
        stats={"r1": {"2026-11-01": 30.0}},
    )


def _export() -> dict:
    # through JSON like a downloaded file
    return json.loads(json.dumps(build_export(_data(), ROOMS, "2026-11-13T10:00:00+01:00")))


def test_export_contains_config_but_not_learning():
    out = _export()
    assert out["format"] == "thermoplan" and out["version"] == 1
    assert out["profiles"] == ["Home", "Off"]
    assert out["active_profile"] == "Home"
    assert out["schedules"]["day"]["days"]["0"] == [[420, 1320, 21.0]]
    assert out["settings"]["presence_rules"][0]["profile"] == "Off"
    assert out["rooms"][1] == {"id": "r2", "name": "Kueche", "data": ROOMS[1]["data"], "plan": {"Home": "day"}}
    assert "learning" not in out and "stats" not in out and "state" not in out


def test_restore_same_instance_matches_by_id():
    plan = plan_restore(_export(), ROOMS, {})
    assert [r.target_id for r in plan.rooms] == ["r1", "r2"]
    assert plan.schedules["day"].days[0][0] == Block(420, 1320, 21.0)
    assert plan.settings.away_profile == "Off"
    assert plan.active_profile == "Home"
    assert not plan.remove and not plan.keep and not plan.warnings


def test_restore_other_instance_matches_by_thermostat_or_creates():
    existing = [{"id": "x9", "name": "Badezimmer", "data": {"climate_entity": "climate.bad"}}]
    plan = plan_restore(_export(), existing, {})
    assert [r.target_id for r in plan.rooms] == ["x9", None]
    report = plan.report({"x9": "Badezimmer"}, dry_run=True)
    assert report["rooms_updated"] == ["Bad"] and report["rooms_created"] == ["Kueche"]


def test_rooms_not_in_file_are_kept_or_removed():
    existing = [*ROOMS, {"id": "r3", "name": "WC", "data": {"climate_entity": "climate.wc"}}]
    plans = {"r3": {"Home": "day", "Gone": "day", "Off": "missing"}}
    kept = plan_restore(_export(), existing, plans)
    assert kept.keep == {"r3": {"Home": "day"}} and kept.remove == []
    removed = plan_restore(_export(), existing, plans, remove_missing=True)
    assert removed.remove == ["r3"] and removed.keep == {}


def test_unknown_references_become_warnings():
    out = _export()
    out["profiles"] = ["Home"]
    plan = plan_restore(out, ROOMS, {})
    assert plan.settings.away_profile is None
    assert plan.settings.presence_rules == []
    assert len(plan.warnings) == 2


def test_plan_entry_with_unknown_schedule_is_skipped():
    out = _export()
    out["rooms"][0]["plan"]["Off"] = "nope"
    plan = plan_restore(out, ROOMS, {})
    assert plan.rooms[0].plan == {"Home": "day"}
    assert "nope" in plan.warnings[0]


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda o: o.update(format="other"), "not a Thermoplan export"),
        (lambda o: o.update(version=99), "Unsupported export version"),
        (lambda o: o.update(profiles=["A", "A"]), "unique"),
        (lambda o: o["schedules"]["day"]["days"].update({"0": [[0, 600, 20], [500, 700, 18]]}), "Schedule 'day'"),
        (lambda o: o["rooms"].append({"name": "x"}), "malformed"),
    ],
)
def test_invalid_files_are_rejected(change, message):
    out = _export()
    change(out)
    with pytest.raises(BackupInvalid, match=message):
        plan_restore(out, ROOMS, {})


def test_room_validation_error_names_the_room():
    def strict(data):
        raise ValueError("bad entity")

    with pytest.raises(BackupInvalid, match="Room 'Bad': bad entity"):
        plan_restore(_export(), ROOMS, {}, validate_room=strict)
