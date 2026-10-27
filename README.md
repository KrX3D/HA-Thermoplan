# HA-Thermoplan

Home Assistant integration for schedule-based thermostat control with global heating profiles.
It replaces AppDaemon + Schedy and the helper/automation glue around it.

> Status: planning. Nothing is implemented yet.

## Concept

- **Profiles** are global modes (e.g. "Home office", "Away", "Saving"). One profile is active at a time.
- **Schedules** are reusable, named weekly plans (target temperature per time block, blocks may cross midnight).
- Each **room** (one or more thermostats) maps every profile to a schedule.
- Thermoplan sits on top of [Better Thermostat](https://github.com/KartoffelToby/better_thermostat): it only sets targets / turns thermostats off. Window sensors and the external temperature sensor stay with Better Thermostat. Without Better Thermostat, window sensors can be configured per room.

## Planned features

- Config flow in the UI; rooms are config subentries
- Graphical weekly schedule editor as sidebar panel and as custom Lovelace card (card picker)
- Heating season (start/end date) with automatic "off" outside it
- Away / vacation counter in days (replaces the `nothomeintillint` helper) and automatic restore of the previous profile
- Presence-based profile switching (enter / leave a zone or state change)
- Outdoor-temperature cutoff: heating off when outdoor temperature stays above the room's current target for X minutes (global or per room; outdoor sensor with weather-entity fallback)
- Per-room manual-override timeout (0 = no override)
- Per-room "off" definition (HVAC off or a fixed target such as 4.5 C)
- Schedy YAML importer
- HACS installation, English and German

## Installation

Not available yet. Will be installable as a HACS custom repository.

## License

MIT
