"""Away counter."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import UnitOfTime

from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([AwayDaysNumber(entry.runtime_data)])


class AwayDaysNumber(ThermoplanEntity, NumberEntity):
    """Days away; heating resumes at the configured reset time."""

    _attr_translation_key = "away_days"
    _attr_native_min_value = 0
    _attr_native_max_value = 365
    _attr_native_step = 1
    _attr_mode = NumberMode.BOX
    _attr_native_unit_of_measurement = UnitOfTime.DAYS

    def __init__(self, controller) -> None:
        super().__init__(controller, "away_days")

    @property
    def native_value(self) -> float:
        return self._controller.away_days

    async def async_set_native_value(self, value: float) -> None:
        await self._controller.async_set_away_days(int(value))
