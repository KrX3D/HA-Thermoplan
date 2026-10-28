# HA-Thermoplan - project notes

Custom HA integration, domain `thermoplan`, HACS, English + German (`translations/en.json` and `de.json` always together).

## Decisions

- Runs on top of Better Thermostat (`climate.better_thermostat_*`). Does NOT use BT's outdoor cutoff; Thermoplan owns it.
- Profiles are global (one active), per-room profile override possible later.
- Rooms = config subentries (min HA 2025.3, confirm with user). Profiles and schedules live in HA storage (`Store`) with websocket commands for the editor.
- Schedule model: named schedules, non-overlapping blocks per weekday, "copy to other days", default target for gaps, blocks may cross midnight.
- Per room: off-behavior (hvac off or fixed target e.g. 4.5), override timeout in minutes (0 = none), optional window sensors (for users without BT), optional outdoor-cutoff scope (global/room).
- Outdoor cutoff: compare outdoor temp to the room's CURRENT target (+offset); off after >= X min above, on again after Z min below. Outdoor sensor first, weather entity as fallback if the sensor is unavailable. Both optional.
- Heating season: start/end day+month, replaces `sensor.heizperiode` + 4 input_selects. Outside season -> profile forced to Off. On season start -> restore the profile stored before.
- Away counter (days) replaces `input_text.nothomeintillint`; previous profile stored in the integration instead of `input_text.heaing_profile_which_was_set_before_nothome`. Season start is delayed while away days remain.
- Presence rules: entity state change / zone enter-leave -> switch profile.
- Frontend: one custom card with built-in editor (card picker) + sidebar panel sharing the same component.
- Schedy importer for the original `x: IncludeSchedule(...) if heating_mode() == '...'` + `v/rules` format.

## Origin (user's current setup)

Schedy (AppDaemon) with 6 profiles in `input_select.heizungsmodus`; rooms: Arbeitszimmer, Badezimmer, Kueche, Schlafzimmer, Wohnzimmer Balkon (+ commented Esszimmer, WC, WZ Fenster). `rescheduling_delay: 60` = manual override timeout. Schedy fallback value is "OFF". Some Zigbee TRVs only accept 4.5 as off.

## Resolved (2026-10-27)

- Min HA 2026.10 (user runs latest). Code, comments and docs in English; UI en + de.
- Away counter: days, configurable reset time (user used 13:00; they usually return ~19:00). Setting it to 0 = back early: restore previous profile immediately.
- Presence: `person.*` entity; its state is `home`, `not_home` or a zone NAME (zones are user-named, so rules use configurable zone names; offer a picker populated from existing `zone.*` entities). Rule: state A -> B switches profile P.
- Window logic that sets thermostats to off / 4.5 is ignored when detecting manual overrides.
- Importer: import everything possible (schedules, profile mapping parsed from `heating_mode() == '...'`, rescheduling_delay, rooms/actors); report clearly what could not be imported.
- Overlap: non-overlapping blocks per weekday, default fallback target for gaps.

## Workflow

- Keep the repo in sync with the work; every change set = new branch + PR against KrX3D/HA-Thermoplan `main`. No `gh` CLI: use the REST API (see user memory).

- Away counter: set N days on day D -> resumes on D+N at the configurable reset time (default 13:00).
- Override tolerance 0.5 C.

## Layout

- `custom_components/thermoplan/engine/`: pure Python (schedule, away, cutoff, override), no HA imports. Tests in `tests/engine/`. Weekdays 0=Monday; times in minutes; a block `end` may exceed 1440 (max 2880) to cross midnight.

- HA layer: `controller.py` (evaluates rooms every minute + on state changes, applies targets, detects manual overrides), `store.py`, `config_flow.py` (hub + `room` subentries), entities (`select` profile, `binary_sensor` heating season, `number` away days, per-room `sensor` target+reason). HA imports in `__init__.py` stay inside functions so engine tests run without HA. HA tests (`tests/test_controller.py`) are skipped locally on Windows (no wheels); they run in CI on 3.14.
- `websocket_api.py` (admin only): `thermoplan/get`, `set_profiles`, `set_schedule` (validated), `delete_schedule`, `set_room_plan`, `set_settings`. Options flow edits global settings (not presence rules; those go via `set_settings`). Profile/settings changes reload the entry; schedule/plan changes only re-evaluate.
- `schedy_import.py` + `thermoplan/import_schedy` websocket command: parses Schedy YAML (first matching rule wins, `+1d` ends, `:59:59` ends round up), matches rooms by climate entity or creates them, returns a report with warnings for everything not imported.
- Frontend (`custom_components/thermoplan/frontend/`, vanilla JS web components, no build step, served at `/thermoplan_static`): `thermoplan-common.js` (strings en/de, entity discovery via `hass.entities` platform/translation_key, shared overview), `thermoplan-card.js` (`custom:thermoplan-card`, in card picker), `thermoplan-panel.js` (admin sidebar panel). Registered in `frontend.py` only when frontend/http/panel_custom are loaded.
- Panel tabs: Overview, Schedules (`thermoplan-editor.js`: per-day block rows with a colored 24h bar, copy day, +1 day end, off blocks, rename/delete) and Plans (profiles add/rename/remove, room x profile schedule matrix). `set_profiles` accepts `renames` to keep plans/active profile/presence rules.
- Settings tab (`thermoplan-settings.js`): season, away reset time, person + presence rules (states: home, not_home, zone names), global cutoff, Schedy import with report. Saves via `set_settings`.
- Not yet built: drag-to-draw on the bar, card config editor, README usage docs. The JS has no automated tests (no DOM harness); verify in a browser.

## Open questions

- None right now.

## Update 2026-10-28

- The integration page has no forms: config flow only creates the hub; the options flow only links to `/thermoplan`; no subentry types are offered. Rooms are subentries managed by websocket (`save_room`, `delete_room`) from the panel Rooms tab. All settings are in the panel.
- Away: `date` entity "Away until" (+ `number` days, `binary_sensor` away). `Settings.away_profile`: profile used while away; None = rooms off. The active profile is never changed by away.
- `CutoffSettings.threshold`: optional fixed outdoor temperature, else the room's current target.
- Panel tabs: Overview, Rooms, Schedules, Plans, Settings, Schedy import.
