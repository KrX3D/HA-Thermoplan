// Backup card on the Import / Export tab: export everything as JSON, restore it with a preview.
import { addStrings, h, errText } from "./thermoplan-common.js";
import { card } from "./thermoplan-settings.js";

addStrings(
  {
    bk: "Backup", bk_help: "Profiles, schedules, rooms with their plans and all settings including presence rules. Learned data, heating statistics and the log are not included.",
    bk_export: "Export", bk_exporting: "Exporting…", bk_exported: "Downloaded",
    bk_restore_title: "Restore from a file",
    bk_restore_help: "Replaces profiles, schedules, plans and settings with the file. Rooms are matched by id (same installation), then by thermostat; missing ones are created.",
    bk_file: "Choose file", bk_remove: "Remove rooms that are not in the file",
    bk_restore: "Restore", bk_restoring: "Restoring…", bk_bad_json: "This file is not valid JSON",
    bk_confirm: "Replace the current Thermoplan setup with this file? Export first if you may want to go back.",
    bk_preview: "Preview - nothing has been restored yet", bk_preview_hint: "Press Restore to apply this.",
    bk_done: "Restore finished", bk_failed: "This file cannot be restored",
    bk_updated: "Rooms updated", bk_created: "Rooms created", bk_removed: "Rooms removed", bk_kept: "Rooms kept (not in the file)",
    bk_profiles: "Profiles", bk_schedules: "Schedules", bk_warnings: "Warnings", bk_exported_at: "Exported",
  },
  {
    bk: "Sicherung", bk_help: "Profile, Zeitpläne, Räume mit ihren Plänen und alle Einstellungen inklusive Anwesenheitsregeln. Gelerntes, Heizstatistik und Protokoll sind nicht enthalten.",
    bk_export: "Exportieren", bk_exporting: "Exportiere…", bk_exported: "Heruntergeladen",
    bk_restore_title: "Aus Datei wiederherstellen",
    bk_restore_help: "Ersetzt Profile, Zeitpläne, Pläne und Einstellungen durch die Datei. Räume werden über die ID (gleiche Installation), sonst über das Thermostat zugeordnet; fehlende werden angelegt.",
    bk_file: "Datei wählen", bk_remove: "Räume entfernen, die nicht in der Datei sind",
    bk_restore: "Wiederherstellen", bk_restoring: "Stelle wieder her…", bk_bad_json: "Diese Datei ist kein gültiges JSON",
    bk_confirm: "Die aktuelle Thermoplan-Einrichtung durch diese Datei ersetzen? Vorher exportieren, falls du zurück willst.",
    bk_preview: "Vorschau - noch nichts wurde wiederhergestellt", bk_preview_hint: "Mit Wiederherstellen wird das übernommen.",
    bk_done: "Wiederherstellung abgeschlossen", bk_failed: "Diese Datei kann nicht wiederhergestellt werden",
    bk_updated: "Räume aktualisiert", bk_created: "Räume angelegt", bk_removed: "Räume entfernt", bk_kept: "Räume behalten (nicht in der Datei)",
    bk_profiles: "Profile", bk_schedules: "Zeitpläne", bk_warnings: "Hinweise", bk_exported_at: "Exportiert",
  },
);

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderBackup({ state, T, getHass, load }) {
  const bk = (state.backup ||= { config: null, fileName: "", remove: false, report: null, error: null, busy: false, status: "" });
  const exportStatus = h("span", { class: "msg" });
  const exportBtn = h("button", { class: "btn" }, T("bk_export"));
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportStatus.textContent = T("bk_exporting");
    try {
      const data = await getHass().callWS({ type: "thermoplan/export" });
      download(`thermoplan-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
      exportStatus.textContent = T("bk_exported");
      exportStatus.className = "msg";
    } catch (err) {
      exportStatus.textContent = errText(err);
      exportStatus.className = "msg error";
    }
    exportBtn.disabled = false;
  });

  const fileInput = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  const fileBtn = h("button", { class: "btn secondary", onclick: () => fileInput.click() }, T("bk_file"));
  const fileName = h("span", { class: "help" });
  const remove = h("input", { type: "checkbox", checked: bk.remove, onchange: (ev) => { bk.remove = ev.target.checked; preview(); } });
  const restoreBtn = h("button", { class: "btn" }, T("bk_restore"));
  const status = h("span", { class: "msg" });
  const holder = h("div", {});

  const list = (label, items, cls = "") => (items?.length
    ? [h("div", {}, h("strong", {}, label)), h("ul", { class: cls }, ...items.map((i) => h("li", {}, i)))] : []);

  function paint() {
    fileName.textContent = bk.fileName;
    restoreBtn.disabled = bk.busy || !bk.config || !!bk.error;
    restoreBtn.textContent = bk.busy ? T("bk_restoring") : T("bk_restore");
    status.textContent = bk.status;
    if (bk.error) { holder.replaceChildren(h("div", { class: "msg error", style: "margin:12px 0 0" }, bk.error)); return; }
    const r = bk.report;
    if (!r) { holder.replaceChildren(); return; }
    const when = bk.config?.exported ? `${T("bk_exported_at")}: ${new Date(bk.config.exported).toLocaleString(getHass()?.language)}` : "";
    holder.replaceChildren(h("div", { class: "report", style: "margin-top:12px" },
      h("h3", { style: "margin:0 0 4px" }, r.dry_run ? T("bk_preview") : T("bk_done")),
      h("p", { class: "help", style: "margin:0 0 8px" }, [when, r.dry_run ? T("bk_preview_hint") : ""].filter(Boolean).join(" - ")),
      ...list(T("bk_profiles"), r.profiles), ...list(T("bk_schedules"), r.schedules),
      ...list(T("bk_updated"), r.rooms_updated), ...list(T("bk_created"), r.rooms_created),
      ...list(T("bk_removed"), r.rooms_removed, "warn"), ...list(T("bk_kept"), r.rooms_kept),
      ...list(T("bk_warnings"), r.warnings, "warn")));
  }

  const failed = (err) => `${T("bk_failed")}: ${errText(err)}`;

  async function preview() {
    if (!bk.config) { paint(); return; }
    bk.status = T("checking"); paint();
    try {
      bk.report = await getHass().callWS({ type: "thermoplan/restore", config: bk.config, remove_rooms: bk.remove, dry_run: true });
      bk.error = null;
    } catch (err) {
      bk.report = null; bk.error = failed(err);
    }
    bk.status = "";
    paint();
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    bk.fileName = file.name; bk.report = null; bk.error = null; bk.config = null;
    try {
      bk.config = JSON.parse(await file.text());
    } catch (_err) {
      bk.error = T("bk_bad_json"); paint(); return;
    }
    preview();
  });

  restoreBtn.addEventListener("click", async () => {
    if (!bk.config || !confirm(T("bk_confirm"))) return;
    bk.busy = true; bk.error = null; paint();
    try {
      bk.report = await getHass().callWS({ type: "thermoplan/restore", config: bk.config, remove_rooms: bk.remove });
      bk.config = null; bk.fileName = "";
      state.settingsDraft = null;
      setTimeout(() => load().catch(() => {}), 2000); // rooms change asynchronously (entry reload)
    } catch (err) {
      bk.error = failed(err);
    }
    bk.busy = false;
    paint();
  });

  const out = h("div", {},
    card(T("bk"), T("bk_help"), h("div", { class: "row" }, exportBtn, exportStatus)),
    card(T("bk_restore_title"), T("bk_restore_help"),
      h("div", { class: "row" }, fileInput, fileBtn, fileName),
      h("div", { class: "row", style: "margin-top:12px" }, h("label", {}, remove, " " + T("bk_remove")), restoreBtn, status),
      holder));
  paint();
  return out;
}
