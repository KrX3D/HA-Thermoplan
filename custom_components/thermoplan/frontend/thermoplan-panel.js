import { STYLE, mountOverview, tr } from "./thermoplan-common.js";
import { EDITOR_STYLE, mountEditor } from "./thermoplan-editor.js";

const TABS = ["overview", "schedules", "plans"];

class ThermoplanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._mounted = false;
    this._tab = "overview";
  }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    this.shadowRoot.innerHTML = `
      <style>
        ${STYLE}
        ${EDITOR_STYLE}
        :host { display: block; background: var(--primary-background-color); min-height: 100vh; }
        header { display: flex; align-items: center; gap: 8px; height: 56px; padding: 0 16px;
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, var(--text-primary-color, #fff)); }
        header h1 { font-size: 1.25em; font-weight: 400; margin: 0; }
        main { max-width: 1000px; margin: 16px auto; padding: 0 16px; }
        .wrap { border-radius: var(--ha-card-border-radius, 12px); }
      </style>
      <header>
        <ha-menu-button></ha-menu-button>
        <h1>Thermoplan</h1>
      </header>
      <main><div class="wrap">
        <div class="tabs"></div>
        <div class="overview"></div>
        <div class="editor"></div>
      </div></main>`;
    const menu = this.shadowRoot.querySelector("ha-menu-button");
    menu.hass = this._hass;
    menu.narrow = this._narrow;
    this._menu = menu;
    this._tabs = this.shadowRoot.querySelector(".tabs");
    this._overviewEl = this.shadowRoot.querySelector(".overview");
    this._editorEl = this.shadowRoot.querySelector(".editor");
    this._updateOverview = mountOverview(this._overviewEl, () => this._hass, { showTitle: false });
    this._editor = mountEditor(this._editorEl, () => this._hass);
    this._renderTabs();
    this._showTab(this._tab);
    if (this._hass) this._updateOverview(this._hass);
  }

  _renderTabs() {
    this._tabs.replaceChildren(...TABS.map((tab) => {
      const b = document.createElement("button");
      b.className = "tab" + (tab === this._tab ? " active" : "");
      b.textContent = tr(this._hass, `tab_${tab}`);
      b.addEventListener("click", () => this._showTab(tab));
      return b;
    }));
  }

  _showTab(tab) {
    this._tab = tab;
    this._overviewEl.hidden = tab !== "overview";
    this._editorEl.hidden = tab === "overview";
    if (tab !== "overview") this._editor.setTab(tab);
    this._renderTabs();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._menu) this._menu.hass = hass;
    if (this._updateOverview) this._updateOverview(hass);
    if (first && this._mounted) this._renderTabs();
  }

  set narrow(narrow) {
    this._narrow = narrow;
    if (this._menu) this._menu.narrow = narrow;
  }

  set panel(_panel) {}
  set route(_route) {}
}

customElements.define("thermoplan-panel", ThermoplanPanel);
