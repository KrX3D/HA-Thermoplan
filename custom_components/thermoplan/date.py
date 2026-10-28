"""Away until date."""

from __future__ import annotations

from datetime import date

from homeassistant.components.date import DateEntity

from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([AwayUntilDate(entry.runtime_data)])


class AwayUntilDate(ThermoplanEntity, DateEntity):
    """Day you are back; heating resumes that day at the configured time."""

    _attr_translation_key = "away_until"

    def __init__(self, controller) -> None:
        super().__init__(controller, "away_until")

    @property
    def native_value(self) -> date | None:
        return self._controller.away_until

    async def async_set_value(self, value: date) -> None:
        await self._controller.async_set_away_until(value)
