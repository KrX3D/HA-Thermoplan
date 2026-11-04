"""Services for automations and scripts."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

_ROOMS = {vol.Optional("rooms"): vol.All(cv.ensure_list, [cv.string])}
HOLD_SCHEMA = vol.Schema(
    {
        **_ROOMS,
        vol.Optional("temperature"): vol.Coerce(float),
        vol.Optional("offset"): vol.Coerce(float),
        vol.Optional("minutes", default=60): vol.All(vol.Coerce(int), vol.Range(min=1, max=60 * 24 * 14)),
    }
)
BOOST_SCHEMA = vol.Schema(
    {
        **_ROOMS,
        vol.Optional("offset"): vol.Coerce(float),
        vol.Optional("minutes"): vol.All(vol.Coerce(int), vol.Range(min=1, max=60 * 24 * 14)),
    }
)


def _controller(hass: HomeAssistant):
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    if not entries:
        raise ServiceValidationError("Thermoplan is not set up")
    return entries[0].runtime_data


def async_register_services(hass: HomeAssistant) -> None:
    """Register the Thermoplan services once."""
    if hass.services.has_service(DOMAIN, "hold"):
        return

    def room_ids(controller, call: ServiceCall):
        try:
            return controller.room_ids(call.data.get("rooms"))
        except ValueError as err:
            raise ServiceValidationError(str(err)) from err

    async def set_profile(call: ServiceCall) -> None:
        controller = _controller(hass)
        if call.data["profile"] not in controller.data.profiles:
            raise ServiceValidationError(f"Unknown profile: {call.data['profile']}")
        await controller.async_set_profile(call.data["profile"], "service call")

    async def hold(call: ServiceCall) -> None:
        controller = _controller(hass)
        if ("temperature" in call.data) == ("offset" in call.data):
            raise ServiceValidationError("Give either temperature or offset")
        mode, value = ("fixed", call.data["temperature"]) if "temperature" in call.data else ("offset", call.data["offset"])
        await controller.async_hold(room_ids(controller, call), mode, value, call.data["minutes"])

    async def boost(call: ServiceCall) -> None:
        controller = _controller(hass)
        defaults = controller.data.settings.feature("boost")
        await controller.async_hold(
            room_ids(controller, call), "offset",
            call.data.get("offset", defaults["offset"]), call.data.get("minutes", defaults["minutes"]),
        )

    async def cancel_hold(call: ServiceCall) -> None:
        controller = _controller(hass)
        await controller.async_cancel_holds(room_ids(controller, call))

    async def set_away(call: ServiceCall) -> None:
        controller = _controller(hass)
        if "until" in call.data:
            await controller.async_set_away_until(call.data["until"])
        else:
            await controller.async_set_away_days(call.data["days"])

    hass.services.async_register(DOMAIN, "set_profile", set_profile, vol.Schema({vol.Required("profile"): cv.string}))
    hass.services.async_register(DOMAIN, "hold", hold, HOLD_SCHEMA)
    hass.services.async_register(DOMAIN, "boost", boost, BOOST_SCHEMA)
    hass.services.async_register(DOMAIN, "cancel_hold", cancel_hold, vol.Schema(_ROOMS))
    hass.services.async_register(
        DOMAIN, "set_away", set_away,
        vol.Schema({vol.Exclusive("days", "away"): vol.All(vol.Coerce(int), vol.Range(min=0, max=365)), vol.Exclusive("until", "away"): cv.date}),
    )
