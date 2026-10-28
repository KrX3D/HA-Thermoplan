// Settings and Schedy import tabs.
import { addStrings, h } from "./thermoplan-common.js";

addStrings(
  {
    tab_settings: "Settings", tab_import: "Schedy import",
    season: "Heating season", season_help: "Outside this period all rooms stay off.",
    season_start: "Start", season_end: "End", day: "Day", month: "Month",
    away: "Away", away_help: "Set \"Away until\" or \"Days away\" on the Overview. While away, rooms follow the profile below, or stay off.",
    away_reset: "Heating resumes at", away_reset_help: "Time of day on the return date.",
    away_profile: "Profile while away", away_profile_help: "e.g. a basic-warmth profile. \"All off\" switches every room off.",
    away_profile_none: "All off",
    presence: "Presence", presence_help: "Switch profile when the person's state changes. Leave the person empty to disable.",
    person: "Person", when_state: "State", switch_to: "Profile", add_rule: "Add rule",
    cutoff: "Outdoor cutoff", cutoff_help: "Switch heating off when it is warm outside. Rooms can use these settings or their own.",
    cutoff_enabled: "Enabled", outdoor_sensor: "Outdoor temperature sensor",
    outdoor_sensor_help: "Used first. Only temperature sensors are listed.",
    weather_entity: "Weather entity (fallback)", weather_entity_help: "Used only if the outdoor sensor is unavailable.",
    threshold: "Fixed outdoor temperature", threshold_help: "Optional. Empty = use each room's current target temperature.",
    off_after: "Turn off after (min)", off_after_help: "Outdoor temperature stays at or above the limit this long.",
    on_after: "Turn on again after (min)", on_after_help: "Outdoor temperature stays below the limit this long.",
    offset: "Offset (°C)", offset_help: "Added to the limit before comparing.",
    save_settings: "Save settings",
    import_title: "Import from Schedy",
    import_hint: "Paste your Schedy YAML. Rooms are matched by thermostat entity. Anything that cannot be converted is listed afterwards.",
    create_rooms: "Create missing rooms", import: "Import", report_profiles: "Profiles",
    report_schedules: "Schedules", report_created: "Rooms created", report_matched: "Rooms matched",
    report_skipped: "Rooms skipped", report_warnings: "Not imported / warnings",
    state_home: "home", state_not_home: "not_home",
  },
  {
    tab_settings: "Einstellungen", tab_import: "Schedy-Import",
    season: "Heizperiode", season_help: "Außerhalb dieses Zeitraums bleiben alle Räume aus.",
    season_start: "Beginn", season_end: "Ende", day: "Tag", month: "Monat",
    away: "Abwesenheit", away_help: "\"Abwesend bis\" oder \"Tage abwesend\" in der Übersicht setzen. Während der Abwesenheit gilt das Profil unten oder alles bleibt aus.",
    away_reset: "Heizen startet wieder um", away_reset_help: "Uhrzeit am Rückkehrtag.",
    away_profile: "Profil bei Abwesenheit", away_profile_help: "z. B. ein Grundwärme-Profil. \"Alles aus\" schaltet jeden Raum aus.",
    away_profile_none: "Alles aus",
    presence: "Anwesenheit", presence_help: "Profil wechseln, wenn sich der Zustand der Person ändert. Person leer lassen zum Deaktivieren.",
    person: "Person", when_state: "Zustand", switch_to: "Profil", add_rule: "Regel hinzufügen",
    cutoff: "Außentemperatur-Abschaltung", cutoff_help: "Heizung ausschalten, wenn es draußen warm ist. Räume können diese oder eigene Einstellungen nutzen.",
    cutoff_enabled: "Aktiv", outdoor_sensor: "Außentemperatursensor",
    outdoor_sensor_help: "Wird zuerst verwendet. Es werden nur Temperatursensoren angezeigt.",
    weather_entity: "Wetter-Entität (Fallback)", weather_entity_help: "Wird nur verwendet, wenn der Außensensor nicht verfügbar ist.",
    threshold: "Feste Außentemperatur", threshold_help: "Optional. Leer = aktuelle Solltemperatur des jeweiligen Raums.",
    off_after: "Ausschalten nach (Min.)", off_after_help: "Außentemperatur bleibt so lange auf oder über der Grenze.",
    on_after: "Wieder einschalten nach (Min.)", on_after_help: "Außentemperatur bleibt so lange unter der Grenze.",
    offset: "Versatz (°C)", offset_help: "Wird vor dem Vergleich zur Grenze addiert.",
    save_settings: "Einstellungen speichern",
    import_title: "Aus Schedy importieren",
    import_hint: "Schedy-YAML einfügen. Räume werden über die Thermostat-Entität zugeordnet. Alles, was nicht umgewandelt werden kann, wird danach aufgelistet.",
    create_rooms: "Fehlende Räume anlegen", import: "Importieren", report_profiles: "Profile",
    report_schedules: "Zeitpläne", report_created: "Räume angelegt", report_matched: "Räume zugeordnet",
    report_skipped: "Räume übersprungen", report_warnings: "Nicht importiert / Hinweise",
    state_home: "zuhause", state_not_home: "unterwegs",
  },
);

export const SETTINGS_STYLE = `
  .card { background: var(--card-background-color); border: 1px solid var(--divider-color);
    border-radius: var(--ha-card-border-radius, 12px); padding: 16px 20px; margin-bottom: 16px; }
  .card > h3 { margin: 0 0 2px; font-size: 1.05em; font-weight: 500; }
  .card > .help { margin: 0 0 12px; color: var(--secondary-text-color); font-size: 0.9em; }
  .field-row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(180px, 1.2fr); gap: 4px 16px;
    align-items: center; padding: 8px 0; border-top: 1px solid var(--divider-color); }
  .field-row:first-of-type { border-top: none; }
  .field-row .label { font-weight: 500; }
  .field-row .sub { color: var(--secondary-text-color); font-size: 0.85em; font-weight: 400; }
  @media (max-width: 640px) { .field-row { grid-template-columns: 1fr; } }
  .inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .summary { color: var(--primary-color); font-weight: 500; font-size: 0.9em; }
  .switch { position: relative; display: inline-block; width: 42px; height: 24px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch span { position: absolute; inset: 0; background: var(--disabled-color, #bdbdbd); border-radius: 24px; cursor: pointer; transition: .2s; }
  .switch span::before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px;
    background: #fff; border-radius: 50%; transition: .2s; }
  .switch input:checked + span { background: var(--primary-color); }
  .switch input:checked + span::before { transform: translateX(18px); }
  textarea { width: 100%; min-height: 220px; box-sizing: border-box; font-family: monospace; padding: 8px;
    color: var(--primary-text-color); background: var(--secondary-background-color);
    border: 1px solid var(--divider-color); border-radius: 6px; }
  .report ul { margin: 4px 0 12px 18px; padding: 0; }
  .report .warn { color: var(--warning-color, #ef6c00); }
  .savebar { position: sticky; bottom: 0; padding: 12px 0; background: var(--primary-background-color); }
`;

const lang = (hass) => ((hass?.language || "en").startsWith("de") ? "de" : "en");

function monthName(hass, month) {
  return new Intl.DateTimeFormat(lang(hass), { month: "long" }).format(new Date(2000, month - 1, 1));
}

function dayMonthLabel(hass, [month, day]) {
  return new Intl.DateTimeFormat(lang(hass), { day: "numeric", month: "long" }).format(new Date(2000, month - 1, day));
}

function entityIds(hass, prefix, filter = () => true) {
  return Object.keys(hass.states)
    .filter((id) => id.startsWith(prefix) && filter(hass.states[id]))
    .sort((a, b) => (hass.states[a].attributes.friendly_name || a).localeCompare(hass.states[b].attributes.friendly_name || b));
}

export function entitySelect(hass, prefix, value, onchange, filter) {
  const ids = entityIds(hass, prefix, filter);
  if (value && !ids.includes(value)) ids.unshift(value);
  return h("select", { onchange: (ev) => onchange(ev.target.value || null) },
    h("option", { value: "" }, "—"),
    ...ids.map((id) => h("option", { value: id, selected: id === value },
      hass.states[id]?.attributes?.friendly_name ? `${hass.states[id].attributes.friendly_name} (${id})` : id)));
}

function personStates(hass, T) {
  const states = [["home", T("state_home")], ["not_home", T("state_not_home")]];
  for (const id of entityIds(hass, "zone.")) {
    if (id === "zone.home") continue;
    const name = hass.states[id].attributes.friendly_name || id.slice(5);
    states.push([name, name]);
  }
  return states;
}

export const card = (title, help, ...rows) => h("div", { class: "card" }, h("h3", {}, title),
  help ? h("p", { class: "help" }, help) : null, ...rows);

export const fieldRow = (label, help, control) => h("div", { class: "field-row" },
  h("div", {}, h("div", { class: "label" }, label), help ? h("div", { class: "sub" }, help) : null),
  h("div", { class: "inline" }, control));

const toggle = (checked, onchange) => h("label", { class: "switch" },
  h("input", { type: "checkbox", checked, onchange: (ev) => onchange(ev.target.checked) }), h("span"));

export function renderSettings({ state, T, call, getHass, render }) {
  const hass = getHass();
  const data = state.data;
  if (!state.settingsDraft) state.settingsDraft = JSON.parse(JSON.stringify(data.settings));
  const s = state.settingsDraft;
  const c = s.cutoff;

  const num = (get, set, attrs = {}) => h("input", { type: "number", value: get() ?? "", ...attrs,
    onchange: (ev) => set(ev.target.value === "" ? null : Number(ev.target.value)) });
  const monthSelect = (get, set) => h("select", { onchange: (ev) => { set(Number(ev.target.value)); render(); } },
    ...Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1, selected: get() === i + 1 }, monthName(hass, i + 1))));
  const dateControl = (pair) => [
    num(() => pair[1], (v) => { pair[1] = v; render(); }, { min: 1, max: 31, style: "width:64px" }),
    monthSelect(() => pair[0], (v) => { pair[0] = v; }),
    h("span", { class: "summary" }, dayMonthLabel(hass, pair)),
  ];

  const seasonCard = card(T("season"), T("season_help"),
    fieldRow(T("season_start"), null, dateControl(s.season_start)),
    fieldRow(T("season_end"), null, dateControl(s.season_end)));

  const awayCard = card(T("away"), T("away_help"),
    fieldRow(T("away_reset"), T("away_reset_help"), h("input", { type: "time", value: (s.away_reset_time || "13:00").slice(0, 5),
      onchange: (ev) => { s.away_reset_time = ev.target.value; } })),
    fieldRow(T("away_profile"), T("away_profile_help"), h("select", { onchange: (ev) => { s.away_profile = ev.target.value || null; } },
      h("option", { value: "" }, T("away_profile_none")),
      ...data.profiles.map((p) => h("option", { value: p, selected: p === s.away_profile }, p)))));

  const states = personStates(hass, T);
  const ruleRows = s.presence_rules.map((rule, index) => h("div", { class: "inline", style: "margin:6px 0" },
    h("select", { onchange: (ev) => { rule.state = ev.target.value; } },
      ...[...states, ...(states.some(([v]) => v === rule.state) ? [] : [[rule.state, rule.state]])]
        .map(([value, label]) => h("option", { value, selected: value === rule.state }, label))),
    "→",
    h("select", { onchange: (ev) => { rule.profile = ev.target.value; } },
      ...data.profiles.map((p) => h("option", { value: p, selected: p === rule.profile }, p))),
    h("button", { class: "btn secondary", onclick: () => { s.presence_rules.splice(index, 1); render(); } }, "✕")));
  const presenceCard = card(T("presence"), T("presence_help"),
    fieldRow(T("person"), null, entitySelect(hass, "person.", s.person_entity, (v) => { s.person_entity = v; render(); })),
    s.person_entity ? h("div", {}, ...ruleRows,
      h("button", { class: "btn secondary", onclick: () => {
        s.presence_rules.push({ state: "home", profile: data.profiles[0] || "" }); render();
      } }, "+ " + T("add_rule"))) : null);

  const tempSensor = (st) => st.attributes.device_class === "temperature";
  const cutoffCard = card(T("cutoff"), T("cutoff_help"),
    fieldRow(T("cutoff_enabled"), null, toggle(c.enabled, (v) => { c.enabled = v; })),
    fieldRow(T("outdoor_sensor"), T("outdoor_sensor_help"), entitySelect(hass, "sensor.", c.outdoor_sensor, (v) => { c.outdoor_sensor = v; }, tempSensor)),
    fieldRow(T("weather_entity"), T("weather_entity_help"), entitySelect(hass, "weather.", c.weather_entity, (v) => { c.weather_entity = v; })),
    fieldRow(T("threshold"), T("threshold_help"), [num(() => c.threshold, (v) => { c.threshold = v; }, { step: 0.5 }), "°C"]),
    fieldRow(T("off_after"), T("off_after_help"), num(() => c.off_after_minutes, (v) => { c.off_after_minutes = v ?? 0; }, { min: 0, step: 5 })),
    fieldRow(T("on_after"), T("on_after_help"), num(() => c.on_after_minutes, (v) => { c.on_after_minutes = v ?? 0; }, { min: 0, step: 5 })),
    fieldRow(T("offset"), T("offset_help"), num(() => c.offset, (v) => { c.offset = v ?? 0; }, { step: 0.5 })));

  const saveBar = h("div", { class: "savebar row" },
    h("button", { class: "btn", onclick: async () => {
      await call({ type: "thermoplan/set_settings", settings: s }, "saved");
      state.settingsDraft = null;
      render();
    } }, T("save_settings")),
    state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null);

  return h("div", {}, seasonCard, awayCard, presenceCard, cutoffCard, saveBar);
}

export function renderImport({ state, T, getHass, load, render }) {
  const hass = getHass();
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

  return h("div", {}, card(T("import_title"), T("import_hint"), textarea,
    h("div", { class: "row", style: "margin-top:12px" }, h("label", {}, createRooms, " " + T("create_rooms")), importBtn),
    reportEl));
}
