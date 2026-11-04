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
    pd: "Delay when leaving", pd_help: "Wait before switching profile when the person leaves (not when arriving home). If the state changes back within the delay, nothing happens. Avoids switching on short GPS drop-outs.",
    pd_minutes: "Wait (min)",
    fd: "Free days", fd_help: "Holidays and days off use the blocks of another weekday (default Sunday) instead of their own. Each source has its own switch; switching it off keeps the entity.",
    fd_workday: "Workday sensor", fd_workday_help: "The Workday integration. Off on a normal working weekday means a holiday; weekends are not affected.",
    fd_holiday: "Holiday sensor", fd_holiday_help: "A binary sensor that is on on public holidays.",
    fd_calendar: "Calendar", fd_calendar_help: "A free day when an event with one of these titles is active (comma separated, empty = any event).",
    fd_match: "Event title", fd_weekday: "Use the blocks of",
    wd_0: "Monday", wd_1: "Tuesday", wd_2: "Wednesday", wd_3: "Thursday", wd_4: "Friday", wd_5: "Saturday", wd_6: "Sunday",
    ca: "Away from calendar", ca_help: "Away while a calendar event with this title is active, until the event ends. Use a different title than for free days (e.g. Vacation versus Day off) so being at home on a day off does not count as away.",
    ca_entity: "Calendar",
    fc: "Forecast cutoff", fc_help: "Pause heating when today's forecast maximum is warm. Rooms whose outdoor cutoff is switched off are not affected.",
    fc_entity: "Weather entity", fc_max: "Pause from a maximum of (°C)",
    notify: "Notifications", notify_help: "Used for warnings such as a window that stays open too long. When switched off, warnings only appear in the log.",
    notify_service: "Send via", notify_service_help: "A notify service, e.g. your phone. Without one, a notification appears in Home Assistant.", notify_persistent: "Home Assistant notification",
    import_title: "Import from Schedy",
    import_hint: "Paste your Schedy YAML. Rooms are matched by thermostat entity. Anything that cannot be converted is listed afterwards.",
    create_rooms: "Create missing rooms", import: "Import", report_profiles: "Profiles",
    report_schedules: "Schedules", report_created: "Rooms created", report_matched: "Rooms matched",
    report_skipped: "Rooms skipped", report_warnings: "Not imported / warnings",
    importing: "Importing…", import_done: "Import finished", import_timeout: "No answer from Home Assistant after 30 seconds. Check the Log tab and the Home Assistant log.",
    import_empty: "Paste your Schedy YAML first.",
    preview_title: "Preview - nothing has been imported yet",
    preview_hint: "Press Import to apply this.", preview_failed: "This text cannot be imported",
    checking: "Checking…",
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
    pd: "Verzögerung beim Verlassen", pd_help: "Vor dem Profilwechsel warten, wenn die Person weggeht (nicht beim Heimkommen). Wechselt der Zustand innerhalb der Zeit zurück, passiert nichts. Verhindert Wechsel durch kurze GPS-Aussetzer.",
    pd_minutes: "Wartezeit (Min.)",
    fd: "Freie Tage", fd_help: "Feiertage und freie Tage verwenden die Blöcke eines anderen Wochentags (Standard Sonntag) statt ihrer eigenen. Jede Quelle hat einen eigenen Schalter; ausgeschaltet bleibt die Entität erhalten.",
    fd_workday: "Arbeitstag-Sensor", fd_workday_help: "Die Workday-Integration. Aus an einem normalen Arbeitstag bedeutet Feiertag; Wochenenden sind nicht betroffen.",
    fd_holiday: "Feiertag-Sensor", fd_holiday_help: "Ein Binärsensor, der an Feiertagen an ist.",
    fd_calendar: "Kalender", fd_calendar_help: "Ein freier Tag, wenn ein Termin mit einem dieser Titel aktiv ist (kommagetrennt, leer = jeder Termin).",
    fd_match: "Termintitel", fd_weekday: "Blöcke verwenden von",
    wd_0: "Montag", wd_1: "Dienstag", wd_2: "Mittwoch", wd_3: "Donnerstag", wd_4: "Freitag", wd_5: "Samstag", wd_6: "Sonntag",
    ca: "Abwesend per Kalender", ca_help: "Abwesend, solange ein Kalendertermin mit diesem Titel aktiv ist, bis der Termin endet. Nimm einen anderen Titel als für freie Tage (z. B. Urlaub statt Frei), damit ein freier Tag zuhause nicht als abwesend zählt.",
    ca_entity: "Kalender",
    fc: "Vorhersage-Abschaltung", fc_help: "Heizung pausieren, wenn das Tagesmaximum der Vorhersage warm ist. Räume mit ausgeschalteter Außentemperatur-Abschaltung sind nicht betroffen.",
    fc_entity: "Wetter-Entität", fc_max: "Pausieren ab einem Maximum von (°C)",
    notify: "Benachrichtigungen", notify_help: "Für Warnungen, z. B. wenn ein Fenster zu lange offen bleibt. Ausgeschaltet erscheinen Warnungen nur im Protokoll.",
    notify_service: "Senden über", notify_service_help: "Ein notify-Dienst, z. B. dein Handy. Ohne Auswahl erscheint eine Benachrichtigung in Home Assistant.", notify_persistent: "Home-Assistant-Benachrichtigung",
    import_title: "Aus Schedy importieren",
    import_hint: "Schedy-YAML einfügen. Räume werden über die Thermostat-Entität zugeordnet. Alles, was nicht umgewandelt werden kann, wird danach aufgelistet.",
    create_rooms: "Fehlende Räume anlegen", import: "Importieren", report_profiles: "Profile",
    report_schedules: "Zeitpläne", report_created: "Räume angelegt", report_matched: "Räume zugeordnet",
    report_skipped: "Räume übersprungen", report_warnings: "Nicht importiert / Hinweise",
    importing: "Importiere…", import_done: "Import abgeschlossen", import_timeout: "Keine Antwort von Home Assistant nach 30 Sekunden. Bitte Protokoll-Tab und Home-Assistant-Protokoll prüfen.",
    import_empty: "Bitte zuerst das Schedy-YAML einfügen.",
    preview_title: "Vorschau - noch nichts wurde importiert",
    preview_hint: "Mit Importieren wird das übernommen.", preview_failed: "Dieser Text kann nicht importiert werden",
    checking: "Prüfe…",
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
  .savebar { position: sticky; bottom: 0; padding: 12px 16px; margin-top: 8px; background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); }
  .field-row > div { min-width: 0; }
  .field-row .inline.src select, .field-row .inline.src input[type=text] { width: auto; flex: 1 1 160px; }
  .feature-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .feature-head h3 { margin: 0; font-size: 1.05em; font-weight: 500; }
  .card.feature.off .field-row { opacity: 0.5; }
  .card.feature.off .help { opacity: 0.7; }
  .muted { color: var(--secondary-text-color); font-size: 0.85em; }
  .field-row .inline { min-width: 0; }
  .field-row select.short { width: auto; min-width: 150px; flex: 0 0 auto; }
  .field-row select, .field-row input[type=text] { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; }
`;

const lang = (hass) => ((hass?.language || "en").startsWith("de") ? "de" : "en");

function monthName(hass, month) {
  return new Intl.DateTimeFormat(lang(hass), { month: "long" }).format(new Date(2000, month - 1, 1));
}

function entityIds(hass, prefix, filter = () => true) {
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  return Object.keys(hass.states)
    .filter((id) => prefixes.some((p) => id.startsWith(p)) && filter(hass.states[id]))
    .sort((a, b) => (hass.states[a].attributes.friendly_name || a).localeCompare(hass.states[b].attributes.friendly_name || b));
}

export function entitySelect(hass, prefix, value, onchange, filter) {
  const ids = entityIds(hass, prefix, filter);
  if (value && !ids.includes(value)) ids.unshift(value);
  return h("select", { onchange: (ev) => onchange(ev.target.value || null) },
    h("option", { value: "" }, "—"),
    ...ids.map((id) => h("option", { value: id, selected: id === value, title: id },
      hass.states[id]?.attributes?.friendly_name || id)));
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

// A card for an optional feature: its own on/off switch, the settings stay stored while it is off.
export const featureCard = (title, help, enabled, onToggle, ...rows) => h("div", { class: "card feature" + (enabled ? "" : " off") },
  h("div", { class: "feature-head" }, h("h3", {}, title), toggle(enabled, onToggle)),
  help ? h("p", { class: "help" }, help) : null, ...rows);

export const card = (title, help, ...rows) => h("div", { class: "card" }, h("h3", {}, title),
  help ? h("p", { class: "help" }, help) : null, ...rows);

export const fieldRow = (label, help, control) => h("div", { class: "field-row" },
  h("div", {}, h("div", { class: "label" }, label), help ? h("div", { class: "sub" }, help) : null),
  h("div", { class: "inline" }, control));

export const toggle = (checked, onchange) => h("label", { class: "switch" },
  h("input", { type: "checkbox", checked, onchange: (ev) => onchange(ev.target.checked) }), h("span"));

const FEATURE_DEFAULTS = {
  presence_delay: { enabled: false, minutes: 10 },
  workday: { enabled: false, entity: null }, holiday: { enabled: false, entity: null },
  free_calendar: { enabled: false, entity: null, match: "Frei" }, free_day: { weekday: 6 },
  calendar_away: { enabled: false, entity: null, match: "Urlaub" }, forecast: { enabled: false, entity: null, max_temp: 18 },
};

export function renderSettings({ state, T, call, getHass, render }) {
  const hass = getHass();
  const data = state.data;
  if (!state.settingsDraft) state.settingsDraft = JSON.parse(JSON.stringify(data.settings));
  const s = state.settingsDraft;
  const c = s.cutoff;
  s.features = s.features || {};
  const F = (name) => (s.features[name] = { ...FEATURE_DEFAULTS[name], ...(s.features[name] || {}) });
  // a row for one source: its own on/off switch next to the entity, so the entity can stay configured while off
  const sourceRow = (label, help, feat, ...controls) => h("div", { class: "field-row" },
    h("div", {}, h("div", { class: "label" }, label), help ? h("div", { class: "sub" }, help) : null),
    h("div", { class: "inline src" }, toggle(!!feat.enabled, (v) => { feat.enabled = v; render(); }), ...controls));
  const textInput = (feat, key) => h("input", { type: "text", value: feat[key] ?? "", style: "min-width:140px", onchange: (ev) => { feat[key] = ev.target.value; } });

  const num = (get, set, attrs = {}) => h("input", { type: "number", value: get() ?? "", ...attrs,
    onchange: (ev) => set(ev.target.value === "" ? null : Number(ev.target.value)) });
  const monthSelect = (get, set) => h("select", { class: "short", onchange: (ev) => { set(Number(ev.target.value)); render(); } },
    ...Array.from({ length: 12 }, (_, i) => h("option", { value: i + 1, selected: get() === i + 1 }, monthName(hass, i + 1))));
  const dateControl = (pair) => [
    num(() => pair[1], (v) => { pair[1] = v; render(); }, { min: 1, max: 31, style: "width:64px" }),
    monthSelect(() => pair[0], (v) => { pair[0] = v; }),
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

  const delayFeat = F("presence_delay");
  const delayCard = featureCard(T("pd"), T("pd_help"), !!delayFeat.enabled, (v) => { delayFeat.enabled = v; render(); },
    fieldRow(T("pd_minutes"), null, h("input", { type: "number", min: 1, step: 1, value: delayFeat.minutes, onchange: (ev) => { delayFeat.minutes = Math.max(1, Math.round(Number(ev.target.value) || 1)); } })));

  const wd = F("workday"), hol = F("holiday"), cal = F("free_calendar"), fday = F("free_day");
  const freeCard = card(T("fd"), T("fd_help"),
    sourceRow(T("fd_workday"), T("fd_workday_help"), wd,
      entitySelect(hass, "binary_sensor.", wd.entity, (v) => { wd.entity = v; }, (st) => "workdays" in st.attributes)),
    sourceRow(T("fd_holiday"), T("fd_holiday_help"), hol, entitySelect(hass, "binary_sensor.", hol.entity, (v) => { hol.entity = v; })),
    sourceRow(T("fd_calendar"), T("fd_calendar_help"), cal, entitySelect(hass, "calendar.", cal.entity, (v) => { cal.entity = v; }), textInput(cal, "match")),
    fieldRow(T("fd_weekday"), null, h("select", { class: "short", onchange: (ev) => { fday.weekday = Number(ev.target.value); } },
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => h("option", { value: i, selected: fday.weekday === i }, T("wd_" + i))))));

  const away = F("calendar_away");
  const calAwayCard = featureCard(T("ca"), T("ca_help"), !!away.enabled, (v) => { away.enabled = v; render(); },
    fieldRow(T("ca_entity"), null, entitySelect(hass, "calendar.", away.entity, (v) => { away.entity = v; })),
    fieldRow(T("fd_match"), null, textInput(away, "match")));

  const fore = F("forecast");
  const forecastCard = featureCard(T("fc"), T("fc_help"), !!fore.enabled, (v) => { fore.enabled = v; render(); },
    fieldRow(T("fc_entity"), null, entitySelect(hass, "weather.", fore.entity, (v) => { fore.entity = v; })),
    fieldRow(T("fc_max"), null, h("input", { type: "number", step: 0.5, value: fore.max_temp, onchange: (ev) => { fore.max_temp = Number(ev.target.value); } })));

  const notifyServices = Object.keys(hass.services?.notify || {}).filter((n) => n !== "send_message").sort();
  const notifyCard = featureCard(T("notify"), T("notify_help"), !!s.notify_enabled, (v) => { s.notify_enabled = v; render(); },
    fieldRow(T("notify_service"), T("notify_service_help"), h("select", { onchange: (ev) => { s.notify_service = ev.target.value || null; } },
      h("option", { value: "" }, T("notify_persistent")),
      ...[...new Set([...notifyServices.map((n) => `notify.${n}`), ...(s.notify_service ? [s.notify_service] : [])])].map((id) => h("option", { value: id, selected: id === s.notify_service }, id)))));

  const saveBar = h("div", { class: "savebar row" },
    h("button", { class: "btn", onclick: async () => {
      await call({ type: "thermoplan/set_settings", settings: s }, "saved");
      state.settingsDraft = null;
      render();
    } }, T("save_settings")),
    state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null);

  return h("div", {}, seasonCard, awayCard, presenceCard, delayCard, freeCard, calAwayCard, cutoffCard, forecastCard, notifyCard, saveBar);
}

export function renderImport({ state, T, getHass, load, render }) {
  const holder = h("div", {});
  const textarea = h("textarea", { placeholder: "schedy_heating:\n  module: hass_apps_loader\n  ...", value: state.importText || "" });
  const createRooms = h("input", { type: "checkbox", checked: state.importCreate !== false,
    onchange: (ev) => { state.importCreate = ev.target.checked; preview(); } });
  const importBtn = h("button", { class: "btn" }, T("import"));
  const status = h("span", { class: "msg" });

  const list = (label, items, cls = "") => (items?.length
    ? [h("div", {}, h("strong", {}, label)), h("ul", { class: cls }, ...items.map((i) => h("li", {}, i)))] : []);

  function paint() {
    const busy = !!state.importBusy;
    importBtn.disabled = busy || !textarea.value.trim();
    importBtn.textContent = busy ? T("importing") : T("import");
    status.textContent = busy ? T("importing") : state.importChecking ? T("checking") : "";
    const report = state.importReport;
    if (state.importError) {
      holder.replaceChildren(h("div", { class: "msg error", style: "margin:12px 0 0" }, state.importError));
      return;
    }
    if (!report) { holder.replaceChildren(); return; }
    const summary = `${report.profiles.length} ${T("report_profiles")}, ${report.schedules.length} ${T("report_schedules")}, `
      + `${report.rooms_created.length} ${T("report_created")}, ${report.rooms_matched.length} ${T("report_matched")}`;
    holder.replaceChildren(h("div", { class: "report", style: "margin-top:12px" },
      h("h3", { style: "margin:0 0 4px" }, report.dry_run ? T("preview_title") : T("import_done")),
      h("p", { class: "help", style: "margin:0 0 8px" }, summary + (report.dry_run ? " - " + T("preview_hint") : "")),
      ...list(T("report_profiles"), report.profiles), ...list(T("report_schedules"), report.schedules),
      ...list(T("report_created"), report.rooms_created), ...list(T("report_matched"), report.rooms_matched),
      ...list(T("report_skipped"), report.rooms_skipped), ...list(T("report_warnings"), report.warnings, "warn")));
  }

  let timer = null;
  let ticket = 0;
  // A dry run on the backend shows what an import would do as soon as text is pasted.
  async function runPreview() {
    const yaml = textarea.value;
    const mine = ++ticket;
    if (!yaml.trim()) { state.importReport = null; state.importError = null; state.importChecking = false; paint(); return; }
    state.importChecking = true; paint();
    try {
      const report = await getHass().callWS({ type: "thermoplan/import_schedy", yaml, create_rooms: createRooms.checked, dry_run: true });
      if (mine !== ticket) return;
      state.importReport = report; state.importError = null;
    } catch (err) {
      if (mine !== ticket) return;
      const text = err?.message || String(err);
      state.importError = `${T("preview_failed")}: ${text}${err?.code && err.code !== "unknown_error" ? ` (${err.code})` : ""}`;
      state.importReport = null;
    }
    state.importChecking = false;
    paint();
  }
  function preview() { clearTimeout(timer); timer = setTimeout(runPreview, 500); }

  textarea.addEventListener("input", () => { state.importText = textarea.value; state.importError = null; paint(); preview(); });
  importBtn.addEventListener("click", async () => {
    const yaml = textarea.value;
    if (!yaml.trim()) { state.importError = T("import_empty"); paint(); return; }
    ticket++; // drop pending previews
    state.importBusy = true; state.importError = null; paint();
    try {
      const call = getHass().callWS({ type: "thermoplan/import_schedy", yaml, create_rooms: createRooms.checked });
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(T("import_timeout"))), 30000));
      state.importReport = await Promise.race([call, timeout]);
      state.settingsDraft = null;
      setTimeout(() => load().catch(() => {}), 2000); // rooms are created asynchronously (entry reload)
    } catch (err) {
      const text = err?.message || (err?.code ? `${err.code}` : String(err));
      state.importError = err?.code && err.code !== "unknown_error" ? `${text} (${err.code})` : text;
    }
    state.importBusy = false;
    paint();
  });

  const out = h("div", {}, card(T("import_title"), T("import_hint"), textarea,
    h("div", { class: "row", style: "margin-top:12px" }, h("label", {}, createRooms, " " + T("create_rooms")), importBtn, status),
    holder));
  paint();
  if (textarea.value.trim() && !state.importReport && !state.importError) preview();
  return out;
}
