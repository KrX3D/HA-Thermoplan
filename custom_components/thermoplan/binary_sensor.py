"""Heating season."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity

from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([HeatingSeasonSensor(entry.runtime_data)])


class HeatingSeasonSensor(ThermoplanEntity, BinarySensorEntity):
    """On while today lies within the heating season."""

    _attr_translation_key = "heating_season"

    def __init__(self, controller) -> None:
        super().__init__(controller, "heating_season")

    @property
    def is_on(self) -> bool:
        return self._controller.season_active
