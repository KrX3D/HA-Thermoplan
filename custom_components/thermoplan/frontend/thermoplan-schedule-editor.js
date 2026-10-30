// Graphical schedule editor: week grid (draw, move, resize), day table, copy. Port of prototypes/schedule-editor.html.
//
// Data format (same as the backend): draft = { name, default_target, days: { "0": [[start, end, target], ...] } }
// Minutes since midnight, end up to 2880 (next day), target null = off, weekday 0 = Monday.
import { addStrings, h } from "./thermoplan-common.js";

addStrings(
  {
    se_name: "Name", se_default: "Times without a block", se_default_off: "heating off", se_default_keep: "keep at",
    se_steps: "Time steps", se_undo: "Undo", se_redo: "Redo", se_clear: "Clear all",
    se_pen: "New blocks get:", se_other: "other", se_off: "off", se_heat: "Heat", se_delete: "Delete",
    se_hint: "Pick a temperature above, then click a day bar to add a 1-hour block or drag across it to draw exactly the time you want (the + at the end of each day adds a block too). Click a block to change its temperature right there; drag it to move, drag its edges to resize. Blocks that run past midnight continue on the next day's bar (hatched) and can be resized or moved there too; the dashed handle at the start of a day lets you continue a block that ends at midnight.",
    se_day: "Day", se_from: "From", se_to: "To", se_plus1: "+1 day", se_add_block: "Add block",
    se_time_hint: "Type times as 7, 7:30 or 0730. An end at or before the start means the next day (22:00 to 01:00); 00:00 as end means midnight.",
    se_copy_to: "Copy this day to", se_copy: "Copy", se_weekdays: "Mon-Fri", se_all_days: "All days",
    se_valid: "Schedule is valid.", se_problems: "Problems", se_no_free: "has no free time left for another block.",
    se_invalid: "invalid block", se_overlap: "overlap", se_no_blocks: "No blocks on this day.",
    se_add_on: "Add a block on", se_continues: "Continues from", se_until: "until", se_ext: "Drag to continue the block past midnight",
    se_spill_hint: "Drag to move, drag the right edge to change the end.",
  },
  {
    se_name: "Name", se_default: "Zeiten ohne Block", se_default_off: "Heizung aus", se_default_keep: "halten bei",
    se_steps: "Zeitschritte", se_undo: "Rückgängig", se_redo: "Wiederholen", se_clear: "Alles löschen",
    se_pen: "Neue Blöcke erhalten:", se_other: "andere", se_off: "aus", se_heat: "Heizen", se_delete: "Löschen",
    se_hint: "Oben eine Temperatur wählen, dann auf einen Tagesbalken klicken (1-Stunden-Block) oder darüber ziehen, um die Zeit genau festzulegen (das + am Ende jedes Tages fügt ebenfalls einen Block hinzu). Einen Block anklicken, um die Temperatur direkt dort zu ändern; ziehen zum Verschieben, an den Rändern ziehen zum Ändern der Länge. Blöcke über Mitternacht werden am nächsten Tag schraffiert fortgesetzt und lassen sich dort ebenfalls ändern oder verschieben; der gestrichelte Griff am Tagesanfang verlängert einen Block, der um Mitternacht endet.",
    se_day: "Tag", se_from: "Von", se_to: "Bis", se_plus1: "+1 Tag", se_add_block: "Block hinzufügen",
    se_time_hint: "Zeiten als 7, 7:30 oder 0730 eingeben. Ein Ende zur oder vor der Startzeit bedeutet den nächsten Tag (22:00 bis 01:00); 00:00 als Ende bedeutet Mitternacht.",
    se_copy_to: "Diesen Tag kopieren nach", se_copy: "Kopieren", se_weekdays: "Mo-Fr", se_all_days: "Alle Tage",
    se_valid: "Zeitplan ist gültig.", se_problems: "Probleme", se_no_free: "hat keine freie Zeit mehr für einen weiteren Block.",
    se_invalid: "ungültiger Block", se_overlap: "überschneiden sich", se_no_blocks: "Keine Blöcke an diesem Tag.",
    se_add_on: "Block hinzufügen am", se_continues: "Fortsetzung von", se_until: "bis", se_ext: "Ziehen, um den Block über Mitternacht zu verlängern",
    se_spill_hint: "Ziehen zum Verschieben, am rechten Rand ziehen zum Ändern des Endes.",
  },
);

export const SCHEDULE_STYLE = `
  .se-toprow { display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: center; margin-bottom: 14px; }
  .se-toprow label.l { color: var(--secondary-text-color); display: flex; align-items: center; gap: 6px; }
  .se-pen { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .se-pen .t { min-width: 44px; padding: 6px 10px; border-radius: 16px; color: #fff; border: 2px solid transparent; font-weight: 500; cursor: pointer; font: inherit; }
  .se-pen .t.on { border-color: var(--primary-text-color); }
  .se-pen .t.offchip { background: #757575; }
  .se-pen-title { font-weight: 500; margin-right: 4px; }
  .se-week { display: grid; grid-template-columns: 44px minmax(0, 1fr) 34px; gap: 6px 10px; align-items: center; }
  .se-dlabel { font-weight: 500; text-align: right; cursor: pointer; padding: 6px 4px; border-radius: 6px; }
  .se-dlabel.sel { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .se-addbtn { padding: 4px 0; width: 34px; font-weight: 700; cursor: pointer; }
  .se-bar { position: relative; height: 44px; border-radius: 8px; background: var(--secondary-background-color); touch-action: none; user-select: none; cursor: crosshair;
    background-image: repeating-linear-gradient(90deg, transparent 0, transparent calc(100%/24 - 1px), var(--divider-color) calc(100%/24 - 1px), var(--divider-color) calc(100%/24)); }
  .se-bar.sel { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .se-blk { position: absolute; top: 3px; bottom: 3px; border-radius: 6px; color: #fff; font-weight: 500; font-size: 12px;
    display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; cursor: grab;
    box-shadow: 0 1px 2px rgba(0,0,0,.4); }
  .se-blk.off { background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0 6px, transparent 6px 12px); }
  .se-blk.sel { box-shadow: 0 0 0 2px var(--primary-text-color); z-index: 2; }
  .se-blk.bad { box-shadow: 0 0 0 2px var(--error-color, #d32f2f); }
  .se-blk.spill { border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .se-blk.spill::before { content: ""; position: absolute; inset: 0; background-image: repeating-linear-gradient(135deg, rgba(0,0,0,.28) 0 4px, transparent 4px 8px); pointer-events: none; }
  .se-blk .hd { position: absolute; top: 0; bottom: 0; width: 10px; cursor: ew-resize; z-index: 1; }
  .se-blk .hd.l { left: 0; } .se-blk .hd.r { right: 0; }
  .se-blk .hd::after { content: ""; position: absolute; top: 12px; bottom: 12px; width: 2px; background: rgba(255,255,255,.75); border-radius: 2px; }
  .se-blk .hd.l::after { left: 3px; } .se-blk .hd.r::after { right: 3px; }
  .se-ext { position: absolute; left: 0; top: 3px; bottom: 3px; width: 12px; border-radius: 0 6px 6px 0; cursor: ew-resize; z-index: 1;
    border: 2px dashed var(--primary-color); border-left: none; display: flex; align-items: center; justify-content: center; color: var(--primary-color); font-size: 10px; }
  .se-ghost { position: absolute; top: 3px; bottom: 3px; border-radius: 6px; border: 2px dashed var(--primary-text-color); opacity: .8;
    pointer-events: none; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }
  .se-ticks { display: grid; grid-template-columns: 44px minmax(0, 1fr) 34px; gap: 10px; color: var(--secondary-text-color); font-size: 11px; margin-top: 2px; }
  .se-ticks div:nth-child(2) { display: flex; justify-content: space-between; }
  .se-pop { position: fixed; z-index: 20; display: none; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 10px;
    background: var(--card-background-color); border: 1px solid var(--divider-color); box-shadow: 0 4px 16px rgba(0,0,0,.35); white-space: nowrap; }
  .se-pop .when { color: var(--secondary-text-color); font-size: 12px; margin-right: 4px; }
  .se-pop button { padding: 4px 10px; cursor: pointer; }
  .se-pop input[type=number] { width: 64px; text-align: center; }
  .se-tip { position: fixed; z-index: 30; display: none; pointer-events: none; padding: 2px 6px; border-radius: 4px; font-size: 12px;
    background: var(--primary-text-color); color: var(--card-background-color); }
  .se-rows { display: grid; grid-template-columns: auto auto auto auto auto auto; gap: 8px 10px; align-items: center; justify-content: start; }
  .se-rows .head { color: var(--secondary-text-color); font-size: 12px; }
  .se-rows .sw { width: 18px; height: 18px; border-radius: 4px; cursor: pointer; }
  .se-rows .sw.sel-row { outline: 2px solid var(--primary-text-color); outline-offset: 2px; }
  .se-rows input.time { width: 72px; text-align: center; }
  .se-badge { font-size: 11px; background: var(--primary-color); color: var(--text-primary-color, #fff); border-radius: 10px; padding: 1px 7px; margin-left: 6px; }
  .se-status { margin-top: 8px; font-size: 13px; }
  .se-status.err { color: var(--error-color, #d32f2f); } .se-status.good { color: var(--success-color, #2e7d32); }
  .se-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; }
  @media (max-width: 900px) { .se-split { grid-template-columns: 1fr; } }
`;

const DAY = 1440;
const PALETTE = [16, 18, 19, 20, 21, 22, 24];
let active = null; // the editor instance whose DOM is currently shown

// ---------- helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
function parseTime(text) {
  const t = String(text).trim().replace(".", ":");
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) m = /^(\d{1,2})(\d{2})$/.exec(t) || /^(\d{1,2})()$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2] || 0);
  if (hh > 24 || mm > 59) return null;
  return hh * 60 + mm;
}
const endOf = (start, typed) => (typed <= start ? typed + DAY : typed); // an end at or before the start means the next day
const color = (t) => {
  if (t === null) return "#757575";
  const c = Math.max(14, Math.min(26, t));
  return `hsl(${220 - ((c - 14) / 12) * 220} 65% 45%)`;
};
const label = (t) => (t === null ? "off" : `${t}`);

export function createScheduleEditorState(draft) {
  return {
    draft, sel: null, curDay: 0, pen: 21, step: 15, copy: new Set(), undo: [], redo: [], drag: null,
    root: null, T: null, tip: null, pop: null, flashText: null, flashTimer: null,
  };
}

const blocks = (ed, d) => ed.draft.days[d] || (ed.draft.days[d] = []);
const firstStart = (ed, d) => blocks(ed, d).reduce((m, b) => Math.min(m, b[0]), DAY);
function spillOf(ed, d) {
  const out = [];
  blocks(ed, (d + 6) % 7).forEach((b, i) => { if (b[1] > DAY) out.push({ src: (d + 6) % 7, idx: i, end: b[1] - DAY, t: b[2] }); });
  return out;
}
function gaps(ed, d) {
  const taken = spillOf(ed, d).map((sp) => [0, sp.end]).concat(blocks(ed, d).map((b) => [b[0], Math.min(b[1], DAY)])).sort((x, y) => x[0] - y[0]);
  const out = []; let at = 0;
  taken.forEach(([s, e]) => { if (s > at) out.push([at, s]); at = Math.max(at, e); });
  if (at < DAY) out.push([at, DAY]);
  return out;
}

function problems(ed) {
  const T = ed.T, days = T("days");
  const iv = [];
  for (let d = 0; d < 7; d++) {
    blocks(ed, d).forEach((b, i) => {
      const invalid = b[0] < 0 || b[0] >= DAY || b[1] <= b[0] || b[1] > 2 * DAY || b[1] - b[0] > DAY;
      if (invalid) iv.push({ d, i, invalid: true, s: 0, e: 0 });
      else {
        const s = d * DAY + b[0], e = d * DAY + b[1], W = 7 * DAY;
        if (e > W) { iv.push({ d, i, s, e: W }); iv.push({ d, i, s: 0, e: e - W }); } else iv.push({ d, i, s, e });
      }
    });
  }
  const bad = new Set(), msgs = [];
  iv.filter((x) => x.invalid).forEach((x) => { bad.add(x.d + ":" + x.i); msgs.push(`${days[x.d]}: ${T("se_invalid")}`); });
  const ok = iv.filter((x) => !x.invalid).sort((a, b) => a.s - b.s);
  for (let k = 1; k < ok.length; k++) {
    if (ok[k].s < ok[k - 1].e && !(ok[k].d === ok[k - 1].d && ok[k].i === ok[k - 1].i)) {
      bad.add(ok[k].d + ":" + ok[k].i); bad.add(ok[k - 1].d + ":" + ok[k - 1].i);
      msgs.push(`${days[ok[k - 1].d]} / ${days[ok[k].d]}: ${T("se_overlap")}`);
    }
  }
  return { bad, msgs: [...new Set(msgs)] };
}

// ---------- history ----------
// The undo stack stores the state *before* a change: call checkpoint() before mutating, commit() after.
function checkpoint(ed) { ed.undo.push(JSON.stringify(ed.draft.days)); if (ed.undo.length > 100) ed.undo.shift(); ed.redo = []; }
function commit(ed) {
  for (const d of Object.keys(ed.draft.days)) ed.draft.days[d].sort((a, b) => a[0] - b[0]);
  paint(ed);
}
function undo(ed) { if (!ed.undo.length) return; ed.redo.push(JSON.stringify(ed.draft.days)); ed.draft.days = JSON.parse(ed.undo.pop()); ed.sel = null; paint(ed); }
function redo(ed) { if (!ed.redo.length) return; ed.undo.push(JSON.stringify(ed.draft.days)); ed.draft.days = JSON.parse(ed.redo.pop()); ed.sel = null; paint(ed); }

function flash(ed, text) {
  ed.flashText = text;
  clearTimeout(ed.flashTimer);
  ed.flashTimer = setTimeout(() => { ed.flashText = null; paint(ed); }, 2500);
  paint(ed);
}

// ---------- rendering ----------
export function renderScheduleEditor({ state, T }) {
  if (!state.se || state.se.draft !== state.draft) state.se = createScheduleEditorState(state.draft);
  const ed = state.se;
  ed.T = T;
  ed.root = h("div", { class: "se" });
  active = ed;
  paint(ed);
  requestAnimationFrame(() => positionPop(ed)); // measure once the node is in the page
  return ed.root;
}

function paint(ed) {
  if (!ed.root) return;
  const T = ed.T, days = T("days"), draft = ed.draft;
  const { bad, msgs } = problems(ed);
  ed.tip = h("div", { class: "se-tip" });
  ed.pop = h("div", { class: "se-pop" });

  // --- toolbar ---
  const nameInput = h("input", { type: "text", value: draft.name || "", placeholder: T("se_name"), style: "width:200px",
    oninput: (ev) => { draft.name = ev.target.value; } });
  const defSelect = h("select", { onchange: (ev) => { draft.default_target = ev.target.value === "off" ? null : 16; paint(ed); } },
    h("option", { value: "off", selected: draft.default_target === null }, T("se_default_off")),
    h("option", { value: "val", selected: draft.default_target !== null }, T("se_default_keep")));
  const defValue = draft.default_target === null ? null : h("input", { type: "number", step: 0.5, min: 4, max: 35, value: draft.default_target,
    onchange: (ev) => { draft.default_target = Number(ev.target.value); } });
  const stepSelect = h("select", { onchange: (ev) => { ed.step = Number(ev.target.value); } },
    ...[5, 15, 30, 60].map((n) => h("option", { value: n, selected: n === ed.step }, n)));
  const pen = h("div", { class: "se-pen" }, h("span", { class: "se-pen-title" }, T("se_pen")),
    ...PALETTE.map((t) => h("button", { class: "t" + (ed.pen === t ? " on" : ""), style: `background:${color(t)}`,
      onclick: () => { ed.pen = t; paint(ed); } }, t + "°")),
    h("button", { class: "t offchip" + (ed.pen === null ? " on" : ""), onclick: () => { ed.pen = null; paint(ed); } }, T("se_off")),
    h("input", { type: "number", step: 0.5, min: 4, max: 35, placeholder: T("se_other"), value: ed.pen !== null && !PALETTE.includes(ed.pen) ? ed.pen : "",
      onchange: (ev) => { if (ev.target.value !== "") { ed.pen = Number(ev.target.value); paint(ed); } } }));
  const toolbar = h("div", { class: "card" },
    h("div", { class: "se-toprow" },
      h("label", { class: "l" }, T("se_name"), nameInput),
      h("label", { class: "l" }, T("se_default") + ":", defSelect, defValue),
      h("label", { class: "l" }, T("se_steps"), stepSelect, "min"),
      h("span", { style: "flex:1" }),
      h("button", { class: "btn secondary", disabled: !ed.undo.length, onclick: () => undo(ed) }, T("se_undo")),
      h("button", { class: "btn secondary", disabled: !ed.redo.length, onclick: () => redo(ed) }, T("se_redo")),
      h("button", { class: "btn secondary", onclick: () => { checkpoint(ed); draft.days = {}; ed.sel = null; commit(ed); } }, T("se_clear"))),
    pen, h("p", { class: "badge", style: "margin:8px 0 0" }, T("se_hint")));

  // --- week grid ---
  const week = h("div", { class: "se-week" });
  for (let d = 0; d < 7; d++) {
    const lab = h("div", { class: "se-dlabel" + (d === ed.curDay ? " sel" : ""), onclick: () => { ed.curDay = d; ed.sel = null; paint(ed); } }, days[d]);
    const bar = h("div", { class: "se-bar" + (d === ed.curDay ? " sel" : "") });
    bar.dataset.day = d;

    spillOf(ed, d).forEach((sp) => {
      const e = h("div", { class: "se-blk spill" + (sp.t === null ? " off" : "") + (ed.sel && ed.sel.day === sp.src && ed.sel.idx === sp.idx ? " sel" : ""),
        style: `left:0;width:${(sp.end / DAY) * 100}%;background:${color(sp.t)}`,
        title: `${T("se_continues")} ${days[sp.src]} (${T("se_until")} ${fmt(sp.end)}). ${T("se_spill_hint")}` }, label(sp.t));
      const r = h("div", { class: "hd r" }); r.dataset.part = "r"; e.appendChild(r);
      e.onpointerdown = (ev) => startSpillDrag(ed, ev, sp.src, sp.idx, ev.target.dataset.part === "r" ? "sr" : "sm");
      bar.appendChild(e);
    });
    blocks(ed, (d + 6) % 7).forEach((pb, pi) => {
      if (pb[1] === DAY && firstStart(ed, d) >= 30 && !spillOf(ed, d).length) {
        const x = h("div", { class: "se-ext", title: T("se_ext") }, "›");
        x.onpointerdown = (ev) => startExtDrag(ed, ev, (d + 6) % 7, pi);
        bar.appendChild(x);
      }
    });
    blocks(ed, d).forEach((b, i) => {
      const e = h("div", { class: "se-blk" + (b[2] === null ? " off" : "") + (ed.sel && ed.sel.day === d && ed.sel.idx === i ? " sel" : "") + (bad.has(d + ":" + i) ? " bad" : ""),
        style: `left:${(b[0] / DAY) * 100}%;width:${((Math.min(b[1], DAY) - b[0]) / DAY) * 100}%;background:${color(b[2])}`,
        title: `${fmt(b[0])} - ${fmt(b[1])}${b[1] > DAY ? " (+1)" : ""}  ${label(b[2])}` }, b[1] > DAY ? `${label(b[2])} →` : label(b[2]));
      const l = h("div", { class: "hd l" }); l.dataset.part = "l"; e.appendChild(l);
      const r = h("div", { class: "hd r" }); r.dataset.part = "r"; e.appendChild(r);
      e.onpointerdown = (ev) => startBlockDrag(ed, ev, d, i, ev.target.dataset.part || "m");
      bar.appendChild(e);
    });
    bar.onpointerdown = (ev) => { if (ev.target === bar) startCreate(ed, ev, d, bar); };
    bar.onpointermove = (ev) => { if (!ed.drag) showTip(ed, ev.clientX, ev.clientY, fmt(minuteAt(ed, ev, bar.getBoundingClientRect()))); };
    bar.onpointerleave = () => { ed.tip.style.display = "none"; };
    const add = h("button", { class: "se-addbtn btn secondary", title: `${T("se_add_on")} ${days[d]}`, onclick: () => { ed.curDay = d; addBlockAfterLast(ed, d); } }, "+");
    week.append(lab, bar, add);
  }
  const ticks = h("div", { class: "se-ticks" }, h("div"),
    h("div", {}, ...["00", "03", "06", "09", "12", "15", "18", "21", "24"].map((t) => h("span", {}, t))), h("div"));
  const status = ed.flashText
    ? h("div", { class: "se-status err" }, ed.flashText)
    : h("div", { class: "se-status " + (msgs.length ? "err" : "good") }, msgs.length ? `${T("se_problems")}: ${msgs.join("; ")}` : T("se_valid"));
  const weekCard = h("div", { class: "card" }, week, ticks, status);

  // --- day table + copy ---
  const rows = h("div", { class: "se-rows" },
    ...["", T("se_from"), T("se_to"), "°C", T("se_off"), ""].map((t) => h("div", { class: "head" }, t)));
  blocks(ed, ed.curDay).forEach((b, i) => {
    const isSel = ed.sel && ed.sel.day === ed.curDay && ed.sel.idx === i;
    const sw = h("div", { class: "sw" + (isSel ? " sel-row" : ""), style: `background:${color(b[2])}`, onclick: () => { ed.sel = { day: ed.curDay, idx: i }; paint(ed); } });
    const from = timeInput(ed, fmt(b[0]), (m) => {
      if (m === null || m >= DAY) return false;
      const len = b[1] - b[0]; checkpoint(ed); b[0] = m; if (b[1] <= b[0]) b[1] = Math.min(m + len, 2 * DAY); commit(ed); return true;
    });
    const to = timeInput(ed, fmt(b[1] >= DAY ? b[1] - DAY : b[1]), (m) => { if (m === null) return false; checkpoint(ed); b[1] = endOf(b[0], m); commit(ed); return true; });
    const toWrap = h("div", {}, to, b[1] >= DAY ? h("span", { class: "se-badge" }, T("se_plus1")) : null);
    const temp = h("input", { type: "number", step: 0.5, min: 4, max: 35, value: b[2] === null ? "" : b[2], disabled: b[2] === null,
      onchange: (ev) => { checkpoint(ed); b[2] = Number(ev.target.value); commit(ed); } });
    const off = h("input", { type: "checkbox", checked: b[2] === null, onchange: (ev) => { checkpoint(ed); b[2] = ev.target.checked ? null : (ed.pen ?? 20); commit(ed); } });
    const del = h("button", { class: "btn secondary", onclick: () => { checkpoint(ed); blocks(ed, ed.curDay).splice(i, 1); ed.sel = null; commit(ed); } }, "✕");
    rows.append(sw, from, toWrap, temp, off, del);
  });
  if (!blocks(ed, ed.curDay).length) rows.append(h("div", { class: "empty", style: "grid-column:1/-1" }, T("se_no_blocks")));

  const dayCard = h("div", { class: "card" }, h("h3", {}, `${T("se_day")}: ${days[ed.curDay]}`), rows,
    h("div", { style: "margin-top:12px" }, h("button", { class: "btn secondary", onclick: () => addBlockAfterLast(ed, ed.curDay) }, "+ " + T("se_add_block"))),
    h("p", { class: "badge", style: "margin:8px 0 0" }, T("se_time_hint")));
  const copyCard = h("div", { class: "card" }, h("h3", {}, T("se_copy_to")),
    h("div", { class: "chips" }, ...days.map((n, d) => (d === ed.curDay ? null : h("button", { class: "chip" + (ed.copy.has(d) ? " active" : ""),
      onclick: () => { ed.copy.has(d) ? ed.copy.delete(d) : ed.copy.add(d); paint(ed); } }, n)))),
    h("div", { class: "row", style: "margin-top:12px" },
      h("button", { class: "btn", onclick: () => copyDay(ed, [...ed.copy]) }, T("se_copy")),
      h("button", { class: "btn secondary", onclick: () => copyDay(ed, [0, 1, 2, 3, 4]) }, T("se_weekdays")),
      h("button", { class: "btn secondary", onclick: () => copyDay(ed, [0, 1, 2, 3, 4, 5, 6]) }, T("se_all_days"))));

  ed.root.replaceChildren(toolbar, weekCard, h("div", { class: "se-split" }, dayCard, copyCard), ed.pop, ed.tip);
  positionPop(ed);
}

function timeInput(ed, value, apply) {
  const i = h("input", { type: "text", class: "time", value });
  i.onchange = () => { if (!apply(parseTime(i.value))) { i.style.borderColor = "var(--error-color, #d32f2f)"; setTimeout(() => paint(ed), 600); } };
  return i;
}
function copyDay(ed, targets) {
  checkpoint(ed);
  targets.filter((d) => d !== ed.curDay).forEach((d) => { ed.draft.days[d] = JSON.parse(JSON.stringify(blocks(ed, ed.curDay))); });
  commit(ed);
}
function addBlockAfterLast(ed, d) {
  const free = gaps(ed, d).filter(([s, e]) => e - s >= ed.step);
  if (!free.length) { flash(ed, `${ed.T("days")[d]} ${ed.T("se_no_free")}`); return; }
  const lastEnd = blocks(ed, d).reduce((m, b) => Math.max(m, Math.min(b[1], DAY)), 0);
  const [gs, ge] = free.find(([s]) => s >= lastEnd) || free[0]; // prefer the gap after the last block
  checkpoint(ed);
  const block = [gs, Math.min(gs + 60, ge), ed.pen];
  blocks(ed, d).push(block);
  blocks(ed, d).sort((x, y) => x[0] - y[0]);
  ed.sel = { day: d, idx: blocks(ed, d).indexOf(block) };
  commit(ed);
}

// floating editor on the selected block
function positionPop(ed) {
  const pop = ed.pop, T = ed.T;
  const hide = () => { pop.style.display = "none"; };
  if (!ed.sel || ed.drag) return hide();
  const b = (ed.draft.days[ed.sel.day] || [])[ed.sel.idx];
  const el = ed.root.querySelector(`.se-bar[data-day="${ed.sel.day}"] .se-blk.sel:not(.spill)`);
  if (!b || !el) return hide();
  const step = (dv) => { checkpoint(ed); b[2] = Math.max(4, Math.min(35, (b[2] === null ? (ed.pen ?? 20) : b[2]) + dv)); commit(ed); };
  pop.replaceChildren(
    h("span", { class: "when" }, `${fmt(b[0])}–${fmt(b[1])}${b[1] >= DAY ? " (+1)" : ""}`),
    h("button", { class: "btn secondary", onclick: () => step(-0.5) }, "−"),
    h("input", { type: "number", step: 0.5, min: 4, max: 35, value: b[2] === null ? "" : b[2], disabled: b[2] === null,
      onchange: (ev) => { checkpoint(ed); b[2] = Number(ev.target.value); commit(ed); } }),
    h("span", {}, "°C"),
    h("button", { class: "btn secondary", onclick: () => step(0.5) }, "+"),
    h("button", { class: "btn secondary", onclick: () => { checkpoint(ed); b[2] = b[2] === null ? (ed.pen ?? 20) : null; commit(ed); } }, b[2] === null ? T("se_heat") : T("se_off")),
    h("button", { class: "btn secondary", onclick: () => { checkpoint(ed); blocks(ed, ed.sel.day).splice(ed.sel.idx, 1); ed.sel = null; commit(ed); } }, T("se_delete")));
  pop.style.display = "flex";
  const r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  let top = r.top - ph - 8; if (top < 6) top = r.bottom + 8;
  pop.style.top = top + "px";
  pop.style.left = Math.max(6, Math.min(innerWidth - pw - 6, r.left + r.width / 2 - pw / 2)) + "px";
}
window.addEventListener("scroll", () => { if (active?.root?.isConnected) positionPop(active); }, true);
window.addEventListener("resize", () => { if (active?.root?.isConnected) positionPop(active); });

function showTip(ed, x, y, text) {
  ed.tip.textContent = text;
  ed.tip.style.display = "block"; ed.tip.style.left = x + 12 + "px"; ed.tip.style.top = y - 30 + "px";
}

// ---------- pointer interactions ----------
function minuteAt(ed, ev, rect) {
  const raw = ((ev.clientX - rect.left) / rect.width) * DAY;
  return Math.max(0, Math.min(DAY, Math.round(raw / ed.step) * ed.step));
}
// free interval [lo, hi] around a minute on a day, ignoring block `skip`
function freeAround(ed, d, at, skip) {
  let lo = 0, hi = DAY;
  spillOf(ed, d).forEach((sp) => { lo = Math.max(lo, sp.end); });
  blocks(ed, d).forEach((b, i) => {
    if (i === skip) return;
    if (b[1] <= at) lo = Math.max(lo, Math.min(b[1], DAY));
    else if (b[0] >= at) hi = Math.min(hi, b[0]);
  });
  return [lo, hi];
}
function startCreate(ed, ev, d, bar) {
  ev.preventDefault();
  const rect = bar.getBoundingClientRect();
  const a = minuteAt(ed, ev, rect);
  const [lo, hi] = freeAround(ed, d, a, -1);
  if (a < lo || a >= hi) return;
  ed.drag = { type: "create", d, rect, a, lo, hi, s: a, e: a, ghost: h("div", { class: "se-ghost" }) };
  bar.appendChild(ed.drag.ghost);
  ed.curDay = d; ed.sel = null;
}
function startBlockDrag(ed, ev, d, i, part) {
  ev.preventDefault(); ev.stopPropagation();
  const rect = ev.currentTarget.parentElement.getBoundingClientRect(), b = blocks(ed, d)[i];
  ed.curDay = d; ed.sel = { day: d, idx: i };
  const [lo, hi] = freeAround(ed, d, b[0], i);
  ed.drag = { type: part, d, i, rect, m0: minuteAt(ed, ev, rect), s0: b[0], e0: b[1], lo, len: b[1] - b[0], moved: false, snapshot: JSON.stringify(ed.draft.days),
    hi: b[1] > DAY ? DAY + firstStart(ed, (d + 1) % 7) : (part === "r" || part === "m" ? Math.min(hi, DAY) : hi) };
  paint(ed);
}
function startSpillDrag(ed, ev, src, idx, type) {
  ev.preventDefault(); ev.stopPropagation();
  const rect = ev.currentTarget.parentElement.getBoundingClientRect(), b = blocks(ed, src)[idx];
  ed.curDay = src; ed.sel = { day: src, idx };
  const [lo] = freeAround(ed, src, b[0], idx);
  ed.drag = { type, d: src, i: idx, rect, m0: minuteAt(ed, ev, rect), s0: b[0], e0: b[1], lo, len: b[1] - b[0], moved: false,
    snapshot: JSON.stringify(ed.draft.days), hi: DAY + firstStart(ed, (src + 1) % 7) };
  paint(ed);
}
function startExtDrag(ed, ev, src, idx) {
  ev.preventDefault(); ev.stopPropagation();
  const rect = ev.currentTarget.parentElement.getBoundingClientRect(), b = blocks(ed, src)[idx];
  ed.curDay = src; ed.sel = { day: src, idx };
  ed.drag = { type: "ext", d: src, i: idx, rect, m0: 0, s0: b[0], e0: b[1], lo: 0, len: b[1] - b[0], moved: false,
    snapshot: JSON.stringify(ed.draft.days), hi: DAY + firstStart(ed, (src + 1) % 7) };
}

window.addEventListener("pointermove", (ev) => {
  const ed = active;
  if (!ed || !ed.drag || !ed.root.isConnected) return;
  const dr = ed.drag, m = minuteAt(ed, ev, dr.rect), s = ed.step;
  if (dr.type === "create") {
    dr.s = Math.max(dr.lo, Math.min(dr.a, m)); dr.e = Math.min(dr.hi, Math.max(dr.a, m));
    dr.ghost.style.left = (dr.s / DAY) * 100 + "%"; dr.ghost.style.width = ((dr.e - dr.s) / DAY) * 100 + "%";
    dr.ghost.textContent = dr.e > dr.s ? `${fmt(dr.s)}-${fmt(dr.e)}` : "";
    showTip(ed, ev.clientX, ev.clientY, dr.e > dr.a ? fmt(dr.e) : fmt(dr.s));
    return;
  }
  const b = blocks(ed, dr.d)[dr.i];
  dr.moved = true;
  if (dr.type === "m" || dr.type === "sm") {
    let ns = dr.s0 + (m - dr.m0);
    ns = Math.max(dr.lo, Math.min(ns, DAY - s, dr.hi - dr.len)); ns = Math.round(ns / s) * s;
    b[0] = ns; b[1] = ns + dr.len;
  } else if (dr.type === "l") {
    b[0] = Math.max(dr.lo, Math.min(m, dr.e0 - s));
  } else if (dr.type === "r") {
    // a block running past midnight keeps its end until the handle is dragged back inside this day
    b[1] = dr.e0 > DAY ? (m >= DAY ? dr.e0 : Math.max(m, dr.s0 + s)) : Math.min(dr.hi, Math.max(m, dr.s0 + s));
  } else if (dr.type === "sr") {
    b[1] = Math.max(DAY + s, Math.min(dr.hi, DAY + m, b[0] + DAY));
  } else if (dr.type === "ext") {
    b[1] = m < s ? DAY : Math.min(dr.hi, DAY + m, b[0] + DAY);
  }
  paint(ed);
  showTip(ed, ev.clientX, ev.clientY, `${fmt(b[0])}–${fmt(b[1])}${b[1] >= DAY ? " (+1)" : ""}`);
});
window.addEventListener("pointerup", () => {
  const ed = active;
  if (!ed || !ed.drag) return;
  const dg = ed.drag; ed.drag = null;
  if (dg.type === "create") {
    dg.ghost.remove();
    let { s, e } = dg;
    if (e - s < ed.step) { s = dg.a; e = Math.min(dg.hi, dg.a + 60); } // a plain click adds a 1-hour block
    if (e - s >= ed.step) {
      checkpoint(ed);
      const block = [s, e, ed.pen];
      blocks(ed, dg.d).push(block);
      blocks(ed, dg.d).sort((x, y) => x[0] - y[0]);
      ed.sel = { day: dg.d, idx: blocks(ed, dg.d).indexOf(block) };
      commit(ed);
    } else paint(ed);
  } else if (dg.moved) {
    const ref = blocks(ed, dg.d)[dg.i];
    ed.undo.push(dg.snapshot); ed.redo = [];
    blocks(ed, dg.d).sort((x, y) => x[0] - y[0]);
    ed.sel = { day: dg.d, idx: blocks(ed, dg.d).indexOf(ref) };
    commit(ed);
  } else paint(ed);
});
window.addEventListener("keydown", (ev) => {
  const ed = active;
  if (!ed || !ed.root?.isConnected) return;
  const tag = ev.composedPath()[0]?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const mod = ev.ctrlKey || ev.metaKey;
  if (mod && ev.key.toLowerCase() === "z") { ev.preventDefault(); undo(ed); }
  else if (mod && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(ed); }
  else if ((ev.key === "Delete" || ev.key === "Backspace") && ed.sel) { ev.preventDefault(); checkpoint(ed); blocks(ed, ed.sel.day).splice(ed.sel.idx, 1); ed.sel = null; commit(ed); }
  else if (ev.key === "Escape") { ed.sel = null; paint(ed); }
  else if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && ed.sel) {
    const b = blocks(ed, ed.sel.day)[ed.sel.idx]; if (!b || b[2] === null) return;
    ev.preventDefault(); checkpoint(ed); b[2] = Math.max(4, Math.min(35, b[2] + (ev.key === "ArrowUp" ? 0.5 : -0.5))); commit(ed);
  }
});
