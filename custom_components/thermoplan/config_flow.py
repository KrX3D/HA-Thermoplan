"""Config flow: one hub entry, rooms as subentries."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    OptionsFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN, SUBENTRY_ROOM
from .model import (
    CUTOFF_GLOBAL,
    CUTOFF_NONE,
    CUTOFF_ROOM,
    OFF_FIXED,
    OFF_HVAC,
    CutoffSettings,
)


def _select(options: list[str], key: str) -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=options,
            mode=selector.SelectSelectorMode.DROPDOWN,
            translation_key=key,
        )
    )


def _number(minimum: float, maximum: float, step: float, unit: str) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=minimum,
            max=maximum,
            step=step,
            mode=selector.NumberSelectorMode.BOX,
            unit_of_measurement=unit,
        )
    )


def _room_schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required("name", default=defaults.get("name", "")): str,
            vol.Required(
                "climate_entity", default=defaults.get("climate_entity", vol.UNDEFINED)
            ): selector.EntitySelector(selector.EntitySelectorConfig(domain="climate")),
            vol.Required("off_mode", default=defaults.get("off_mode", OFF_HVAC)): _select(
                [OFF_HVAC, OFF_FIXED], "off_mode"
            ),
            vol.Required("off_target", default=defaults.get("off_target", 4.5)): _number(
                4, 30, 0.5, "°C"
            ),
            vol.Required(
                "override_minutes", default=defaults.get("override_minutes", 60)
            ): _number(0, 1440, 5, "min"),
            vol.Optional(
                "window_sensors", default=defaults.get("window_sensors", [])
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="binary_sensor", multiple=True)
            ),
            vol.Required(
                "cutoff_scope", default=defaults.get("cutoff_scope", CUTOFF_GLOBAL)
            ): _select([CUTOFF_GLOBAL, CUTOFF_ROOM, CUTOFF_NONE], "cutoff_scope"),
        }
    )


def _cutoff_schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Optional(
                "outdoor_sensor", description={"suggested_value": defaults.get("outdoor_sensor")}
            ): selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor")),
            vol.Optional(
                "weather_entity", description={"suggested_value": defaults.get("weather_entity")}
            ): selector.EntitySelector(selector.EntitySelectorConfig(domain="weather")),
            vol.Required(
                "off_after_minutes", default=defaults.get("off_after_minutes", 30)
            ): _number(0, 1440, 5, "min"),
            vol.Required(
                "on_after_minutes", default=defaults.get("on_after_minutes", 10)
            ): _number(0, 1440, 5, "min"),
            vol.Required("offset", default=defaults.get("offset", 0.0)): _number(
                -10, 10, 0.5, "°C"
            ),
        }
    )


class ThermoplanConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single Thermoplan hub."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Thermoplan", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return ThermoplanOptionsFlow()

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        return {SUBENTRY_ROOM: RoomSubentryFlow}


class RoomSubentryFlow(ConfigSubentryFlow):
    """Add or reconfigure a room."""

    def __init__(self) -> None:
        self._room: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        return await self._room_step("user", user_input, {})

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        sub = self._get_reconfigure_subentry()
        return await self._room_step("reconfigure", user_input, {**sub.data, "name": sub.title})

    async def _room_step(
        self, step_id: str, user_input: dict[str, Any] | None, defaults: dict[str, Any]
    ) -> SubentryFlowResult:
        if user_input is not None:
            self._room = user_input
            if user_input["cutoff_scope"] == CUTOFF_ROOM:
                return await self.async_step_cutoff()
            return self._finish()
        return self.async_show_form(step_id=step_id, data_schema=_room_schema(defaults))

    async def async_step_cutoff(self, user_input: dict[str, Any] | None = None) -> SubentryFlowResult:
        if user_input is not None:
            self._room = {**self._room, **user_input}
            return self._finish()
        defaults = self._get_reconfigure_subentry().data if self.source == "reconfigure" else {}
        return self.async_show_form(step_id="cutoff", data_schema=_cutoff_schema(dict(defaults)))

    def _finish(self) -> SubentryFlowResult:
        data = dict(self._room)
        title = data.pop("name")
        if self.source == "reconfigure":
            return self.async_update_and_abort(
                self._get_entry(), self._get_reconfigure_subentry(), title=title, data=data
            )
        return self.async_create_entry(title=title, data=data)


def _int_box(minimum: int, maximum: int) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=minimum, max=maximum, step=1, mode=selector.NumberSelectorMode.BOX
        )
    )


class ThermoplanOptionsFlow(OptionsFlow):
    """Global settings: heating season, away reset time, person and global outdoor cutoff."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        controller = self.config_entry.runtime_data
        settings = controller.data.settings
        if user_input is not None:
            settings.season_start = (
                int(user_input["season_start_month"]),
                int(user_input["season_start_day"]),
            )
            settings.season_end = (
                int(user_input["season_end_month"]),
                int(user_input["season_end_day"]),
            )
            settings.away_reset_time = user_input["away_reset_time"]
            settings.person_entity = user_input.get("person_entity")
            settings.cutoff = CutoffSettings(
                enabled=user_input["cutoff_enabled"],
                outdoor_sensor=user_input.get("outdoor_sensor"),
                weather_entity=user_input.get("weather_entity"),
                off_after_minutes=int(user_input["off_after_minutes"]),
                on_after_minutes=int(user_input["on_after_minutes"]),
                offset=float(user_input["offset"]),
            )
            await controller.async_set_settings(settings)
            return self.async_create_entry(data={})

        c = settings.cutoff
        schema = vol.Schema(
            {
                vol.Required("season_start_day", default=settings.season_start[1]): _int_box(1, 31),
                vol.Required("season_start_month", default=settings.season_start[0]): _int_box(1, 12),
                vol.Required("season_end_day", default=settings.season_end[1]): _int_box(1, 31),
                vol.Required("season_end_month", default=settings.season_end[0]): _int_box(1, 12),
                vol.Required(
                    "away_reset_time", default=settings.away_reset_time
                ): selector.TimeSelector(),
                vol.Optional(
                    "person_entity", description={"suggested_value": settings.person_entity}
                ): selector.EntitySelector(selector.EntitySelectorConfig(domain="person")),
                vol.Required("cutoff_enabled", default=c.enabled): bool,
                vol.Optional(
                    "outdoor_sensor", description={"suggested_value": c.outdoor_sensor}
                ): selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor")),
                vol.Optional(
                    "weather_entity", description={"suggested_value": c.weather_entity}
                ): selector.EntitySelector(selector.EntitySelectorConfig(domain="weather")),
                vol.Required("off_after_minutes", default=c.off_after_minutes): _number(
                    0, 1440, 5, "min"
                ),
                vol.Required("on_after_minutes", default=c.on_after_minutes): _number(
                    0, 1440, 5, "min"
                ),
                vol.Required("offset", default=c.offset): _number(-10, 10, 0.5, "\u00b0C"),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
