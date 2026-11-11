"""Persistence of Thermoplan data."""

from __future__ import annotations

from collections.abc import Callable
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


class LogStore:
    """The Log tab's events, in their own file so the main store stays small."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.log")

    async def async_load(self) -> list[dict]:
        raw = await self._store.async_load()
        return list((raw or {}).get("events", []))

    def schedule_save(self, events: Callable[[], list[dict]]) -> None:
        """Save within a minute; Home Assistant also writes it when it shuts down."""
        self._store.async_delay_save(lambda: {"events": events()}, 60)

    async def async_save(self, events: list[dict]) -> None:
        await self._store.async_save({"events": events})
