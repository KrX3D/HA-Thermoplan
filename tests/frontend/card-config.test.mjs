// node --test tests/frontend
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SECTIONS, configFromData, editorData, overviewOptions, roomOptions,
} from "../../custom_components/thermoplan/frontend/thermoplan-card-config.js";

const allShown = Object.fromEntries(SECTIONS.map((k) => [k, true]));

describe("overviewOptions", () => {
  test("defaults", () => {
    assert.deepEqual(overviewOptions({}), { title: "Thermoplan", showTitle: true, show: allShown, rooms: [] });
    assert.deepEqual(overviewOptions(undefined), overviewOptions({}));
  });
  test("an empty title or show_title false hides the title", () => {
    assert.equal(overviewOptions({ title: "" }).showTitle, false);
    assert.equal(overviewOptions({ title: "Heat", show_title: false }).showTitle, false);
    assert.equal(overviewOptions({ title: "Heat" }).title, "Heat");
  });
  test("only false hides a section; rooms must be a list", () => {
    const o = overviewOptions({ show_away: false, show_legend: null, show_reset: 0, rooms: "sensor.x" });
    assert.equal(o.show.away, false);
    assert.equal(o.show.legend, true);
    assert.equal(o.show.reset, true);
    assert.deepEqual(o.rooms, []);
    assert.deepEqual(overviewOptions({ rooms: ["sensor.a"] }).rooms, ["sensor.a"]);
  });
});

describe("card editor config", () => {
  test("editorData fills every field", () => {
    assert.deepEqual(editorData({}), {
      title: "Thermoplan", show_title: true, rooms: [],
      show_profiles: true, show_away: true, show_warnings: true, show_rooms: true, show_legend: true, show_reset: true,
    });
    const d = editorData({ title: "", show_rooms: false, rooms: ["sensor.a"] });
    assert.equal(d.title, "");
    assert.equal(d.show_rooms, false);
    assert.deepEqual(d.rooms, ["sensor.a"]);
  });
  test("unchanged defaults write only the title", () => {
    const cfg = { type: "custom:thermoplan-card" };
    assert.deepEqual(configFromData(cfg, editorData(cfg)), { type: "custom:thermoplan-card", title: "Thermoplan" });
  });
  test("only false flags are written, true removes them again", () => {
    const cfg = { type: "custom:thermoplan-card", title: "T", show_away: false, show_title: false };
    const data = { ...editorData(cfg), show_away: true, show_title: true, show_legend: false };
    assert.deepEqual(configFromData(cfg, data), { type: "custom:thermoplan-card", title: "T", show_legend: false });
  });
  test("rooms only when some are picked; the list is copied", () => {
    const rooms = ["sensor.a", "sensor.b"];
    const out = configFromData({ rooms: ["sensor.old"] }, { ...editorData({}), rooms });
    assert.deepEqual(out.rooms, rooms);
    assert.notEqual(out.rooms, rooms);
    assert.equal("rooms" in configFromData({ rooms: ["sensor.old"] }, { ...editorData({}), rooms: [] }), false);
    assert.equal("rooms" in configFromData({ rooms: ["sensor.old"] }, { title: "x" }), false);
  });
  test("unknown keys survive, a missing title becomes empty, the input is not mutated", () => {
    const cfg = { type: "custom:thermoplan-card", grid_options: { columns: 6 }, show_reset: false };
    const out = configFromData(cfg, { show_reset: true });
    assert.deepEqual(out, { type: "custom:thermoplan-card", grid_options: { columns: 6 }, title: "" });
    assert.equal(cfg.show_reset, false);
  });
  test("round trip keeps the config", () => {
    const cfg = { type: "custom:thermoplan-card", title: "Heizung", show_warnings: false, rooms: ["sensor.b", "sensor.a"] };
    assert.deepEqual(configFromData(cfg, editorData(cfg)), cfg);
  });
});

describe("roomOptions", () => {
  test("discovered rooms first, then configured rooms that no longer exist", () => {
    const rooms = [{ entityId: "sensor.a", name: "Bad" }, { entityId: "sensor.b", name: "Küche" }];
    assert.deepEqual(roomOptions(rooms, ["sensor.b", "sensor.gone"]), [
      { value: "sensor.a", label: "Bad" }, { value: "sensor.b", label: "Küche" }, { value: "sensor.gone", label: "sensor.gone" },
    ]);
    assert.deepEqual(roomOptions([], undefined), []);
  });
});
