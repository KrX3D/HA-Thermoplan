import { STYLE, addStrings, discover, mountOverview, tr } from "./thermoplan-common.js";

// Sections of the overview that the card can hide (config key show_<name>, default shown).
const SECTIONS = ["profiles", "away", "warnings", "rooms", "legend", "reset"];

addStrings(
  {
    ce_title: "Title", ce_show_title: "Show title", ce_rooms: "Rooms to show (none selected = all rooms)",
    ce_show_profiles: "Profile buttons", ce_show_away: "Away and heating season", ce_show_warnings: "Warnings",
    ce_show_rooms: "Room table", ce_show_legend: "Colour legend", ce_show_reset: "Button: reset manual changes and holds",
    ce_sections: "Sections",
  },
  {
    ce_title: "Titel", ce_show_title: "Titel anzeigen", ce_rooms: "Angezeigte Räume (keiner gewählt = alle Räume)",
    ce_show_profiles: "Profil-Schaltflächen", ce_show_away: "Abwesenheit und Heizperiode", ce_show_warnings: "Warnungen",
    ce_show_rooms: "Raumtabelle", ce_show_legend: "Farblegende", ce_show_reset: "Schaltfläche: manuelle Änderungen und Halten zurücksetzen",
    ce_sections: "Bereiche",
  },
);

class ThermoplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._update = null;
    this._config = {};
  }

  setConfig(config) {
    this._config = config || {};
    const c = this._config;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="body"></div></ha-card>`;
    this._body = this.shadowRoot.querySelector(".body");
    this._update = mountOverview(this._body, () => this._hass, {
      title: c.title ?? "Thermoplan",
      showTitle: c.show_title !== false && c.title !== "", // an empty title also hides it (older configs)
      show: Object.fromEntries(SECTIONS.map((key) => [key, c[`show_${key}`] !== false])),
      rooms: Array.isArray(c.rooms) ? c.rooms : [],
    });
    if (this._hass) this._update(this._hass);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._update) this._update(hass);
  }

  getCardSize() {
    const c = this._config;
    if (c.show_rooms === false) return 2;
    const rooms = c.rooms?.length || (this._hass ? discover(this._hass).rooms.length : 4);
    return 2 + rooms;
  }

  static getConfigElement() {
    return document.createElement("thermoplan-card-editor");
  }

  static getStubConfig() {
    return { title: "Thermoplan" };
  }
}

// Card editor: uses Home Assistant's ha-form when it is loaded (it is in the dashboard editor), else plain inputs.
class ThermoplanCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    // the room list comes from hass: render again once it arrives or when rooms change
    const sig = discover(hass).rooms.map((r) => r.entityId + "=" + r.name).join("|");
    if (first || sig !== this._roomSig) { this._roomSig = sig; this._render(); }
  }

  _data() {
    const c = this._config;
    const data = { title: c.title ?? "Thermoplan", show_title: c.show_title !== false, rooms: c.rooms || [] };
    for (const key of SECTIONS) data[`show_${key}`] = c[`show_${key}`] !== false;
    return data;
  }

  _schema() {
    const rooms = this._hass ? discover(this._hass).rooms : [];
    const known = new Set(rooms.map((r) => r.entityId));
    const options = rooms.map((r) => ({ value: r.entityId, label: r.name }))
      // keep rooms from the config that no longer exist, so they can be unticked
      .concat((this._config.rooms || []).filter((id) => !known.has(id)).map((id) => ({ value: id, label: id })));
    return [
      { name: "title", selector: { text: {} } },
      { name: "show_title", selector: { boolean: {} } },
      { name: "rooms", selector: { select: { multiple: true, mode: "list", options } } },
      ...SECTIONS.map((key) => ({ name: `show_${key}`, selector: { boolean: {} } })),
    ];
  }

  _label(name) {
    const key = name === "title" ? "ce_title" : name === "rooms" ? "ce_rooms" : `ce_${name}`;
    return tr(this._hass, key);
  }

  _changed(data) {
    const config = { ...this._config, title: data.title ?? "" };
    // write only what differs from the defaults so the YAML stays short
    const flags = { show_title: data.show_title, ...Object.fromEntries(SECTIONS.map((key) => [`show_${key}`, data[`show_${key}`]])) };
    for (const [key, value] of Object.entries(flags)) {
      if (value === false) config[key] = false; else delete config[key];
    }
    if (data.rooms?.length) config.rooms = [...data.rooms]; else delete config.rooms;
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this._config) return;
    if (customElements.get("ha-form")) {
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (schema) => this._label(schema.name);
        this._form.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._changed(ev.detail.value); });
        this.replaceChildren(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = this._schema();
      this._form.data = this._data();
      return;
    }
    this._renderPlain();
  }

  // Fallback without ha-form (and for the screenshot harness).
  _renderPlain() {
    const data = this._data();
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;padding:8px 0";
    const emit = () => this._changed(data);
    for (const field of this._schema()) {
      const label = document.createElement("label");
      label.style.cssText = "display:flex;gap:8px;align-items:center";
      if (field.selector.text) {
        label.style.flexDirection = "column"; label.style.alignItems = "stretch";
        const input = Object.assign(document.createElement("input"), { type: "text", value: data.title });
        input.style.cssText = "padding:8px;box-sizing:border-box";
        input.addEventListener("change", () => { data.title = input.value; emit(); });
        label.append(this._label(field.name), input);
      } else if (field.selector.boolean) {
        const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: data[field.name] });
        box.addEventListener("change", () => { data[field.name] = box.checked; emit(); });
        label.append(box, this._label(field.name));
      } else {
        label.style.flexDirection = "column"; label.style.alignItems = "flex-start";
        label.append(this._label(field.name));
        for (const option of field.selector.select.options) {
          const row = document.createElement("label");
          const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: data.rooms.includes(option.value) });
          box.addEventListener("change", () => {
            data.rooms = box.checked ? [...data.rooms, option.value] : data.rooms.filter((id) => id !== option.value);
            emit();
          });
          row.append(box, " ", option.label);
          label.append(row);
        }
      }
      wrap.append(label);
    }
    this.replaceChildren(wrap);
  }
}

customElements.define("thermoplan-card-editor", ThermoplanCardEditor);
customElements.define("thermoplan-card", ThermoplanCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermoplan-card",
  name: "Thermoplan",
  description: "Switch heating profile, set away days and see each room's target",
  preview: false,
});
