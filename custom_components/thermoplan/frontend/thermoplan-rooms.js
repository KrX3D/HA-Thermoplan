// Rooms tab: add, edit and remove rooms (thermostats).
import { addStrings, h } from "./thermoplan-common.js";
import { card, fieldRow, entitySelect, featureCard, saveBar, markSaved } from "./thermoplan-settings.js";

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
    rf_adjust: "Room adjustment", rf_adjust_help: "Make this room warmer or cooler than its schedule, for example -1 °C for a bedroom. Applied to every heating target; off stays off.",
    rf_adjust_value: "Adjustment (°C)",
    rf_limits: "Temperature limits", rf_limits_help: "Keep the target of this room inside a range, whatever the schedule says. Leave a field empty for no limit.",
    rf_min: "Minimum (°C)", rf_max: "Maximum (°C)",
    rf_occ: "Room occupancy", rf_occ_help: "A presence or motion sensor for this room. Choose what happens when someone is in the room and when nobody is.",
    rf_occ_entity: "Sensor", rf_occ_present: "When someone is in the room", rf_occ_absent: "When the room is empty",
    occ_none: "Do nothing", occ_offset: "Raise / lower by", occ_profile: "Use the plan of profile", occ_schedule: "Use schedule",
    rf_window: "Window handling", rf_window_help: "What to do while a window is open. Better Thermostat can keep doing this itself: choose Only observe to just record what happens.",
    rf_window_mode: "While a window is open", win_off: "Switch the thermostat off", win_lower: "Lower to a temperature", win_observe: "Only observe (log)",
    rf_window_target: "Lowered temperature (°C)", rf_window_delay: "Act after (min)", rf_window_delay_help: "The window must be open this long before Thermoplan reacts. 0 = at once.",
    rf_window_long: "Report after (min)", rf_window_long_help: "Write a warning to the log when a window stays open this long (works in every mode). 0 = never.",
    rf_window_notify: "Also send a notification", rf_window_notify_help: "Sent with the notification settings on the Settings tab (pick your phone there under \"Send via\").", rf_window_notify_off: "Notifications are switched off on the Settings tab, so nothing is sent yet.",
    rf_real: "Real thermostat", rf_real_help: "The device behind Better Thermostat. Its actual setting is shown next to the room on the Overview, so you can see what Better Thermostat really sent.",
    rf_real_entity: "Thermostat",
    rf_more_climates: "Weitere Thermostate in diesem Raum", rf_more_climates_help: "Jedes Thermostat des Raums bekommt dieselbe Zieltemperatur. Leer lassen, wenn der Raum nur eines hat.",
    rf_sensor: "Raumtemperatur-Sensor", rf_sensor_help: "Ein externer Sensor für die echte Raumtemperatur. Wird für Übersicht, Warnungen und Lernen statt der Messung des Thermostats genutzt.",
    rf_sensor_entity: "Sensor", rf_occ_present_after: "nach (Min.)", rf_occ_absent_after: "nach (Min.)",
    rf_more_climates: "More thermostats in this room", rf_more_climates_help: "Every thermostat of the room gets the same target. Leave empty if the room has only one.",
    rf_sensor: "Room temperature sensor", rf_sensor_help: "An external sensor for the real room temperature. Used for the Overview, warnings and learning instead of the thermostat's own reading.",
    rf_sensor_entity: "Sensor", rf_occ_present_after: "after (min)", rf_occ_absent_after: "after (min)",
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
    rf_adjust: "Raumanpassung", rf_adjust_help: "Diesen Raum wärmer oder kühler als im Zeitplan machen, z. B. -1 °C im Schlafzimmer. Gilt für jede Heiz-Solltemperatur; Aus bleibt Aus.",
    rf_adjust_value: "Anpassung (°C)",
    rf_limits: "Temperaturgrenzen", rf_limits_help: "Die Solltemperatur dieses Raums bleibt in einem Bereich, egal was der Zeitplan sagt. Feld leer lassen = keine Grenze.",
    rf_min: "Minimum (°C)", rf_max: "Maximum (°C)",
    rf_occ: "Raumbelegung", rf_occ_help: "Ein Anwesenheits- oder Bewegungssensor für diesen Raum. Lege fest, was passiert, wenn jemand im Raum ist und wenn niemand da ist.",
    rf_occ_entity: "Sensor", rf_occ_present: "Wenn jemand im Raum ist", rf_occ_absent: "Wenn der Raum leer ist",
    occ_none: "Nichts tun", occ_offset: "Erhöhen / senken um", occ_profile: "Plan des Profils verwenden", occ_schedule: "Zeitplan verwenden",
    rf_window: "Fensterverhalten", rf_window_help: "Was passieren soll, solange ein Fenster offen ist. Better Thermostat kann das weiter selbst tun: wähle Nur beobachten, um nur zu protokollieren.",
    rf_window_mode: "Solange ein Fenster offen ist", win_off: "Thermostat ausschalten", win_lower: "Auf eine Temperatur absenken", win_observe: "Nur beobachten (Protokoll)",
    rf_window_target: "Abgesenkte Temperatur (°C)", rf_window_delay: "Reagieren nach (Min.)", rf_window_delay_help: "Das Fenster muss so lange offen sein, bevor Thermoplan reagiert. 0 = sofort.",
    rf_window_long: "Melden nach (Min.)", rf_window_long_help: "Eine Warnung ins Protokoll schreiben, wenn ein Fenster so lange offen bleibt (in jedem Modus). 0 = nie.",
    rf_window_notify: "Zusätzlich benachrichtigen", rf_window_notify_help: "Wird mit den Benachrichtigungs-Einstellungen im Tab Einstellungen gesendet (dort unter \"Senden über\" dein Handy wählen).", rf_window_notify_off: "Benachrichtigungen sind im Tab Einstellungen ausgeschaltet, deshalb wird noch nichts gesendet.",
    rf_real: "Echtes Thermostat", rf_real_help: "Das Gerät hinter Better Thermostat. Seine tatsächliche Einstellung steht in der Übersicht neben dem Raum, so siehst du, was Better Thermostat wirklich gesendet hat.",
    rf_real_entity: "Thermostat",
  },
);

const DEFAULTS = {
  name: "", climate_entity: "", override_minutes: 60, off_mode: "hvac_off", off_target: 4.5,
  window_sensors: [], cutoff_scope: "global", outdoor_sensor: null, weather_entity: null, threshold: null,
  off_after_minutes: 30, on_after_minutes: 10, offset: 0,
  adjust_enabled: false, adjust: 0, limits_enabled: false, min_temp: null, max_temp: null,
  occupancy_enabled: false, occupancy_entity: null, occ_present_type: "none", occ_present_value: null,
  occ_absent_type: "none", occ_absent_value: null,
  window_enabled: true, window_mode: "off", window_target: 15, window_open_delay: 0, window_too_long: 0, window_notify: false,
  real_enabled: false, real_entity: null, learn_enabled: true,
  extra_climates: [], temp_sensor_enabled: false, temp_sensor: null, occ_present_delay: 0, occ_absent_delay: 0,
};

const toNum = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const OPENING_CLASSES = ["window", "door", "opening", "garage_door"];

export function renderRooms({ state, T, call, getHass, load, render }) {
  const hass = getHass();
  const rooms = state.data.rooms;
  if (!state.roomDraft && state.roomId !== "new" && rooms.length) {
    state.roomId = rooms[0].id; // open the first room right away
    state.roomDraft = { ...DEFAULTS, ...rooms[0] };
  }

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

    const profiles = state.data.profiles, scheduleNames = Object.keys(state.data.schedules).sort();
    const actionControl = (typeKey, valueKey) => h("div", { class: "inline" },
      h("select", { class: "short", onchange: (ev) => { d[typeKey] = ev.target.value; d[valueKey] = null; render(); } },
        ...[["none", T("occ_none")], ["offset", T("occ_offset")], ["profile", T("occ_profile")], ["schedule", T("occ_schedule")]]
          .map(([v, l]) => h("option", { value: v, selected: d[typeKey] === v }, l))),
      d[typeKey] === "offset" ? [num(valueKey, { step: 0.5, style: "width:80px" }), "°C"] : null,
      d[typeKey] === "profile" ? h("select", { class: "short", onchange: (ev) => { d[valueKey] = ev.target.value; } },
        h("option", { value: "" }, T("choose")), ...profiles.map((p) => h("option", { value: p, selected: d[valueKey] === p }, p))) : null,
      d[typeKey] === "schedule" ? h("select", { class: "short", onchange: (ev) => { d[valueKey] = ev.target.value; } },
        h("option", { value: "" }, T("choose")), ...scheduleNames.map((n) => h("option", { value: n, selected: d[valueKey] === n }, n))) : null);

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
        fieldRow(T("room_climate"), T("room_climate_help"), entitySelect(hass, "climate.", d.climate_entity, (v) => { d.climate_entity = v || ""; render(); })),
        fieldRow(T("rf_more_climates"), T("rf_more_climates_help"), h("div", { style: "display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto" },
          ...climateIds.filter((id) => id !== d.climate_entity).map((id) => h("label", {},
            h("input", { type: "checkbox", checked: d.extra_climates.includes(id), onchange: (ev) => {
              d.extra_climates = ev.target.checked ? [...d.extra_climates, id] : d.extra_climates.filter((x) => x !== id);
            } }), " " + (hass.states[id]?.attributes?.friendly_name || id))))),
        fieldRow(T("room_override"), T("room_override_help"), num("override_minutes", { min: 0, step: 5 }))),
      featureCard(T("rf_sensor"), T("rf_sensor_help"), !!d.temp_sensor_enabled, (v) => { d.temp_sensor_enabled = v; render(); },
        fieldRow(T("rf_sensor_entity"), null, entitySelect(hass, "sensor.", d.temp_sensor, (v) => { d.temp_sensor = v; }, (st) => st.attributes.device_class === "temperature"))),
      card(T("room_off"), null,
        fieldRow(T("room_off_mode"), null, select("off_mode", [["hvac_off", T("off_hvac")], ["fixed", T("off_fixed")]])),
        d.off_mode === "fixed" ? fieldRow(T("room_off_target"), T("room_off_target_help"), num("off_target", { step: 0.5, min: 0 })) : null),
      featureCard(T("rf_window"), T("rf_window_help"), d.window_enabled !== false, (v) => { d.window_enabled = v; render(); },
        h("div", { class: "muted", style: "margin-bottom:6px" }, T("room_windows_help")), checkboxes,
        fieldRow(T("rf_window_mode"), null, select("window_mode", [["off", T("win_off")], ["lower", T("win_lower")], ["observe", T("win_observe")]])),
        d.window_mode === "lower" ? fieldRow(T("rf_window_target"), null, num("window_target", { step: 0.5, min: 4 })) : null,
        d.window_mode !== "observe" ? fieldRow(T("rf_window_delay"), T("rf_window_delay_help"), num("window_open_delay", { min: 0, step: 1 })) : null,
        fieldRow(T("rf_window_long"), T("rf_window_long_help"), num("window_too_long", { min: 0, step: 1 })),
        fieldRow(T("rf_window_notify"), state.data.settings.notify_enabled ? T("rf_window_notify_help") : T("rf_window_notify_off"), h("input", { type: "checkbox", checked: !!d.window_notify, onchange: (ev) => { d.window_notify = ev.target.checked; } }))),
      featureCard(T("rf_adjust"), T("rf_adjust_help"), !!d.adjust_enabled, (v) => { d.adjust_enabled = v; render(); },
        fieldRow(T("rf_adjust_value"), null, num("adjust", { step: 0.5 }))),
      featureCard(T("rf_limits"), T("rf_limits_help"), !!d.limits_enabled, (v) => { d.limits_enabled = v; render(); },
        fieldRow(T("rf_min"), null, num("min_temp", { step: 0.5 })), fieldRow(T("rf_max"), null, num("max_temp", { step: 0.5 }))),
      featureCard(T("rf_occ"), T("rf_occ_help"), !!d.occupancy_enabled, (v) => { d.occupancy_enabled = v; render(); },
        fieldRow(T("rf_occ_entity"), null, entitySelect(hass, ["binary_sensor.", "input_boolean.", "person.", "group."], d.occupancy_entity, (v) => { d.occupancy_entity = v; })),
        fieldRow(T("rf_occ_present"), null, [actionControl("occ_present_type", "occ_present_value"), h("span", { class: "inline" }, T("rf_occ_present_after"), num("occ_present_delay", { min: 0, step: 1, style: "width:70px" }))]),
        fieldRow(T("rf_occ_absent"), null, [actionControl("occ_absent_type", "occ_absent_value"), h("span", { class: "inline" }, T("rf_occ_absent_after"), num("occ_absent_delay", { min: 0, step: 1, style: "width:70px" }))])),
      featureCard(T("ln_room_title"), T("ln_room_help"), d.learn_enabled !== false, (v) => { d.learn_enabled = v; render(); }),
      featureCard(T("rf_real"), T("rf_real_help"), !!d.real_enabled, (v) => { d.real_enabled = v; render(); },
        fieldRow(T("rf_real_entity"), null, entitySelect(hass, "climate.", d.real_entity, (v) => { d.real_entity = v; }))),
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
      saveBar(state, "room", d, T("save_room"), async () => {
          const data = {
            climate_entity: d.climate_entity, off_mode: d.off_mode, off_target: Number(d.off_target ?? 4.5),
            override_minutes: Math.round(Number(d.override_minutes ?? 60)), window_sensors: d.window_sensors,
            cutoff_scope: d.cutoff_scope, outdoor_sensor: d.outdoor_sensor || null, weather_entity: d.weather_entity || null,
            threshold: d.threshold === null || d.threshold === undefined ? null : Number(d.threshold),
            off_after_minutes: Math.round(Number(d.off_after_minutes ?? 30)), on_after_minutes: Math.round(Number(d.on_after_minutes ?? 10)),
            offset: Number(d.offset ?? 0),
            adjust_enabled: !!d.adjust_enabled, adjust: Number(d.adjust ?? 0),
            limits_enabled: !!d.limits_enabled, min_temp: toNum(d.min_temp), max_temp: toNum(d.max_temp),
            occupancy_enabled: !!d.occupancy_enabled, occupancy_entity: d.occupancy_entity || null,
            occ_present_type: d.occ_present_type, occ_present_value: d.occ_present_value ?? null,
            occ_absent_type: d.occ_absent_type, occ_absent_value: d.occ_absent_value ?? null,
            window_enabled: d.window_enabled !== false, window_mode: d.window_mode, window_target: Number(d.window_target ?? 15),
            window_open_delay: Math.round(Number(d.window_open_delay ?? 0)), window_too_long: Math.round(Number(d.window_too_long ?? 0)),
            window_notify: !!d.window_notify, real_enabled: !!d.real_enabled, real_entity: d.real_entity || null,
            learn_enabled: d.learn_enabled !== false,
            extra_climates: d.extra_climates.filter((id) => id !== d.climate_entity),
            temp_sensor_enabled: !!d.temp_sensor_enabled, temp_sensor: d.temp_sensor || null,
            occ_present_delay: Math.round(Number(d.occ_present_delay ?? 0)), occ_absent_delay: Math.round(Number(d.occ_absent_delay ?? 0)),
          };
          try {
            const result = await hass.callWS({ type: "thermoplan/save_room", ...(state.roomId !== "new" ? { room_id: state.roomId } : {}),
              name: (d.name || "").trim(), data });
            state.roomId = result.room_id;
            markSaved(state, "room", d);
            state.message = T("room_saved");
            state.error = false;
          } catch (err) {
            state.message = err?.message || String(err);
            state.error = true;
          }
          render();
          setTimeout(load, 1500); // the entry reloads after a room change
        },
        ...(state.roomId !== "new" ? [h("button", { class: "btn secondary", onclick: async () => {
          if (!confirm(T("confirm_delete_room"))) return;
          await call({ type: "thermoplan/delete_room", room_id: state.roomId });
          state.roomId = null; state.roomDraft = null;
          setTimeout(load, 1500);
        } }, T("delete_room"))] : [])),
    ];
    detail = h("div", {}, ...cards);
  }
  return h("div", { class: "split" }, list, detail);
}
