// Pure schedule editor logic (no DOM), used by thermoplan-schedule-editor.js and tested with `node --test` (tests/frontend).
//
// draft = { name, default_target, days: { "0": [[start, end, target], ...] } }: minutes since midnight,
// end up to 2880 (next day), target null = off, weekday 0 = Monday.

export const DAY = 1440;

const pad = (n) => String(n).padStart(2, "0");
export const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

// "7", "7:30", "7.30" or "0730" -> minutes; null for anything else
export function parseTime(text) {
  const t = String(text).trim().replace(".", ":");
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) m = /^(\d{1,2})(\d{2})$/.exec(t) || /^(\d{1,2})()$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2] || 0);
  if (hh > 24 || mm > 59) return null;
  return hh * 60 + mm;
}

// an end at or before the start means the next day
export const endOf = (start, typed) => (typed <= start ? typed + DAY : typed);

export const blocksOf = (draft, d) => draft.days[d] || (draft.days[d] = []);
export const firstStart = (draft, d) => blocksOf(draft, d).reduce((m, b) => Math.min(m, b[0]), DAY);

// parts of the previous day's blocks that run past midnight into day d
export function spillOf(draft, d) {
  const src = (d + 6) % 7, out = [];
  blocksOf(draft, src).forEach((b, i) => { if (b[1] > DAY) out.push({ src, idx: i, end: b[1] - DAY, t: b[2] }); });
  return out;
}

// free [start, end] intervals of day d (spill from the previous day counts as taken)
export function gaps(draft, d) {
  const taken = spillOf(draft, d).map((sp) => [0, sp.end])
    .concat(blocksOf(draft, d).map((b) => [b[0], Math.min(b[1], DAY)])).sort((x, y) => x[0] - y[0]);
  const out = []; let at = 0;
  taken.forEach(([s, e]) => { if (s > at) out.push([at, s]); at = Math.max(at, e); });
  if (at < DAY) out.push([at, DAY]);
  return out;
}

// Invalid and overlapping blocks over the whole week (Sunday wraps into Monday).
// Returns { bad: Set of "day:index", msgs: [text] }; T(key) gives the UI strings, T("days") the day names.
export function problems(draft, T) {
  const days = T("days");
  const iv = [];
  for (let d = 0; d < 7; d++) {
    blocksOf(draft, d).forEach((b, i) => {
      const invalid = b[0] < 0 || b[0] >= DAY || b[1] <= b[0] || b[1] > 2 * DAY || b[1] - b[0] > DAY;
      if (invalid) iv.push({ d, i, invalid: true, b, s: 0, e: 0 });
      else {
        const s = d * DAY + b[0], e = d * DAY + b[1], W = 7 * DAY;
        if (e > W) { iv.push({ d, i, s, e: W }); iv.push({ d, i, s: 0, e: e - W }); } else iv.push({ d, i, s, e });
      }
    });
  }
  const bad = new Set(), msgs = [];
  iv.filter((x) => x.invalid).forEach((x) => { bad.add(x.d + ":" + x.i); msgs.push(`${days[x.d]} ${fmt(x.b[0])}-${fmt(x.b[1])}: ${T("se_invalid")}`); });
  const ok = iv.filter((x) => !x.invalid).sort((a, b) => a.s - b.s);
  // compare with the interval that reaches furthest so far, not only the previous one:
  // in 01-05, 02-03, 04-06 the last block overlaps the first
  let far = null;
  for (const x of ok) {
    if (far && x.s < far.e && !(x.d === far.d && x.i === far.i)) {
      bad.add(x.d + ":" + x.i); bad.add(far.d + ":" + far.i);
      msgs.push(`${days[far.d]} / ${days[x.d]}: ${T("se_overlap")}`);
    }
    if (!far || x.e > far.e) far = x;
  }
  return { bad, msgs: [...new Set(msgs)] };
}

// Make room for block ``b`` (on day ``d``) by trimming, splitting or emptying the blocks it now overlaps,
// including blocks of the neighbouring days that run over midnight. A block that is covered completely
// ends up empty (start = end); it is flagged as an error and blocks saving until the user fixes it.
export function carve(draft, d, b) {
  const bs = b[0], be = b[1];
  for (const [dd, offset] of [[d, 0], [(d + 6) % 7, -DAY], [(d + 1) % 7, DAY]]) {
    const list = blocksOf(draft, dd);
    for (const x of [...list]) {
      if (x === b) continue;
      const xa = x[0] + offset, xe = x[1] + offset;
      if (!(xa < be && xe > bs)) continue;                       // no overlap
      if (xa < bs && xe > be) {                                  // b lies inside x
        if (dd === d) { list.push([be - offset, x[1], x[2]]); x[1] = bs - offset; } else x[1] = bs - offset;
      } else if (xa <= bs && xe > be) x[0] = be - offset;        // x starts with b and runs on
      else if (xa < bs) x[1] = bs - offset;                      // x starts before b
      else if (xe > be) x[0] = be - offset;                      // x starts inside b and runs past it
      else x[1] = x[0];                                          // x is covered completely
    }
  }
}

// free interval [lo, hi] around a minute on a day, ignoring block index `skip`
export function freeAround(draft, d, at, skip) {
  let lo = 0, hi = DAY;
  spillOf(draft, d).forEach((sp) => { lo = Math.max(lo, sp.end); });
  blocksOf(draft, d).forEach((b, i) => {
    if (i === skip) return;
    if (b[1] <= at) lo = Math.max(lo, Math.min(b[1], DAY));
    else if (b[0] >= at) hi = Math.min(hi, b[0]);
  });
  return [lo, hi];
}

// Where a new block goes for the "+" button: the free gap after the last block, else the first gap that fits
// a step; 1 hour long or up to the end of the gap. null when the day is full.
export function nextFreeBlock(draft, d, step, target) {
  const free = gaps(draft, d).filter(([s, e]) => e - s >= step);
  if (!free.length) return null;
  const lastEnd = blocksOf(draft, d).reduce((m, b) => Math.max(m, Math.min(b[1], DAY)), 0);
  const [gs, ge] = free.find(([s]) => s >= lastEnd) || free[0];
  return [gs, Math.min(gs + 60, ge), target];
}

// pointer x position on a day bar -> minute, snapped to the step and clamped to the day
export function minuteFromX(x, left, width, step) {
  const raw = ((x - left) / width) * DAY;
  return Math.max(0, Math.min(DAY, Math.round(raw / step) * step));
}

// Drawing a new block from minute dr.a (inside the free span dr.lo..dr.hi) to the pointer minute m.
export function createSpan(dr, m) {
  return { s: Math.max(dr.lo, Math.min(dr.a, m)), e: Math.min(dr.hi, Math.max(dr.a, m)) };
}

// Final [s, e] of a create drag; a plain click (less than one step) adds a 1-hour block. null = nothing to add.
export function createResult(dr, step) {
  let { s, e } = dr;
  if (e - s < step) { s = dr.a; e = Math.min(dr.hi, dr.a + 60); }
  return e - s >= step ? [s, e] : null;
}

// Apply a move/resize drag to block b for pointer minute m.
// dr.type: m (move), l / r (left / right edge), sm / sr (move / right edge on the next day's spill),
// ext (continue a block that ends at midnight). dr holds the start state: m0, s0, e0, len, lo, hi.
export function dragBlock(b, dr, m, step) {
  const s = step;
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
  return b;
}
