"""Persistence of Thermoplan data."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .model import StoreData, store_from_dict, store_to_dict

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

STORAGE_VERSION = 1


class ThermoplanStore:
    """Thin wrapper around the HA store."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, DOMAIN)

    async def async_load(self) -> StoreData:
        raw = await self._store.async_load()
        return store_from_dict(raw) if raw else StoreData()

    async def async_save(self, data: StoreData) -> None:
        await self._store.async_save(store_to_dict(data))
