// Schedule, profile and plan editor (used by the panel).
import { tr, addStrings, h } from "./thermoplan-common.js";
import { renderSettings, renderImport, SETTINGS_STYLE } from "./thermoplan-settings.js";
import { renderRooms } from "./thermoplan-rooms.js";
import { renderLog, LOG_STYLE } from "./thermoplan-log.js";
import { renderScheduleEditor, SCHEDULE_STYLE } from "./thermoplan-schedule-editor.js";

addStrings(
  {
    tab_overview: "Overview", tab_schedules: "Schedules", tab_plans: "Plans",
    schedules: "Schedules", new_schedule: "New schedule", name: "Name",
    default_target: "Outside of blocks", off_option: "Off", save: "Save", delete: "Delete",
    add_block: "Add block", copy_to: "Copy this day to", copy: "Copy", from: "From", to: "To",
    next_day: "+1 day", temperature: "°C", target_off: "Off", saved: "Saved",
    confirm_delete: "Delete this schedule?", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    profiles: "Profiles", add_profile: "Add profile", rename: "Rename", remove: "Remove",
    profile_name: "Profile name", plans: "Which schedule applies per room and profile",
    none: "— none —", no_schedules: "No schedules yet.", no_profiles: "No profiles yet.",
    confirm_remove: "Remove this profile? Its room assignments are lost.",
    prompt_rename: "New name for the profile", loading: "Loading…",
  },
  {
    tab_overview: "Übersicht", tab_schedules: "Zeitpläne", tab_plans: "Zuordnung",
    schedules: "Zeitpläne", new_schedule: "Neuer Zeitplan", name: "Name",
    default_target: "Außerhalb der Blöcke", off_option: "Aus", save: "Speichern", delete: "Löschen",
    add_block: "Block hinzufügen", copy_to: "Diesen Tag kopieren nach", copy: "Kopieren", from: "Von", to: "Bis",
    next_day: "+1 Tag", temperature: "°C", target_off: "Aus", saved: "Gespeichert",
    confirm_delete: "Diesen Zeitplan löschen?", days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    profiles: "Profile", add_profile: "Profil hinzufügen", rename: "Umbenennen", remove: "Entfernen",
    profile_name: "Profilname", plans: "Welcher Zeitplan gilt pro Raum und Profil",
    none: "— keiner —", no_schedules: "Noch keine Zeitpläne.", no_profiles: "Noch keine Profile.",
    confirm_remove: "Dieses Profil entfernen? Die Zuordnungen gehen verloren.",
    prompt_rename: "Neuer Name für das Profil", loading: "Lädt…",
  },
);

export const EDITOR_STYLE = SETTINGS_STYLE + LOG_STYLE + SCHEDULE_STYLE + `
  .tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--divider-color); }
  .tab { padding: 10px 16px; cursor: pointer; background: none; border: none; font: inherit;
    color: var(--secondary-text-color); border-bottom: 2px solid transparent; }
  .tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
  .split { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; }
  .plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .plan-grid .card { margin-bottom: 0; }
  .plan-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(0, 1.4fr); gap: 8px; align-items: center; padding: 6px 0;
    border-top: 1px solid var(--divider-color); }
  .plan-row:first-of-type { border-top: none; }
  .plan-row select { width: 100%; min-width: 0; }
  @media (max-width: 700px) { .split { grid-template-columns: 1fr; } }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .list button { text-align: left; }
  input[type=text], input[type=number], input[type=time], select {
    padding: 6px; font: inherit; color: var(--primary-text-color);
    background: var(--secondary-background-color); border: 1px solid var(--divider-color); border-radius: 6px; }
  input[type=number] { width: 70px; }
  .block { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
  .msg { margin-left: 8px; color: var(--secondary-text-color); }
  .msg.error { color: var(--error-color, #d32f2f); }
  .grid { overflow-x: auto; }
  .grid table td, .grid table th { padding: 6px 8px; text-align: left; }
  .grid th { font-weight: 500; color: var(--secondary-text-color); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .chip-edit { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--divider-color);
    border-radius: 16px; padding: 4px 6px 4px 12px; }
  .chip-edit button { border: none; background: none; cursor: pointer; color: var(--secondary-text-color); font: inherit; }
`;

export function mountEditor(root, getHass) {
  const state = {
    data: null, tab: "schedules", selected: null, draft: null, isNew: false, message: null, error: false,
  };
  const T = (key) => tr(getHass(), key);

  async function load() {
    // Saving reloads the integration; retry while it is not loaded yet.
    for (let attempt = 0; ; attempt++) {
      try {
        state.data = await getHass().callWS({ type: "thermoplan/get" });
        break;
      } catch (err) {
        if (attempt >= 8) throw err;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    render();
  }

  async function call(msg, okText) {
    try {
      await getHass().callWS(msg);
      state.message = okText ? T(okText) : null;
      state.error = false;
      await load();
    } catch (err) {
      state.message = err?.message || String(err);
      state.error = true;
      render();
    }
  }

  function newDraft(name) {
    return { name, default_target: null, days: {} };
  }

  function select(name) {
    state.selected = name;
    state.isNew = false;
    state.message = null;
    const source = state.data.schedules[name];
    state.draft = JSON.parse(JSON.stringify(source));
    state.draft.days = state.draft.days || {};
    render();
  }

  // ---- Schedules tab ----------------------------------------------------

  function renderSchedules() {
    const names = Object.keys(state.data.schedules).sort();
    if (!state.draft && !state.isNew && names.length) {
      // open the first schedule right away
      state.selected = names[0];
      state.draft = JSON.parse(JSON.stringify(state.data.schedules[names[0]]));
      state.draft.days = state.draft.days || {};
    }
    const list = h("div", { class: "list" },
      ...names.map((name) => h("button", { class: "chip" + (name === state.selected && !state.isNew ? " active" : ""),
        onclick: () => select(name) }, name)),
      h("button", { class: "chip" + (state.isNew ? " active" : ""), onclick: () => {
        state.selected = null; state.isNew = true; state.draft = newDraft(""); state.message = null; render();
      } }, "+ " + T("new_schedule")));
    if (!names.length && !state.isNew) list.prepend(h("div", { class: "empty" }, T("no_schedules")));

    let detail = h("div", {});
    if (state.draft) {
      detail = h("div", {}, renderScheduleEditor({ state, T }),
        h("div", { class: "savebar row" },
          h("button", { class: "btn", onclick: save }, T("save")),
          !state.isNew ? h("button", { class: "btn secondary", onclick: remove }, T("delete")) : null,
          state.message ? h("span", { class: "msg" + (state.error ? " error" : "") }, state.message) : null));
    }
    return h("div", { class: "split" }, list, detail);
  }

  async function save() {
    const draft = state.draft;
    const name = (draft.name || "").trim();
    if (!name) { state.message = T("name"); state.error = true; render(); return; }
    const days = {};
    for (const [day, blocks] of Object.entries(draft.days)) {
      if (blocks.length) days[day] = blocks.map(([s, e, t]) => [s, e, t]);
    }
    const renamedFrom = !state.isNew && state.selected && state.selected !== name ? state.selected : null;
    await call({ type: "thermoplan/set_schedule", schedule: { name, default_target: draft.default_target, days } }, "saved");
    if (!state.error) {
      if (renamedFrom) {
        // Move room assignments to the new name, then drop the old schedule.
        for (const [roomId, plan] of Object.entries(state.data.room_plans)) {
          const updated = Object.fromEntries(Object.entries(plan).map(([p, s]) => [p, s === renamedFrom ? name : s]));
          if (JSON.stringify(updated) !== JSON.stringify(plan)) {
            await getHass().callWS({ type: "thermoplan/set_room_plan", room_id: roomId, plan: updated });
          }
        }
        await getHass().callWS({ type: "thermoplan/delete_schedule", name: renamedFrom });
        await load();
      }
      select(name);
      state.message = T("saved");
      render();
    }
  }

  async function remove() {
    if (!confirm(T("confirm_delete"))) return;
    const name = state.selected;
    state.draft = null; state.selected = null;
    await call({ type: "thermoplan/delete_schedule", name });
  }

  // ---- Plans tab --------------------------------------------------------

  function renderPlans() {
    const { profiles, rooms, schedules, room_plans: plans } = state.data;
    const scheduleNames = Object.keys(schedules).sort();

    const chips = h("div", { class: "chips" }, ...profiles.map((profile) => h("span", { class: "chip-edit" }, profile,
      h("button", { title: T("rename"), onclick: () => {
        const next = (prompt(T("prompt_rename"), profile) || "").trim();
        if (next && next !== profile && !profiles.includes(next)) {
          call({ type: "thermoplan/set_profiles", profiles: profiles.map((p) => (p === profile ? next : p)),
            renames: { [profile]: next } });
        }
      } }, "✎"),
      h("button", { title: T("remove"), onclick: () => {
        if (confirm(T("confirm_remove"))) call({ type: "thermoplan/set_profiles", profiles: profiles.filter((p) => p !== profile) });
      } }, "✕"))));
    const addInput = h("input", { type: "text", placeholder: T("profile_name") });
    const addBtn = h("button", { class: "btn", onclick: () => {
      const name = addInput.value.trim();
      if (name && !profiles.includes(name)) call({ type: "thermoplan/set_profiles", profiles: [...profiles, name] });
    } }, T("add_profile"));

    const roomCards = rooms.map((room) => h("div", { class: "card" }, h("h3", {}, room.name),
      ...profiles.map((profile) => {
        const current = (plans[room.id] || {})[profile] || "";
        return h("div", { class: "plan-row" }, h("span", {}, profile),
          h("select", { onchange: (ev) => {
            const plan = { ...(plans[room.id] || {}) };
            if (ev.target.value) plan[profile] = ev.target.value; else delete plan[profile];
            call({ type: "thermoplan/set_room_plan", room_id: room.id, plan });
          } }, h("option", { value: "" }, T("none")),
          ...scheduleNames.map((name) => h("option", { value: name, selected: name === current }, name))));
      })));

    return h("div", {},
      h("h2", {}, T("profiles")),
      profiles.length ? chips : h("div", { class: "empty" }, T("no_profiles")),
      h("div", { class: "row" }, addInput, addBtn),
      h("h2", {}, T("plans")),
      h("div", { class: "plan-grid" }, ...(profiles.length ? roomCards : [])),
      state.message ? h("div", { class: "msg" + (state.error ? " error" : "") }, state.message) : null);
  }

  // ---- Shell ------------------------------------------------------------

  function render() {
    if (!state.data) { root.replaceChildren(h("div", { class: "empty" }, T("loading"))); return; }
    const ctx = { state, T, call, getHass, load, render };
    const content = state.tab === "plans" ? renderPlans()
      : state.tab === "settings" ? renderSettings(ctx)
      : state.tab === "import" ? renderImport(ctx)
      : state.tab === "rooms" ? renderRooms(ctx)
      : state.tab === "log" ? renderLog(ctx)
      : renderSchedules();
    root.replaceChildren(content);
  }

  return {
    setTab(tab) { state.tab = tab; state.message = null; if (state.data) render(); else load(); },
    load,
    update() { /* data is pulled explicitly; hass updates do not re-render the editor */ },
  };
}
