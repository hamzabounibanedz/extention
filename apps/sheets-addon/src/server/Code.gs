/**
 * @fileoverview Entry point — Sheets simple triggers must call globally named handlers.
 * Menu, sidebar, and storage live in sibling .gs files (shared global scope).
 */

/**
 * Runs when the spreadsheet is opened. Installs the add-on menu.
 */
function onOpen() {
  installDeliveryToolMenu_();
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch (e) {
    // Best-effort only.
  }
}

/**
 * Runs when the add-on is installed (published add-on flow). Keeps menu in sync with first open.
 */
function onInstall() {
  installDeliveryToolMenu_();
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch (e) {
    // Best-effort only.
  }
}
