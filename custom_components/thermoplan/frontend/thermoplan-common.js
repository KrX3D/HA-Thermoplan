// Shared helpers for the Thermoplan card and panel (no build step, no dependencies).

const STRINGS = {
  en: {
    profile: "Profile",
    away: "Away",
    away_days: "Away days",
    set: "Set",
    back: "I'm back",
    season_on: "Heating season",
    season_off: "Outside heating season",
    rooms: "Rooms",
    no_rooms: "No rooms yet. Add rooms in Settings > Devices & services > Thermoplan.",
    not_found: "Thermoplan entities not found.",
    off: "off",
    window: "Window open",
    override: "Manual override",
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
    set: "Setzen",
    back: "Ich bin zurück",
    season_on: "Heizperiode",
    season_off: "Außerhalb der Heizperiode",
    rooms: "Räume",
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

export function tr(hass, key) {
  const lang = (hass?.language || "en").startsWith("de") ? "de" : "en";
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
}

// Find the Thermoplan entities through the entity registry the frontend already has.
export function discover(hass) {
  const found = { profile: null, away: null, season: null, rooms: [] };
  for (const [entityId, entry] of Object.entries(hass?.entities || {})) {
    if (entry.platform !== "thermoplan") continue;
    const key = entry.translation_key;
    if (key === "profile") found.profile = entityId;
    else if (key === "away_days") found.away = entityId;
    else if (key === "heating_season") found.season = entityId;
    else if (key === "room_target") {
      const device = hass.devices?.[entry.device_id];
      const state = hass.states[entityId];
      found.rooms.push({
        entityId,
        name: device?.name_by_user || device?.name || state?.attributes?.friendly_name || entityId,
      });
    }
  }
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
  .away-input { width: 70px; padding: 6px; font: inherit; color: var(--primary-text-color);
    background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 6px; }
  .btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; font: inherit;
    background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .btn.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 4px; border-top: 1px solid var(--divider-color); }
  td.temp { text-align: right; font-weight: 500; white-space: nowrap; }
  td.reason { color: var(--secondary-text-color); font-size: 0.85em; }
  .empty { color: var(--secondary-text-color); padding: 8px 0; }
`;

// Build the overview DOM once and return an update(hass) function.
export function mountOverview(root, getHass, { showTitle = true, title = "Thermoplan" } = {}) {
  root.innerHTML = `
    ${showTitle ? `<h2></h2>` : ""}
    <div class="empty" data-ref="missing" hidden></div>
    <div class="row" data-ref="profiles"></div>
    <div class="row" data-ref="awayRow">
      <span data-ref="awayLabel"></span>
      <input class="away-input" type="number" min="0" max="365" step="1" data-ref="awayInput" />
      <button class="btn" data-ref="awaySet"></button>
      <button class="btn secondary" data-ref="awayBack"></button>
      <span class="badge" data-ref="season"></span>
    </div>
    <h2 data-ref="roomsTitle"></h2>
    <table><tbody data-ref="rooms"></tbody></table>
  `;
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const el = {
    missing: ref("missing"), profiles: ref("profiles"), awayRow: ref("awayRow"),
    awayLabel: ref("awayLabel"), awayInput: ref("awayInput"), awaySet: ref("awaySet"),
    awayBack: ref("awayBack"), season: ref("season"), roomsTitle: ref("roomsTitle"),
    rooms: ref("rooms"),
  };
  if (showTitle) root.querySelector("h2").textContent = title;

  let entities = discover(getHass());
  el.awaySet.addEventListener("click", () => {
    const hass = getHass();
    if (!entities.away) return;
    hass.callService("number", "set_value", {
      entity_id: entities.away, value: Number(el.awayInput.value || 0),
    });
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
    el.awaySet.textContent = tr(hass, "set");
    el.awayBack.textContent = tr(hass, "back");
    el.awayRow.hidden = !entities.away;
    const away = entities.away && hass.states[entities.away];
    if (away && document.activeElement !== el.awayInput && root.getRootNode().activeElement !== el.awayInput) {
      el.awayInput.value = away.state;
    }
    const season = entities.season && hass.states[entities.season];
    el.season.textContent = season ? tr(hass, season.state === "on" ? "season_on" : "season_off") : "";
    el.season.classList.toggle("on", season?.state === "on");

    // Rooms
    el.roomsTitle.textContent = tr(hass, "rooms");
    el.roomsTitle.hidden = !entities.rooms.length && !!missing;
    el.rooms.replaceChildren(...(entities.rooms.length ? entities.rooms.map((room) => {
      const state = hass.states[room.entityId];
      const tr_ = document.createElement("tr");
      const value = state && state.state !== "unknown" && state.state !== "unavailable"
        ? `${state.state} °C` : tr(hass, "off");
      const reason = state?.attributes?.reason;
      tr_.innerHTML = `<td></td><td class="temp"></td><td class="reason"></td>`;
      tr_.children[0].textContent = room.name;
      tr_.children[1].textContent = reason === "override" ? "—" : value;
      tr_.children[2].textContent = reason ? tr(hass, reason === "away" ? "away_reason" : reason) : "";
      return tr_;
    }) : []));
    if (!entities.rooms.length && !missing) {
      const row = document.createElement("tr");
      row.innerHTML = `<td class="empty"></td>`;
      row.firstChild.textContent = tr(hass, "no_rooms");
      el.rooms.replaceChildren(row);
    }
  };
}
