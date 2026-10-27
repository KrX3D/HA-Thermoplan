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

## Open questions

- Away counter: exact semantics when set mid-day (decrement at reset time each day?)
