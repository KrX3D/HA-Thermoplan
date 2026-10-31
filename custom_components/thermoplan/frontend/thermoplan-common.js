// Shared helpers for the Thermoplan card and panel (no build step, no dependencies).

const STRINGS = {
  en: {
    profile: "Profile",
    away: "Away",
    away_days: "Days away",
    away_until: "Away until",
    set: "Set",
    back: "I'm back",
    season_on: "Heating season",
    season_off: "Outside heating season",
    rooms: "Rooms",
    col_current: "Current",
    col_set: "Thermostat",
    col_plan: "Plan",
    col_status: "Status",
    reset_override: "Reset",
    reset_all: "Reset all manual changes",
    manual: "Manual change",
    no_rooms: "No rooms yet. Add rooms in Settings > Devices & services > Thermoplan.",
    not_found: "Thermoplan entities not found.",
    off: "off",
    window: "Window open",
    override: "Manual change",
    outside_season: "Outside season",
    away_reason: "Away",
    outdoor_cutoff: "Outdoor cutoff",
    schedule_off: "Schedule: off",
    schedule: "Schedule",
    default: "Default",
  },
  de: {
    profile: "Profil",
    away: "Abwesend",
    away_days: "Tage abwesend",
    away_until: "Abwesend bis",
    set: "Setzen",
    back: "Ich bin zurück",
    season_on: "Heizperiode",
    season_off: "Außerhalb der Heizperiode",
    rooms: "Räume",
    col_current: "Ist",
    col_set: "Thermostat",
    col_plan: "Plan",
    col_status: "Status",
    reset_override: "Zurücksetzen",
    reset_all: "Alle manuellen Änderungen zurücksetzen",
    manual: "Manuelle Änderung",
    no_rooms: "Noch keine Räume. Räume unter Einstellungen > Geräte & Dienste > Thermoplan hinzufügen.",
    not_found: "Thermoplan-Entitäten nicht gefunden.",
    off: "aus",
    window: "Fenster offen",
    override: "Manuelle Änderung",
    outside_season: "Außerhalb der Heizperiode",
    away_reason: "Abwesend",
    outdoor_cutoff: "Außentemperatur",
    schedule_off: "Zeitplan: aus",
    schedule: "Zeitplan",
    default: "Standard",
  },
};

export function addStrings(en, de) {
  Object.assign(STRINGS.en, en);
  Object.assign(STRINGS.de, de);
}

export function tr(hass, key) {
  const lang = (hass?.language || "en").startsWith("de") ? "de" : "en";
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
}

// Find the Thermoplan entities through the entity registry the frontend already has.
export function discover(hass) {
  const found = { profile: null, away: null, awayUntil: null, season: null, clearAll: null, rooms: [] };
  const roomButtons = {};
  for (const [entityId, entry] of Object.entries(hass?.entities || {})) {
    if (entry.platform !== "thermoplan") continue;
    const key = entry.translation_key;
    if (key === "profile") found.profile = entityId;
    else if (key === "away_days") found.away = entityId;
    else if (key === "away_until") found.awayUntil = entityId;
    else if (key === "heating_season") found.season = entityId;
    else if (key === "clear_all_overrides") found.clearAll = entityId;
    else if (key === "clear_override") roomButtons[entry.device_id] = entityId;
    else if (key === "room_target") {
      const device = hass.devices?.[entry.device_id];
      const state = hass.states[entityId];
      found.rooms.push({
        entityId,
        deviceId: entry.device_id,
        name: device?.name_by_user || device?.name || state?.attributes?.friendly_name || entityId,
      });
    }
  }
  for (const room of found.rooms) room.button = roomButtons[room.deviceId] || null;
  found.rooms.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}

export const STYLE = `
  :host { display: block; }
  ha-card, .wrap { padding: 16px; }
  .wrap { background: var(--card-background-color, #fff); color: var(--primary-text-color); }
  h2 { margin: 0 0 12px; font-size: 1.1em; font-weight: 500; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .chip {
    border: 1px solid var(--divider-color); border-radius: 16px; padding: 6px 14px;
    background: transparent; color: var(--primary-text-color); cursor: pointer; font: inherit;
  }
  .chip.active { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .badge { font-size: 0.85em; color: var(--secondary-text-color); }
  .badge.on { color: var(--success-color, #2e7d32); }
  .row.away { align-items: flex-end; }
  .row.away .btn, .row.away .away-input { height: 34px; box-sizing: border-box; }
  .row.away .badge { line-height: 34px; }
  .field { display: flex; flex-direction: column; gap: 2px; font-size: 0.8em; color: var(--secondary-text-color); }
  .away-input.wide { width: 150px; }
  .away-input { width: 70px; padding: 6px; font: inherit; color: var(--primary-text-color);
    background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 6px; }
  .btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; font: inherit;
    background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: right; font-weight: 400; font-size: 0.8em; color: var(--secondary-text-color); padding: 4px; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 10px 4px; border-top: 1px solid var(--divider-color); text-align: right; white-space: nowrap; }
  td.temp { font-weight: 500; }
  td.status { text-align: left; padding-left: 16px; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8em;
    background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .pill.warn { background: var(--warning-color, #ef6c00); color: #fff; }
  .pill.ok { background: var(--success-color, #2e7d32); color: #fff; }
  .mini { padding: 2px 8px; font-size: 0.8em; margin-left: 6px; }
  .empty { color: var(--secondary-text-color); padding: 8px 0; }
`;

// Build the overview DOM once and return an update(hass) function.
export function mountOverview(root, getHass, { showTitle = true, title = "Thermoplan" } = {}) {
  root.innerHTML = `
    ${showTitle ? `<h2></h2>` : ""}
    <div class="empty" data-ref="missing" hidden></div>
    <div class="row" data-ref="profiles"></div>
    <div class="row away" data-ref="awayRow">
      <label class="field"><span data-ref="untilLabel"></span>
        <input class="away-input wide" type="date" data-ref="untilInput" /></label>
      <label class="field"><span data-ref="awayLabel"></span>
        <input class="away-input" type="number" min="0" max="365" step="1" data-ref="awayInput" /></label>
      <button class="btn secondary" data-ref="awayBack"></button>
      <span class="badge" data-ref="season"></span>
    </div>
    <h2 data-ref="roomsTitle"></h2>
    <table><thead data-ref="head"></thead><tbody data-ref="rooms"></tbody></table>
    <div class="row" style="margin-top:12px"><button class="btn secondary" data-ref="resetAll"></button></div>
  `;
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const el = {
    missing: ref("missing"), profiles: ref("profiles"), awayRow: ref("awayRow"),
    awayLabel: ref("awayLabel"), awayInput: ref("awayInput"), untilLabel: ref("untilLabel"),
    untilInput: ref("untilInput"), awayBack: ref("awayBack"), season: ref("season"), roomsTitle: ref("roomsTitle"),
    rooms: ref("rooms"), head: ref("head"), resetAll: ref("resetAll"),
  };
  if (showTitle) root.querySelector("h2").textContent = title;

  let entities = discover(getHass());
  // Inputs are applied on change, and are not overwritten from state while being edited.
  const editing = new Set();
  for (const input of [el.awayInput, el.untilInput]) {
    input.addEventListener("input", () => editing.add(input));
    input.addEventListener("blur", () => setTimeout(() => editing.delete(input), 300));
  }
  el.awayInput.addEventListener("change", () => {
    if (!entities.away) return;
    const days = Math.max(0, Number(el.awayInput.value || 0));
    getHass().callService("number", "set_value", { entity_id: entities.away, value: days })
      .finally(() => editing.delete(el.awayInput));
  });
  el.untilInput.addEventListener("change", () => {
    if (!entities.awayUntil || !el.untilInput.value) return;
    getHass().callService("date", "set_value", { entity_id: entities.awayUntil, date: el.untilInput.value })
      .finally(() => editing.delete(el.untilInput));
  });
  el.resetAll.addEventListener("click", () => {
    if (entities.clearAll) getHass().callService("button", "press", { entity_id: entities.clearAll });
  });
  el.awayBack.addEventListener("click", () => {
    if (entities.away) getHass().callService("number", "set_value", { entity_id: entities.away, value: 0 });
  });

  return function update(hass) {
    entities = discover(hass);
    const missing = !entities.profile && !entities.away && !entities.rooms.length;
    el.missing.hidden = !missing;
    el.missing.textContent = tr(hass, "not_found");

    // Profiles
    const profileState = entities.profile && hass.states[entities.profile];
    const options = profileState?.attributes?.options || [];
    el.profiles.hidden = !options.length;
    const sig = options.join("|") + "#" + (profileState?.state ?? "");
    if (el.profiles.dataset.sig !== sig) {
      el.profiles.dataset.sig = sig;
      el.profiles.replaceChildren(...options.map((option) => {
        const b = document.createElement("button");
        b.className = "chip" + (option === profileState.state ? " active" : "");
        b.textContent = option;
        b.addEventListener("click", () => hass.callService("select", "select_option", {
          entity_id: entities.profile, option,
        }));
        return b;
      }));
    }

    // Away + season
    el.awayLabel.textContent = tr(hass, "away_days");
    el.untilLabel.textContent = tr(hass, "away_until");
    el.awayBack.textContent = tr(hass, "back");
    el.awayRow.hidden = !entities.away && !entities.awayUntil;
    const away = entities.away && hass.states[entities.away];
    if (away && !editing.has(el.awayInput)) el.awayInput.value = away.state;
    const until = entities.awayUntil && hass.states[entities.awayUntil];
    if (until && !editing.has(el.untilInput)) {
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      el.untilInput.value = /^\d{4}-\d{2}-\d{2}$/.test(until.state) ? until.state : today;
    }
    const season = entities.season && hass.states[entities.season];
    el.season.textContent = season ? tr(hass, season.state === "on" ? "season_on" : "season_off") : "";
    el.season.classList.toggle("on", season?.state === "on");

    // Rooms
    el.roomsTitle.textContent = tr(hass, "rooms");
    el.roomsTitle.hidden = !entities.rooms.length && !!missing;
    el.resetAll.textContent = tr(hass, "reset_all");
    el.resetAll.hidden = !entities.clearAll || !entities.rooms.length;
    el.head.replaceChildren(...(entities.rooms.length ? [(() => {
      const row = document.createElement("tr");
      for (const key of ["rooms", "col_current", "col_set", "col_plan", "col_status"]) {
        const th = document.createElement("th");
        th.textContent = key === "rooms" ? "" : tr(hass, key);
        if (key === "col_status") th.style.textAlign = "left";
        row.append(th);
      }
      return row;
    })()] : []));
    const fmt = (value) => (value === null || value === undefined || Number.isNaN(Number(value)) ? "–" : `${Number(value).toFixed(1)} °C`);
    el.rooms.replaceChildren(...(entities.rooms.length ? entities.rooms.map((room) => {
      const state = hass.states[room.entityId];
      const attrs = state?.attributes || {};
      const climate = attrs.climate_entity && hass.states[attrs.climate_entity];
      const reason = attrs.reason;
      const row = document.createElement("tr");
      row.innerHTML = `<td></td><td class="temp"></td><td></td><td></td><td class="status"></td>`;
      row.children[0].textContent = room.name;
      row.children[1].textContent = fmt(climate?.attributes?.current_temperature);
      row.children[2].textContent = !climate ? "–" : climate.state === "off" ? tr(hass, "off") : fmt(climate.attributes.temperature);
      row.children[3].textContent = attrs.schedule_target === null || attrs.schedule_target === undefined ? tr(hass, "off") : fmt(attrs.schedule_target);
      const pill = document.createElement("span");
      pill.className = "pill" + (reason === "override" ? " warn" : reason === "schedule" || reason === "default" ? " ok" : "");
      pill.textContent = reason ? tr(hass, reason === "away" ? "away_reason" : reason) : "";
      row.children[4].append(pill);
      if (reason === "override" && room.button) {
        const btn = document.createElement("button");
        btn.className = "btn secondary mini";
        btn.textContent = tr(hass, "reset_override");
        btn.addEventListener("click", () => hass.callService("button", "press", { entity_id: room.button }));
        row.children[4].append(btn);
      }
      return row;
    }) : []));
    if (!entities.rooms.length && !missing) {
      const row = document.createElement("tr");
      row.innerHTML = `<td class="empty"></td>`;
      row.firstChild.textContent = tr(hass, "no_rooms");
      el.rooms.replaceChildren(row);
    }
  };
}

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node[key] = value;
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

