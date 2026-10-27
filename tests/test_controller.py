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
