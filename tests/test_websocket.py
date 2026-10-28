"""Websocket API tests (skipped without HA installed)."""

from pathlib import Path

import pytest

pytest.importorskip("homeassistant")

from homeassistant.setup import async_setup_component  # noqa: E402
from pytest_homeassistant_custom_component.common import MockConfigEntry  # noqa: E402

from custom_components.thermoplan.const import DOMAIN  # noqa: E402


async def _client(hass, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return await hass_ws_client(hass)


async def test_profiles_and_schedule_roundtrip(hass, hass_storage, hass_ws_client):
    client = await _client(hass, hass_ws_client)
    await client.send_json_auto_id(
        {"type": "thermoplan/set_profiles", "profiles": ["Home", "Away"]}
    )
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()

    schedule = {"name": "s", "default_target": 16, "days": {"0": [[420, 1500, 20.0]]}}
    await client.send_json_auto_id({"type": "thermoplan/set_schedule", "schedule": schedule})
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id({"type": "thermoplan/get"})
    result = (await client.receive_json())["result"]
    assert result["profiles"] == ["Home", "Away"]
    assert result["schedules"]["s"]["days"]["0"] == [[420, 1500, 20.0]]


async def test_overlapping_schedule_rejected(hass, hass_storage, hass_ws_client):
    client = await _client(hass, hass_ws_client)
    bad = {"name": "bad", "days": {"0": [[0, 600, 20], [500, 700, 18]]}}
    await client.send_json_auto_id({"type": "thermoplan/set_schedule", "schedule": bad})
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "invalid"


async def test_import_schedy_creates_rooms(hass, hass_storage, hass_ws_client):
    client = await _client(hass, hass_ws_client)
    sample = (Path(__file__).parent / "fixtures" / "schedy_sample.yaml").read_text(encoding="utf-8")
    await client.send_json_auto_id({"type": "thermoplan/import_schedy", "yaml": sample})
    response = await client.receive_json()
    assert response["success"], response
    report = response["result"]
    assert sorted(report["rooms_created"]) == ["badezimmer", "schlafzimmer"]
    assert "grundwaerme_preset1" in report["schedules"]
    await hass.async_block_till_done()

    await client.send_json_auto_id({"type": "thermoplan/get"})
    result = (await client.receive_json())["result"]
    assert len(result["rooms"]) == 2
    assert "Aus" in result["profiles"]
    plans = result["room_plans"]
    bath = next(r["id"] for r in result["rooms"] if r["name"] == "Badezimmer")
    assert plans[bath]["Aus"] == "alles_aus_preset2"


async def test_rename_profile_keeps_plans(hass, hass_storage, hass_ws_client):
    client = await _client(hass, hass_ws_client)
    await client.send_json_auto_id({"type": "thermoplan/set_profiles", "profiles": ["Home"]})
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    controller = hass.config_entries.async_loaded_entries(DOMAIN)[0].runtime_data
    controller.data.room_plans["r1"] = {"Home": "s"}
    controller.data.state.active_profile = "Home"

    await client.send_json_auto_id(
        {"type": "thermoplan/set_profiles", "profiles": ["Daily"], "renames": {"Home": "Daily"}}
    )
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    controller = hass.config_entries.async_loaded_entries(DOMAIN)[0].runtime_data
    assert controller.data.room_plans["r1"] == {"Daily": "s"}
    assert controller.data.state.active_profile == "Daily"
