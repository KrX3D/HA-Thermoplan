import { STYLE, mountOverview } from "./thermoplan-common.js";

class ThermoplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._update = null;
    this._config = {};
  }

  setConfig(config) {
    this._config = config || {};
    if (this._update) this._update = null;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="body"></div></ha-card>`;
    this._body = this.shadowRoot.querySelector(".body");
    this._update = mountOverview(this._body, () => this._hass, {
      title: this._config.title ?? "Thermoplan",
      showTitle: this._config.title !== "",
    });
    if (this._hass) this._update(this._hass);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._update) this._update(hass);
  }

  getCardSize() {
    return 4;
  }

  static getConfigElement() {
    return document.createElement("thermoplan-card-editor");
  }

  static getStubConfig() {
    return { title: "Thermoplan" };
  }
}

class ThermoplanCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  _render() {
    const de = (this._hass?.language || navigator.language || "en").startsWith("de");
    this.innerHTML = `<div style="padding:8px 0"><label>${de ? "Titel (leer = ausblenden)" : "Title (empty = hidden)"}
      <input type="text" style="width:100%;margin-top:4px;padding:8px;box-sizing:border-box" /></label></div>`;
    const input = this.querySelector("input");
    input.value = this._config.title ?? "Thermoplan";
    input.addEventListener("change", () => {
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: { ...this._config, title: input.value } }, bubbles: true, composed: true,
      }));
    });
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
