// Log tab: recent decisions and commands, newest first.
import { addStrings, h } from "./thermoplan-common.js";

addStrings(
  {
    tab_log: "Log", log_title: "Recent events", log_hint: "Why each room is at its current target, and what Thermoplan sent. For more detail enable debug logging (see README). Events are kept across restarts for the number of days set in Settings (7 by default, up to 30).",
    log_today: "Today", log_yesterday: "Yesterday", log_3d: "3 days", log_7d: "7 days", log_all: "Everything", log_day: "Day", log_count: "%n events",
    log_refresh: "Refresh", log_all_rooms: "All events", log_empty: "No events yet.", log_general: "General",
    log_copy: "Copy log", log_copied: "Copied", log_copy_failed: "Copying failed, select the text manually",
  },
  {
    tab_log: "Protokoll", log_title: "Letzte Ereignisse", log_hint: "Warum jeder Raum auf seiner aktuellen Solltemperatur steht und was Thermoplan gesendet hat. Für mehr Details Debug-Protokollierung aktivieren (siehe README). Ereignisse bleiben über Neustarts erhalten, so viele Tage wie in den Einstellungen festgelegt (Standard 7, bis zu 30).",
    log_today: "Heute", log_yesterday: "Gestern", log_3d: "3 Tage", log_7d: "7 Tage", log_all: "Alles", log_day: "Tag", log_count: "%n Ereignisse",
    log_refresh: "Aktualisieren", log_all_rooms: "Alle Ereignisse", log_empty: "Noch keine Ereignisse.", log_general: "Allgemein",
    log_copy: "Protokoll kopieren", log_copied: "Kopiert", log_copy_failed: "Kopieren fehlgeschlagen, Text bitte manuell markieren",
  },
);

export const LOG_STYLE = `
  .log-line { display: grid; grid-template-columns: 150px 170px minmax(0, 1fr); gap: 8px; padding: 6px 0;
    border-top: 1px solid var(--divider-color); font-size: 0.9em; }
  .log-line:first-child { border-top: none; }
  .log-time { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  .log-room { font-weight: 500; }
  .log-detail { color: var(--secondary-text-color); font-size: 0.85em; margin-top: 2px; }
  .log-detail::before { content: "\u21b3 "; }
  @media (max-width: 700px) { .log-line { grid-template-columns: 1fr; } }
`;

const GENERAL = "\u0000general";

export function renderLog({ state, T, getHass, render }) {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const range = state.logRange || (state.logRange = { preset: "today", day: null });
  const dayStart = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  let start = null, end = null;
  if (range.preset === "today") start = dayStart(0);
  else if (range.preset === "yesterday") { start = dayStart(1); end = dayStart(0); }
  else if (range.preset === "3d") start = dayStart(2);
  else if (range.preset === "7d") start = dayStart(6);
  else if (range.preset === "day" && range.day) { const [y, m, d] = range.day.split("-").map(Number); start = new Date(y, m - 1, d); end = new Date(y, m - 1, d + 1); }
  const key = `${range.preset}|${range.day || ""}`;
  if (!state.logLoaded || state.logKey !== key) {
    state.logLoaded = true; state.logKey = key;
    getHass().callWS({ type: "thermoplan/get_log", ...(start ? { start: start.toISOString() } : {}), ...(end ? { end: end.toISOString() } : {}) }).then((events) => {
      state.log = events;
      render();
    }).catch(() => { state.log = []; render(); });
  }
  const events = state.log || [];
  const rooms = [...new Set(events.map((e) => e.room).filter(Boolean))].sort();
  const hasGeneral = events.some((e) => !e.room);
  const filter = state.logRoom || "";
  // "" = everything, GENERAL = events that belong to no room, otherwise a room name
  const shown = events.filter((e) => !filter || (filter === GENERAL ? !e.room : e.room === filter));
  const time = (iso) => new Date(iso).toLocaleString(getHass().language || undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  // One line per event, oldest first, ready to paste into an issue or a chat.
  const text = [...shown].reverse().map((e) => {
    const d = new Date(e.time);
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${d.toTimeString().slice(0, 8)}`;
    return `${stamp} [${e.room || T("log_general")}] ${e.message}${e.detail ? `\n    -> ${e.detail}` : ""}`;
  }).join("\n");
  const copyButton = h("button", { class: "btn secondary" }, T("log_copy"));
  copyButton.addEventListener("click", async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (err) { /* not a secure context: fall back below */ }
    if (!ok) {
      const area = document.createElement("textarea");
      area.value = text; area.style.cssText = "position:fixed;opacity:0"; document.body.append(area); area.select();
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      area.remove();
    }
    copyButton.textContent = ok ? T("log_copied") : T("log_copy_failed");
    setTimeout(() => { copyButton.textContent = T("log_copy"); }, 2500);
  });

  const presetChip = (id, label) => h("button", { class: "chip" + (range.preset === id ? " active" : ""),
    onclick: () => { range.preset = id; render(); } }, label);
  const rangeRow = h("div", { class: "row", style: "margin-bottom:8px" },
    h("div", { class: "chips", style: "margin:0" }, presetChip("today", T("log_today")), presetChip("yesterday", T("log_yesterday")),
      presetChip("3d", T("log_3d")), presetChip("7d", T("log_7d")), presetChip("all", T("log_all"))),
    h("label", { style: "display:flex;gap:6px;align-items:center;color:var(--secondary-text-color)" }, T("log_day"),
      h("input", { type: "date", max: ymd(today), value: range.preset === "day" && range.day ? range.day : range.preset === "yesterday" ? ymd(dayStart(1)) : ymd(today),
        onchange: (ev) => {
          const v = ev.target.value;
          if (!v || v === ymd(today)) range.preset = "today";
          else if (v === ymd(dayStart(1))) range.preset = "yesterday";
          else { range.preset = "day"; range.day = v; }
          render();
        } })),
    h("span", { class: "muted" }, T("log_count").replace("%n", shown.length)));

  return h("div", { class: "card" }, h("h3", {}, T("log_title")), h("p", { class: "help" }, T("log_hint")), rangeRow,
    h("div", { class: "row" },
      h("select", { onchange: (ev) => { state.logRoom = ev.target.value; render(); } },
        h("option", { value: "" }, T("log_all_rooms")),
        ...(hasGeneral ? [h("option", { value: GENERAL, selected: filter === GENERAL }, T("log_general"))] : []),
        ...rooms.map((r) => h("option", { value: r, selected: r === filter }, r))),
      h("button", { class: "btn secondary", onclick: () => { state.logLoaded = false; render(); } }, T("log_refresh")),
      copyButton),
    ...(shown.length ? shown.map((e) => h("div", { class: "log-line" },
      h("span", { class: "log-time" }, time(e.time)),
      h("span", { class: "log-room" }, e.room || T("log_general")),
      h("span", {}, e.message, e.detail ? h("div", { class: "log-detail" }, e.detail) : null))) : [h("div", { class: "empty" }, T("log_empty"))]));
}
