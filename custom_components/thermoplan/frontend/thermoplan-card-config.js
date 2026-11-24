// Pure card config logic (no DOM), used by thermoplan-card.js and tested with `node --test` (tests/frontend).

// Sections of the overview that the card can hide (config key show_<name>, default shown).
export const SECTIONS = ["profiles", "away", "warnings", "rooms", "legend", "reset"];

// card config -> options for mountOverview
export function overviewOptions(config) {
  const c = config || {};
  return {
    title: c.title ?? "Thermoplan",
    showTitle: c.show_title !== false && c.title !== "", // an empty title also hides it (older configs)
    show: Object.fromEntries(SECTIONS.map((key) => [key, c[`show_${key}`] !== false])),
    rooms: Array.isArray(c.rooms) ? c.rooms : [],
  };
}

// card config -> form data of the card editor (every field filled)
export function editorData(config) {
  const c = config || {};
  const data = { title: c.title ?? "Thermoplan", show_title: c.show_title !== false, rooms: c.rooms || [] };
  for (const key of SECTIONS) data[`show_${key}`] = c[`show_${key}`] !== false;
  return data;
}

// Form data -> new card config. Only what differs from the defaults is written (flags only as `false`,
// rooms only when some are picked) so the YAML stays short; unknown keys of the old config are kept.
export function configFromData(config, data) {
  const out = { ...config, title: data.title ?? "" };
  const flags = { show_title: data.show_title, ...Object.fromEntries(SECTIONS.map((key) => [`show_${key}`, data[`show_${key}`]])) };
  for (const [key, value] of Object.entries(flags)) {
    if (value === false) out[key] = false; else delete out[key];
  }
  if (data.rooms?.length) out.rooms = [...data.rooms]; else delete out.rooms;
  return out;
}

// Room options of the editor: discovered rooms, plus configured ones that no longer exist so they can be unticked.
export function roomOptions(rooms, configured) {
  const known = new Set(rooms.map((r) => r.entityId));
  return rooms.map((r) => ({ value: r.entityId, label: r.name }))
    .concat((configured || []).filter((id) => !known.has(id)).map((id) => ({ value: id, label: id })));
}
