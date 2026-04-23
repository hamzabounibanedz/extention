/**
 * @fileoverview Entry point — Sheets simple triggers must call globally named handlers.
 * Menu, sidebar, and storage live in sibling .gs files (shared global scope).
 *
 * Deployment: use Deploy → Test deployments → type "Editor add-on" → Execute (opens the test sheet).
 * Running onOpen from the script editor does not install the add-on in Extensions; use Test deployments
 * or a published add-on install. The manifest addOns block registers this project as a Workspace add-on.
 */

/**
 * Runs when the spreadsheet is opened. Installs the add-on menu.
 * @param {GoogleAppsScript.Events.SheetsOnOpen=} e
 */
function onOpen(e) {
  installDeliveryToolMenu_(e);
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
 * @param {GoogleAppsScript.Events.AppsScriptEvent=} e
 */
function onInstall(e) {
  installDeliveryToolMenu_(e);
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch (e) {
    // Best-effort only.
  }
}
