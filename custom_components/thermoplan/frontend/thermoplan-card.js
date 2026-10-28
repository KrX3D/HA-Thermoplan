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

  static getStubConfig() {
    return { title: "Thermoplan" };
  }
}

customElements.define("thermoplan-card", ThermoplanCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "thermoplan-card",
  name: "Thermoplan",
  description: "Switch heating profile, set away days and see each room's target",
  preview: false,
});
