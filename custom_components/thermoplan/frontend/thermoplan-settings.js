// Settings tab: heating season, away reset time, presence rules, global outdoor cutoff, Schedy import.
import { addStrings, h } from "./thermoplan-common.js";

addStrings(
  {
    tab_settings: "Settings", season: "Heating season", season_start: "Start (day / month)",
    season_end: "End (day / month)", away_reset: "Away counter: heating resumes at",
    presence: "Presence", person: "Person", presence_hint: "When the person's state changes to …, switch to profile …",
    when_state: "State", switch_to: "Profile", add_rule: "Add rule", cutoff: "Outdoor cutoff (global)",
    cutoff_enabled: "Enabled", outdoor_sensor: "Outdoor sensor", weather_entity: "Weather entity (fallback)",
    off_after: "Off after (min)", on_after: "On again after (min)", offset: "Offset (°C)",
    save_settings: "Save settings", import_title: "Import from Schedy",
    import_hint: "Paste your Schedy YAML. Rooms are matched by thermostat entity.",
    create_rooms: "Create missing rooms", import: "Import", report_profiles: "Profiles",
    report_schedules: "Schedules", report_created: "Rooms created", report_matched: "Rooms matched",
    report_skipped: "Rooms skipped", report_warnings: "Not imported / warnings", none_option: "—",
    state_home: "home", state_not_home: "not_home",
  },
  {
    tab_settings: "Einstellungen", season: "Heizperiode", season_start: "Beginn (Tag / Monat)",
    season_end: "Ende (Tag / Monat)", away_reset: "Abwesenheitszähler: Heizen startet wieder um",
    presence: "Anwesenheit", person: "Person", presence_hint: "Wenn der Zustand der Person wechselt zu …, wechsle auf Profil …",
    when_state: "Zustand", switch_to: "Profil", add_rule: "Regel hinzufügen", cutoff: "Außentemperatur-Abschaltung (global)",
    cutoff_enabled: "Aktiv", outdoor_sensor: "Außentemperatursensor", weather_entity: "Wetter-Entität (Ersatz)",
    off_after: "Aus nach (Min.)", on_after: "Wieder an nach (Min.)", offset: "Versatz (°C)",
    save_settings: "Einstellungen speichern", import_title: "Aus Schedy importieren",
    import_hint: "Schedy-YAML einfügen. Räume werden über die Thermostat-Entität zugeordnet.",
    create_rooms: "Fehlende Räume anlegen", import: "Importieren", report_profiles: "Profile",
    report_schedules: "Zeitpläne", report_created: "Räume angelegt", report_matched: "Räume zugeordnet",
    report_skipped: "Räume übersprungen", report_warnings: "Nicht importiert / Hinweise", none_option: "—",
    state_home: "zuhause", state_not_home: "unterwegs",
  },
);

export const SETTINGS_STYLE = `
  .form { display: grid; grid-template-columns: minmax(180px, 280px) 1fr; gap: 8px 12px; align-items: center; max-width: 720px; }
  .form .full { grid-column: 1 / -1; }
  textarea { width: 100%; min-height: 160px; box-sizing: border-box; font-family: monospace; padding: 8px;
    color: var(--primary-text-color); background: var(--secondary-background-color);
    border: 1px solid var(--divider-color); border-radius: 6px; }
  .report ul { margin: 4px 0 12px 18px; padding: 0; }
  .report .warn { color: var(--warning-color, #ef6c00); }
  section { margin-bottom: 28px; }
`;

function entityOptions(hass, prefix, filter = () => true) {
  return Object.keys(hass.states)
    .filter((id) => id.startsWith(prefix) && filter(hass.states[id]))
    .sort();
}

function entitySelect(hass, prefix, value, onchange, filter) {
  const ids = entityOptions(hass, prefix, filter);
  if (value && !ids.includes(value)) ids.unshift(value);
  return h("select", { onchange: (ev) => onchange(ev.target.value || null) },
    h("option", { value: "" }, "—"),
    ...ids.map((id) => h("option", { value: id, selected: id === value },
      hass.states[id]?.attributes?.friendly_name ? `${hass.states[id].attributes.friendly_name} (${id})` : id)));
}

function personStates(hass, T) {
  const states = [["home", T("state_home")], ["not_home", T("state_not_home")]];
  for (const id of entityOptions(hass, "zone.")) {
    if (id === "zone.home") continue;
    const name = hass.states[id].attributes.friendly_name || id.slice(5);
    states.push([name, name]);
  }
  return states;
}

export function renderSettings({ state, T, call, getHass, load, render }) {
  const hass = getHass();
  const data = state.data;
  if (!state.settingsDraft) state.settingsDraft = JSON.parse(JSON.stringify(data.settings));
  const s = state.settingsDraft;

  const num = (get, set, attrs = {}) => h("input", { type: "number", value: get(), ...attrs,
    onchange: (ev) => set(Number(ev.target.value)) });
  const row = (label, ...controls) => [h("label", {}, label), h("div", {}, ...controls)];

  const seasonSection = h("section", {}, h("h2", {}, T("season")),
    h("div", { class: "form" },
      ...row(T("season_start"),
        num(() => s.season_start[1], (v) => { s.season_start[1] = v; }, { min: 1, max: 31 }), " / ",
        num(() => s.season_start[0], (v) => { s.season_start[0] = v; }, { min: 1, max: 12 })),
      ...row(T("season_end"),
        num(() => s.season_end[1], (v) => { s.season_end[1] = v; }, { min: 1, max: 31 }), " / ",
        num(() => s.season_end[0], (v) => { s.season_end[0] = v; }, { min: 1, max: 12 })),
      ...row(T("away_reset"), h("input", { type: "time", value: (s.away_reset_time || "13:00").slice(0, 5),
        onchange: (ev) => { s.away_reset_time = ev.target.value; } }))));

  const states = personStates(hass, T);
  const ruleRows = s.presence_rules.map((rule, index) => h("div", { class: "block" },
    h("select", { onchange: (ev) => { rule.state = ev.target.value; } },
      ...[...states, ...(states.some(([v]) => v === rule.state) ? [] : [[rule.state, rule.state]])]
        .map(([value, label]) => h("option", { value, selected: value === rule.state }, label))),
    "→",
    h("select", { onchange: (ev) => { rule.profile = ev.target.value; } },
      ...data.profiles.map((p) => h("option", { value: p, selected: p === rule.profile }, p))),
    h("button", { class: "btn secondary", onclick: () => { s.presence_rules.splice(index, 1); render(); } }, "✕")));
  const presenceSection = h("section", {}, h("h2", {}, T("presence")),
    h("div", { class: "form" }, ...row(T("person"), entitySelect(hass, "person.", s.person_entity, (v) => { s.person_entity = v; }))),
    h("p", { class: "badge" }, T("presence_hint")),
    ...ruleRows,
    h("button", { class: "btn secondary", onclick: () => {
      s.presence_rules.push({ state: "home", profile: data.profiles[0] || "" }); render();
    } }, "+ " + T("add_rule")));

  const c = s.cutoff;
  const tempSensor = (st) => st.attributes.device_class === "temperature";
  const cutoffSection = h("section", {}, h("h2", {}, T("cutoff")),
    h("div", { class: "form" },
      ...row(T("cutoff_enabled"), h("input", { type: "checkbox", checked: c.enabled, onchange: (ev) => { c.enabled = ev.target.checked; } })),
      ...row(T("outdoor_sensor"), entitySelect(hass, "sensor.", c.outdoor_sensor, (v) => { c.outdoor_sensor = v; }, tempSensor)),
      ...row(T("weather_entity"), entitySelect(hass, "weather.", c.weather_entity, (v) => { c.weather_entity = v; })),
      ...row(T("off_after"), num(() => c.off_after_minutes, (v) => { c.off_after_minutes = v; }, { min: 0, step: 5 })),
      ...row(T("on_after"), num(() => c.on_after_minutes, (v) => { c.on_after_minutes = v; }, { min: 0, step: 5 })),
      ...row(T("offset"), num(() => c.offset, (v) => { c.offset = v; }, { step: 0.5 }))));

  const saveRow = h("div", { class: "row" },
    h("button", { class: "btn", onclick: async () => {
      await call({ type: "thermoplan/set_settings", settings: s }, "saved");
      state.settingsDraft = null;
      render();
    } }, T("save_settings")),
    state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null);

  // ---- import ----
  const textarea = h("textarea", { placeholder: "schedy_heating:\n  module: hass_apps_loader\n  ...", value: state.importText || "",
    oninput: (ev) => { state.importText = ev.target.value; } });
  const createRooms = h("input", { type: "checkbox", checked: state.importCreate !== false,
    onchange: (ev) => { state.importCreate = ev.target.checked; } });
  const importBtn = h("button", { class: "btn", onclick: async () => {
    try {
      state.importReport = await hass.callWS({ type: "thermoplan/import_schedy", yaml: textarea.value,
        create_rooms: createRooms.checked });
      state.importError = null;
      state.settingsDraft = null;
      setTimeout(load, 1500); // rooms are created asynchronously (entry reload)
    } catch (err) {
      state.importError = err?.message || String(err);
      state.importReport = null;
    }
    render();
  } }, T("import"));

  const list = (label, items, cls = "") => (items?.length
    ? [h("div", {}, h("strong", {}, label)), h("ul", { class: cls }, ...items.map((i) => h("li", {}, i)))] : []);
  const report = state.importReport;
  const reportEl = state.importError
    ? h("div", { class: "msg error" }, state.importError)
    : report ? h("div", { class: "report" },
      ...list(T("report_profiles"), report.profiles), ...list(T("report_schedules"), report.schedules),
      ...list(T("report_created"), report.rooms_created), ...list(T("report_matched"), report.rooms_matched),
      ...list(T("report_skipped"), report.rooms_skipped), ...list(T("report_warnings"), report.warnings, "warn")) : null;

  const importSection = h("section", {}, h("h2", {}, T("import_title")),
    h("p", { class: "badge" }, T("import_hint")), textarea,
    h("div", { class: "row" }, h("label", {}, createRooms, " " + T("create_rooms")), importBtn), reportEl);

  return h("div", {}, seasonSection, presenceSection, cutoffSection, saveRow, h("hr", {}), importSection);
}
