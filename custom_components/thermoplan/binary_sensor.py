"""Heating season."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity

from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities(
        [HeatingSeasonSensor(entry.runtime_data), AwaySensor(entry.runtime_data), FreeDaySensor(entry.runtime_data)]
    )


class HeatingSeasonSensor(ThermoplanEntity, BinarySensorEntity):
    """On while today lies within the heating season."""

    _attr_translation_key = "heating_season"

    def __init__(self, controller) -> None:
        super().__init__(controller, "heating_season")

    @property
    def is_on(self) -> bool:
        return self._controller.season_active


class AwaySensor(ThermoplanEntity, BinarySensorEntity):
    """On while the away period runs (use it to trigger your own automations)."""

    _attr_translation_key = "away"

    def __init__(self, controller) -> None:
        super().__init__(controller, "away")

    @property
    def is_on(self) -> bool:
        return self._controller.away_active

    @property
    def extra_state_attributes(self) -> dict:
        return self._controller.away_info


class FreeDaySensor(ThermoplanEntity, BinarySensorEntity):
    """On on a holiday or day off that is detected from sensors or a calendar."""

    _attr_translation_key = "free_day"

    def __init__(self, controller) -> None:
        super().__init__(controller, "free_day")

    @property
    def is_on(self) -> bool:
        return self._controller.free_day

    @property
    def extra_state_attributes(self) -> dict:
        return {"reason": self._controller.free_reason or None}
