"""Active heating profile."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity

from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([ProfileSelect(entry.runtime_data)])


class ProfileSelect(ThermoplanEntity, SelectEntity):
    """Select the active profile."""

    _attr_translation_key = "profile"

    def __init__(self, controller) -> None:
        super().__init__(controller, "profile")

    @property
    def options(self) -> list[str]:
        return list(self._controller.data.profiles)

    @property
    def current_option(self) -> str | None:
        return self._controller.data.state.active_profile

    async def async_select_option(self, option: str) -> None:
        await self._controller.async_set_profile(option)
