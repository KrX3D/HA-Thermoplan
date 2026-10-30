// Schedule, profile and plan editor (used by the panel).
import { tr, addStrings, h } from "./thermoplan-common.js";
import { renderSettings, renderImport, SETTINGS_STYLE } from "./thermoplan-settings.js";
import { renderRooms } from "./thermoplan-rooms.js";

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

const pad = (n) => String(n).padStart(2, "0");
const toTime = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
// An end of 24:00 is shown as 00:00 on the next day.
const splitEnd = (end) => (end >= 1440 ? { time: toTime(end - 1440), next: true } : { time: toTime(end), next: false });
const joinEnd = (text, next) => fromTime(text) + (next ? 1440 : 0);
const fromTime = (text) => {
  const [hh, mm] = (text || "00:00").split(":").map(Number);
  return hh * 60 + mm;
};

function colorFor(target) {
  if (target === null) return "var(--disabled-color, #bdbdbd)";
  const clamped = Math.max(10, Math.min(28, target));
  const hue = 220 - ((clamped - 10) / 18) * 220; // blue (cold) to red (hot)
  return `hsl(${hue} 70% 55%)`;
}

export const EDITOR_STYLE = SETTINGS_STYLE + `
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
  .day { margin: 14px 0; }
  .day-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-weight: 500; }
  .bar { position: relative; height: 22px; border-radius: 6px; background: var(--secondary-background-color);
    overflow: hidden; margin-bottom: 6px; }
  .seg { position: absolute; top: 0; bottom: 0; font-size: 0.7em; color: #fff; text-align: center;
    line-height: 22px; overflow: hidden; white-space: nowrap; }
  .ticks { display: flex; justify-content: space-between; font-size: 0.7em; color: var(--secondary-text-color); }
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
    state.data = await getHass().callWS({ type: "thermoplan/get" });
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

  function renderBar(blocks) {
    const bar = h("div", { class: "bar" });
    const add = (from, to, target) => {
      bar.append(h("div", {
        class: "seg",
        style: `left:${(from / 1440) * 100}%;width:${((to - from) / 1440) * 100}%;background:${colorFor(target)}`,
        title: `${toTime(from)}–${toTime(to)}  ${target === null ? T("target_off") : target + " °C"}`,
      }, target === null ? "" : target));
    };
    for (const [s, e, t] of blocks) add(s, Math.min(e, 1440), t);
    return bar;
  }

  function dayBlocksWithSpill(dayIndex) {
    // Include the part of yesterday's midnight-crossing blocks that lands on this day.
    const own = (state.draft.days[dayIndex] || []).map((b) => [...b]);
    const prev = state.draft.days[(dayIndex + 6) % 7] || [];
    for (const [, end, target] of prev) if (end > 1440) own.push([0, end - 1440, target]);
    return own;
  }

  function renderDay(dayIndex) {
    const blocks = state.draft.days[dayIndex] || (state.draft.days[dayIndex] = []);
    const copySelect = h("select", {}, h("option", { value: "" }, T("copy_to")),
      ...T("days").map((label, i) => (i === dayIndex ? null : h("option", { value: i }, label))),
      h("option", { value: "all" }, "*"));
    const copyBtn = h("button", { class: "btn secondary", onclick: () => {
      const v = copySelect.value;
      if (v === "") return;
      const targets = v === "all" ? [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== dayIndex) : [Number(v)];
      for (const i of targets) state.draft.days[i] = JSON.parse(JSON.stringify(blocks));
      render();
    } }, T("copy"));

    const rows = blocks.map((block, index) => {
      const [start, end, target] = block;
      const { time: endTime, next: nextDay } = splitEnd(end);
      const offBox = h("input", { type: "checkbox", checked: target === null,
        onchange: (ev) => { block[2] = ev.target.checked ? null : 20; render(); } });
      return h("div", { class: "block" },
        T("from"), h("input", { type: "time", value: toTime(start),
          onchange: (ev) => { const len = block[1] - block[0]; block[0] = fromTime(ev.target.value); if (block[1] <= block[0]) block[1] = block[0] + len; render(); } }),
        T("to"), h("input", { type: "time", value: endTime,
          onchange: (ev) => { block[1] = joinEnd(ev.target.value, nextDay); render(); } }),
        h("label", {}, h("input", { type: "checkbox", checked: nextDay,
          onchange: (ev) => { block[1] = joinEnd(endTime, ev.target.checked); render(); } }), " " + T("next_day")),
        target === null ? null : h("input", { type: "number", step: 0.5, min: 4, max: 35, value: target,
          onchange: (ev) => { block[2] = Number(ev.target.value); render(); } }),
        target === null ? null : T("temperature"),
        h("label", {}, offBox, " " + T("target_off")),
        h("button", { class: "btn secondary", onclick: () => { blocks.splice(index, 1); render(); } }, "✕"));
    });

    return h("div", { class: "day" },
      h("div", { class: "day-head" }, T("days")[dayIndex]),
      renderBar(dayBlocksWithSpill(dayIndex)),
      h("div", { class: "ticks" }, ...["00", "06", "12", "18", "24"].map((t) => h("span", {}, t))),
      ...rows,
      h("div", { class: "block" },
        h("button", { class: "btn secondary", onclick: () => {
          const last = blocks[blocks.length - 1];
          const start = last ? Math.min(last[1], 1439) % 1440 : 420;
          blocks.push([start, Math.min(start + 60, 1440), 20]);
          render();
        } }, "+ " + T("add_block")),
        copySelect, copyBtn));
  }

  function renderSchedules() {
    const names = Object.keys(state.data.schedules).sort();
    const list = h("div", { class: "list" },
      ...names.map((name) => h("button", { class: "chip" + (name === state.selected && !state.isNew ? " active" : ""),
        onclick: () => select(name) }, name)),
      h("button", { class: "chip" + (state.isNew ? " active" : ""), onclick: () => {
        state.selected = null; state.isNew = true; state.draft = newDraft(""); state.message = null; render();
      } }, "+ " + T("new_schedule")));
    if (!names.length && !state.isNew) list.prepend(h("div", { class: "empty" }, T("no_schedules")));

    let detail = h("div", {});
    if (state.draft) {
      const draft = state.draft;
      const nameInput = h("input", { type: "text", value: draft.name, placeholder: T("name"),
        oninput: (ev) => { draft.name = ev.target.value; } });
      const defaultOff = h("input", { type: "checkbox", checked: draft.default_target === null,
        onchange: (ev) => { draft.default_target = ev.target.checked ? null : 16; render(); } });
      detail = h("div", {},
        h("div", { class: "row" }, T("name") + ":", nameInput),
        h("div", { class: "row" }, T("default_target") + ":",
          draft.default_target === null ? null : h("input", { type: "number", step: 0.5, min: 4, max: 35,
            value: draft.default_target, onchange: (ev) => { draft.default_target = Number(ev.target.value); } }),
          draft.default_target === null ? null : T("temperature"),
          h("label", {}, defaultOff, " " + T("off_option"))),
        ...[0, 1, 2, 3, 4, 5, 6].map(renderDay),
        h("div", { class: "row" },
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
      : renderSchedules();
    root.replaceChildren(content);
  }

  return {
    setTab(tab) { state.tab = tab; state.message = null; if (state.data) render(); else load(); },
    load,
    update() { /* data is pulled explicitly; hass updates do not re-render the editor */ },
  };
}
