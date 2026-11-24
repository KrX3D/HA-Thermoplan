// node --test tests/frontend
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DAY, fmt, parseTime, endOf, spillOf, gaps, problems, carve, freeAround, nextFreeBlock,
  minuteFromX, createSpan, createResult, dragBlock,
} from "../../custom_components/thermoplan/frontend/thermoplan-schedule-logic.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const T = (key) => (key === "days" ? DAYS : key);
const draft = (days) => ({ name: "x", default_target: null, days });
const h = (hh, mm = 0) => hh * 60 + mm;

describe("parseTime / fmt / endOf", () => {
  test("accepted formats", () => {
    assert.equal(parseTime("7"), h(7));
    assert.equal(parseTime("07:30"), h(7, 30));
    assert.equal(parseTime("7.30"), h(7, 30));
    assert.equal(parseTime("0730"), h(7, 30));
    assert.equal(parseTime(" 22:15 "), h(22, 15));
    assert.equal(parseTime("0"), 0);
    assert.equal(parseTime("24"), DAY);
  });
  test("rejected input", () => {
    for (const bad of ["", "abc", "25", "7:60", "7:5", "12345", "-1", "7:30pm"]) assert.equal(parseTime(bad), null, bad);
  });
  test("fmt wraps past midnight", () => {
    assert.equal(fmt(0), "00:00");
    assert.equal(fmt(h(7, 5)), "07:05");
    assert.equal(fmt(DAY), "00:00");
    assert.equal(fmt(DAY + h(1, 30)), "01:30");
  });
  test("an end at or before the start means the next day", () => {
    assert.equal(endOf(h(22), h(1)), DAY + h(1));
    assert.equal(endOf(h(8), h(8)), DAY + h(8));
    assert.equal(endOf(h(8), 0), DAY); // 00:00 as end = midnight
    assert.equal(endOf(h(8), h(9)), h(9));
  });
});

describe("gaps / spill", () => {
  test("empty day is one gap", () => {
    assert.deepEqual(gaps(draft({}), 0), [[0, DAY]]);
  });
  test("blocks and spill from the previous day are taken", () => {
    const d = draft({ 0: [[h(22), DAY + h(2), 20]], 1: [[h(6), h(8), 21], [h(8), h(9), 19]] });
    assert.deepEqual(spillOf(d, 1), [{ src: 0, idx: 0, end: h(2), t: 20 }]);
    assert.deepEqual(gaps(d, 1), [[h(2), h(6)], [h(9), DAY]]);
    assert.deepEqual(gaps(d, 0), [[0, h(22)]]); // the cross-midnight block is cut at the day end
  });
  test("Sunday spills into Monday", () => {
    const d = draft({ 6: [[h(23), DAY + h(1), 18]] });
    assert.deepEqual(spillOf(d, 0), [{ src: 6, idx: 0, end: h(1), t: 18 }]);
  });
  test("full day has no gap", () => {
    assert.deepEqual(gaps(draft({ 2: [[0, DAY, 20]] }), 2), []);
  });
});

describe("problems (overlap check)", () => {
  test("valid week, adjacent blocks touch but do not overlap", () => {
    const r = problems(draft({ 0: [[h(6), h(8), 21], [h(8), h(22), 19]], 1: [[h(22), DAY + h(6), null]], 2: [[h(6), h(7), 20]] }), T);
    assert.deepEqual(r.msgs, []);
    assert.equal(r.bad.size, 0);
  });
  test("overlap on the same day flags both blocks", () => {
    const r = problems(draft({ 3: [[h(6), h(9), 21], [h(8), h(10), 19]] }), T);
    assert.deepEqual([...r.bad].sort(), ["3:0", "3:1"]);
    assert.deepEqual(r.msgs, ["Thu / Thu: se_overlap"]);
  });
  test("a block crossing midnight overlaps the next day's first block", () => {
    const r = problems(draft({ 0: [[h(22), DAY + h(7), 18]], 1: [[h(6), h(8), 21]] }), T);
    assert.deepEqual([...r.bad].sort(), ["0:0", "1:0"]);
    assert.deepEqual(r.msgs, ["Mon / Tue: se_overlap"]);
  });
  test("Sunday night block wraps into Monday", () => {
    const r = problems(draft({ 6: [[h(22), DAY + h(7), 18]], 0: [[h(6), h(8), 21]] }), T);
    assert.deepEqual([...r.bad].sort(), ["0:0", "6:0"]);
    const ok = problems(draft({ 6: [[h(22), DAY + h(6), 18]], 0: [[h(6), h(8), 21]] }), T);
    assert.deepEqual(ok.msgs, []);
  });
  test("invalid blocks", () => {
    const cases = [[h(8), h(8), 20], [h(9), h(8), 20], [-10, h(1), 20], [DAY, DAY + 60, 20], [h(1), 2 * DAY + 1, 20], [h(1), DAY + h(2), 20]];
    for (const b of cases) {
      const r = problems(draft({ 4: [b] }), T);
      assert.ok(r.bad.has("4:0"), JSON.stringify(b));
      assert.match(r.msgs[0], /^Fri .*: se_invalid$/);
    }
  });
  test("a full 24 h block is valid; an overlap with an earlier, longer block is found; the same message is reported once", () => {
    assert.deepEqual(problems(draft({ 0: [[h(6), DAY + h(6), 20]] }), T).msgs, []);
    const r = problems(draft({ 0: [[h(1), h(5), 20], [h(2), h(3), 20], [h(4), h(6), 20]] }), T);
    assert.deepEqual(r.msgs, ["Mon / Mon: se_overlap"]);
    assert.equal(r.bad.size, 3);
  });
});

describe("carve (typed times make room)", () => {
  test("a block inside another splits it", () => {
    const b = [h(10), h(12), 22];
    const d = draft({ 0: [[h(6), h(20), 19], b] });
    carve(d, 0, b);
    d.days[0].sort((x, y) => x[0] - y[0]);
    assert.deepEqual(d.days[0], [[h(6), h(10), 19], b, [h(12), h(20), 19]]);
  });
  test("trims a block it overlaps at either end and empties one it covers", () => {
    const b = [h(8), h(12), 22];
    const d = draft({ 0: [[h(6), h(9), 19], [h(9), h(10), 18], [h(11), h(14), 17], b] });
    carve(d, 0, b);
    assert.deepEqual(d.days[0].slice(0, 3), [[h(6), h(8), 19], [h(9), h(9), 18], [h(12), h(14), 17]]);
    assert.ok(problems(d, T).bad.has("0:1"), "the emptied block is flagged");
  });
  test("a cross-midnight block trims the next day's first block", () => {
    const b = [h(22), DAY + h(7), 18];
    const d = draft({ 0: [b], 1: [[h(6), h(9), 21]] });
    carve(d, 0, b);
    assert.deepEqual(d.days[1], [[h(7), h(9), 21]]);
    assert.deepEqual(problems(d, T).msgs, []);
  });
  test("an early block trims the previous day's spill", () => {
    const b = [h(5), h(8), 21];
    const d = draft({ 6: [[h(22), DAY + h(7), 18]], 0: [b] });
    carve(d, 0, b);
    assert.deepEqual(d.days[6], [[h(22), DAY + h(5), 18]]);
  });
  test("no overlap leaves the others alone", () => {
    const b = [h(10), h(11), 20];
    const d = draft({ 0: [[h(8), h(10), 19], b, [h(11), h(12), 19]] });
    carve(d, 0, b);
    assert.deepEqual(d.days[0], [[h(8), h(10), 19], b, [h(11), h(12), 19]]);
  });
});

describe("freeAround / nextFreeBlock", () => {
  test("free span between blocks and after spill", () => {
    const d = draft({ 0: [[h(22), DAY + h(2), 20]], 1: [[h(6), h(8), 21], [h(18), h(20), 19]] });
    assert.deepEqual(freeAround(d, 1, h(12), -1), [h(8), h(18)]);
    assert.deepEqual(freeAround(d, 1, h(3), -1), [h(2), h(6)]);
    assert.deepEqual(freeAround(d, 1, h(7), 0), [h(2), h(18)]); // skip the block itself
    assert.deepEqual(freeAround(d, 0, h(12), -1), [0, h(22)]);
  });
  test("+ adds 1 h after the last block", () => {
    assert.deepEqual(nextFreeBlock(draft({}), 0, 15, 21), [0, 60, 21]);
    assert.deepEqual(nextFreeBlock(draft({ 0: [[h(6), h(8), 20]] }), 0, 15, 21), [h(8), h(9), 21]);
  });
  test("+ uses an earlier gap when the day end is taken, and a short gap is shortened", () => {
    const d = draft({ 0: [[h(6), h(8), 20], [h(8, 30), DAY, 19]] });
    assert.deepEqual(nextFreeBlock(d, 0, 15, null), [0, 60, null]);
    const tight = draft({ 0: [[0, h(8), 20], [h(8, 30), DAY, 19]] });
    assert.deepEqual(nextFreeBlock(tight, 0, 15, 20), [h(8), h(8, 30), 20]);
  });
  test("+ on a full day or with only gaps below one step returns null", () => {
    assert.equal(nextFreeBlock(draft({ 0: [[0, DAY, 20]] }), 0, 15, 20), null);
    assert.equal(nextFreeBlock(draft({ 0: [[0, h(8), 20], [h(8, 10), DAY, 19]] }), 0, 15, 20), null);
    assert.deepEqual(nextFreeBlock(draft({ 0: [[0, h(8), 20], [h(8, 10), DAY, 19]] }), 0, 5, 20), [h(8), h(8, 10), 20]);
  });
});

describe("drag-to-draw snapping", () => {
  test("pointer x snaps to the step and is clamped to the day", () => {
    // 1440 px wide bar starting at x=100: 1 px = 1 minute
    assert.equal(minuteFromX(100 + 427, 100, 1440, 15), 420);
    assert.equal(minuteFromX(100 + 428, 100, 1440, 15), 435);
    assert.equal(minuteFromX(100 + 427, 100, 1440, 5), 425);
    assert.equal(minuteFromX(100 + 450, 100, 1440, 60), 480);
    assert.equal(minuteFromX(50, 100, 1440, 15), 0);
    assert.equal(minuteFromX(5000, 100, 1440, 15), DAY);
    assert.equal(minuteFromX(100 + 360, 100, 720, 30), 720); // half-width bar
  });
  test("drawing right or left of the anchor, clamped to the free span", () => {
    const dr = { a: h(10), lo: h(8), hi: h(14) };
    assert.deepEqual(createSpan(dr, h(12)), { s: h(10), e: h(12) });
    assert.deepEqual(createSpan(dr, h(9)), { s: h(9), e: h(10) });
    assert.deepEqual(createSpan(dr, h(20)), { s: h(10), e: h(14) });
    assert.deepEqual(createSpan(dr, h(3)), { s: h(8), e: h(10) });
  });
  test("a click adds a 1 h block, shorter when the next block is closer", () => {
    assert.deepEqual(createResult({ a: h(10), lo: 0, hi: DAY, s: h(10), e: h(10) }, 15), [h(10), h(11)]);
    assert.deepEqual(createResult({ a: h(10), lo: 0, hi: h(10, 30), s: h(10), e: h(10) }, 15), [h(10), h(10, 30)]);
    assert.deepEqual(createResult({ a: h(23, 30), lo: 0, hi: DAY, s: h(23, 30), e: h(23, 30) }, 15), [h(23, 30), DAY]);
    assert.equal(createResult({ a: h(10), lo: 0, hi: h(10, 10), s: h(10), e: h(10) }, 15), null);
  });
  test("a drawn span is kept as is", () => {
    assert.deepEqual(createResult({ a: h(10), lo: 0, hi: DAY, s: h(10), e: h(13, 15) }, 15), [h(10), h(13, 15)]);
  });
});

describe("dragBlock (move / resize)", () => {
  const base = (b, extra) => ({ m0: h(10), s0: b[0], e0: b[1], len: b[1] - b[0], lo: 0, hi: DAY, ...extra });
  test("move keeps the length, snaps and stays inside the free span", () => {
    const b = [h(10), h(12), 20];
    dragBlock(b, base(b, { type: "m", lo: h(8), hi: h(16) }), h(11, 8), 15);
    assert.deepEqual(b, [h(11, 15), h(13, 15), 20]);
    dragBlock(b, base([h(10), h(12)], { type: "m", lo: h(8), hi: h(16) }), h(20), 15);
    assert.deepEqual(b, [h(14), h(16), 20]);
    dragBlock(b, base([h(10), h(12)], { type: "m", lo: h(8), hi: h(16) }), 0, 15);
    assert.deepEqual(b, [h(8), h(10), 20]);
  });
  test("left edge stops one step before the end and at the previous block", () => {
    const b = [h(10), h(12), 20];
    dragBlock(b, base(b, { type: "l", lo: h(9) }), h(13), 15);
    assert.deepEqual(b, [h(11, 45), h(12), 20]);
    dragBlock(b, base([h(10), h(12)], { type: "l", lo: h(9) }), h(7), 15);
    assert.equal(b[0], h(9));
  });
  test("right edge stops one step after the start and at the next block", () => {
    const b = [h(10), h(12), 20];
    dragBlock(b, base(b, { type: "r", hi: h(15) }), h(9), 15);
    assert.deepEqual(b, [h(10), h(10, 15), 20]);
    dragBlock(b, base([h(10), h(12)], { type: "r", hi: h(15) }), h(18), 15);
    assert.equal(b[1], h(15));
  });
  test("right edge of a cross-midnight block keeps its end until dragged back into the day", () => {
    const b = [h(22), DAY + h(2), 20];
    dragBlock(b, base(b, { type: "r", hi: DAY + h(6) }), DAY, 15);
    assert.equal(b[1], DAY + h(2));
    dragBlock(b, base([h(22), DAY + h(2)], { type: "r", hi: DAY + h(6) }), h(23), 15);
    assert.equal(b[1], h(23));
  });
  test("spill right edge: at least one step past midnight, at most 24 h and before the next day's first block", () => {
    const b = [h(22), DAY + h(2), 20];
    const dr = base(b, { type: "sr", hi: DAY + h(6) });
    dragBlock(b, dr, 0, 15);
    assert.equal(b[1], DAY + 15);
    dragBlock(b, dr, h(4), 15);
    assert.equal(b[1], DAY + h(4));
    dragBlock(b, dr, h(9), 15);
    assert.equal(b[1], DAY + h(6));
    const long = [h(2), DAY + h(1), 20];
    dragBlock(long, base(long, { type: "sr", hi: 2 * DAY }), h(5), 15);
    assert.equal(long[1], DAY + h(2)); // not longer than 24 h
  });
  test("continuing a block that ends at midnight; back below one step snaps to midnight", () => {
    const b = [h(20), DAY, 20];
    const dr = { type: "ext", m0: 0, s0: b[0], e0: b[1], len: b[1] - b[0], lo: 0, hi: DAY + h(6) };
    dragBlock(b, dr, h(3), 15);
    assert.equal(b[1], DAY + h(3));
    dragBlock(b, dr, 10, 15);
    assert.equal(b[1], DAY);
    dragBlock(b, dr, h(8), 15);
    assert.equal(b[1], DAY + h(6));
  });
  test("moving a spill keeps the length and is limited by the next day's first block", () => {
    const b = [h(22), DAY + h(2), 20];
    const dr = { type: "sm", m0: h(1), s0: b[0], e0: b[1], len: b[1] - b[0], lo: h(20), hi: DAY + h(3) };
    dragBlock(b, dr, h(5), 15);
    assert.deepEqual(b, [h(23), DAY + h(3), 20]);
  });
});
