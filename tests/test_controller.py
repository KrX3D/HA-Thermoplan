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
    assert any(m.startswith("Sent climate.set_temperature") and "thermostat was heat, target 15" in m for m in messages)


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
    assert room_id in controller.data.state.off_by_us

    hass.states.async_set(ROOM, "off", {"temperature": 21})
    controller.data.room_plans[room_id] = {"Home": "s"}
    await controller.async_evaluate()
    assert [c.data["hvac_mode"] for c in hvac] == ["off", "heat"]
    assert room_id not in controller.data.state.off_by_us


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
