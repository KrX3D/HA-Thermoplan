"""Config flow: creates the single Thermoplan hub; everything else is managed in the sidebar."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    OptionsFlow,
)
from homeassistant.core import callback

from .const import DOMAIN, PANEL_URL


class ThermoplanConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single Thermoplan hub."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Thermoplan", data={})
        return self.async_show_form(
            step_id="user", description_placeholders={"url": PANEL_URL}
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return ThermoplanOptionsFlow()

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        # Rooms are added and edited in the Thermoplan sidebar panel.
        return {}


class ThermoplanOptionsFlow(OptionsFlow):
    """Points to the sidebar, where all settings live."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data={})
        return self.async_show_form(
            step_id="init", description_placeholders={"url": PANEL_URL}
        )
