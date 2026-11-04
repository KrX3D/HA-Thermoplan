// Hold tab: keep rooms at a temperature, or raise them, for a while (and cancel it again).
import { addStrings, h } from "./thermoplan-common.js";
import { card, fieldRow } from "./thermoplan-settings.js";

addStrings(
  {
    tab_hold: "Hold", hold_title: "Hold or boost", hold_help: "Keep rooms at a fixed temperature, or raise them for a while. A hold overrides the schedule, the season and the away state; it ends by itself, or when you change the thermostat by hand or cancel it here.",
    hold_mode: "What to do", hold_fixed: "Set to a temperature", hold_offset: "Raise or lower by",
    hold_value: "Value (°C)", hold_duration: "For", hold_custom: "minutes", hold_rooms: "Rooms", hold_all: "All rooms",
    hold_start: "Start", hold_started: "Started", hold_running: "Running holds", hold_none: "No hold is running.",
    hold_cancel: "Cancel", hold_cancel_all: "Cancel all", hold_until: "until", hold_failed: "Could not start the hold",
    d30: "30 min", d60: "1 h", d120: "2 h", d240: "4 h", d480: "8 h", d_midnight: "Until midnight",
  },
  {
    tab_hold: "Halten", hold_title: "Halten oder Boost", hold_help: "Räume für eine Weile auf einer festen Temperatur halten oder anheben. Ein Halten überstimmt Zeitplan, Heizperiode und Abwesenheit; es endet von selbst, wenn du am Thermostat etwas änderst oder es hier abbrichst.",
    hold_mode: "Was tun", hold_fixed: "Auf Temperatur setzen", hold_offset: "Anheben oder senken um",
    hold_value: "Wert (°C)", hold_duration: "Für", hold_custom: "Minuten", hold_rooms: "Räume", hold_all: "Alle Räume",
    hold_start: "Starten", hold_started: "Gestartet", hold_running: "Laufende Halten", hold_none: "Es läuft kein Halten.",
    hold_cancel: "Abbrechen", hold_cancel_all: "Alle abbrechen", hold_until: "bis", hold_failed: "Halten konnte nicht gestartet werden",
    d30: "30 Min.", d60: "1 Std.", d120: "2 Std.", d240: "4 Std.", d480: "8 Std.", d_midnight: "Bis Mitternacht",
  },
);

const DURATIONS = [30, 60, 120, 240, 480];

export function renderHold({ state, T, getHass, load, render }) {
  const hass = getHass();
  const rooms = state.data.rooms;
  const form = state.holdForm || (state.holdForm = { mode: "fixed", value: 22, minutes: 60, rooms: [] }); // [] = all rooms
  const hm = (iso) => new Date(iso).toLocaleTimeString(hass.language, { hour: "2-digit", minute: "2-digit" });
  const minutesToMidnight = () => { const n = new Date(); return Math.max(1, Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n) / 60000)); };

  const chip = (label, active, onclick) => h("button", { class: "chip" + (active ? " active" : ""), onclick }, label);
  const toggleRoom = (name) => {
    form.rooms = form.rooms.includes(name) ? form.rooms.filter((r) => r !== name) : [...form.rooms, name];
    render();
  };

  const start = async () => {
    try {
      await hass.callWS({ type: "thermoplan/hold", ...(form.rooms.length ? { rooms: form.rooms } : {}),
        mode: form.mode, value: Number(form.value), minutes: Math.round(Number(form.minutes)) });
      state.message = T("hold_started"); state.error = false;
      await load();
    } catch (err) {
      state.message = `${T("hold_failed")}: ${err?.message || err}`; state.error = true; render();
    }
  };

  const startCard = card(T("hold_title"), T("hold_help"),
    fieldRow(T("hold_mode"), null, h("div", { class: "chips" },
      chip(T("hold_fixed"), form.mode === "fixed", () => { form.mode = "fixed"; form.value = 22; render(); }),
      chip(T("hold_offset"), form.mode === "offset", () => { form.mode = "offset"; form.value = 2; render(); }))),
    fieldRow(T("hold_value"), null, h("input", { type: "number", step: 0.5, value: form.value, onchange: (ev) => { form.value = Number(ev.target.value); } })),
    fieldRow(T("hold_duration"), null, h("div", { class: "chips" },
      ...DURATIONS.map((m) => chip(T("d" + m), form.minutes === m, () => { form.minutes = m; render(); })),
      chip(T("d_midnight"), form.minutes === minutesToMidnight(), () => { form.minutes = minutesToMidnight(); render(); }),
      h("input", { type: "number", min: 1, step: 5, value: form.minutes, style: "width:80px", onchange: (ev) => { form.minutes = Number(ev.target.value) || 60; render(); } }),
      h("span", { class: "muted" }, T("hold_custom")))),
    fieldRow(T("hold_rooms"), null, h("div", { class: "chips" },
      chip(T("hold_all"), form.rooms.length === 0, () => { form.rooms = []; render(); }),
      ...rooms.map((r) => chip(r.name, form.rooms.includes(r.name), () => toggleRoom(r.name))))),
    h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn", onclick: start }, T("hold_start")),
      state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null));

  const holds = state.data.holds || [];
  const running = card(T("hold_running"), null,
    ...(holds.length ? holds.map((hold) => h("div", { class: "field-row" },
      h("div", {}, h("div", { class: "label" }, hold.rooms === null ? T("hold_all") : hold.room_names.join(", ")),
        h("div", { class: "sub" }, `${hold.mode === "fixed" ? hold.value + " °C" : (hold.value > 0 ? "+" : "") + hold.value + " °C"} · ${T("hold_until")} ${hm(hold.until)}`)),
      h("div", { class: "inline" }, h("button", { class: "btn secondary", onclick: async () => {
        await hass.callWS({ type: "thermoplan/cancel_hold", ...(hold.rooms === null ? {} : { rooms: hold.room_names }) });
        await load();
      } }, T("hold_cancel"))))) : [h("div", { class: "empty" }, T("hold_none"))]),
    holds.length > 1 ? h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn secondary", onclick: async () => {
      await hass.callWS({ type: "thermoplan/cancel_hold" }); await load();
    } }, T("hold_cancel_all"))) : null);

  return h("div", {}, startCard, running);
}
