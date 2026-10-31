// History tab: per room, current temperature vs. thermostat setting vs. plan, with status bands.
// Data comes from the Home Assistant recorder (history/history_during_period) for the room's
// thermostat and its Thermoplan target sensor.
import { addStrings, h, discover } from "./thermoplan-common.js";

addStrings(
  {
    tab_history: "History", hist_title: "Temperature history",
    hist_hint: "Current temperature, what the thermostat was set to, and what the plan asked for. Bands show manual changes, a thermostat that was off and open windows.",
    hist_range: "Range", hist_until: "Until", hist_now: "Now", hist_room: "Room",
    h6: "6 h", h24: "24 h", h72: "3 days", h168: "7 days", h336: "14 days",
    leg_current: "Current", leg_set: "Thermostat", leg_plan: "Plan", leg_manual: "Manual change", leg_off: "Thermostat off", leg_window: "Window open",
    hist_loading: "Loading…", hist_empty: "No data for this period.", hist_error: "History is not available",
    hist_no_rooms: "No rooms yet.", tip_status: "Status",
    r_schedule: "Schedule", r_default: "Default", r_override: "Manual change", r_window: "Window open", r_outside_season: "Outside season",
    r_away: "Away", r_outdoor_cutoff: "Outdoor cutoff", r_schedule_off: "Schedule: off",
  },
  {
    tab_history: "Verlauf", hist_title: "Temperaturverlauf",
    hist_hint: "Ist-Temperatur, Einstellung am Thermostat und Vorgabe aus dem Plan. Bänder zeigen manuelle Änderungen, ein ausgeschaltetes Thermostat und offene Fenster.",
    hist_range: "Zeitraum", hist_until: "Bis", hist_now: "Jetzt", hist_room: "Raum",
    h6: "6 Std.", h24: "24 Std.", h72: "3 Tage", h168: "7 Tage", h336: "14 Tage",
    leg_current: "Ist", leg_set: "Thermostat", leg_plan: "Plan", leg_manual: "Manuelle Änderung", leg_off: "Thermostat aus", leg_window: "Fenster offen",
    hist_loading: "Lädt…", hist_empty: "Keine Daten für diesen Zeitraum.", hist_error: "Verlauf nicht verfügbar",
    hist_no_rooms: "Noch keine Räume.", tip_status: "Status",
    r_schedule: "Zeitplan", r_default: "Standard", r_override: "Manuelle Änderung", r_window: "Fenster offen", r_outside_season: "Außerhalb der Heizperiode",
    r_away: "Abwesend", r_outdoor_cutoff: "Außentemperatur", r_schedule_off: "Zeitplan: aus",
  },
);

export const HISTORY_STYLE = `
  .hist-wrap { position: relative; }
  .hist-wrap svg { width: 100%; height: auto; display: block; }
  .hist-tip { position: absolute; pointer-events: none; display: none; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.5;
    background: var(--card-background-color); border: 1px solid var(--divider-color); box-shadow: 0 4px 16px rgba(0,0,0,.35); white-space: nowrap; z-index: 5; }
  .hist-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: 12px; color: var(--secondary-text-color); }
  .hist-legend i { display: inline-block; width: 22px; height: 0; border-top: 3px solid; vertical-align: middle; margin-right: 6px; }
  .hist-legend i.band { height: 10px; border: none; opacity: .55; border-radius: 2px; }
  .hist-controls { display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; }
`;

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  kids.forEach((k) => k && el.append(k));
  return el;
};
const RANGES = [6, 24, 72, 168, 336];
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// compressed history -> [{t, state, attrs}] with attributes carried forward
function points(list) {
  let attrs = {};
  return (list || []).map((p) => {
    if (p.a) attrs = p.a;
    return { t: (p.lu ?? p.lc ?? p.last_updated ?? 0) * 1000 || Date.parse(p.last_updated), state: p.s ?? p.state, attrs };
  }).sort((a, b) => a.t - b.t);
}
// value at time t from a step series
function at(series, t) {
  let last = null;
  for (const p of series) { if (p.t <= t) last = p; else break; }
  return last;
}

export function renderHistory({ state, T, getHass, render }) {
  const hass = getHass();
  const rooms = state.data.rooms;
  if (!rooms.length) return h("div", { class: "card" }, h("div", { class: "empty" }, T("hist_no_rooms")));
  const st = state.hist || (state.hist = { room: rooms[0].id, hours: 24, until: null, key: "", data: null, loading: false, error: null });
  if (!rooms.some((r) => r.id === st.room)) st.room = rooms[0].id;
  const room = rooms.find((r) => r.id === st.room);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); // local date
  const end = st.until ? new Date(st.until + "T23:59:59") : new Date();
  const endMs = Math.min(end.getTime(), Date.now());
  const startMs = endMs - st.hours * 3600 * 1000;

  const sensorId = discover(hass).rooms.map((r) => r.entityId)
    .find((id) => hass.states[id]?.attributes?.climate_entity === room.climate_entity);
  const key = `${room.id}|${st.hours}|${st.until || ""}`;
  if (st.key !== key && !st.loading) {
    st.key = key; st.loading = true; st.error = null;
    const ids = [room.climate_entity, sensorId].filter(Boolean);
    hass.callWS({
      type: "history/history_during_period", start_time: new Date(startMs).toISOString(), end_time: new Date(endMs).toISOString(),
      entity_ids: ids, include_start_time_state: true, significant_changes_only: false, minimal_response: false, no_attributes: false,
    }).then((res) => { st.data = res; })
      .catch((err) => { st.error = err?.message || String(err); st.data = null; })
      .finally(() => { st.loading = false; if (st.key === key) render(); else render(); });
  }

  const controls = h("div", { class: "card" }, h("h3", {}, T("hist_title")), h("p", { class: "help" }, T("hist_hint")),
    h("div", { class: "hist-controls" },
      h("div", { class: "chips" }, ...rooms.map((r) => h("button", { class: "chip" + (r.id === st.room ? " active" : ""),
        onclick: () => { st.room = r.id; render(); } }, r.name))),
      h("div", { class: "chips" }, ...RANGES.map((n) => h("button", { class: "chip" + (n === st.hours ? " active" : ""),
        onclick: () => { st.hours = n; render(); } }, T("h" + n)))),
      h("label", { class: "l", style: "display:flex;gap:6px;align-items:center;color:var(--secondary-text-color)" }, T("hist_until"),
        h("input", { type: "date", value: st.until || today, max: today,
          // today means "up to now"; an earlier day shows that whole day
          onchange: (ev) => { st.until = ev.target.value && ev.target.value < today ? ev.target.value : null; render(); } }),
        h("button", { class: "btn secondary", onclick: () => { st.until = null; render(); } }, T("hist_now")))));

  let body;
  if (st.loading || (st.key !== key)) body = h("div", { class: "empty" }, T("hist_loading"));
  else if (st.error) body = h("div", { class: "msg error" }, `${T("hist_error")}: ${st.error}`);
  else body = chart(st.data || {}, room, sensorId, startMs, endMs, hass, T);

  return h("div", {}, controls, h("div", { class: "card" }, body));
}

function chart(data, room, sensorId, t0, t1, hass, T) {
  const climate = points(data[room.climate_entity]);
  const sensor = points(sensorId ? data[sensorId] : []);
  const cur = climate.map((p) => ({ t: p.t, v: num(p.attrs.current_temperature) })).filter((p) => p.v !== null);
  const setp = climate.map((p) => ({ t: p.t, v: p.state === "off" ? null : num(p.attrs.temperature) }));
  const plan = sensor.map((p) => ({ t: p.t, v: num(p.attrs.schedule_target) }));
  if (!cur.length && !setp.some((p) => p.v !== null)) return h("div", { class: "empty" }, T("hist_empty"));

  const W = 1000, H = 340, L = 46, R = 12, TOP = 10, B = 30;
  const vals = [...cur, ...setp, ...plan].map((p) => p.v).filter((v) => v !== null);
  let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  if (hi - lo < 4) hi = lo + 4;
  const X = (t) => L + ((Math.max(t0, Math.min(t1, t)) - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v) => TOP + (1 - (v - lo) / (hi - lo)) * (H - TOP - B);

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  // grid + axes
  const yStep = hi - lo > 14 ? 5 : hi - lo > 8 ? 2 : 1;
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) {
    root.append(svg("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: "var(--divider-color)", "stroke-width": 1 }));
    const label = svg("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", fill: "var(--secondary-text-color)", "font-size": 11 });
    label.textContent = `${v}°`; root.append(label);
  }
  const span = t1 - t0, hours = span / 3600000;
  const tickMs = hours <= 7 ? 3600000 : hours <= 30 ? 3 * 3600000 : hours <= 80 ? 12 * 3600000 : 24 * 3600000;
  const fmtTick = (d) => (tickMs >= 24 * 3600000 ? d.toLocaleDateString(hass.language, { day: "2-digit", month: "2-digit" })
    : tickMs >= 12 * 3600000 ? d.toLocaleString(hass.language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleTimeString(hass.language, { hour: "2-digit", minute: "2-digit" }));
  for (let t = Math.ceil(t0 / tickMs) * tickMs; t <= t1; t += tickMs) {
    root.append(svg("line", { x1: X(t), x2: X(t), y1: TOP, y2: H - B, stroke: "var(--divider-color)", "stroke-width": 1, opacity: 0.6 }));
    const label = svg("text", { x: X(t), y: H - 10, "text-anchor": "middle", fill: "var(--secondary-text-color)", "font-size": 11 });
    label.textContent = fmtTick(new Date(t)); root.append(label);
  }

  // status bands
  const bands = (series, test, color) => {
    for (let i = 0; i < series.length; i++) {
      if (!test(series[i])) continue;
      let j = i + 1;
      while (j < series.length && test(series[j])) j++;
      const a = series[i].t, b = j < series.length ? series[j].t : t1;
      root.append(svg("rect", { x: X(a), y: TOP, width: Math.max(2, X(b) - X(a)), height: H - TOP - B, fill: color, opacity: 0.22 }));
      i = j - 1;
    }
  };
  bands(climate, (p) => p.state === "off", "#9e9e9e");
  bands(sensor, (p) => p.attrs.reason === "window", "#29b6f6");
  bands(sensor, (p) => p.attrs.reason === "override", "#ffa000");

  // lines
  const step = (series) => {
    let d = "", pen = false;
    series.forEach((p, i) => {
      const next = series[i + 1]?.t ?? t1;
      if (p.v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}L${X(next).toFixed(1)} ${Y(p.v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const line = (series) => series.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("") + (series.length ? `L${X(t1).toFixed(1)} ${Y(series[series.length - 1].v).toFixed(1)}` : "");
  root.append(svg("path", { d: step(plan), fill: "none", stroke: "#b39ddb", "stroke-width": 2, "stroke-dasharray": "6 4" }));
  root.append(svg("path", { d: step(setp), fill: "none", stroke: "#66bb6a", "stroke-width": 2.5 }));
  root.append(svg("path", { d: line(cur), fill: "none", stroke: "#ff7043", "stroke-width": 2.5, "stroke-linejoin": "round" }));

  // hover crosshair + tooltip
  const cross = svg("line", { y1: TOP, y2: H - B, stroke: "var(--primary-text-color)", "stroke-width": 1, opacity: 0, "stroke-dasharray": "3 3" });
  root.append(cross);
  const tip = h("div", { class: "hist-tip" });
  const hit = svg("rect", { x: L, y: TOP, width: W - L - R, height: H - TOP - B, fill: "transparent" });
  const fmtV = (v) => (v === null || v === undefined ? "–" : `${v.toFixed(1)} °C`);
  hit.addEventListener("pointermove", (ev) => {
    const box = root.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const t = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
    const c = at(cur, t), s = at(setp, t), p = at(plan, t), sn = at(sensor, t), cl = at(climate, t);
    cross.setAttribute("x1", X(t)); cross.setAttribute("x2", X(t)); cross.setAttribute("opacity", 0.7);
    const reason = sn?.attrs?.reason;
    tip.replaceChildren(
      h("div", { style: "font-weight:500" }, new Date(t).toLocaleString(hass.language, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })),
      h("div", { style: "color:#ff7043" }, `${T("leg_current")}: ${fmtV(c?.v)}`),
      h("div", { style: "color:#66bb6a" }, `${T("leg_set")}: ${cl?.state === "off" ? "off" : fmtV(s?.v)}`),
      h("div", { style: "color:#b39ddb" }, `${T("leg_plan")}: ${p?.v === null || p === null ? "off" : fmtV(p.v)}`),
      reason ? h("div", {}, `${T("tip_status")}: ${T("r_" + reason)}`) : null);
    tip.style.display = "block";
    const rel = (ev.clientX - box.left);
    tip.style.left = Math.min(box.width - 190, rel + 14) + "px";
    tip.style.top = Math.max(0, ev.clientY - box.top - 20) + "px";
  });
  hit.addEventListener("pointerleave", () => { tip.style.display = "none"; cross.setAttribute("opacity", 0); });
  root.append(hit);

  const legend = h("div", { class: "hist-legend" },
    h("span", {}, h("i", { style: "border-color:#ff7043" }), T("leg_current")),
    h("span", {}, h("i", { style: "border-color:#66bb6a" }), T("leg_set")),
    h("span", {}, h("i", { style: "border-color:#b39ddb;border-top-style:dashed" }), T("leg_plan")),
    h("span", {}, h("i", { class: "band", style: "background:#ffa000" }), T("leg_manual")),
    h("span", {}, h("i", { class: "band", style: "background:#9e9e9e" }), T("leg_off")),
    h("span", {}, h("i", { class: "band", style: "background:#29b6f6" }), T("leg_window")));
  return h("div", {}, h("div", { class: "hist-wrap" }, root, tip), legend);
}
