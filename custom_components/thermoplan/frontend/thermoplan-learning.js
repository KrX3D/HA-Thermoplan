// Learning tab: adaptive preheating and coasting, and what was learned about each room.
import { addStrings, h, errText } from "./thermoplan-common.js";
import { card, fieldRow, featureCard, toggle, saveBar } from "./thermoplan-settings.js";

addStrings(
  {
    tab_learning: "Learning",
    ln_title: "Adaptive heating", ln_help: "Thermoplan watches how fast each room heats up and cools down. With that it can start heating early so a room is warm when a warmer block begins (preheating), and stop early when the room will stay warm enough until a cooler block begins (coasting). Everything stays visible here, and you can switch it off at any time.",
    ln_preheat: "Preheating", ln_coast: "Coasting", ln_max_lead: "Longest preheating (min)", ln_samples: "Heat-ups needed before it acts",
    ln_margin: "Coasting safety margin (°C)", ln_min_block: "No coasting when the cooler block is shorter than (min)", ln_save: "Save", ln_saved: "Saved",
    ln_room_off: "Switched off for this room (Rooms tab)", ln_ready: "Active", ln_collecting: "Collecting data",
    ln_need: "needs %n more heat-up(s)", ln_power: "Heating speed", ln_power_hint: "how fast the room warms with the heating on",
    ln_cool: "Heat loss", ln_cool_hint: "the room loses this fraction of the difference to outside per hour",
    ln_example: "18 → 20 °C takes about", ln_outdoor: "at outdoor", ln_nothing: "Not learned yet.",
    ln_now: "Right now", ln_samples_title: "Recent observations", ln_events: "What it did",
    ln_reset: "Reset learning", ln_reset_all: "Reset all", ln_confirm: "Delete everything learned?", ln_no_events: "Nothing yet.",
    ln_kind_heat: "Heating", ln_kind_idle: "Cooling", ln_col_when: "When", ln_col_kind: "Type", ln_col_dur: "Duration", ln_col_delta: "Change", ln_col_rate: "Speed", ln_col_out: "Outdoor",
    ln_per_hour: "°C/h", ln_min: "min", ln_no_rooms: "No rooms yet.",
    ln_room_title: "Learning (preheating / coasting)", ln_room_help: "Let this room take part in adaptive heating. Needs the global switch on the Learning tab.",
  },
  {
    tab_learning: "Lernen",
    ln_title: "Adaptives Heizen", ln_help: "Thermoplan beobachtet, wie schnell sich jeder Raum aufheizt und abkühlt. Damit kann es früher anfangen zu heizen, damit der Raum bei Beginn eines wärmeren Blocks warm ist (Vorheizen), und früher aufhören, wenn der Raum bis zu einem kühleren Block warm genug bleibt (Auslaufen). Alles ist hier sichtbar, und du kannst es jederzeit ausschalten.",
    ln_preheat: "Vorheizen", ln_coast: "Auslaufen", ln_max_lead: "Längstes Vorheizen (Min.)", ln_samples: "Nötige Aufheizvorgänge, bevor es eingreift",
    ln_margin: "Sicherheitsabstand beim Auslaufen (°C)", ln_min_block: "Kein Auslaufen, wenn der kühlere Block kürzer ist als (Min.)", ln_save: "Speichern", ln_saved: "Gespeichert",
    ln_room_off: "Für diesen Raum ausgeschaltet (Tab Räume)", ln_ready: "Aktiv", ln_collecting: "Sammelt Daten",
    ln_need: "braucht noch %n Aufheizvorgang/-vorgänge", ln_power: "Aufheizgeschwindigkeit", ln_power_hint: "wie schnell der Raum bei eingeschalteter Heizung wärmer wird",
    ln_cool: "Wärmeverlust", ln_cool_hint: "der Raum verliert pro Stunde diesen Anteil des Unterschieds zu draußen",
    ln_example: "18 → 20 °C dauert etwa", ln_outdoor: "bei Außentemperatur", ln_nothing: "Noch nichts gelernt.",
    ln_now: "Gerade jetzt", ln_samples_title: "Letzte Beobachtungen", ln_events: "Was es getan hat",
    ln_reset: "Gelerntes zurücksetzen", ln_reset_all: "Alles zurücksetzen", ln_confirm: "Alles Gelernte löschen?", ln_no_events: "Noch nichts.",
    ln_kind_heat: "Aufheizen", ln_kind_idle: "Abkühlen", ln_col_when: "Wann", ln_col_kind: "Art", ln_col_dur: "Dauer", ln_col_delta: "Änderung", ln_col_rate: "Tempo", ln_col_out: "Außen",
    ln_per_hour: "°C/Std.", ln_min: "Min.", ln_no_rooms: "Noch keine Räume.",
    ln_room_title: "Lernen (Vorheizen / Auslaufen)", ln_room_help: "Diesen Raum am adaptiven Heizen teilnehmen lassen. Braucht den globalen Schalter im Tab Lernen.",
  },
);

export const LEARNING_STYLE = `
  .ln-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 10px 0; }
  .ln-metric .v { font-size: 1.3em; font-weight: 500; }
  .ln-metric .l { color: var(--secondary-text-color); font-size: 0.8em; }
  .ln-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8em; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .ln-badge.on { background: var(--success-color, #2e7d32); color: #fff; }
  .ln-badge.act { background: #7e57c2; color: #fff; }
  .ln-table { width: 100%; border-collapse: collapse; font-size: 0.9em; margin-top: 6px; }
  .ln-table th { text-align: left; font-weight: 400; color: var(--secondary-text-color); padding: 4px 6px; }
  .ln-table td { padding: 5px 6px; border-top: 1px solid var(--divider-color); }
  .ln-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; }
  .ln-head h3 { margin: 0; }
  @media (max-width: 640px) { .ln-table { display: block; overflow-x: auto; } }
`;

export function renderLearning({ state, T, getHass, load, render }) {
  const hass = getHass();
  if (!state.learnLoaded) {
    state.learnLoaded = true;
    hass.callWS({ type: "thermoplan/get_learning" }).then((res) => { state.learn = res; render(); })
      .catch(() => { state.learn = { settings: {}, rooms: [], events: [] }; render(); });
  }
  const data = state.learn;
  if (!data) return h("div", { class: "empty" }, T("loading"));
  if (!state.learnDraft) state.learnDraft = { enabled: false, preheat: true, coast: true, max_lead: 120, coast_margin: 0.3, min_samples: 3, coast_min_block: 45, ...data.settings };
  const cfg = state.learnDraft;

  const save = async () => {
    const settings = JSON.parse(JSON.stringify(state.data.settings));
    settings.features = { ...(settings.features || {}), learning: cfg };
    try {
      await hass.callWS({ type: "thermoplan/set_settings", settings });
      state.settingsDraft = null; // the Settings tab must not overwrite this later
      state.learnDraft = null; state.learnLoaded = false;
      state.message = T("ln_saved"); state.error = false;
      await load();
    } catch (err) { state.message = errText(err); state.error = true; render(); }
  };
  const numRow = (label, key, attrs) => fieldRow(label, null, h("input", { type: "number", value: cfg[key], ...attrs,
    onchange: (ev) => { cfg[key] = Number(ev.target.value); } }));
  const sw = (label, key) => fieldRow(label, null, toggle(!!cfg[key], (v) => { cfg[key] = v; }));

  const settingsCard = featureCard(T("ln_title"), T("ln_help"), !!cfg.enabled, (v) => { cfg.enabled = v; render(); },
    sw(T("ln_preheat"), "preheat"), sw(T("ln_coast"), "coast"),
    numRow(T("ln_max_lead"), "max_lead", { min: 10, step: 10 }), numRow(T("ln_samples"), "min_samples", { min: 1, step: 1 }),
    numRow(T("ln_margin"), "coast_margin", { min: 0, step: 0.1 }), numRow(T("ln_min_block"), "coast_min_block", { min: 0, step: 5 }),
    saveBar(state, "learning", cfg, T("ln_save"), save));

  const time = (iso) => new Date(iso).toLocaleString(hass.language || undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const roomCard = (r) => {
    const status = !r.enabled ? h("span", { class: "ln-badge" }, T("ln_room_off"))
      : r.ready ? h("span", { class: "ln-badge on" }, T("ln_ready"))
        : h("span", { class: "ln-badge" }, `${T("ln_collecting")} (${T("ln_need").replace("%n", Math.max(0, (cfg.min_samples || 3) - r.n_heat))})`);
    const metric = (value, label, hint) => h("div", { class: "ln-metric", title: hint || "" }, h("div", { class: "v" }, value), h("div", { class: "l" }, label));
    const metrics = r.power || r.k ? h("div", { class: "ln-metrics" },
      metric(r.power ? `${(r.power * 60).toFixed(1)} ${T("ln_per_hour")}` : "–", T("ln_power"), T("ln_power_hint")),
      metric(r.k ? `${(r.k * 60 * 100).toFixed(1)} %/h` : "–", T("ln_cool"), T("ln_cool_hint")),
      metric(r.example_minutes != null ? `${Math.round(r.example_minutes)} ${T("ln_min")}` : "–",
        `${T("ln_example")}${r.outdoor != null ? ` (${T("ln_outdoor")} ${r.outdoor.toFixed(1)} °C)` : ""}`)) : h("div", { class: "empty" }, T("ln_nothing"));
    const now = r.note ? h("p", { class: "help" }, h("span", { class: "ln-badge act" }, r.state === "preheat" ? T("ln_preheat") : T("ln_coast")), " " + r.note) : null;
    const rows = r.samples.map((s) => h("tr", {},
      h("td", {}, time(s.at)), h("td", {}, s.kind === "heat" ? T("ln_kind_heat") : T("ln_kind_idle")),
      h("td", {}, `${Math.round(s.minutes)} ${T("ln_min")}`), h("td", {}, `${s.delta > 0 ? "+" : ""}${s.delta.toFixed(1)} °C`),
      h("td", {}, `${(Math.abs(s.rate) * 60).toFixed(1)} ${T("ln_per_hour")}`), h("td", {}, s.t_out != null ? `${s.t_out.toFixed(1)} °C` : "–")));
    return h("div", { class: "card" },
      h("div", { class: "ln-head" }, h("h3", {}, r.name), status),
      now, metrics,
      r.samples.length ? h("table", { class: "ln-table" },
        h("thead", {}, h("tr", {}, ...["ln_col_when", "ln_col_kind", "ln_col_dur", "ln_col_delta", "ln_col_rate", "ln_col_out"].map((k) => h("th", {}, T(k))))),
        h("tbody", {}, ...rows)) : null,
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn secondary", onclick: async () => {
        if (!confirm(T("ln_confirm"))) return;
        await hass.callWS({ type: "thermoplan/reset_learning", room_id: r.id }); state.learnLoaded = false; render();
      } }, T("ln_reset"))));
  };

  const events = card(T("ln_events"), null,
    ...(data.events.length ? data.events.map((e) => h("div", { class: "log-line" }, h("span", { class: "log-time" }, time(e.time)),
      h("span", { class: "log-room" }, e.room || ""), h("span", {}, e.message))) : [h("div", { class: "empty" }, T("ln_no_events"))]));

  return h("div", {}, settingsCard, ...(data.rooms.length ? data.rooms.map(roomCard) : [h("div", { class: "empty" }, T("ln_no_rooms"))]), events,
    data.rooms.length > 1 ? h("div", { class: "row" }, h("button", { class: "btn secondary", onclick: async () => {
      if (!confirm(T("ln_confirm"))) return;
      await hass.callWS({ type: "thermoplan/reset_learning" }); state.learnLoaded = false; render();
    } }, T("ln_reset_all"))) : null);
}
