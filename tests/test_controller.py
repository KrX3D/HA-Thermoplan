"""Controller tests against a simulated Home Assistant (skipped without HA installed)."""

import pytest

pytest.importorskip("homeassistant")

from homeassistant.config_entries import ConfigSubentryData  # noqa: E402
from pytest_homeassistant_custom_component.common import (  # noqa: E402
    MockConfigEntry,
    async_mock_service,
)

from custom_components.thermoplan.const import DOMAIN  # noqa: E402
from custom_components.thermoplan.engine.schedule import Schedule  # noqa: E402
from custom_components.thermoplan.model import StoreData, store_to_dict  # noqa: E402

ROOM = "climate.test_room"


def _store(**kwargs) -> dict:
    data = StoreData(
        profiles=["Home"],
        schedules={"s": Schedule("s", {}, default_target=21.0)},
        room_plans={},
    )
    data.settings.season_start = (1, 1)
    data.settings.season_end = (12, 31)
    for key, value in kwargs.items():
        setattr(data.settings, key, value)
    return {"version": 1, "minor_version": 1, "key": DOMAIN, "data": store_to_dict(data)}


async def _setup(hass, hass_storage, room_data=None) -> MockConfigEntry:
    hass_storage[DOMAIN] = _store()
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={},
        subentries_data=[
            ConfigSubentryData(
                data={"climate_entity": ROOM, **(room_data or {})},
                subentry_type="room",
                title="Test room",
                unique_id=None,
            )
        ],
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_applies_default_target(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    # Assign the schedule now that the room id is known, then re-evaluate.
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    await hass.async_block_till_done()
    assert [c.data["temperature"] for c in calls] == [21.0]


async def test_no_schedule_turns_room_off(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    calls = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, hass_storage)
    assert [c.data["hvac_mode"] for c in calls] == ["off"]


async def test_away_until_date_updates_entities(hass, hass_storage):
    from datetime import timedelta

    from homeassistant.helpers import entity_registry as er
    from homeassistant.util import dt as dt_util

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_hvac_mode")
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    registry = er.async_get(hass)
    until_id = registry.async_get_entity_id("date", DOMAIN, f"{entry.entry_id}_away_until")
    days_id = registry.async_get_entity_id("number", DOMAIN, f"{entry.entry_id}_away_days")
    away_id = registry.async_get_entity_id("binary_sensor", DOMAIN, f"{entry.entry_id}_away")
    assert until_id and days_id and away_id

    target = (dt_util.now() + timedelta(days=3)).date()
    await hass.services.async_call(
        "date", "set_value", {"entity_id": until_id, "date": target.isoformat()}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get(until_id).state == target.isoformat()
    assert hass.states.get(days_id).state in ("3.0", "3")
    assert hass.states.get(away_id).state == "on"

    await hass.services.async_call(
        "number", "set_value", {"entity_id": days_id, "value": 0}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get(until_id).state == "unknown"
    assert hass.states.get(away_id).state == "off"


async def test_override_ignores_own_command_and_clears_on_profile_change(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    await hass.async_block_till_done()
    rt = controller.runtime[room_id]

    # The thermostat reports an intermediate value right after our command: not manual.
    hass.states.async_set(ROOM, "heat", {"temperature": 17})
    await hass.async_block_till_done()
    assert rt.override is None

    # Once the grace period is over, a different target is a manual change.
    rt.last_command = local_now() - timedelta(minutes=5)
    hass.states.async_set(ROOM, "heat", {"temperature": 25})
    await hass.async_block_till_done()
    assert rt.override is not None

    # Switching profile clears it.
    await controller.async_set_profile("Home")
    assert rt.override is None


async def test_decisions_are_logged(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    messages = [e["message"] for e in controller.events if e["room"] == "Test room"]
    assert any(m.startswith("Target 21 °C") for m in messages)
    assert any("profile 'Home', schedule 's'" in m for m in messages)
    details = [e.get("detail", "") for e in controller.events if e["room"] == "Test room"]
    assert any("Sent climate.set_temperature" in d and "thermostat was heat, target 15" in d for d in details)


async def test_half_degree_change_is_a_manual_change(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    rt = controller.runtime[room_id]
    assert rt.last_sent == 21.0

    rt.last_command = local_now() - timedelta(minutes=5)
    hass.states.async_set(ROOM, "heat", {"temperature": 20.5})  # one thermostat step down
    await hass.async_block_till_done()
    assert rt.override is not None
    assert any("Manual change detected" in e["message"] for e in controller.events)


async def test_thermostat_switched_off_by_someone_else_is_left_alone(hass, hass_storage):
    """Better Thermostat's window handling turns the thermostat off: Thermoplan must not fight it."""
    hass.states.async_set(ROOM, "heat", {"temperature": 21})
    hvac = async_mock_service(hass, "climate", "set_hvac_mode")
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()  # heating as planned
    heat_calls = lambda: [c for c in hvac if c.data["hvac_mode"] == "heat"]  # noqa: E731

    hass.states.async_set(ROOM, "off", {"temperature": 21})  # window opened, switched off by BT
    await controller.async_evaluate()
    await controller.async_evaluate()
    assert not heat_calls()
    assert any("not switched off by Thermoplan" in e["message"] for e in controller.events)

    # An explicit reset takes control back.
    await controller.async_clear_overrides()
    assert len(heat_calls()) == 1


async def test_thermostat_we_switched_off_is_switched_on_again(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 21})
    hvac = async_mock_service(hass, "climate", "set_hvac_mode")
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)  # no plan yet: the room is off
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    assert [c.data["hvac_mode"] for c in hvac] == ["off"]
    assert ROOM in controller.data.state.off_by_us

    hass.states.async_set(ROOM, "off", {"temperature": 21})
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    assert [c.data["hvac_mode"] for c in hvac] == ["off", "heat"]
    assert ROOM not in controller.data.state.off_by_us


async def test_presence_rule_ignores_attribute_updates_and_keeps_overrides(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now
    from custom_components.thermoplan.model import PresenceRule

    hass.states.async_set("person.alex", "home", {"latitude": 1.0})
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    controller.data.profiles.append("Away")
    controller.data.settings.person_entity = "person.alex"
    controller.data.settings.presence_rules = [PresenceRule("home", "Home")]
    await controller.async_set_settings(controller.data.settings)  # saves and reloads
    await hass.async_block_till_done()
    controller = hass.config_entries.async_loaded_entries(DOMAIN)[0].runtime_data
    rt = controller.runtime[room_id]
    rt.last_command = local_now() - timedelta(minutes=5)
    hass.states.async_set(ROOM, "heat", {"temperature": 25})  # manual change
    await hass.async_block_till_done()
    assert rt.override is not None

    hass.states.async_set("person.alex", "home", {"latitude": 2.0})  # GPS update, same state
    await hass.async_block_till_done()
    assert rt.override is not None
    assert not any("presence rule" in e["message"] for e in controller.events)


async def _target_after_setup(hass, hass_storage, room_data, states=None):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    for entity, state in (states or {}).items():
        hass.states.async_set(entity, state)
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage, room_data)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    await hass.async_block_till_done()
    return controller, calls


async def test_room_adjustment_and_limits(hass, hass_storage):
    _, calls = await _target_after_setup(
        hass, hass_storage, {"adjust_enabled": True, "adjust": 1.0, "limits_enabled": True, "max_temp": 21.5}
    )
    assert calls[-1].data["temperature"] == 21.5  # 21 + 1 = 22, limited to 21.5


async def test_room_adjustment_ignored_when_feature_is_switched_off(hass, hass_storage):
    _, calls = await _target_after_setup(
        hass, hass_storage, {"adjust_enabled": False, "adjust": 3.0, "limits_enabled": False, "max_temp": 18}
    )
    assert calls[-1].data["temperature"] == 21.0


async def test_empty_room_lowers_the_target(hass, hass_storage):
    room = {
        "occupancy_enabled": True, "occupancy_entity": "binary_sensor.motion",
        "occ_present_type": "none", "occ_absent_type": "offset", "occ_absent_value": -2.0,
    }
    controller, calls = await _target_after_setup(hass, hass_storage, room, {"binary_sensor.motion": "off"})
    assert calls[-1].data["temperature"] == 19.0
    assert any("room empty" in e["message"] for e in controller.events)


async def test_window_lower_mode(hass, hass_storage):
    room = {"window_sensors": ["binary_sensor.window"], "window_mode": "lower", "window_target": 17.0}
    _, calls = await _target_after_setup(hass, hass_storage, room, {"binary_sensor.window": "on"})
    assert calls[-1].data["temperature"] == 17.0


async def test_window_feature_switched_off_is_ignored(hass, hass_storage):
    room = {"window_sensors": ["binary_sensor.window"], "window_mode": "lower", "window_enabled": False}
    _, calls = await _target_after_setup(hass, hass_storage, room, {"binary_sensor.window": "on"})
    assert calls[-1].data["temperature"] == 21.0


async def test_window_observe_only_logs(hass, hass_storage):
    room = {"window_sensors": ["binary_sensor.window"], "window_mode": "observe"}
    controller, calls = await _target_after_setup(hass, hass_storage, room, {"binary_sensor.window": "on"})
    assert calls[-1].data["temperature"] == 21.0  # the window does not change the thermostat
    assert any(e["message"].startswith("Window opened") for e in controller.events)


async def test_free_day_uses_the_chosen_weekday(hass, hass_storage):
    from custom_components.thermoplan.controller import local_now
    from custom_components.thermoplan.engine.schedule import Block

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    hass.states.async_set("binary_sensor.holiday", "on")
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    today = local_now().weekday()
    other = (today + 3) % 7
    controller.data.schedules["s"] = Schedule("s", {today: (Block(0, 1440, 19.0),), other: (Block(0, 1440, 23.0),)}, None)
    controller.data.room_plans[room_id] = {"Home": "s"}
    controller.data.settings.features = {
        "holiday": {"enabled": True, "entity": "binary_sensor.holiday"},
        "free_day": {"weekday": other},
    }
    await controller.async_evaluate()
    assert controller.free_day and calls[-1].data["temperature"] == 23.0

    controller.data.settings.features["holiday"]["enabled"] = False  # switched off, entity stays
    await controller.async_evaluate()
    assert not controller.free_day and calls[-1].data["temperature"] == 19.0


async def test_calendar_away_and_event_text(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    hass.states.async_set("calendar.vacation", "on", {"message": "Urlaub", "end_time": "2999-01-01 00:00:00"})
    async_mock_service(hass, "climate", "set_hvac_mode")
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    controller.data.settings.features = {"calendar_away": {"enabled": True, "entity": "calendar.vacation", "match": "Urlaub"}}
    await controller.async_evaluate()
    assert controller.calendar_away and controller.away_active
    assert controller.runtime[room_id].decision.reason == "away"

    hass.states.async_set("calendar.vacation", "on", {"message": "Frei", "end_time": "2999-01-01 00:00:00"})
    await controller.async_evaluate()
    assert not controller.calendar_away  # another event text does not count as away


async def test_hold_and_boost_and_cancel(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    assert calls[-1].data["temperature"] == 21.0

    await hass.services.async_call(DOMAIN, "boost", {"rooms": ["Test room"], "offset": 2, "minutes": 30}, blocking=True)
    assert calls[-1].data["temperature"] == 23.0
    assert controller.runtime[room_id].decision.reason == "hold"

    await hass.services.async_call(DOMAIN, "hold", {"temperature": 18.5, "minutes": 10}, blocking=True)
    assert calls[-1].data["temperature"] == 18.5  # the newer hold covers every room

    await hass.services.async_call(DOMAIN, "cancel_hold", {}, blocking=True)
    assert calls[-1].data["temperature"] == 21.0
    assert not controller.holds
    assert any("Hold cancelled for all rooms" in e["message"] for e in controller.events)


async def test_hold_expires_and_survives_restart(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import Hold, local_now

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    controller.holds = [Hold(None, "fixed", 25.0, local_now() - timedelta(hours=2), local_now() - timedelta(hours=1))]
    await controller.async_evaluate()
    assert not controller.holds  # expired holds are dropped

    await controller.async_hold(None, "fixed", 24.0, 30)
    assert controller.data.state.holds and controller.data.state.holds[0]["value"] == 24.0


async def test_hold_service_rejects_unknown_room(hass, hass_storage):
    import pytest
    from homeassistant.exceptions import ServiceValidationError

    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    await _setup(hass, hass_storage)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "hold", {"rooms": ["Nowhere"], "temperature": 20}, blocking=True)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "hold", {"temperature": 20, "offset": 1}, blocking=True)


async def _learning_setup(hass, hass_storage, current, blocks_for_minute):
    import pytest

    from custom_components.thermoplan.controller import local_now
    from custom_components.thermoplan.engine.learning import Model
    from custom_components.thermoplan.engine.schedule import Block, Schedule

    minute = local_now().hour * 60 + local_now().minute
    if minute > 1380:
        pytest.skip("too close to midnight for this timing test")
    hass.states.async_set(ROOM, "heat", {"temperature": 15, "current_temperature": current})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    today = local_now().weekday()
    controller.data.schedules["s"] = Schedule("s", {today: tuple(Block(*b) for b in blocks_for_minute(minute))}, None)
    controller.data.room_plans[room_id] = {"Home": "s"}
    controller.models[room_id] = Model(k=0.002, power=0.06, n_heat=5, n_idle=5)
    controller.data.settings.features = {"learning": {"enabled": True}}
    await controller.async_evaluate()
    return controller, room_id, calls


async def test_preheating_starts_early(hass, hass_storage):
    controller, room_id, calls = await _learning_setup(
        hass, hass_storage, 17.0, lambda m: [(0, m + 30, 18.0), (m + 30, 1440, 21.0)]
    )
    assert calls[-1].data["temperature"] == 21.0  # the 21 °C block is 30 min away, heating up takes longer
    assert controller.runtime[room_id].learning == "preheat"
    assert any(e.get("kind") == "learning" and "Preheating started" in e["message"] for e in controller.events)


async def test_coasting_stops_heating_early(hass, hass_storage):
    controller, room_id, calls = await _learning_setup(
        hass, hass_storage, 22.0, lambda m: [(0, m + 30, 21.0), (m + 30, 1440, 18.0)]
    )
    assert calls[-1].data["temperature"] == 18.0  # the room stays warm enough until the cooler block
    assert controller.runtime[room_id].learning == "coast"


async def test_learning_switched_off_does_nothing(hass, hass_storage):
    controller, room_id, calls = await _learning_setup(
        hass, hass_storage, 17.0, lambda m: [(0, m + 30, 18.0), (m + 30, 1440, 21.0)]
    )
    controller.data.settings.features["learning"]["enabled"] = False
    controller.runtime[room_id].learn_state = None
    await controller.async_evaluate()
    assert controller.runtime[room_id].learning is None
    assert calls[-1].data["temperature"] == 18.0


async def test_warning_when_the_target_is_not_reached_and_it_clears(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now

    hass.states.async_set(ROOM, "heat", {"temperature": 21, "current_temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    assert not controller.warnings  # only just started

    controller.runtime[room_id].unreach_since = local_now() - timedelta(hours=4)
    await controller.async_evaluate()
    assert f"{room_id}:unreachable" in controller.warnings
    assert any(e.get("kind") == "warning" for e in controller.events)

    hass.states.async_set(ROOM, "heat", {"temperature": 21, "current_temperature": 20.8})
    await controller.async_evaluate()
    assert not controller.warnings
    assert any(e["message"].startswith("Resolved") for e in controller.events)


async def test_warnings_can_be_switched_off(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now

    hass.states.async_set(ROOM, "unavailable")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.runtime[room_id].unavail_since = local_now() - timedelta(hours=2)
    await controller.async_evaluate()
    assert f"{room_id}:unavailable" in controller.warnings
    controller.data.settings.features["warnings"] = {"enabled": False}
    await controller.async_evaluate()
    assert not controller.warnings


async def test_all_thermostats_of_a_room_get_the_target(hass, hass_storage):
    hass.states.async_set("climate.second", "heat", {"temperature": 15})
    controller, calls = await _target_after_setup(hass, hass_storage, {"extra_climates": ["climate.second"]})
    assert {c.data["entity_id"] for c in calls} == {ROOM, "climate.second"}
    assert all(c.data["temperature"] == 21.0 for c in calls)


async def test_external_sensor_gives_the_room_temperature(hass, hass_storage):
    room = {"temp_sensor_enabled": True, "temp_sensor": "sensor.room"}
    controller, _ = await _target_after_setup(hass, hass_storage, room, {"sensor.room": "19.4"})
    assert controller.room_temperature(next(iter(controller.rooms.values()))) == 19.4
    room_cfg = next(iter(controller.rooms.values()))
    room_cfg.temp_sensor_enabled = False
    hass.states.async_set(ROOM, "heat", {"temperature": 15, "current_temperature": 18.0})
    assert controller.room_temperature(room_cfg) == 18.0  # switched off: back to the thermostat's own reading


async def test_empty_room_delay(hass, hass_storage):
    from datetime import timedelta

    room = {
        "occupancy_enabled": True, "occupancy_entity": "binary_sensor.motion",
        "occ_absent_type": "offset", "occ_absent_value": -2.0, "occ_absent_delay": 10,
    }
    controller, calls = await _target_after_setup(hass, hass_storage, room, {"binary_sensor.motion": "on"})
    room_id = next(iter(controller.rooms))
    hass.states.async_set("binary_sensor.motion", "off")
    await hass.async_block_till_done()
    assert calls[-1].data["temperature"] == 21.0  # empty, but not for 10 minutes yet
    controller.runtime[room_id].occ_raw_since -= timedelta(minutes=11)
    await controller.async_evaluate()
    await hass.async_block_till_done()
    assert calls[-1].data["temperature"] == 19.0


async def test_coasting_skipped_for_a_short_dip(hass, hass_storage):
    controller, room_id, calls = await _learning_setup(
        hass, hass_storage, 22.0, lambda m: [(0, m + 30, 21.0), (m + 30, m + 50, 18.0), (m + 50, 1440, 21.0)]
    )
    assert controller.runtime[room_id].learning is None  # the room would be heated again 20 minutes later


async def test_presence_rule_from_state_with_delay(hass, hass_storage):
    from custom_components.thermoplan.model import PresenceRule

    hass.states.async_set("person.alex", "work")
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    controller.data.profiles.append("Away")
    controller.data.profiles.append("Warm")
    controller.data.settings.person_entity = "person.alex"
    controller.data.settings.presence_rules = [
        PresenceRule("not_home", "Away"),
        PresenceRule("not_home", "Warm", from_state="work", delay=90),
    ]
    await controller.async_set_settings(controller.data.settings)
    await hass.async_block_till_done()
    controller = hass.config_entries.async_loaded_entries(DOMAIN)[0].runtime_data
    hass.states.async_set("person.alex", "not_home")
    await hass.async_block_till_done()
    assert any("'Warm' in 90 min" in e["message"] for e in controller.events)
    assert controller.data.state.active_profile != "Away"


async def test_heating_time_is_recorded_and_merged(hass, hass_storage):
    from datetime import timedelta

    from custom_components.thermoplan.controller import local_now

    hass.states.async_set(ROOM, "heat", {"temperature": 21, "hvac_action": "heating"})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    now = local_now()
    await controller._record_stats(now)
    await controller._record_stats(now + timedelta(minutes=3))
    today = now.date().isoformat()
    assert controller.data.stats[room_id][today] == 3.0

    await controller.async_merge_stats(room_id, {today: 500.0, "2020-01-01": 42.0})
    assert controller.data.stats[room_id][today] == 3.0  # today stays with the live recording
    assert controller.data.stats[room_id]["2020-01-01"] == 42.0
    assert controller.data.stats_seeded


async def test_thermostat_coming_back_is_applied_at_once(hass, hass_storage):
    hass.states.async_set(ROOM, "unavailable")
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage)
    controller = entry.runtime_data
    room_id = next(iter(controller.rooms))
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    assert not calls
    hass.states.async_set(ROOM, "heat", {"temperature": 15})
    await hass.async_block_till_done()
    assert calls[-1].data["temperature"] == 21.0


async def test_real_thermostat_valve_counts_as_heating(hass, hass_storage):
    hass.states.async_set(ROOM, "heat", {"temperature": 21, "current_temperature": 20})
    hass.states.async_set("climate.real", "auto", {"temperature": 21, "current_temperature": 20, "level": 0.5, "valve": 40})
    async_mock_service(hass, "climate", "set_temperature")
    entry = await _setup(hass, hass_storage, {"real_enabled": True, "real_entity": "climate.real"})
    controller = entry.runtime_data
    room = next(iter(controller.rooms.values()))
    assert controller._is_heating(room)
    hass.states.async_set("climate.real", "auto", {"temperature": 21, "current_temperature": 20, "level": 0.0, "valve": 0})
    assert not controller._is_heating(room)
    assert controller._heating_signal(room) == "idle"
