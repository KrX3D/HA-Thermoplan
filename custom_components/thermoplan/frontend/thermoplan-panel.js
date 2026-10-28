import { STYLE, mountOverview } from "./thermoplan-common.js";

class ThermoplanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._update = null;
  }

  connectedCallback() {
    if (this._update) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${STYLE}
        :host { display: block; background: var(--primary-background-color); min-height: 100vh; }
        header { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 16px;
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, var(--text-primary-color, #fff)); }
        header h1 { font-size: 1.25em; font-weight: 400; margin: 0; }
        main { max-width: 900px; margin: 16px auto; padding: 0 16px; }
        .wrap { border-radius: var(--ha-card-border-radius, 12px); }
      </style>
      <header>
        <ha-menu-button></ha-menu-button>
        <h1>Thermoplan</h1>
      </header>
      <main><div class="wrap"></div></main>`;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    menu.hass = this._hass;
    menu.narrow = this._narrow;
    this._menu = menu;
    this._update = mountOverview(this.shadowRoot.querySelector(".wrap"), () => this._hass, {
      showTitle: false,
    });
    if (this._hass) this._update(this._hass);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
    if (this._update) this._update(hass);
  }

  set narrow(narrow) {
    this._narrow = narrow;
    if (this._menu) this._menu.narrow = narrow;
  }

  set panel(_panel) {}
  set route(_route) {}
}

customElements.define("thermoplan-panel", ThermoplanPanel);
