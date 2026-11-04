// Heating time statistics: how long each room was heating, per day / week / month, for any period.
// Thermoplan records this itself (the Home Assistant recorder keeps only about ten days); the first
// time the tab is opened the recent days are filled in from the recorder.
import { addStrings, h } from "./thermoplan-common.js";
import { card } from "./thermoplan-settings.js";

addStrings(
  {
    ht_title: "Heating time", ht_help: "How long the thermostats were heating. Thermoplan keeps these numbers itself, so they last longer than the Home Assistant history.",
    ht_7d: "Last 7 days", ht_30d: "Last 30 days", ht_month: "This month", ht_year: "This year", ht_season: "Heating season", ht_custom: "From – to",
    ht_from: "From", ht_to: "To", ht_group: "Group by", ht_day: "Day", ht_week: "Week", ht_month_g: "Month", ht_auto: "Automatic",
    ht_rooms: "Rooms", ht_all: "All rooms", ht_total: "Total", ht_avg: "per day on average", ht_h: "h", ht_share: "Share",
    ht_none: "No heating recorded in this period.", ht_since: "Recording started on %d; earlier days are not available.",
    ht_week_short: "CW",
  },
  {
    ht_title: "Heizzeit", ht_help: "Wie lange die Thermostate geheizt haben. Thermoplan speichert diese Zahlen selbst, deshalb reichen sie weiter zurück als der Verlauf von Home Assistant.",
    ht_7d: "Letzte 7 Tage", ht_30d: "Letzte 30 Tage", ht_month: "Dieser Monat", ht_year: "Dieses Jahr", ht_season: "Heizperiode", ht_custom: "Von – bis",
    ht_from: "Von", ht_to: "Bis", ht_group: "Gruppieren nach", ht_day: "Tag", ht_week: "Woche", ht_month_g: "Monat", ht_auto: "Automatisch",
    ht_rooms: "Räume", ht_all: "Alle Räume", ht_total: "Gesamt", ht_avg: "pro Tag im Schnitt", ht_h: "Std.", ht_share: "Anteil",
    ht_none: "In diesem Zeitraum wurde nicht geheizt.", ht_since: "Aufzeichnung seit %d; frühere Tage sind nicht verfügbar.",
    ht_week_short: "KW",
  },
);

const COLORS = ["#ff7043", "#42a5f5", "#66bb6a", "#ab47bc", "#ffca28", "#26c6da", "#ec407a", "#8d6e63"];
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return [t.getUTCFullYear(), Math.ceil(((t - first) / 86400000 + 1) / 7)];
}

function period(st, settings) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  switch (st.preset) {
    case "30d": return [addDays(today, -29), today];
    case "month": return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    case "year": return [new Date(today.getFullYear(), 0, 1), today];
    case "season": {
      const [sm, sd] = settings.season_start || [10, 1], [em, ed] = settings.season_end || [4, 30];
      let y = today.getFullYear();
      if (new Date(y, sm - 1, sd) > today) y -= 1;
      const start = new Date(y, sm - 1, sd);
      const end = new Date(em < sm ? y + 1 : y, em - 1, ed);
      return [start, end < today ? end : today];
    }
    case "custom": {
      const from = st.from ? parse(st.from) : addDays(today, -29), to = st.to ? parse(st.to) : today;
      return from <= to ? [from, to] : [to, from];
    }
    default: return [addDays(today, -6), today];
  }
}

// recorder history -> minutes of heating per day, for one room's thermostats
function heatingMinutes(series) {
  const heating = (p) => (p.attrs.hvac_action ? p.attrs.hvac_action === "heating"
    : p.state !== "off" && num(p.attrs.temperature) !== null && num(p.attrs.current_temperature) !== null
      && num(p.attrs.temperature) >= num(p.attrs.current_temperature) + 1);
  const perDay = {};
  const end = Date.now();
  for (let i = 0; i < series.length; i++) {
    if (!heating(series[i])) continue;
    let from = series[i].t;
    const to = Math.min(series[i + 1]?.t ?? end, end);
    while (from < to) {
      const d = new Date(from);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const stop = Math.min(to, midnight);
      perDay[ymd(d)] = (perDay[ymd(d)] || 0) + (stop - from) / 60000;
      from = stop;
    }
  }
  return perDay;
}

async function backfill(state, getHass, load) {
  const hass = getHass();
  state.hsBackfill = true;
  try {
    const start = new Date(Date.now() - 10 * 86400000);
    const ids = [...new Set(state.data.rooms.flatMap((r) => [r.climate_entity, ...(r.extra_climates || [])]))];
    if (!ids.length) return;
    const res = await hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), end_time: new Date().toISOString(),
      entity_ids: ids, include_start_time_state: true, significant_changes_only: false, minimal_response: false, no_attributes: false });
    for (const room of state.data.rooms) {
      const perDay = {};
      for (const id of [room.climate_entity, ...(room.extra_climates || [])]) {
        let attrs = {};
        const series = (res[id] || []).map((p) => {
          if (p.a) attrs = p.a;
          return { t: (p.lu ?? p.lc ?? 0) * 1000 || Date.parse(p.last_updated), state: p.s ?? p.state, attrs };
        });
        for (const [day, minutes] of Object.entries(heatingMinutes(series))) perDay[day] = Math.max(perDay[day] || 0, minutes);
      }
      await hass.callWS({ type: "thermoplan/merge_stats", room_id: room.id, days: perDay });
    }
    await load();
  } catch (err) {
    state.hsBackfill = false; // try again next time
  }
}

export function renderHeating({ state, T, getHass, load, render }) {
  const hass = getHass();
  const rooms = state.data.rooms;
  if (!rooms.length) return null;
  if (!state.data.stats_seeded && !state.hsBackfill) backfill(state, getHass, load);
  const st = state.hs || (state.hs = { preset: "7d", from: null, to: null, group: "auto", rooms: [] });
  const [from, to] = period(st, state.data.settings);
  const dayCount = Math.round((to - from) / 86400000) + 1;
  const group = st.group === "auto" ? (dayCount <= 45 ? "day" : dayCount <= 200 ? "week" : "month") : st.group;
  const chosen = st.rooms.length ? rooms.filter((r) => st.rooms.includes(r.id)) : rooms;
  const stats = state.data.stats || {};

  // hours per bucket per room
  const buckets = new Map();
  const bucketOf = (d) => {
    if (group === "month") return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}`, new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString(hass.language, { month: "short", year: "2-digit" })];
    if (group === "week") { const [y, w] = isoWeek(d); return [`${y}-W${pad(w)}`, `${T("ht_week_short")} ${w}`]; }
    return [ymd(d), d.toLocaleDateString(hass.language, { day: "2-digit", month: "2-digit" })];
  };
  const totals = new Map(chosen.map((r) => [r.id, 0]));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const [key, label] = bucketOf(d);
    if (!buckets.has(key)) buckets.set(key, { label, per: new Map(chosen.map((r) => [r.id, 0])) });
    for (const r of chosen) {
      const hours = ((stats[r.id] || {})[ymd(d)] || 0) / 60;
      buckets.get(key).per.set(r.id, buckets.get(key).per.get(r.id) + hours);
      totals.set(r.id, totals.get(r.id) + hours);
    }
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const colorOf = (id) => COLORS[rooms.findIndex((r) => r.id === id) % COLORS.length];
  const sums = [...buckets.values()].map((b) => [...b.per.values()].reduce((a, c) => a + c, 0));
  const max = Math.max(1, ...sums);

  const chip = (label, active, onclick, color) => h("button", { class: "chip" + (active ? " active" : ""), onclick },
    color ? h("i", { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px` }) : null, label);
  const presets = [["7d", "ht_7d"], ["30d", "ht_30d"], ["month", "ht_month"], ["year", "ht_year"], ["season", "ht_season"], ["custom", "ht_custom"]];
  const dateInput = (key, value) => h("input", { type: "date", value, max: ymd(new Date()), onchange: (ev) => { st[key] = ev.target.value || null; render(); } });
  const controls = [
    h("div", { class: "chips" }, ...presets.map(([id, label]) => chip(T(label), st.preset === id, () => { st.preset = id; render(); }))),
    st.preset === "custom" ? h("div", { class: "hist-controls", style: "margin-bottom:8px" },
      h("label", { style: "display:flex;gap:6px;align-items:center" }, T("ht_from"), dateInput("from", ymd(from))),
      h("label", { style: "display:flex;gap:6px;align-items:center" }, T("ht_to"), dateInput("to", ymd(to)))) : null,
    h("div", { class: "hist-controls" },
      h("div", { class: "chips" }, ...rooms.length > 1 ? [chip(T("ht_all"), st.rooms.length === 0, () => { st.rooms = []; render(); }),
        ...rooms.map((r) => chip(r.name, st.rooms.includes(r.id), () => {
          st.rooms = st.rooms.includes(r.id) ? st.rooms.filter((x) => x !== r.id) : [...st.rooms, r.id]; render();
        }, colorOf(r.id)))] : []),
      h("label", { style: "display:flex;gap:6px;align-items:center;color:var(--secondary-text-color)" }, T("ht_group"),
        h("select", { onchange: (ev) => { st.group = ev.target.value; render(); } },
          ...[["auto", "ht_auto"], ["day", "ht_day"], ["week", "ht_week"], ["month", "ht_month_g"]]
            .map(([v, l]) => h("option", { value: v, selected: st.group === v }, T(l)))))),
  ];

  const bars = [...buckets.values()].map((b, i) => {
    const parts = chosen.map((r) => [r, b.per.get(r.id)]).filter(([, v]) => v > 0);
    return h("div", { style: "flex:1 1 0;min-width:26px;max-width:72px;text-align:center" },
      h("div", { style: "height:110px;display:flex;flex-direction:column-reverse;justify-content:flex-start" },
        ...parts.map(([r, v]) => h("div", { title: `${r.name}: ${v.toFixed(1)} ${T("ht_h")}`,
          style: `height:${(v / max) * 100}%;min-height:2px;background:${colorOf(r.id)}` }))),
      h("div", { class: "muted" }, sums[i] > 0 ? sums[i].toFixed(1) : "–"),
      h("div", { class: "muted" }, b.label));
  });

  const recorded = Object.values(stats).flatMap((days) => Object.keys(days)).sort()[0];
  const since = recorded && parse(recorded) > from ? T("ht_since").replace("%d", parse(recorded).toLocaleDateString(hass.language)) : null;
  const table = chosen.length > 1 ? h("table", { style: "margin-top:10px;font-size:0.9em" },
    ...chosen.map((r) => h("tr", {}, h("td", {}, h("i", { style: `display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(r.id)};margin-right:6px` }), r.name),
      h("td", { style: "text-align:right;padding-left:16px" }, `${totals.get(r.id).toFixed(1)} ${T("ht_h")}`),
      h("td", { class: "muted", style: "text-align:right;padding-left:16px" }, total > 0 ? `${Math.round((totals.get(r.id) / total) * 100)} %` : "")))) : null;

  return card(T("ht_title"), T("ht_help"), ...controls,
    total > 0 ? h("div", { style: "display:flex;gap:4px;overflow-x:auto;margin-top:12px" }, ...bars) : h("div", { class: "empty", style: "margin-top:12px" }, T("ht_none")),
    h("div", { class: "muted", style: "margin-top:8px" }, `${T("ht_total")}: ${total.toFixed(1)} ${T("ht_h")} · ${(total / dayCount).toFixed(1)} ${T("ht_h")} ${T("ht_avg")}`),
    since ? h("div", { class: "muted" }, since) : null, table);
}
