// Rooms tab: add, edit and remove rooms (thermostats).
import { addStrings, h } from "./thermoplan-common.js";
import { card, fieldRow, entitySelect } from "./thermoplan-settings.js";

addStrings(
  {
    tab_rooms: "Rooms", new_room: "New room", no_rooms_yet: "No rooms yet.",
    room_general: "Room", room_name: "Name", room_climate: "Thermostat",
    room_climate_help: "The thermostat to control, e.g. the Better Thermostat entity.",
    room_override: "Manual override duration (min)",
    room_override_help: "How long a manual change on the thermostat is respected before the schedule takes over again. 0 = never.",
    room_off: "Off behavior", room_off_mode: "When the room should be off",
    off_hvac: "Turn the thermostat off", off_fixed: "Set a fixed temperature",
    room_off_target: "Off temperature (°C)",
    room_off_target_help: "Some thermostats only accept 4.5 as off.",
    room_windows: "Window sensors", room_windows_help: "Optional. Only needed if the thermostat does not handle windows itself (e.g. without Better Thermostat). The room is off while any selected sensor is open.",
    room_cutoff: "Outdoor cutoff", room_cutoff_scope: "Use",
    scope_global: "Global settings", scope_room: "Settings for this room only", scope_off: "Disabled",
    save_room: "Save room", delete_room: "Delete room", confirm_delete_room: "Delete this room?",
    room_saved: "Saved. The integration reloads in a moment.",
    r_outdoor_sensor: "Outdoor temperature sensor", r_weather: "Weather entity (fallback)",
    r_threshold: "Fixed outdoor temperature (°C)", r_threshold_help: "Optional. Empty = this room's current target temperature.",
    r_off_after: "Turn off after (min)", r_on_after: "Turn on again after (min)", r_offset: "Offset (°C)",
    choose: "— choose —",
  },
  {
    tab_rooms: "Räume", new_room: "Neuer Raum", no_rooms_yet: "Noch keine Räume.",
    room_general: "Raum", room_name: "Name", room_climate: "Thermostat",
    room_climate_help: "Das zu steuernde Thermostat, z. B. die Better-Thermostat-Entität.",
    room_override: "Dauer manueller Änderung (Min.)",
    room_override_help: "Wie lange eine manuelle Änderung am Thermostat respektiert wird, bevor wieder der Zeitplan gilt. 0 = nie.",
    room_off: "Verhalten bei Aus", room_off_mode: "Wenn der Raum aus sein soll",
    off_hvac: "Thermostat ausschalten", off_fixed: "Feste Temperatur setzen",
    room_off_target: "Aus-Temperatur (°C)",
    room_off_target_help: "Manche Thermostate akzeptieren nur 4,5 als Aus.",
    room_windows: "Fenstersensoren", room_windows_help: "Optional. Nur nötig, wenn das Thermostat Fenster nicht selbst behandelt (z. B. ohne Better Thermostat). Der Raum ist aus, solange ein gewählter Sensor offen ist.",
    room_cutoff: "Außentemperatur-Abschaltung", room_cutoff_scope: "Verwenden",
    scope_global: "Globale Einstellungen", scope_room: "Nur Einstellungen für diesen Raum", scope_off: "Deaktiviert",
    save_room: "Raum speichern", delete_room: "Raum löschen", confirm_delete_room: "Diesen Raum löschen?",
    room_saved: "Gespeichert. Die Integration lädt gleich neu.",
    r_outdoor_sensor: "Außentemperatursensor", r_weather: "Wetter-Entität (Fallback)",
    r_threshold: "Feste Außentemperatur (°C)", r_threshold_help: "Optional. Leer = aktuelle Solltemperatur dieses Raums.",
    r_off_after: "Ausschalten nach (Min.)", r_on_after: "Wieder einschalten nach (Min.)", r_offset: "Versatz (°C)",
    choose: "— wählen —",
  },
);

const DEFAULTS = {
  name: "", climate_entity: "", override_minutes: 60, off_mode: "hvac_off", off_target: 4.5,
  window_sensors: [], cutoff_scope: "global", outdoor_sensor: null, weather_entity: null, threshold: null,
  off_after_minutes: 30, on_after_minutes: 10, offset: 0,
};

const OPENING_CLASSES = ["window", "door", "opening", "garage_door"];

export function renderRooms({ state, T, call, getHass, load, render }) {
  const hass = getHass();
  const rooms = state.data.rooms;

  const list = h("div", { class: "list" },
    ...rooms.map((room) => h("button", { class: "chip" + (room.id === state.roomId ? " active" : ""),
      onclick: () => { state.roomId = room.id; state.roomDraft = { ...DEFAULTS, ...room }; state.message = null; render(); } }, room.name)),
    h("button", { class: "chip" + (state.roomId === "new" ? " active" : ""), onclick: () => {
      state.roomId = "new"; state.roomDraft = { ...DEFAULTS }; state.message = null; render();
    } }, "+ " + T("new_room")));
  if (!rooms.length && state.roomId !== "new") list.prepend(h("div", { class: "empty" }, T("no_rooms_yet")));

  let detail = h("div", {});
  const d = state.roomDraft;
  if (d) {
    const num = (key, attrs = {}) => h("input", { type: "number", value: d[key] ?? "", ...attrs,
      onchange: (ev) => { d[key] = ev.target.value === "" ? null : Number(ev.target.value); } });
    const select = (key, options, rerender = true) => h("select", { onchange: (ev) => { d[key] = ev.target.value; if (rerender) render(); } },
      ...options.map(([value, label]) => h("option", { value, selected: d[key] === value }, label)));

    const climateIds = Object.keys(hass.states).filter((id) => id.startsWith("climate.")).sort();
    const openingIds = Object.keys(hass.states).filter((id) => id.startsWith("binary_sensor.")
      && OPENING_CLASSES.includes(hass.states[id].attributes.device_class));
    const windowIds = [...new Set([...openingIds, ...d.window_sensors])];
    const checkboxes = h("div", { style: "display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto" },
      ...(windowIds.length ? windowIds : Object.keys(hass.states).filter((id) => id.startsWith("binary_sensor."))).map((id) => h("label", {},
        h("input", { type: "checkbox", checked: d.window_sensors.includes(id), onchange: (ev) => {
          d.window_sensors = ev.target.checked ? [...d.window_sensors, id] : d.window_sensors.filter((x) => x !== id);
        } }), " " + (hass.states[id]?.attributes?.friendly_name || id))));

    const cards = [
      card(T("room_general"), null,
        fieldRow(T("room_name"), null, h("input", { type: "text", value: d.name, oninput: (ev) => { d.name = ev.target.value; } })),
        fieldRow(T("room_climate"), T("room_climate_help"), h("select", { onchange: (ev) => { d.climate_entity = ev.target.value; } },
          h("option", { value: "" }, T("choose")),
          ...[...new Set([...climateIds, d.climate_entity].filter(Boolean))].map((id) => h("option", { value: id, selected: id === d.climate_entity },
            hass.states[id]?.attributes?.friendly_name ? `${hass.states[id].attributes.friendly_name} (${id})` : id)))),
        fieldRow(T("room_override"), T("room_override_help"), num("override_minutes", { min: 0, step: 5 }))),
      card(T("room_off"), null,
        fieldRow(T("room_off_mode"), null, select("off_mode", [["hvac_off", T("off_hvac")], ["fixed", T("off_fixed")]])),
        d.off_mode === "fixed" ? fieldRow(T("room_off_target"), T("room_off_target_help"), num("off_target", { step: 0.5, min: 0 })) : null),
      card(T("room_windows"), T("room_windows_help"), checkboxes),
      card(T("room_cutoff"), null,
        fieldRow(T("room_cutoff_scope"), null, select("cutoff_scope", [["global", T("scope_global")], ["room", T("scope_room")], ["off", T("scope_off")]])),
        ...(d.cutoff_scope === "room" ? [
          fieldRow(T("r_outdoor_sensor"), null, entitySelect(hass, "sensor.", d.outdoor_sensor, (v) => { d.outdoor_sensor = v; }, (st) => st.attributes.device_class === "temperature")),
          fieldRow(T("r_weather"), null, entitySelect(hass, "weather.", d.weather_entity, (v) => { d.weather_entity = v; })),
          fieldRow(T("r_threshold"), T("r_threshold_help"), num("threshold", { step: 0.5 })),
          fieldRow(T("r_off_after"), null, num("off_after_minutes", { min: 0, step: 5 })),
          fieldRow(T("r_on_after"), null, num("on_after_minutes", { min: 0, step: 5 })),
          fieldRow(T("r_offset"), null, num("offset", { step: 0.5 })),
        ] : [])),
      h("div", { class: "savebar row" },
        h("button", { class: "btn", onclick: async () => {
          const data = {
            climate_entity: d.climate_entity, off_mode: d.off_mode, off_target: Number(d.off_target ?? 4.5),
            override_minutes: Math.round(Number(d.override_minutes ?? 60)), window_sensors: d.window_sensors,
            cutoff_scope: d.cutoff_scope, outdoor_sensor: d.outdoor_sensor || null, weather_entity: d.weather_entity || null,
            threshold: d.threshold === null || d.threshold === undefined ? null : Number(d.threshold),
            off_after_minutes: Math.round(Number(d.off_after_minutes ?? 30)), on_after_minutes: Math.round(Number(d.on_after_minutes ?? 10)),
            offset: Number(d.offset ?? 0),
          };
          try {
            const result = await hass.callWS({ type: "thermoplan/save_room", ...(state.roomId !== "new" ? { room_id: state.roomId } : {}),
              name: (d.name || "").trim(), data });
            state.roomId = result.room_id;
            state.message = T("room_saved");
            state.error = false;
          } catch (err) {
            state.message = err?.message || String(err);
            state.error = true;
          }
          render();
          setTimeout(load, 1500); // the entry reloads after a room change
        } }, T("save_room")),
        state.roomId !== "new" ? h("button", { class: "btn secondary", onclick: async () => {
          if (!confirm(T("confirm_delete_room"))) return;
          await call({ type: "thermoplan/delete_room", room_id: state.roomId });
          state.roomId = null; state.roomDraft = null;
          setTimeout(load, 1500);
        } }, T("delete_room")) : null,
        state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null),
    ];
    detail = h("div", {}, ...cards);
  }
  return h("div", { class: "split" }, list, detail);
}
