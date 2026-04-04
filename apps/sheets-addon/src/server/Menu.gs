/**
 * @fileoverview Add-on menu and sidebar entry.
 */

/**
 * Creates the Delivery Tool entry under the add-ons menu.
 * Uses {@code createAddonMenu} for published add-ons. For a container-bound test script
 * without the add-on flow, use {@code createMenu} instead so the menu appears during dev.
 */
function installDeliveryToolMenu_() {
  var ui = SpreadsheetApp.getUi();
  var menu;
  try {
    menu = ui.createAddonMenu();
  } catch (e) {
    menu = ui.createMenu('Delivery Tool');
  }
  if (!menu || typeof menu.addItem !== 'function') {
    menu = ui.createMenu('Delivery Tool');
  }
  // Use i18n keys so labels follow the user language preference.
  menu
    .addItem(i18n_t('menu.open_sidebar'), 'showDeliveryToolSidebar_')
    .addItem(i18n_t('menu.setup'), 'showSetupDialog_')
    .addItem(i18n_t('menu.sync'), 'sync_runFromMenu_')
    .addItem(i18n_t('menu.help'), 'showHelpDialog_')
    .addToUi();
}

/**
 * Opens the main sidebar (HTML template + client script include).
 */
function showDeliveryToolSidebar_() {
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch (e0) {
    // Best-effort: mobile automation should never block opening the sidebar.
  }
  try {
    // Best-effort eager refresh so finance/stats sheets appear without waiting
    // for an edit event.
    if (typeof mobile_refreshCompanionArtifactsForActiveSheet === 'function') {
      mobile_refreshCompanionArtifactsForActiveSheet();
    }
  } catch (e1) {
    // Ignore if mapping is not ready yet.
  }
  var template = createTemplateFromFileSafe_('src/ui/views/welcome/Sidebar');
  var langPack = i18n_getClientStrings();
  template.lang = langPack.lang;
  template.stringsJson = JSON.stringify(langPack.dict || {});
  template.bootstrapJson = JSON.stringify(config_getUiSettings_());
  var html = template
    .evaluate()
    .setTitle(i18n_t('trial.welcome_title'))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Re-open sidebar (public RPC wrapper used by client language switch).
 * @return {{ ok: boolean }}
 */
function menu_reopenSidebar() {
  showDeliveryToolSidebar_();
  return { ok: true };
}

/**
 * Opens the setup wizard as a modal dialog (700x500).
 */
function showSetupDialog_() {
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch (e0) {
    // Best-effort only.
  }
  var template = createTemplateFromFileSafe_('src/ui/views/setup/SetupDialog');
  var langPack = i18n_getClientStrings();
  template.lang = langPack.lang;
  template.stringsJson = JSON.stringify(langPack.dict || {});
  var html = template
    .evaluate()
    .setWidth(700)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, i18n_t('setup.title'));
}

/**
 * Help dialog with actionable setup and troubleshooting guidance.
 */
function showHelpDialog_() {
  var lang = i18n_getLang();
  var dir = lang === LANG_AR ? 'rtl' : 'ltr';
  var body =
    '<div dir="' +
    dir +
    '" style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:18px 20px;background:#f1f3f4;color:#202124;font-size:13px;line-height:1.5;unicode-bidi:plaintext;">' +
    '<p style="margin:0 0 10px;color:#5f6368;">' +
    i18n_t('help.intro') +
    '</p>' +
    '<h3 style="margin:10px 0 6px;font-size:13px;">' +
    i18n_t('help.steps_title') +
    '</h3>' +
    '<ol style="margin:0 0 10px;padding-inline-start:18px;">' +
    '<li>' +
    i18n_t('help.step_open') +
    '</li>' +
    '<li>' +
    i18n_t('help.step_map') +
    '</li>' +
    '<li>' +
    i18n_t('help.step_send') +
    '</li>' +
    '<li>' +
    i18n_t('help.step_sync') +
    '</li>' +
    '</ol>' +
    '<h3 style="margin:10px 0 6px;font-size:13px;">' +
    i18n_t('help.troubleshoot_title') +
    '</h3>' +
    '<ul style="margin:0;padding-inline-start:18px;">' +
    '<li>' +
    i18n_t('help.trouble_license') +
    '</li>' +
    '<li>' +
    i18n_t('help.trouble_backend') +
    '</li>' +
    '<li>' +
    i18n_t('help.trouble_labels') +
    '</li>' +
    '</ul>' +
    '<p style="margin:10px 0 0;color:#5f6368;">' +
    i18n_t('help.support') +
    '</p>' +
    '</div>';
  var html = HtmlService.createHtmlOutput(body).setWidth(520).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, i18n_t('menu.help'));
}

/**
 * Sync from the menu (wrapper around main sync function).
 */
function sync_runFromMenu_() {
  try {
    // Basic behaviour: run sync on current selection/sheet.
    sync_syncSelection();
  } catch (e) {
    SpreadsheetApp.getUi().alert(i18n_format('general.error', e && e.message ? e.message : e));
  }
}
