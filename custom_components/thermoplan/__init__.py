"""Thermoplan: schedule-based thermostat control with global heating profiles."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.typing import ConfigType


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Thermoplan (engine only for now, no entities yet)."""
    return True
