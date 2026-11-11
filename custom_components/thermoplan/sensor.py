"""Per-room target and reason."""

from __future__ import annotations

from datetime import timedelta

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTemperature
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN, SUBENTRY_ROOM
from .entity import ThermoplanEntity


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    controller = entry.runtime_data
    for subentry in entry.subentries.values():
        if subentry.subentry_type == SUBENTRY_ROOM:
            async_add_entities(
                [RoomTargetSensor(controller, subentry.subentry_id, subentry.title)],
                config_subentry_id=subentry.subentry_id,
            )


class RoomTargetSensor(ThermoplanEntity, SensorEntity):
    """Target Thermoplan wants for a room, with the reason as attribute."""

    _attr_translation_key = "room_target"
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS

    def __init__(self, controller, room_id: str, title: str) -> None:
        super().__init__(controller, f"{room_id}_target")
        self._room_id = room_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, room_id)},
            name=title,
            via_device=(DOMAIN, controller.entry.entry_id),
        )

    @property
    def native_value(self) -> float | None:
        rt = self._controller.runtime.get(self._room_id)
        if rt is None or rt.decision is None or rt.decision.hold:
            return None
        return rt.decision.target

    def _hold_attributes(self) -> dict:
        hold = self._controller._hold_for(self._room_id)
        return {
            "hold_until": hold.until.isoformat() if hold else None,
            "hold_text": (f"{hold.value:g} °C" if hold.mode == "fixed" else f"{hold.value:+g} °C") if hold else None,
            "boost_enabled": bool(self._controller.data.settings.feature("boost")["enabled"]),
        }

    def _real_attributes(self) -> dict:
        room = self._controller.rooms.get(self._room_id)
        if room is None or not room.real_enabled or not room.real_entity:
            return {}
        state = self._controller.hass.states.get(room.real_entity)
        if state is None:
            return {"real_entity": room.real_entity}
        return {
            "real_entity": room.real_entity,
            "real_target": state.attributes.get("temperature"),
            "real_current": state.attributes.get("current_temperature"),
            "real_state": state.state,
        }

    @property
    def extra_state_attributes(self) -> dict:
        rt = self._controller.runtime.get(self._room_id)
        if rt is None or rt.decision is None:
            return {}
        return {
            "climate_entity": self._controller.rooms[self._room_id].climate_entity,
            "climate_entities": self._controller.rooms[self._room_id].climates,
            "room_temperature": self._controller.room_temperature(self._controller.rooms[self._room_id]),
            "reason": str(rt.decision.reason),
            "schedule_target": rt.target,
            "base_target": rt.base_target,
            "adjustments": rt.adjustments or None,
            "window_open": rt.window_since is not None or self._controller.device_window_open(self._controller.rooms[self._room_id]),
            "learning": rt.learning,
            "learning_note": rt.learn_note or None,
            **self._hold_attributes(),
            **self._real_attributes(),
            "override_until": (
                (rt.override.started + timedelta(minutes=rt.override.minutes)).isoformat()
                if rt.override
                else None
            ),
        }
