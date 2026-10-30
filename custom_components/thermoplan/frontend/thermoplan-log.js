// Log tab: recent decisions and commands, newest first.
import { addStrings, h } from "./thermoplan-common.js";

addStrings(
  {
    tab_log: "Log", log_title: "Recent events", log_hint: "Why each room is at its current target, and what Thermoplan sent. For more detail enable debug logging (see README). Events are kept in memory (last 300) and cleared on restart.",
    log_refresh: "Refresh", log_all_rooms: "All rooms", log_empty: "No events yet.", log_general: "General",
  },
  {
    tab_log: "Protokoll", log_title: "Letzte Ereignisse", log_hint: "Warum jeder Raum auf seiner aktuellen Solltemperatur steht und was Thermoplan gesendet hat. Für mehr Details Debug-Protokollierung aktivieren (siehe README). Ereignisse liegen im Speicher (die letzten 300) und werden beim Neustart gelöscht.",
    log_refresh: "Aktualisieren", log_all_rooms: "Alle Räume", log_empty: "Noch keine Ereignisse.", log_general: "Allgemein",
  },
);

export const LOG_STYLE = `
  .log-line { display: grid; grid-template-columns: 150px 170px minmax(0, 1fr); gap: 8px; padding: 6px 0;
    border-top: 1px solid var(--divider-color); font-size: 0.9em; }
  .log-line:first-child { border-top: none; }
  .log-time { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .log-room { font-weight: 500; }
  @media (max-width: 700px) { .log-line { grid-template-columns: 1fr; } }
`;

export function renderLog({ state, T, getHass, render }) {
  if (!state.logLoaded) {
    state.logLoaded = true;
    getHass().callWS({ type: "thermoplan/get_log" }).then((events) => {
      state.log = events;
      render();
    }).catch(() => { state.log = []; render(); });
  }
  const events = state.log || [];
  const rooms = [...new Set(events.map((e) => e.room).filter(Boolean))].sort();
  const filter = state.logRoom || "";
  const shown = events.filter((e) => !filter || e.room === filter);
  const time = (iso) => new Date(iso).toLocaleString(getHass().language || undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return h("div", { class: "card" }, h("h3", {}, T("log_title")), h("p", { class: "help" }, T("log_hint")),
    h("div", { class: "row" },
      h("select", { onchange: (ev) => { state.logRoom = ev.target.value; render(); } },
        h("option", { value: "" }, T("log_all_rooms")),
        ...rooms.map((r) => h("option", { value: r, selected: r === filter }, r))),
      h("button", { class: "btn secondary", onclick: () => { state.logLoaded = false; render(); } }, T("log_refresh"))),
    ...(shown.length ? shown.map((e) => h("div", { class: "log-line" },
      h("span", { class: "log-time" }, time(e.time)),
      h("span", { class: "log-room" }, e.room || T("log_general")),
      h("span", {}, e.message))) : [h("div", { class: "empty" }, T("log_empty"))]));
}
