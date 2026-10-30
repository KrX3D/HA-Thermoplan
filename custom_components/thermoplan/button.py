"""Buttons to drop manual overrides."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN, SUBENTRY_ROOM
from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    controller = entry.runtime_data
    async_add_entities([ClearOverridesButton(controller, None, None)])
    for subentry in entry.subentries.values():
        if subentry.subentry_type == SUBENTRY_ROOM:
            async_add_entities(
                [ClearOverridesButton(controller, subentry.subentry_id, subentry.title)],
                config_subentry_id=subentry.subentry_id,
            )


class ClearOverridesButton(ThermoplanEntity, ButtonEntity):
    """Reset the manual override of one room, or of all rooms."""

    def __init__(self, controller, room_id: str | None, title: str | None) -> None:
        super().__init__(controller, f"{room_id}_clear_override" if room_id else "clear_overrides")
        self._room_id = room_id
        self._attr_translation_key = "clear_override" if room_id else "clear_all_overrides"
        if room_id:
            self._attr_device_info = DeviceInfo(
                identifiers={(DOMAIN, room_id)},
                name=title,
                via_device=(DOMAIN, controller.entry.entry_id),
            )

    async def async_press(self) -> None:
        await self._controller.async_clear_overrides(self._room_id)
