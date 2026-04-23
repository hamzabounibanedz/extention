/**
 * @fileoverview Mobile-first automation:
 * - installable onEdit trigger for status-based auto-send
 * - companion status sheets (Delivered / Unconfirmed / etc.)
 * - in-sheet stats dashboard with charts (phone + laptop friendly)
 */

var MOBILE_ON_EDIT_TRIGGER_HANDLER_ = 'mobile_onEditInstallable_';
var MOBILE_VIEW_MAP_KEY_PREFIX_ = 'dt.v1.mobile.views.';
var MOBILE_STATS_MAP_KEY_PREFIX_ = 'dt.v1.mobile.stats.';
var MOBILE_FINANCE_MAP_KEY_PREFIX_ = 'dt.v1.mobile.finance.';
var MOBILE_ON_EDIT_LOCK_WAIT_MS_ = 5000;
// Auto-send should follow explicit user status edits only (no bulk backfill blasts).
var MOBILE_AUTOSEND_MAX_EDIT_ROWS_ = 1;
// Keep companion refresh responsive but throttled to avoid heavy work on every edit.
var MOBILE_REFRESH_THROTTLE_MS_ = 7000;
var MOBILE_LAST_REFRESH_KEY_PREFIX_ = 'dt.v1.mobile.lastRefresh.';

var MOBILE_FINANCE_HEADERS_ = [
  'Product',
  'Unit cost (DZD)',
  'Sell price (DZD)',
  'Ad cost (DZD)',
  'Meta ad spend (DZD)',
  'Meta cost/order (DZD)',
  'Other cost (DZD)',
  'Active (1/0)',
  'Notes',
];

var MOBILE_UI_COLORS_ = {
  brand: '#1a73e8',
  brandMuted: '#e8f0fe',
  success: '#188038',
  warning: '#f9ab00',
  danger: '#d93025',
  neutralDark: '#3c4043',
  headerBg: '#1f3a5f',
  headerText: '#ffffff',
  sectionBg: '#f1f3f4',
  rowAlt: '#f8fafc',
  border: '#d2d6dc',
};

var MOBILE_STATUS_COLORS_ = [
  '#188038', // delivered
  '#1a73e8', // in_transit
  '#34a853', // confirmed
  '#f9ab00', // pending
  '#ff7043', // returned
  '#d93025', // failed
  '#9aa0a6', // cancelled
  '#7e57c2', // unknown
];

var MOBILE_BUCKET_ORDER_ = [
  'delivered',
  'in_transit',
  'confirmed',
  'pending',
  'returned',
  'failed',
  'cancelled',
  'unknown',
];

var MOBILE_STATUS_VIEW_DEFS_ = [
  {
    key: 'delivered',
    defaultTitle: 'Delivered Orders',
    aliases: ['Delivered Orders', 'Livrees', 'Livrees Orders', 'تم التسليم'],
    buckets: ['delivered'],
  },
  {
    key: 'confirmed',
    defaultTitle: 'Confirmed Orders',
    aliases: ['Confirmed Orders', 'Commandes confirmees', 'مؤكدة'],
    buckets: ['confirmed'],
  },
  {
    key: 'unconfirmed',
    defaultTitle: 'Unconfirmed Orders',
    aliases: ['Unconfirmed Orders', 'Pending Orders', 'Commandes en attente', 'غير مؤكدة'],
    buckets: ['pending', 'unknown'],
  },
  {
    key: 'in_transit',
    defaultTitle: 'In Transit Orders',
    aliases: ['In Transit Orders', 'En transit', 'قيد النقل'],
    buckets: ['in_transit'],
  },
  {
    key: 'returned',
    defaultTitle: 'Returned Orders',
    aliases: ['Returned Orders', 'Retours', 'مرتجعة'],
    buckets: ['returned'],
  },
  {
    key: 'failed',
    defaultTitle: 'Failed Orders',
    aliases: ['Failed Orders', 'Failed and Cancelled', 'Echec', 'فاشلة'],
    buckets: ['failed'],
  },
  {
    key: 'cancelled',
    defaultTitle: 'Cancelled Orders',
    aliases: ['Cancelled Orders', 'Commandes annulees', 'ملغاة'],
    buckets: ['cancelled'],
  },
];

/**
 * Ensure installable phone automation trigger exists.
 * @return {{ ok: boolean, enabled: boolean }}
 */
function mobile_enablePhoneAutomation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  mobile_ensureOnEditTriggerForSpreadsheet_(ss);
  return { ok: true, enabled: true };
}

/**
 * Remove installable phone automation trigger(s).
 * @return {{ ok: boolean, enabled: boolean }}
 */
function mobile_disablePhoneAutomation() {
  mobile_deleteOnEditTriggers_();
  return { ok: true, enabled: false };
}

/**
 * Check whether phone automation trigger is installed.
 * @return {{ enabled: boolean }}
 */
function mobile_isPhoneAutomationEnabled() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MOBILE_ON_EDIT_TRIGGER_HANDLER_) {
      return { enabled: true };
    }
  }
  return { enabled: false };
}

/**
 * Manual refresh helper for active sheet.
 * @return {{
 *   ok: boolean,
 *   statusViewSheets: Array<string>,
 *   reusedSheets: Array<string>,
 *   createdSheets: Array<string>,
 *   statsSheet: string|null
 * }}
 */
function mobile_refreshCompanionArtifactsForActiveSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sourceSheet.getSheetId();
  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
  if (!mappingJson) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }
  var saved;
  try {
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }
  return mobile_refreshCompanionArtifactsForSheet_(ss, sourceSheet, saved);
}

/**
 * Manual refresh helper for a specific sheet id (from sidebar selector).
 * @param {number|string} sheetId
 * @return {{
 *   ok: boolean,
 *   statusViewSheets: Array<string>,
 *   reusedSheets: Array<string>,
 *   createdSheets: Array<string>,
 *   statsSheet: string|null
 * }}
 */
function mobile_refreshCompanionArtifactsForSheetId(sheetId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sid = Number(sheetId);
  if (!isFinite(sid) || sid < 1) {
    throw new Error('Invalid sheet id');
  }
  var sourceSheet = getSheetById_(ss, sid);
  if (!sourceSheet) {
    throw new Error('Sheet not found');
  }
  var spreadsheetId = ss.getId();
  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sid);
  if (!mappingJson) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }
  var saved;
  try {
    saved = setup_loadMapping(sid);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }
  return mobile_refreshCompanionArtifactsForSheet_(ss, sourceSheet, saved);
}

/**
 * Installable onEdit trigger entry point (must stay global and stable).
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function mobile_onEditInstallable_(e) {
  // Use ScriptLock here to avoid deadlocking with send_sendSelection(), which uses
  // DocumentLock internally.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MOBILE_ON_EDIT_LOCK_WAIT_MS_)) {
    return;
  }
  try {
    mobile_handleOnEdit_(e);
  } catch (err) {
    try {
      Logger.log(
        'mobile_onEditInstallable_ error: %s',
        err && err.message ? String(err.message) : String(err),
      );
    } catch (logErr) {}
  } finally {
    lock.releaseLock();
  }
}

/**
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function mobile_handleOnEdit_(e) {
  if (!e || !e.range) {
    return;
  }
  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet) {
    return;
  }
  var ss = sheet.getParent();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();

  // Allow refreshing the mobile stats dashboard when users edit date filter cells.
  if (mobile_tryHandleStatsDashboardDateEdit_(ss, sheet, range)) {
    return;
  }
  // Refresh source dashboard when finance inputs are edited.
  if (mobile_tryHandleFinanceInputsEdit_(ss, sheet, range)) {
    return;
  }

  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
  if (!mappingJson) {
    return;
  }

  var saved;
  try {
    saved = setup_loadMapping(sheetId);
  } catch (e0) {
    return;
  }
  if (!saved || !saved.columns) {
    return;
  }

  var columns = saved.columns || {};
  var statusCol = mobile_toColumnIndex_(columns.statusColumn);
  var headerRow = mobile_getHeaderRow_(saved);

  var startCol = range.getColumn();
  var endCol = startCol + range.getNumColumns() - 1;
  var startRow = range.getRow();
  var endRow = startRow + range.getNumRows() - 1;
  if (endRow <= headerRow) {
    return;
  }
  var editedStatusColumn =
    statusCol != null && statusCol >= startCol && statusCol <= endCol;
  // Avoid accidental mass auto-send when users paste/import multiple rows at once.
  if (editedStatusColumn && range.getNumRows() > MOBILE_AUTOSEND_MAX_EDIT_ROWS_) {
    editedStatusColumn = false;
  }

  // Mobile parity: if dropdown validations are missing (provider/status),
  // re-apply them for this mapped sheet on first real data edit.
  try {
    mobile_ensureCarrierAndStatusChoiceValidation_(
      ss,
      sheet,
      saved,
      headerRow,
      startRow,
      endRow,
    );
  } catch (eVal) {
    // Best-effort only.
  }

  if (editedStatusColumn) {
    var rowsToAutoSend = mobile_collectRowsToAutoSend_(
      sheet,
      range,
      statusCol,
      headerRow,
      columns,
      saved.defaultCarrier,
    );
    if (rowsToAutoSend.length) {
      mobile_sendRowsBySelectionSpec_(ss, sheet, rowsToAutoSend);
    }
  }

  // Keep mobile companion sheets/charts in sync, but avoid heavy re-render on
  // every keystroke/edit in rapid succession.
  if (mobile_shouldRefreshCompanionArtifacts_(spreadsheetId, sheetId)) {
    mobile_refreshCompanionArtifactsForSheet_(ss, sheet, saved);
  }
}

/**
 * Ensures mapped carrier + status columns keep list-choice validation, even when
 * mobile clients edit sheets without desktop/sidebar initialization.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} saved
 * @param {number} headerRow
 * @param {number} startRow
 * @param {number} endRow
 */
function mobile_ensureCarrierAndStatusChoiceValidation_(
  ss,
  sheet,
  saved,
  headerRow,
  startRow,
  endRow,
) {
  if (
    typeof lists_applyCarrierAndStatusColumnValidationForSheet_ !== 'function' ||
    typeof lists_getCarrierDropdownLabels_ !== 'function' ||
    typeof lists_getStatusDropdownLabels_ !== 'function'
  ) {
    return;
  }
  if (endRow <= headerRow) {
    return;
  }
  var columns = saved && saved.columns ? saved.columns : {};
  var carrierCol =
    columns.carrierColumn != null && isFinite(Number(columns.carrierColumn))
      ? Number(columns.carrierColumn)
      : null;
  var statusCol =
    columns.statusColumn != null && isFinite(Number(columns.statusColumn))
      ? Number(columns.statusColumn)
      : null;
  if (carrierCol == null && statusCol == null) {
    return;
  }
  var sampleRow = Math.max(headerRow + 1, startRow);
  var needsApply = false;
  if (carrierCol != null) {
    var carrierRule = sheet.getRange(sampleRow, carrierCol).getDataValidation();
    if (!carrierRule) {
      needsApply = true;
    }
  }
  if (!needsApply && statusCol != null) {
    var statusRule = sheet.getRange(sampleRow, statusCol).getDataValidation();
    if (!statusRule) {
      needsApply = true;
    }
  }
  if (!needsApply) {
    return;
  }

  lists_applyCarrierAndStatusColumnValidationForSheet_(
    ss,
    sheet,
    saved,
    false,
    lists_getCarrierDropdownLabels_(),
    lists_getStatusDropdownLabels_(),
  );
}

/**
 * @param {string} spreadsheetId
 * @param {number|string} sheetId
 * @return {string}
 */
function mobile_lastRefreshStoreKey_(spreadsheetId, sheetId) {
  return MOBILE_LAST_REFRESH_KEY_PREFIX_ + String(spreadsheetId) + ':' + String(sheetId);
}

/**
 * Throttle expensive companion refresh work per sheet.
 *
 * @param {string} spreadsheetId
 * @param {number|string} sheetId
 * @return {boolean}
 */
function mobile_shouldRefreshCompanionArtifacts_(spreadsheetId, sheetId) {
  var sid = Number(sheetId);
  if (!spreadsheetId || !isFinite(sid) || sid < 1) {
    return true;
  }
  var key = mobile_lastRefreshStoreKey_(spreadsheetId, sid);
  var now = Date.now();
  try {
    var props = PropertiesService.getDocumentProperties();
    var raw = props.getProperty(key);
    var last = raw != null ? Number(raw) : 0;
    if (isFinite(last) && last > 0 && now - last < MOBILE_REFRESH_THROTTLE_MS_) {
      return false;
    }
    props.setProperty(key, String(now));
  } catch (e) {
    // If properties fail for any reason, keep functionality over optimization.
  }
  return true;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function mobile_ensureOnEditTriggerForSpreadsheet_(ss) {
  if (!ss) {
    return;
  }
  var targetSpreadsheetId = ss.getId();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction() !== MOBILE_ON_EDIT_TRIGGER_HANDLER_) {
      continue;
    }
    try {
      if (typeof t.getTriggerSourceId === 'function') {
        var existingSourceId = t.getTriggerSourceId();
        if (!existingSourceId || existingSourceId === targetSpreadsheetId) {
          return;
        }
      } else {
        return;
      }
    } catch (e) {
      return;
    }
  }
  ScriptApp.newTrigger(MOBILE_ON_EDIT_TRIGGER_HANDLER_).forSpreadsheet(ss).onEdit().create();
}

function mobile_deleteOnEditTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === MOBILE_ON_EDIT_TRIGGER_HANDLER_) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {GoogleAppsScript.Spreadsheet.Range} range
 * @param {number} statusCol
 * @param {number} headerRow
 * @param {Object} columns
 * @param {string|null|undefined} defaultCarrier
 * @return {Array<number>}
 */
function mobile_collectRowsToAutoSend_(
  sheet,
  range,
  statusCol,
  headerRow,
  columns,
  defaultCarrier,
) {
  var rows = [];
  var startRow = range.getRow();
  var startCol = range.getColumn();
  var statusOffset = statusCol - startCol;
  if (statusOffset < 0 || statusOffset >= range.getNumColumns()) {
    return rows;
  }

  var values = range.getDisplayValues();
  var defaultCarrierId = defaultCarrier != null ? String(defaultCarrier).trim() : '';
  var carrierCol = mobile_toColumnIndex_(columns && columns.carrierColumn);
  var carrierValues = null;
  var carrierCredReadyCache = {};
  if (carrierCol != null) {
    try {
      carrierValues = sheet.getRange(startRow, carrierCol, range.getNumRows(), 1).getDisplayValues();
    } catch (e0) {
      carrierValues = null;
    }
  }
  for (var i = 0; i < values.length; i++) {
    var rowNum = startRow + i;
    if (rowNum <= headerRow) {
      continue;
    }
    var statusRaw = values[i] && values[i].length > statusOffset ? values[i][statusOffset] : '';
    if (!mobile_isConfirmedStatus_(statusRaw)) {
      continue;
    }
    var resolvedCarrier = '';
    // Row-level carrier routing for mobile/desktop parity:
    // when a carrier column is mapped, auto-send only if this row has a selected carrier.
    if (carrierCol != null) {
      var carrierRaw = carrierValues && carrierValues[i] && carrierValues[i].length ? carrierValues[i][0] : '';
      if (carrierRaw == null || String(carrierRaw).trim() === '') {
        continue;
      }
      resolvedCarrier = String(carrierRaw).trim();
    }
    if (!resolvedCarrier && defaultCarrierId) {
      resolvedCarrier = defaultCarrierId;
    }
    if (!resolvedCarrier) {
      continue;
    }
    // Require carrier credentials before attempting auto-send to avoid noisy failures.
    if (!mobile_hasCarrierCredentialsForAutoSend_(resolvedCarrier, carrierCredReadyCache)) {
      continue;
    }
    if (mobile_rowAlreadySent_(sheet, rowNum, columns)) {
      continue;
    }
    rows.push(rowNum);
  }

  rows.sort(function (a, b) {
    return a - b;
  });
  var unique = [];
  var seen = {};
  for (var j = 0; j < rows.length; j++) {
    if (!seen[rows[j]]) {
      unique.push(rows[j]);
      seen[rows[j]] = true;
    }
  }
  return unique;
}

/**
 * @param {string} carrierId
 * @param {Object<string, boolean>=} cache
 * @return {boolean}
 */
function mobile_hasCarrierCredentialsForAutoSend_(carrierId, cache) {
  var id = carrierId != null ? String(carrierId).trim().toLowerCase() : '';
  if (!id) {
    return false;
  }
  if (cache && cache[id] != null) {
    return !!cache[id];
  }
  // If credentials helper is unavailable for any reason, do not block auto-send.
  if (typeof carrierCreds_getForCarrier_ !== 'function') {
    if (cache) {
      cache[id] = true;
    }
    return true;
  }
  var creds = carrierCreds_getForCarrier_(id) || {};
  var ok = true;
  if (id === 'zr') {
    var tenant = creds.tenantId != null ? String(creds.tenantId).trim() : '';
    var secret =
      creds.secretKey != null && String(creds.secretKey).trim() !== ''
        ? String(creds.secretKey).trim()
        : creds.apiKey != null
          ? String(creds.apiKey).trim()
          : '';
    ok = !!(tenant && secret);
  } else if (id === 'yalidine') {
    var apiId = creds.apiId != null ? String(creds.apiId).trim() : '';
    var apiToken = creds.apiToken != null ? String(creds.apiToken).trim() : '';
    ok = !!(apiId && apiToken);
  } else if (id === 'noest') {
    var nt =
      creds.apiToken != null && String(creds.apiToken).trim() !== ''
        ? String(creds.apiToken).trim()
        : creds.token != null
          ? String(creds.token).trim()
          : creds.apiKey != null
            ? String(creds.apiKey).trim()
            : '';
    var ng =
      creds.userGuid != null && String(creds.userGuid).trim() !== ''
        ? String(creds.userGuid).trim()
        : creds.user_guid != null
          ? String(creds.user_guid).trim()
          : '';
    ok = !!(nt && ng);
  }
  if (cache) {
    cache[id] = ok;
  }
  return ok;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {Object} columns
 * @return {boolean}
 */
function mobile_rowAlreadySent_(sheet, rowNum, columns) {
  var extCol = mobile_toColumnIndex_(columns.externalShipmentIdColumn);
  if (extCol == null) {
    return false;
  }
  var raw = sheet.getRange(rowNum, extCol).getDisplayValue();
  return raw != null && String(raw).trim() !== '';
}

/**
 * @param {*} statusRaw
 * @return {boolean}
 */
function mobile_isConfirmedStatus_(statusRaw) {
  if (statusRaw == null) {
    return false;
  }
  var text = String(statusRaw).trim();
  if (!text) {
    return false;
  }

  if (typeof classifyShipmentBucket_ === 'function') {
    try {
      if (classifyShipmentBucket_(text, false) === 'confirmed') {
        return true;
      }
    } catch (e0) {}
  }

  var normalized = mobile_normalizeText_(text);
  if (/(^|\b)confirm/.test(normalized)) {
    return true;
  }
  if (/مؤكد|تأكيد|تاكيد|تم التأكيد|تم التاكيد/.test(text)) {
    return true;
  }
  return false;
}

/**
 * @param {string} s
 * @return {string}
 */
function mobile_normalizeText_(s) {
  if (s == null) {
    return '';
  }
  var out = String(s).trim().toLowerCase();
  try {
    out = out
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  } catch (e) {}
  return out;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet
 * @param {Array<number>} rows
 */
function mobile_sendRowsBySelectionSpec_(ss, targetSheet, rows) {
  if (!rows || !rows.length) {
    return;
  }
  var previous = ss.getActiveSheet();
  try {
    if (!previous || previous.getSheetId() !== targetSheet.getSheetId()) {
      ss.setActiveSheet(targetSheet);
    }
    send_sendSelection(rows.join(','), {
      skipLicenseRefresh: true,
      source: 'mobile_on_edit',
    });
  } catch (e) {
    try {
      Logger.log(
        'mobile_sendRowsBySelectionSpec_ send error: %s',
        e && e.message ? String(e.message) : String(e),
      );
    } catch (logErr) {}
  } finally {
    try {
      if (previous && previous.getSheetId() !== targetSheet.getSheetId()) {
        ss.setActiveSheet(previous);
      }
    } catch (restoreErr) {}
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {Object} saved
 * @return {{
 *   ok: boolean,
 *   statusViewSheets: Array<string>,
 *   reusedSheets: Array<string>,
 *   createdSheets: Array<string>,
 *   statsSheet: string|null
 * }}
 */
function mobile_refreshCompanionArtifactsForSheet_(ss, sourceSheet, saved) {
  var columns = saved && saved.columns ? saved.columns : {};
  var headerRow = mobile_getHeaderRow_(saved);
  var lastCol = sourceSheet.getLastColumn();
  if (lastCol < 1) {
    return {
      ok: true,
      statusViewSheets: [],
      reusedSheets: [],
      createdSheets: [],
      statsSheet: null,
    };
  }
  var lastRow = sourceSheet.getLastRow();
  if (lastRow < headerRow) {
    lastRow = headerRow;
  }

  var header = sourceSheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0];
  var body =
    lastRow > headerRow
      ? sourceSheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getDisplayValues()
      : [];

  var productKeys = mobile_collectProductKeysFromBody_(body, columns, header);
  var financeInfo = mobile_prepareFinanceInputsSheet_(ss, sourceSheet, productKeys);

  var defaultCarrier =
    saved && saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
      ? String(saved.defaultCarrier).trim()
      : null;
  var snapshot = mobile_buildDataSnapshot_(body, columns, defaultCarrier, {
    financeInfo: financeInfo,
    sheet: sourceSheet,
    sheetId: sourceSheet.getSheetId(),
    headerRow: headerRow,
  });
  var canBuildStatusViews =
    mobile_toColumnIndex_(columns.statusColumn) != null ||
    mobile_toColumnIndex_(columns.trackingColumn) != null;
  var statusSheetResult = canBuildStatusViews
    ? mobile_refreshStatusViewSheets_(ss, sourceSheet, header, snapshot.rowsByBucket)
    : { updated: [], reused: [], created: [] };
  var statsSheetName = mobile_refreshStatsDashboardSheet_(
    ss,
    sourceSheet,
    saved,
    body,
    columns,
    defaultCarrier,
    financeInfo,
  );

  return {
    ok: true,
    statusViewSheets: statusSheetResult.updated,
    reusedSheets: statusSheetResult.reused,
    createdSheets: statusSheetResult.created,
    statsSheet: statsSheetName,
  };
}

/**
 * @param {Array<Array<string>>} bodyRows
 * @param {Object} columns
 * @param {string|null} defaultCarrier
 * @return {{
 *   totalRowsAnalyzed: number,
 *   buckets: Object,
 *   rowsByBucket: Object<string, Array<Array<string>>>,
 *   byCarrier: Object,
 *   byProduct: Object,
 *   byProductQty: Object,
 *   rowsSkippedNoDateFilter: number,
 *   rowsFilteredBeforeDateRange: number,
 *   rowsFilteredAfterDateRange: number,
 *   dateFilter: Object,
 *   finance: Object,
 *   trendByDay: Array<Object>
 * }}
 */
function mobile_buildDataSnapshot_(bodyRows, columns, defaultCarrier, options) {
  var opts = options || {};
  var statusCol = mobile_toColumnIndex_(columns.statusColumn);
  var trackingCol = mobile_toColumnIndex_(columns.trackingColumn);
  var carrierCol = mobile_toColumnIndex_(columns.carrierColumn);
  var productCol = mobile_toColumnIndex_(columns.productColumn);
  var quantityCol = mobile_toColumnIndex_(columns.quantityColumn);
  var codCol = mobile_toColumnIndex_(columns.codColumn);
  var shippingFeeCol = mobile_toColumnIndex_(columns.shippingFeeColumn);
  var headerRow =
    opts.headerRow != null && isFinite(Number(opts.headerRow)) && Number(opts.headerRow) >= 1
      ? Math.floor(Number(opts.headerRow))
      : 1;

  var fromIsoRaw = opts.fromIso != null ? String(opts.fromIso).trim() : '';
  var toIsoRaw = opts.toIso != null ? String(opts.toIso).trim() : '';
  var fromMs =
    fromIsoRaw && typeof stats_parseFilterStart_ === 'function'
      ? stats_parseFilterStart_(fromIsoRaw)
      : null;
  var toMs =
    toIsoRaw && typeof stats_parseFilterEnd_ === 'function'
      ? stats_parseFilterEnd_(toIsoRaw)
      : null;
  if (fromMs != null && toMs != null && fromMs > toMs) {
    var tmp = fromMs;
    fromMs = toMs;
    toMs = tmp;
  }
  var dateFilterRequested = fromMs != null || toMs != null;
  var mappedDateCol = mobile_toColumnIndex_(columns.orderDateColumn);
  var resolvedDateColumn = { col: null, source: 'missing' };
  if (
    opts.sheet &&
    typeof stats_resolveOrderDateColumn_ === 'function' &&
    isFinite(Number(opts.sheetId))
  ) {
    try {
      resolvedDateColumn =
        stats_resolveOrderDateColumn_(
          Number(opts.sheetId),
          opts.sheet,
          headerRow,
          columns,
          dateFilterRequested,
        ) || resolvedDateColumn;
    } catch (e0) {
      resolvedDateColumn =
        mappedDateCol != null
          ? { col: mappedDateCol, source: 'mapped' }
          : { col: null, source: 'missing' };
    }
  } else if (mappedDateCol != null) {
    resolvedDateColumn = { col: mappedDateCol, source: 'mapped' };
  }
  var effectiveOrderDateColumn =
    resolvedDateColumn && resolvedDateColumn.col != null
      ? Number(resolvedDateColumn.col)
      : null;
  var trendOrderDateColumn =
    effectiveOrderDateColumn != null ? effectiveOrderDateColumn : mappedDateCol;
  var dateFilterOn = dateFilterRequested && effectiveOrderDateColumn != null;
  var effectiveOrderDateLabel = null;
  if (
    opts.sheet &&
    (dateFilterOn || trendOrderDateColumn != null) &&
    typeof stats_describeSheetColumn_ === 'function'
  ) {
    try {
      var dateMeta = stats_describeSheetColumn_(
        opts.sheet,
        headerRow,
        effectiveOrderDateColumn != null ? effectiveOrderDateColumn : trendOrderDateColumn,
      );
      effectiveOrderDateLabel = dateMeta ? dateMeta.label : null;
    } catch (e1) {
      effectiveOrderDateLabel = null;
    }
  }
  var fromIsoNormalized =
    fromMs != null && typeof stats_formatDateMsAsIso_ === 'function'
      ? stats_formatDateMsAsIso_(fromMs)
      : fromIsoRaw || null;
  var toIsoNormalized =
    toMs != null && typeof stats_formatDateMsAsIso_ === 'function'
      ? stats_formatDateMsAsIso_(toMs)
      : toIsoRaw || null;

  var rowsByBucket = {};
  var buckets = mobile_emptyBucketCounters_();
  for (var i = 0; i < MOBILE_BUCKET_ORDER_.length; i++) {
    rowsByBucket[MOBILE_BUCKET_ORDER_[i]] = [];
  }

  var byCarrier = {};
  var byProduct = {};
  var byProductQty = {};
  var byDay = {};
  var totalRowsAnalyzed = 0;
  var skippedNoDate = 0;
  var filteredBeforeRange = 0;
  var filteredAfterRange = 0;

  var financeInfo = opts.financeInfo || null;
  var financeByProduct = financeInfo && financeInfo.byProduct ? financeInfo.byProduct : {};
  var financeTotalsInput = financeInfo && financeInfo.totals ? financeInfo.totals : {};
  var finance = {
    currency: 'DZD',
    inputSheetName: financeInfo && financeInfo.sheetName ? String(financeInfo.sheetName) : null,
    deliveredOrders: 0,
    deliveredQty: 0,
    deliveredRevenue: 0,
    deliveredCogs: 0,
    deliveredShipping: 0,
    pipelineOrders: 0,
    pipelineRevenue: 0,
    adCost: Number(financeTotalsInput.adCost || 0),
    metaAdSpend: Number(financeTotalsInput.metaAdSpend || 0),
    marketingSpend: 0,
    metaOrdersEstimated: Number(financeTotalsInput.metaOrdersEstimated || 0),
    metaCostPerOrderInput: null,
    otherCost: Number(financeTotalsInput.otherCost || 0),
    grossProfit: 0,
    netProfit: 0,
    grossMarginPct: null,
    netMarginPct: null,
    aov: null,
    cpa: null,
    roas: null,
    productsMissingPriceCount: 0,
    productsMissingPrice: [],
    byProduct: [],
  };
  var financeByProductAgg = {};
  var missingPriceMap = {};

  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r] || [];
    if (mobile_isRowBlank_(row)) {
      continue;
    }
    var rowNum = headerRow + 1 + r;
    var rowDate = null;
    if (trendOrderDateColumn != null) {
      rowDate = mobile_parseRowDateForStats_(
        row,
        trendOrderDateColumn,
        opts.sheet,
        rowNum,
      );
    }

    if (dateFilterOn) {
      if (trendOrderDateColumn !== effectiveOrderDateColumn) {
        rowDate = mobile_parseRowDateForStats_(
          row,
          effectiveOrderDateColumn,
          opts.sheet,
          rowNum,
        );
      }
      if (!rowDate) {
        skippedNoDate++;
        continue;
      }
      var t = rowDate.getTime();
      if (fromMs != null && t < fromMs) {
        filteredBeforeRange++;
        continue;
      }
      if (toMs != null && t > toMs) {
        filteredAfterRange++;
        continue;
      }
    }

    totalRowsAnalyzed++;

    var statusText = statusCol != null && statusCol <= row.length ? String(row[statusCol - 1] || '') : '';
    var hasTracking =
      trackingCol != null &&
      trackingCol <= row.length &&
      String(row[trackingCol - 1] || '').trim() !== '';
    var bucket = 'unknown';
    if (typeof classifyShipmentBucket_ === 'function') {
      bucket = classifyShipmentBucket_(statusText, hasTracking);
    }
    if (buckets[bucket] == null) {
      bucket = 'unknown';
    }
    buckets[bucket]++;
    rowsByBucket[bucket].push(row.slice());

    var carrier = '';
    if (carrierCol != null && carrierCol <= row.length) {
      carrier = String(row[carrierCol - 1] || '').trim();
    }
    if (!carrier) {
      carrier = defaultCarrier != null && String(defaultCarrier).trim() !== '' ? String(defaultCarrier).trim() : '—';
    }
    mobile_incNestedBucket_(byCarrier, carrier, bucket);

    var product = '';
    if (productCol != null && productCol <= row.length) {
      product = String(row[productCol - 1] || '').trim();
    }
    if (!product) {
      product = '—';
    }
    product = mobile_normalizeProductNameForFinance_(product);
    if (!byProduct[product]) {
      byProduct[product] = 0;
    }
    byProduct[product]++;

    var qty = mobile_parseNumberLoose_(
      quantityCol != null && quantityCol <= row.length ? row[quantityCol - 1] : null
    );
    if (!isFinite(qty) || qty <= 0) {
      qty = 1;
    }
    if (!byProductQty[product]) {
      byProductQty[product] = 0;
    }
    byProductQty[product] += qty;
    var codAmount = mobile_parseNumberLoose_(
      codCol != null && codCol <= row.length ? row[codCol - 1] : null
    );
    var shippingAmount = mobile_parseNumberLoose_(
      shippingFeeCol != null && shippingFeeCol <= row.length ? row[shippingFeeCol - 1] : null
    );
    if (!isFinite(shippingAmount) || shippingAmount < 0) {
      shippingAmount = 0;
    }

    var cfg = financeByProduct[product] || null;
    var cfgActive = cfg ? cfg.active !== false : true;
    var unitCost = cfg && isFinite(cfg.unitCost) && cfg.unitCost > 0 ? cfg.unitCost : 0;
    var unitSell =
      cfg && isFinite(cfg.sellPrice) && cfg.sellPrice > 0
        ? cfg.sellPrice
        : codAmount != null && isFinite(codAmount) && qty > 0
          ? codAmount / qty
          : null;
    var lineRevenue =
      unitSell != null && isFinite(unitSell) && unitSell >= 0
        ? unitSell * qty
        : codAmount != null && isFinite(codAmount) && codAmount > 0
          ? codAmount
          : 0;
    var lineCogs = unitCost * qty;

    if (lineRevenue <= 0) {
      missingPriceMap[product] = true;
    }

    if (!financeByProductAgg[product]) {
      financeByProductAgg[product] = {
        product: product,
        orders: 0,
        qty: 0,
        revenue: 0,
        cogs: 0,
        shipping: 0,
        gross: 0,
      };
    }
    var agg = financeByProductAgg[product];
    agg.orders++;
    agg.qty += qty;
    agg.revenue += lineRevenue;
    agg.cogs += lineCogs;
    agg.shipping += shippingAmount;
    agg.gross = agg.revenue - agg.cogs - agg.shipping;

    var pipelineEligible =
      bucket === 'confirmed' || bucket === 'in_transit' || bucket === 'pending' || bucket === 'unknown';
    if (cfgActive && pipelineEligible) {
      finance.pipelineOrders++;
      finance.pipelineRevenue += lineRevenue;
    }

    if (cfgActive && bucket === 'delivered') {
      finance.deliveredOrders++;
      finance.deliveredQty += qty;
      finance.deliveredRevenue += lineRevenue;
      finance.deliveredCogs += lineCogs;
      finance.deliveredShipping += shippingAmount;
      if (rowDate != null) {
        var dayKey =
          typeof stats_formatDateMsAsIso_ === 'function'
            ? stats_formatDateMsAsIso_(rowDate.getTime())
            : rowDate.toISOString().slice(0, 10);
        if (!byDay[dayKey]) {
          byDay[dayKey] = { date: dayKey, orders: 0, delivered: 0, deliveredRevenue: 0 };
        }
        byDay[dayKey].delivered += 1;
        byDay[dayKey].deliveredRevenue += lineRevenue;
      }
    }
    if (rowDate != null) {
      var allDayKey =
        typeof stats_formatDateMsAsIso_ === 'function'
          ? stats_formatDateMsAsIso_(rowDate.getTime())
          : rowDate.toISOString().slice(0, 10);
      if (!byDay[allDayKey]) {
        byDay[allDayKey] = { date: allDayKey, orders: 0, delivered: 0, deliveredRevenue: 0 };
      }
      byDay[allDayKey].orders += 1;
    }
  }

  finance.grossProfit =
    finance.deliveredRevenue - finance.deliveredCogs - finance.deliveredShipping;
  if (isFinite(finance.metaOrdersEstimated)) {
    finance.metaOrdersEstimated = Math.round(finance.metaOrdersEstimated * 100) / 100;
  } else {
    finance.metaOrdersEstimated = 0;
  }
  finance.marketingSpend = finance.adCost + finance.metaAdSpend;
  finance.netProfit = finance.grossProfit - finance.marketingSpend - finance.otherCost;
  finance.metaCostPerOrderInput =
    finance.metaAdSpend > 0 && finance.metaOrdersEstimated > 0
      ? Math.round((finance.metaAdSpend * 100) / finance.metaOrdersEstimated) / 100
      : null;
  finance.grossMarginPct =
    finance.deliveredRevenue > 0
      ? Math.round((finance.grossProfit * 10000) / finance.deliveredRevenue) / 100
      : null;
  finance.netMarginPct =
    finance.deliveredRevenue > 0
      ? Math.round((finance.netProfit * 10000) / finance.deliveredRevenue) / 100
      : null;
  finance.aov =
    finance.deliveredOrders > 0
      ? Math.round((finance.deliveredRevenue * 100) / finance.deliveredOrders) / 100
      : null;
  finance.cpa =
    finance.deliveredOrders > 0 && finance.marketingSpend + finance.otherCost > 0
      ? Math.round(((finance.marketingSpend + finance.otherCost) * 100) / finance.deliveredOrders) / 100
      : null;
  finance.roas =
    finance.marketingSpend > 0
      ? Math.round((finance.deliveredRevenue * 100) / finance.marketingSpend) / 100
      : null;
  finance.productsMissingPrice = Object.keys(missingPriceMap).sort();
  finance.productsMissingPriceCount = finance.productsMissingPrice.length;
  finance.byProduct = Object.keys(financeByProductAgg)
    .map(function (k) {
      return financeByProductAgg[k];
    })
    .sort(function (a, b) {
      return b.revenue - a.revenue;
    })
    .slice(0, 20);

  var trendByDay = Object.keys(byDay)
    .map(function (k) {
      return byDay[k];
    })
    .sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
  if (trendByDay.length > 45) {
    trendByDay = trendByDay.slice(trendByDay.length - 45);
  }

  return {
    totalRowsAnalyzed: totalRowsAnalyzed,
    buckets: buckets,
    rowsByBucket: rowsByBucket,
    byCarrier: byCarrier,
    byProduct: byProduct,
    byProductQty: byProductQty,
    rowsSkippedNoDateFilter: skippedNoDate,
    rowsFilteredBeforeDateRange: filteredBeforeRange,
    rowsFilteredAfterDateRange: filteredAfterRange,
    dateFilter: {
      requested: dateFilterRequested,
      active: dateFilterOn,
      fromIso: fromIsoNormalized,
      toIso: toIsoNormalized,
      orderDateColumnSource:
        resolvedDateColumn && resolvedDateColumn.source
          ? String(resolvedDateColumn.source)
          : 'missing',
      orderDateColumnEffective: effectiveOrderDateColumn,
      orderDateColumnEffectiveLabel: effectiveOrderDateLabel,
    },
    finance: finance,
    trendByDay: trendByDay,
  };
}

/**
 * @param {Array<*>} row
 * @param {number|null} dateCol
 * @param {GoogleAppsScript.Spreadsheet.Sheet|undefined} sheet
 * @param {number} rowNum
 * @return {Date|null}
 */
function mobile_parseRowDateForStats_(row, dateCol, sheet, rowNum) {
  if (dateCol == null || !isFinite(Number(dateCol)) || Number(dateCol) < 1) {
    return null;
  }
  var c = Math.floor(Number(dateCol));
  var raw = row && c <= row.length ? row[c - 1] : '';
  if (
    raw != null &&
    String(raw).trim() !== '' &&
    typeof stats_parseDateString_ === 'function'
  ) {
    var fromDisplay = stats_parseDateString_(String(raw));
    if (fromDisplay) {
      return fromDisplay;
    }
  }
  if (sheet && typeof stats_parseCellDate_ === 'function') {
    try {
      return stats_parseCellDate_(sheet, rowNum, c);
    } catch (e) {}
  }
  return null;
}

/**
 * @param {Array<Array<string>>} bodyRows
 * @param {Object} columns
 * @param {Array<string>=} headerRowValues
 * @return {Array<string>}
 */
function mobile_collectProductKeysFromBody_(bodyRows, columns, headerRowValues) {
  var productCol = mobile_toColumnIndex_(columns && columns.productColumn);
  if (productCol == null && headerRowValues && headerRowValues.length) {
    for (var i = 0; i < headerRowValues.length; i++) {
      var h = String(headerRowValues[i] || '').trim().toLowerCase();
      if (/product|produit|item|article|sku|منتج|المنتج/.test(h)) {
        productCol = i + 1;
        break;
      }
    }
  }
  if (productCol == null) {
    return [];
  }
  var seen = {};
  for (var r = 0; r < bodyRows.length; r++) {
    var row = bodyRows[r] || [];
    var raw = productCol <= row.length ? row[productCol - 1] : '';
    var product = mobile_normalizeProductNameForFinance_(raw);
    if (!product || product === '—') {
      continue;
    }
    seen[product] = true;
  }
  return Object.keys(seen).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {Array<string>} productKeys
 * @return {{ sheetName: string|null, byProduct: Object, totals: {adCost:number, metaAdSpend:number, metaOrdersEstimated:number, otherCost:number} }}
 */
function mobile_prepareFinanceInputsSheet_(ss, sourceSheet, productKeys) {
  if (!ss || !sourceSheet) {
    return {
      sheetName: null,
      byProduct: {},
      totals: { adCost: 0, metaAdSpend: 0, metaOrdersEstimated: 0, otherCost: 0 },
    };
  }
  var key = mobile_financeMapStoreKey_(ss.getId(), sourceSheet.getSheetId());
  var stored = mobile_readDocumentJson_(key) || {};
  var financeSheet = null;

  if (stored.sheetName) {
    var storedFinance = ss.getSheetByName(String(stored.sheetName));
    if (
      storedFinance &&
      storedFinance.getSheetId() !== sourceSheet.getSheetId() &&
      mobile_isManagedFinanceSheet_(storedFinance, sourceSheet.getSheetId())
    ) {
      financeSheet = storedFinance;
    }
  }
  if (!financeSheet || financeSheet.getSheetId() === sourceSheet.getSheetId()) {
    var candidates = mobile_buildCompanionNameCandidates_(
      sourceSheet.getName(),
      'Finance Inputs',
      ['Finance Inputs', 'Cost Inputs', 'مدخلات التكاليف'],
    );
    for (var i = 0; i < candidates.length; i++) {
      var existing = ss.getSheetByName(candidates[i]);
      if (
        existing &&
        existing.getSheetId() !== sourceSheet.getSheetId() &&
        mobile_isManagedFinanceSheet_(existing, sourceSheet.getSheetId())
      ) {
        financeSheet = existing;
        break;
      }
    }
  }
  if (!financeSheet) {
    financeSheet = mobile_createSheetWithUniqueName_(
      ss,
      mobile_buildCompanionSheetName_('Finance Inputs', sourceSheet.getName()),
    );
  }

  var currentHeader = [];
  try {
    var readCols = Math.max(financeSheet.getLastColumn(), MOBILE_FINANCE_HEADERS_.length, 9);
    currentHeader = financeSheet.getRange(1, 1, 1, readCols).getDisplayValues()[0] || [];
  } catch (eReadHeader) {
    currentHeader = [];
  }
  if (mobile_isLegacyFinanceHeader_(currentHeader)) {
    mobile_migrateLegacyFinanceSheet_(financeSheet);
  }

  mobile_ensureSheetSize_(financeSheet, 2, MOBILE_FINANCE_HEADERS_.length);
  financeSheet
    .getRange(1, 1, 1, MOBILE_FINANCE_HEADERS_.length)
    .setValues([MOBILE_FINANCE_HEADERS_]);
  financeSheet.getRange(1, 1, 1, MOBILE_FINANCE_HEADERS_.length).setFontWeight('bold');
  financeSheet
    .getRange(1, 1)
    .setNote(
      'dt-mobile-finance-source:' +
        String(sourceSheet.getSheetId()) +
        '\nFill unit cost/sell price/ad cost/meta ad spend/meta cost per order/other cost per product.',
    );
  financeSheet.setFrozenRows(1);
  var fmtRows = Math.max(financeSheet.getLastRow() - 1, 1);
  try {
    financeSheet.getRange(2, 2, fmtRows, 6).setNumberFormat('#,##0.00');
  } catch (e0) {}

  var lastRow = financeSheet.getLastRow();
  var existingRows = [];
  if (lastRow >= 2) {
    existingRows = financeSheet
      .getRange(2, 1, lastRow - 1, MOBILE_FINANCE_HEADERS_.length)
      .getDisplayValues();
  }
  var rowByProduct = {};
  for (var r = 0; r < existingRows.length; r++) {
    var p = mobile_normalizeProductNameForFinance_(existingRows[r][0]);
    if (p && p !== '—' && !rowByProduct[p]) {
      rowByProduct[p] = true;
    }
  }
  var newRows = [];
  for (var j = 0; j < productKeys.length; j++) {
    var pk = mobile_normalizeProductNameForFinance_(productKeys[j]);
    if (!pk || pk === '—' || rowByProduct[pk]) {
      continue;
    }
    rowByProduct[pk] = true;
    newRows.push([pk, '', '', '', '', '', '', '1', '']);
  }
  if (newRows.length) {
    var start = Math.max(financeSheet.getLastRow() + 1, 2);
    mobile_ensureSheetSize_(financeSheet, start + newRows.length - 1, MOBILE_FINANCE_HEADERS_.length);
    financeSheet
      .getRange(start, 1, newRows.length, MOBILE_FINANCE_HEADERS_.length)
      .setValues(newRows);
  }

  lastRow = financeSheet.getLastRow();
  try {
    financeSheet.getRange(2, 2, Math.max(lastRow - 1, 1), 6).setNumberFormat('#,##0.00');
  } catch (e1) {}
  mobile_styleFinanceInputsSheet_(financeSheet);
  var map = {};
  var totals = { adCost: 0, metaAdSpend: 0, metaOrdersEstimated: 0, otherCost: 0 };
  if (lastRow >= 2) {
    var financeRange = financeSheet.getRange(2, 1, lastRow - 1, MOBILE_FINANCE_HEADERS_.length);
    var rawRows = financeRange.getValues();
    var displayRows = financeRange.getDisplayValues();
    for (var x = 0; x < displayRows.length; x++) {
      var rawRow = rawRows[x] || [];
      var row = displayRows[x] || [];
      var product = mobile_normalizeProductNameForFinance_(row[0] || rawRow[0]);
      if (!product || product === '—') {
        continue;
      }
      var active = mobile_parseFinanceActive_(row[7] !== '' ? row[7] : rawRow[7]);
      var unitCost = mobile_parseNumberCell_(rawRow[1], row[1]);
      var sellPrice = mobile_parseNumberCell_(rawRow[2], row[2]);
      var adCost = mobile_parseNumberCell_(rawRow[3], row[3]);
      var metaAdSpend = mobile_parseNumberCell_(rawRow[4], row[4]);
      var metaCostPerOrder = mobile_parseNumberCell_(rawRow[5], row[5]);
      var otherCost = mobile_parseNumberCell_(rawRow[6], row[6]);
      if (!isFinite(unitCost) || unitCost < 0) {
        unitCost = 0;
      }
      if (!isFinite(sellPrice) || sellPrice <= 0) {
        sellPrice = null;
      }
      if (!isFinite(adCost) || adCost < 0) {
        adCost = 0;
      }
      if (!isFinite(metaAdSpend) || metaAdSpend < 0) {
        metaAdSpend = 0;
      }
      if (!isFinite(metaCostPerOrder) || metaCostPerOrder <= 0) {
        metaCostPerOrder = null;
      }
      if (!isFinite(otherCost) || otherCost < 0) {
        otherCost = 0;
      }
      map[product] = {
        unitCost: unitCost,
        sellPrice: sellPrice,
        adCost: adCost,
        metaAdSpend: metaAdSpend,
        metaCostPerOrder: metaCostPerOrder,
        otherCost: otherCost,
        active: active,
      };
      if (active) {
        totals.adCost += adCost;
        totals.metaAdSpend += metaAdSpend;
        if (metaCostPerOrder != null && metaAdSpend > 0) {
          totals.metaOrdersEstimated += metaAdSpend / metaCostPerOrder;
        }
        totals.otherCost += otherCost;
      }
    }
  }

  stored.sheetName = financeSheet.getName();
  mobile_writeDocumentJson_(key, stored);
  return {
    sheetName: financeSheet.getName(),
    byProduct: map,
    totals: totals,
  };
}

/**
 * @param {*} raw
 * @return {number|null}
 */
function mobile_parseNumberLoose_(raw) {
  if (raw == null || raw === '') {
    return null;
  }
  if (typeof raw === 'number' && isFinite(raw)) {
    return raw;
  }
  var s = String(raw).trim();
  if (!s) {
    return null;
  }
  if (typeof stats_digitsToAscii_ === 'function') {
    try {
      s = stats_digitsToAscii_(s);
    } catch (e0) {}
  }
  s = s.replace(/\u00a0/g, ' ');
  s = s.replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') {
    return null;
  }
  var hasDot = s.indexOf('.') >= 0;
  var hasComma = s.indexOf(',') >= 0;
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    s = s.replace(',', '.');
  }
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Prefer typed numeric values when available, then fallback to loose parsing.
 * @param {*} raw
 * @param {*} display
 * @return {number|null}
 */
function mobile_parseNumberCell_(raw, display) {
  if (typeof raw === 'number' && isFinite(raw)) {
    return raw;
  }
  if (raw instanceof Date) {
    return null;
  }
  var fromRaw = mobile_parseNumberLoose_(raw);
  if (fromRaw != null) {
    return fromRaw;
  }
  return mobile_parseNumberLoose_(display);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} financeSheet
 */
function mobile_styleFinanceInputsSheet_(financeSheet) {
  if (!financeSheet) {
    return;
  }
  var colors = MOBILE_UI_COLORS_;
  var lastRow = Math.max(financeSheet.getLastRow(), 2);
  var maxRows = financeSheet.getMaxRows();
  var cols = MOBILE_FINANCE_HEADERS_.length;

  try {
    financeSheet.setTabColor(colors.brand);
  } catch (e0) {}
  try {
    mobile_clearBandings_(financeSheet);
  } catch (e1) {}

  var headerRange = financeSheet.getRange(1, 1, 1, cols);
  headerRange
    .setBackground(colors.headerBg)
    .setFontColor(colors.headerText)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var bodyRows = Math.max(lastRow - 1, 1);
  var bodyRange = financeSheet.getRange(2, 1, bodyRows, cols);
  bodyRange.setFontColor('#202124');
  try {
    var financeBanding = financeSheet
      .getRange(1, 1, bodyRows + 1, cols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    financeBanding.setHeaderRowColor(colors.headerBg);
    financeBanding.setFirstRowColor('#ffffff');
    financeBanding.setSecondRowColor(colors.rowAlt);
  } catch (e4) {}
  financeSheet
    .getRange(1, 1, bodyRows + 1, cols)
    .setBorder(true, true, true, true, true, true, colors.border, SpreadsheetApp.BorderStyle.SOLID);

  financeSheet.getRange(2, 1, bodyRows, 1).setHorizontalAlignment('left');
  financeSheet.getRange(2, 2, bodyRows, 6).setHorizontalAlignment('right');
  financeSheet.getRange(2, 8, bodyRows, 1).setHorizontalAlignment('center');
  financeSheet.getRange(2, 9, bodyRows, 1).setHorizontalAlignment('left');
  financeSheet.getRange(2, 2, bodyRows, 6).setNumberFormat('#,##0.00');
  financeSheet.getRange(2, 1, bodyRows, cols).setWrap(false);

  try {
    var activeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['1', '0'], true)
      .setAllowInvalid(true)
      .build();
    var validationRows = Math.max(1, Math.min(Math.max(lastRow + 200, 500), Math.max(maxRows - 1, 1)));
    financeSheet
      .getRange(2, 8, validationRows, 1)
      .setDataValidation(activeRule);
  } catch (e2) {}

  try {
    financeSheet.setColumnWidth(1, 240);
    financeSheet.setColumnWidths(2, 6, 118);
    financeSheet.setColumnWidth(8, 90);
    financeSheet.setColumnWidth(9, 220);
  } catch (e3) {}
}

/**
 * @param {*} raw
 * @return {string}
 */
function mobile_normalizeProductNameForFinance_(raw) {
  var base = raw != null ? String(raw).trim() : '';
  if (!base) {
    return '—';
  }
  if (typeof stats_normalizeProductKey_ === 'function') {
    try {
      var normalized = String(stats_normalizeProductKey_(base) || '').trim();
      if (normalized) {
        return normalized;
      }
    } catch (e0) {}
  }
  return base.replace(/\s+/g, ' ').trim();
}

/**
 * @param {*} raw
 * @return {boolean}
 */
function mobile_parseFinanceActive_(raw) {
  if (raw == null) {
    return true;
  }
  var s = String(raw).trim().toLowerCase();
  if (!s) {
    return true;
  }
  if (s === '0' || s === 'false' || s === 'no' || s === 'off' || s === 'non') {
    return false;
  }
  return true;
}

/**
 * Detect previous 7-column finance schema before meta fields were introduced.
 * @param {Array<*>} header
 * @return {boolean}
 */
function mobile_isLegacyFinanceHeader_(header) {
  var h = header || [];
  function normAt_(idx) {
    return String(idx < h.length ? h[idx] : '').trim().toLowerCase();
  }
  return (
    normAt_(0) === 'product' &&
    normAt_(1).indexOf('unit cost') === 0 &&
    normAt_(2).indexOf('sell price') === 0 &&
    normAt_(3).indexOf('ad cost') === 0 &&
    normAt_(4).indexOf('other cost') === 0 &&
    normAt_(5).indexOf('active') === 0 &&
    normAt_(6).indexOf('notes') === 0 &&
    normAt_(7) === ''
  );
}

/**
 * Convert old rows: [product,unit,sell,ad,other,active,notes]
 * to new rows:      [product,unit,sell,ad,metaSpend,metaCPO,other,active,notes]
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function mobile_migrateLegacyFinanceSheet_(sheet) {
  if (!sheet) {
    return;
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }
  var oldRows = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  var converted = [];
  for (var i = 0; i < oldRows.length; i++) {
    var row = oldRows[i] || [];
    converted.push([
      row[0] || '',
      row[1] || '',
      row[2] || '',
      row[3] || '',
      '',
      '',
      row[4] || '',
      row[5] || '',
      row[6] || '',
    ]);
  }
  mobile_ensureSheetSize_(sheet, Math.max(lastRow, 2), MOBILE_FINANCE_HEADERS_.length);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, MOBILE_FINANCE_HEADERS_.length).clearContent();
  }
  if (converted.length) {
    sheet
      .getRange(2, 1, converted.length, MOBILE_FINANCE_HEADERS_.length)
      .setValues(converted);
  }
}

/**
 * @param {string} spreadsheetId
 * @param {number|string} sheetId
 * @return {string}
 */
function mobile_financeMapStoreKey_(spreadsheetId, sheetId) {
  return MOBILE_FINANCE_MAP_KEY_PREFIX_ + spreadsheetId + ':' + String(sheetId);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number|null}
 */
function mobile_getFinanceSourceSheetId_(sheet) {
  if (!sheet) {
    return null;
  }
  var note = '';
  try {
    note = String(sheet.getRange(1, 1).getNote() || '').trim();
  } catch (e0) {
    note = '';
  }
  if (!note) {
    return null;
  }
  var m = note.match(/dt-mobile-finance-source:(\d+)/);
  if (!m) {
    return null;
  }
  var n = Number(m[1]);
  if (!isFinite(n) || n < 1) {
    return null;
  }
  return Math.floor(n);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} sourceSheetId
 * @return {boolean}
 */
function mobile_isManagedFinanceSheet_(sheet, sourceSheetId) {
  if (!sheet) {
    return false;
  }
  var mappedSource = mobile_getFinanceSourceSheetId_(sheet);
  if (mappedSource != null) {
    return Number(mappedSource) === Number(sourceSheetId);
  }
  var n = String(sheet.getName() || '');
  return /^DT\s/i.test(n);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {GoogleAppsScript.Spreadsheet.Range} range
 * @return {boolean}
 */
function mobile_tryHandleFinanceInputsEdit_(ss, sheet, range) {
  if (!ss || !sheet || !range) {
    return false;
  }
  var sourceSheetId = mobile_getFinanceSourceSheetId_(sheet);
  if (sourceSheetId == null || sourceSheetId === sheet.getSheetId()) {
    return false;
  }
  var rowStart = range.getRow();
  var rowEnd = rowStart + range.getNumRows() - 1;
  if (rowEnd < 2) {
    return false;
  }
  var sourceSheet = getSheetById_(ss, sourceSheetId);
  if (!sourceSheet) {
    return false;
  }
  var spreadsheetId = ss.getId();
  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sourceSheetId);
  if (!mappingJson) {
    return false;
  }
  var saved;
  try {
    saved = setup_loadMapping(sourceSheetId);
  } catch (e1) {
    return false;
  }
  if (!saved || !saved.columns) {
    return false;
  }
  mobile_refreshCompanionArtifactsForSheet_(ss, sourceSheet, saved);
  return true;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {Array<string>} header
 * @param {Object<string, Array<Array<string>>>} rowsByBucket
 * @return {{ updated: Array<string>, reused: Array<string>, created: Array<string> }}
 */
function mobile_refreshStatusViewSheets_(ss, sourceSheet, header, rowsByBucket) {
  var key = mobile_viewMapStoreKey_(ss.getId(), sourceSheet.getSheetId());
  var viewMap = mobile_readDocumentJson_(key) || {};
  var updated = [];
  var reused = [];
  var created = [];

  for (var i = 0; i < MOBILE_STATUS_VIEW_DEFS_.length; i++) {
    var def = MOBILE_STATUS_VIEW_DEFS_[i];
    var resolved = mobile_resolveStatusViewSheet_(ss, sourceSheet, viewMap[def.key], def);
    var targetSheet = resolved.sheet;
    if (!targetSheet) {
      continue;
    }
    if (resolved.created) {
      created.push(targetSheet.getName());
    } else {
      reused.push(targetSheet.getName());
    }

    var payloadRows = [];
    for (var b = 0; b < def.buckets.length; b++) {
      var bk = def.buckets[b];
      var bucketRows = rowsByBucket[bk] || [];
      for (var r = 0; r < bucketRows.length; r++) {
        payloadRows.push(bucketRows[r]);
      }
    }
    mobile_writeCompanionRowsToSheet_(
      targetSheet,
      sourceSheet.getName(),
      sourceSheet.getSheetId(),
      header,
      payloadRows,
      def.defaultTitle,
    );
    viewMap[def.key] = targetSheet.getName();
    updated.push(targetSheet.getName());
  }

  mobile_writeDocumentJson_(key, viewMap);
  return { updated: updated, reused: reused, created: created };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {string|undefined} storedName
 * @param {{ defaultTitle: string, aliases: Array<string> }} def
 * @return {{ sheet: GoogleAppsScript.Spreadsheet.Sheet|null, created: boolean }}
 */
function mobile_resolveStatusViewSheet_(ss, sourceSheet, storedName, def) {
  if (storedName) {
    var stored = ss.getSheetByName(String(storedName));
    if (
      stored &&
      stored.getSheetId() !== sourceSheet.getSheetId() &&
      mobile_isManagedStatusViewSheet_(stored, sourceSheet.getSheetId())
    ) {
      return { sheet: stored, created: false };
    }
  }

  var candidates = mobile_buildCompanionNameCandidates_(sourceSheet.getName(), def.defaultTitle, def.aliases);
  for (var i = 0; i < candidates.length; i++) {
    var existing = ss.getSheetByName(candidates[i]);
    if (
      existing &&
      existing.getSheetId() !== sourceSheet.getSheetId() &&
      mobile_isManagedStatusViewSheet_(existing, sourceSheet.getSheetId())
    ) {
      return { sheet: existing, created: false };
    }
  }

  var createdSheet = mobile_createSheetWithUniqueName_(ss, candidates[0]);
  return { sheet: createdSheet, created: true };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet
 * @param {string} sourceSheetName
 * @param {number} sourceSheetId
 * @param {Array<string>} header
 * @param {Array<Array<string>>} bodyRows
 * @param {string} viewTitle
 */
function mobile_writeCompanionRowsToSheet_(
  targetSheet,
  sourceSheetName,
  sourceSheetId,
  header,
  bodyRows,
  viewTitle,
) {
  var safeHeader = header && header.length ? header.slice() : [''];
  var matrix = [safeHeader];
  for (var i = 0; i < bodyRows.length; i++) {
    var row = bodyRows[i] || [];
    var outRow = row.slice(0, safeHeader.length);
    while (outRow.length < safeHeader.length) {
      outRow.push('');
    }
    matrix.push(outRow);
  }
  if (matrix.length === 1) {
    matrix.push(mobile_blankRow_(safeHeader.length));
  }
  mobile_writeMatrixToSheet_(targetSheet, matrix);
  targetSheet.setFrozenRows(1);
  targetSheet.getRange(1, 1, 1, safeHeader.length).setFontWeight('bold');
  mobile_styleStatusViewSheet_(targetSheet, matrix.length, safeHeader.length);
  targetSheet.getRange(1, 1).setNote(
    'dt-mobile-view-source:' +
      String(sourceSheetId) +
      '\nAuto-managed view: "' +
      viewTitle +
      '" from sheet "' +
      sourceSheetName +
      '".',
  );
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {Object} saved
 * @param {Array<Array<string>>} bodyRows
 * @param {Object} columns
 * @param {string|null} defaultCarrier
 * @param {{ sheetName: string|null, byProduct: Object, totals: {adCost:number, metaAdSpend:number, metaOrdersEstimated:number, otherCost:number} }|null} financeInfo
 * @return {string|null}
 */
function mobile_refreshStatsDashboardSheet_(
  ss,
  sourceSheet,
  saved,
  bodyRows,
  columns,
  defaultCarrier,
  financeInfo,
) {
  var key = mobile_statsMapStoreKey_(ss.getId(), sourceSheet.getSheetId());
  var stored = mobile_readDocumentJson_(key) || {};
  var storedName = stored.sheetName ? String(stored.sheetName) : '';
  var dashboardSheet = null;

  if (storedName) {
    var storedSheet = ss.getSheetByName(storedName);
    if (
      storedSheet &&
      storedSheet.getSheetId() !== sourceSheet.getSheetId() &&
      mobile_isManagedStatsSheet_(storedSheet, sourceSheet.getSheetId())
    ) {
      dashboardSheet = storedSheet;
    }
  }
  if (!dashboardSheet || dashboardSheet.getSheetId() === sourceSheet.getSheetId()) {
    var candidates = mobile_buildCompanionNameCandidates_(
      sourceSheet.getName(),
      'Stats Dashboard',
      ['Stats Dashboard', 'Tableau stats', 'لوحة الإحصائيات'],
    );
    for (var i = 0; i < candidates.length; i++) {
      var existing = ss.getSheetByName(candidates[i]);
      if (
        existing &&
        existing.getSheetId() !== sourceSheet.getSheetId() &&
        mobile_isManagedStatsSheet_(existing, sourceSheet.getSheetId())
      ) {
        dashboardSheet = existing;
        break;
      }
    }
  }
  if (!dashboardSheet) {
    dashboardSheet = mobile_createSheetWithUniqueName_(
      ss,
      mobile_buildCompanionSheetName_('Stats Dashboard', sourceSheet.getName()),
    );
  }

  var dateFilterInput = mobile_readDashboardDateFilter_(dashboardSheet);
  var statsSnapshot = mobile_buildDataSnapshot_(
    bodyRows || [],
    columns || {},
    defaultCarrier,
    {
      sheet: sourceSheet,
      sheetId: sourceSheet.getSheetId(),
      headerRow: mobile_getHeaderRow_(saved),
      fromIso: dateFilterInput.fromIso,
      toIso: dateFilterInput.toIso,
      financeInfo: financeInfo || null,
    },
  );

  mobile_renderStatsDashboard_(
    dashboardSheet,
    sourceSheet,
    statsSnapshot,
    dateFilterInput,
  );
  stored.sheetName = dashboardSheet.getName();
  mobile_writeDocumentJson_(key, stored);
  return dashboardSheet.getName();
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} dashboardSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sourceSheet
 * @param {{
 *   totalRowsAnalyzed: number,
 *   buckets: Object,
 *   byCarrier: Object,
 *   byProduct: Object,
 *   byProductQty: Object,
 *   dateFilter: Object,
 *   finance: Object,
 *   trendByDay: Array<Object>
 * }} snapshot
 * @param {{ fromIso: string, toIso: string }} dateFilterInput
 */
function mobile_renderStatsDashboard_(
  dashboardSheet,
  sourceSheet,
  snapshot,
  dateFilterInput,
) {
  var df = snapshot && snapshot.dateFilter ? snapshot.dateFilter : {};
  var fromIso = df.fromIso || (dateFilterInput && dateFilterInput.fromIso) || '';
  var toIso = df.toIso || (dateFilterInput && dateFilterInput.toIso) || '';
  var finance = snapshot && snapshot.finance ? snapshot.finance : {};
  var trendByDay = snapshot && snapshot.trendByDay ? snapshot.trendByDay : [];

  var bucketRows = [];
  for (var i = 0; i < MOBILE_BUCKET_ORDER_.length; i++) {
    var b = MOBILE_BUCKET_ORDER_[i];
    bucketRows.push([i18n_t('stats.bucket.' + b), Number(snapshot.buckets[b] || 0)]);
  }

  var total = Number(snapshot.totalRowsAnalyzed || 0);
  var confirmationRate = total > 0 ? Math.round((10000 * Number(snapshot.buckets.confirmed || 0)) / total) / 100 : 0;
  var deliveryRate = total > 0 ? Math.round((10000 * Number(snapshot.buckets.delivered || 0)) / total) / 100 : 0;

  var kpiRows = [
    [i18n_t('sidebar.stats.total_rows'), total],
    [i18n_t('stats.bucket.confirmed'), Number(snapshot.buckets.confirmed || 0)],
    [i18n_t('stats.bucket.delivered'), Number(snapshot.buckets.delivered || 0)],
    [i18n_t('stats.bucket.in_transit'), Number(snapshot.buckets.in_transit || 0)],
    [i18n_t('stats.bucket.pending'), Number(snapshot.buckets.pending || 0)],
    [i18n_t('stats.bucket.returned'), Number(snapshot.buckets.returned || 0)],
    [i18n_t('stats.bucket.failed'), Number(snapshot.buckets.failed || 0)],
    [i18n_t('stats.bucket.cancelled'), Number(snapshot.buckets.cancelled || 0)],
    [i18n_t('stats.confirmation_rate'), confirmationRate + '%'],
    [i18n_t('stats.delivery_rate'), deliveryRate + '%'],
  ];
  if (df.active) {
    kpiRows.push(['Filtered before', Number(snapshot.rowsFilteredBeforeDateRange || 0)]);
    kpiRows.push(['Filtered after', Number(snapshot.rowsFilteredAfterDateRange || 0)]);
    kpiRows.push(['Missing date', Number(snapshot.rowsSkippedNoDateFilter || 0)]);
  }

  var carrierRows = mobile_buildCarrierRows_(snapshot.byCarrier, 10);
  var productRows = mobile_buildTopProductRows_(
    snapshot.byProduct,
    snapshot.byProductQty,
    10,
  );

  var carrierTable = [['Carrier', 'Delivered', 'In transit', 'Confirmed', 'Pending', 'Returned', 'Failed', 'Cancelled', 'Total']];
  for (var c = 0; c < carrierRows.length; c++) {
    carrierTable.push(carrierRows[c]);
  }
  var productTable = [[i18n_t('sidebar.stats.col_item'), 'Orders', 'Qty']];
  for (var p = 0; p < productRows.length; p++) {
    productTable.push(productRows[p]);
  }

  var kpiTable = [['Metric', 'Value']].concat(kpiRows);
  var statusTable = [['Status', i18n_t('sidebar.stats.col_total')]].concat(bucketRows);
  var financeKpiTable = [
    ['Finance metric', 'Value (DZD)'],
    ['Delivered revenue', Number(finance.deliveredRevenue || 0)],
    ['Delivered COGS', Number(finance.deliveredCogs || 0)],
    ['Delivered shipping', Number(finance.deliveredShipping || 0)],
    ['Gross profit', Number(finance.grossProfit || 0)],
    ['Ad cost', Number(finance.adCost || 0)],
    ['Meta ad spend', Number(finance.metaAdSpend || 0)],
    ['Marketing spend', Number(finance.marketingSpend || 0)],
    ['Meta estimated orders', Number(finance.metaOrdersEstimated || 0)],
    [
      'Meta cost/order (input)',
      finance.metaCostPerOrderInput != null ? Number(finance.metaCostPerOrderInput) : '—',
    ],
    ['Other cost', Number(finance.otherCost || 0)],
    ['Net profit', Number(finance.netProfit || 0)],
    ['AOV', finance.aov != null ? Number(finance.aov) : '—'],
    ['CPA', finance.cpa != null ? Number(finance.cpa) : '—'],
    ['ROAS', finance.roas != null ? Number(finance.roas) : '—'],
    ['Gross margin %', finance.grossMarginPct != null ? finance.grossMarginPct + '%' : '—'],
    ['Net margin %', finance.netMarginPct != null ? finance.netMarginPct + '%' : '—'],
  ];
  var financeBreakdownTable = [
    ['Metric', 'Amount'],
    ['Revenue', Number(finance.deliveredRevenue || 0)],
    ['COGS', Number(finance.deliveredCogs || 0)],
    ['Shipping', Number(finance.deliveredShipping || 0)],
    ['Ad', Number(finance.adCost || 0)],
    ['Meta ad spend', Number(finance.metaAdSpend || 0)],
    ['Other', Number(finance.otherCost || 0)],
    ['Net profit', Number(finance.netProfit || 0)],
  ];
  var financeProductTable = [['Product', 'Orders', 'Qty', 'Revenue', 'Gross']];
  var financeProducts = finance && finance.byProduct ? finance.byProduct : [];
  for (var fp = 0; fp < financeProducts.length && fp < 12; fp++) {
    var pr = financeProducts[fp] || {};
    financeProductTable.push([
      String(pr.product || '—'),
      Number(pr.orders || 0),
      Number(pr.qty || 0),
      Number(pr.revenue || 0),
      Number(pr.gross || 0),
    ]);
  }
  if (financeProductTable.length === 1) {
    financeProductTable.push(['—', 0, 0, 0, 0]);
  }
  var trendTable = [['Date', 'Orders', 'Delivered', 'Delivered revenue']];
  for (var td = 0; td < trendByDay.length; td++) {
    var d = trendByDay[td] || {};
    trendTable.push([
      String(d.date || ''),
      Number(d.orders || 0),
      Number(d.delivered || 0),
      Number(d.deliveredRevenue || 0),
    ]);
  }
  if (trendTable.length === 1) {
    trendTable.push(['', 0, 0, 0]);
  }

  var tableStartRow = 6;
  var productStartRow = 24;
  var financeStartRow = productStartRow;
  var trendStartRow =
    productStartRow +
    Math.max(productTable.length, financeKpiTable.length, financeProductTable.length) +
    3;
  var chartStartRow = trendStartRow + trendTable.length + 2;
  var chartRowStep = 16;
  var neededRows = Math.max(
    tableStartRow + 2,
    tableStartRow + kpiTable.length + 2,
    tableStartRow + statusTable.length + 2,
    tableStartRow + carrierTable.length + 2,
    productStartRow + productTable.length + 2,
    financeStartRow + financeKpiTable.length + 2,
    financeStartRow + financeProductTable.length + 2,
    trendStartRow + trendTable.length + 2,
    chartStartRow + chartRowStep * 5 + 2,
  );
  var neededCols = 22;

  mobile_ensureSheetSize_(dashboardSheet, neededRows, neededCols);
  mobile_clearAllCharts_(dashboardSheet);
  dashboardSheet.clearContents();
  dashboardSheet.clearFormats();
  dashboardSheet.setFrozenRows(4);
  try {
    dashboardSheet.setTabColor(MOBILE_UI_COLORS_.brand);
    dashboardSheet.setHiddenGridlines(true);
  } catch (e0) {}

  dashboardSheet.getRange(1, 1).setValue(i18n_t('stats.title') + ' — ' + sourceSheet.getName());
  dashboardSheet
    .getRange(1, 1, 1, 8)
    .setBackground(MOBILE_UI_COLORS_.headerBg)
    .setFontColor(MOBILE_UI_COLORS_.headerText)
    .setFontWeight('bold');
  dashboardSheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  dashboardSheet
    .getRange(1, 1)
    .setNote('dt-mobile-stats-source:' + String(sourceSheet.getSheetId()));
  dashboardSheet.getRange(2, 1).setValue(i18n_t('sidebar.label.date_from_optional'));
  dashboardSheet.getRange(2, 2).setValue(fromIso);
  dashboardSheet.getRange(2, 3).setValue(i18n_t('sidebar.label.date_to_optional'));
  dashboardSheet.getRange(2, 4).setValue(toIso);
  dashboardSheet.getRange(2, 1, 1, 4).setFontWeight('bold');
  dashboardSheet.getRange(2, 2, 1, 1).setNumberFormat('@');
  dashboardSheet.getRange(2, 4, 1, 1).setNumberFormat('@');
  dashboardSheet
    .getRange(2, 1, 1, 4)
    .setBackground(MOBILE_UI_COLORS_.brandMuted)
    .setFontColor('#202124');
  dashboardSheet
    .getRange(2, 2, 1, 1)
    .setBackground('#ffffff')
    .setBorder(true, true, true, true, true, true, MOBILE_UI_COLORS_.brand, SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center');
  dashboardSheet
    .getRange(2, 4, 1, 1)
    .setBackground('#ffffff')
    .setBorder(true, true, true, true, true, true, MOBILE_UI_COLORS_.brand, SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center');
  dashboardSheet.getRange(2, 6).setValue('Updated: ' + new Date().toISOString());
  dashboardSheet.getRange(2, 6).setFontColor('#5f6368');

  var filterLine = '';
  if (df.requested && !df.active) {
    filterLine = i18n_t('sidebar.msg.stats_order_date_unusable');
  } else if (df.active && df.fromIso && df.toIso) {
    filterLine = i18n_t('sidebar.stats.filter_range') + ': ' + df.fromIso + ' → ' + df.toIso;
    if (typeof i18n_format === 'function') {
      filterLine +=
        ' | ' +
        i18n_format(
          'sidebar.msg.stats_filter_excluded',
          Number(snapshot.rowsFilteredBeforeDateRange || 0),
          Number(snapshot.rowsFilteredAfterDateRange || 0),
          Number(snapshot.rowsSkippedNoDateFilter || 0),
        );
    }
  } else {
    filterLine = 'Set From/To in row 2 (yyyy-mm-dd), then edit a status cell to refresh.';
  }
  dashboardSheet.getRange(3, 1).setValue(filterLine);
  dashboardSheet.getRange(3, 1, 1, 11).setBackground('#eef3fb').setFontColor('#1f3a5f');
  dashboardSheet
    .getRange(4, 1)
    .setValue(
      'Finance input sheet: ' +
        String(finance && finance.inputSheetName ? finance.inputSheetName : 'auto-created'),
    );
  dashboardSheet
    .getRange(4, 1, 1, 11)
    .setBackground('#f8f9fa')
    .setFontColor('#3c4043');
  if (finance && finance.productsMissingPriceCount) {
    dashboardSheet
      .getRange(4, 8)
      .setValue('Products missing price: ' + String(finance.productsMissingPriceCount))
      .setBackground('#fde293')
      .setFontColor('#5f3b00')
      .setFontWeight('bold');
  }

  dashboardSheet
    .getRange(tableStartRow, 1, kpiTable.length, 2)
    .setValues(kpiTable);
  dashboardSheet
    .getRange(tableStartRow, 4, statusTable.length, 2)
    .setValues(statusTable);
  dashboardSheet
    .getRange(tableStartRow, 7, carrierTable.length, carrierTable[0].length)
    .setValues(carrierTable);
  dashboardSheet
    .getRange(productStartRow, 1, productTable.length, productTable[0].length)
    .setValues(productTable);
  dashboardSheet
    .getRange(financeStartRow, 4, financeKpiTable.length, 2)
    .setValues(financeKpiTable);
  dashboardSheet
    .getRange(financeStartRow, 7, financeProductTable.length, financeProductTable[0].length)
    .setValues(financeProductTable);
  dashboardSheet
    .getRange(financeStartRow, 13, financeBreakdownTable.length, 2)
    .setValues(financeBreakdownTable);
  dashboardSheet
    .getRange(trendStartRow, 1, trendTable.length, trendTable[0].length)
    .setValues(trendTable);

  mobile_styleDashboardTable_(dashboardSheet, tableStartRow, 1, kpiTable.length, 2, '#d7e7ff');
  mobile_styleDashboardTable_(dashboardSheet, tableStartRow, 4, statusTable.length, 2, '#fde293');
  mobile_styleDashboardTable_(
    dashboardSheet,
    tableStartRow,
    7,
    carrierTable.length,
    carrierTable[0].length,
    '#d9f2e3',
  );
  mobile_styleDashboardTable_(dashboardSheet, productStartRow, 1, productTable.length, 3, '#efe3ff');
  mobile_styleDashboardTable_(dashboardSheet, financeStartRow, 4, financeKpiTable.length, 2, '#e4f3eb');
  mobile_styleDashboardTable_(
    dashboardSheet,
    financeStartRow,
    7,
    financeProductTable.length,
    financeProductTable[0].length,
    '#e8f0fe',
  );
  mobile_styleDashboardTable_(
    dashboardSheet,
    financeStartRow,
    13,
    financeBreakdownTable.length,
    2,
    '#ffe7cf',
  );
  mobile_styleDashboardTable_(
    dashboardSheet,
    trendStartRow,
    1,
    trendTable.length,
    trendTable[0].length,
    '#eaf1ff',
  );

  if (kpiTable.length > 1) {
    dashboardSheet
      .getRange(tableStartRow + 1, 2, kpiTable.length - 1, 1)
      .setHorizontalAlignment('right');
  }
  if (statusTable.length > 1) {
    dashboardSheet
      .getRange(tableStartRow + 1, 5, statusTable.length - 1, 1)
      .setHorizontalAlignment('right');
  }
  if (productTable.length > 1) {
    dashboardSheet
      .getRange(productStartRow + 1, 2, productTable.length - 1, 2)
      .setHorizontalAlignment('right')
      .setNumberFormat('#,##0.00');
  }
  if (financeKpiTable.length > 1) {
    dashboardSheet
      .getRange(financeStartRow + 1, 5, financeKpiTable.length - 1, 1)
      .setHorizontalAlignment('right')
      .setNumberFormat('#,##0.00');
  }
  if (financeProductTable.length > 1) {
    dashboardSheet
      .getRange(financeStartRow + 1, 8, financeProductTable.length - 1, 4)
      .setHorizontalAlignment('right');
    dashboardSheet
      .getRange(financeStartRow + 1, 10, financeProductTable.length - 1, 2)
      .setNumberFormat('#,##0.00');
  }
  if (financeBreakdownTable.length > 1) {
    dashboardSheet
      .getRange(financeStartRow + 1, 14, financeBreakdownTable.length - 1, 1)
      .setHorizontalAlignment('right')
      .setNumberFormat('#,##0.00');
  }
  if (trendTable.length > 1) {
    dashboardSheet
      .getRange(trendStartRow + 1, 2, trendTable.length - 1, 3)
      .setHorizontalAlignment('right');
    dashboardSheet
      .getRange(trendStartRow + 1, 4, trendTable.length - 1, 1)
      .setNumberFormat('#,##0.00');
  }

  try {
    dashboardSheet.setColumnWidth(1, 210);
    dashboardSheet.setColumnWidths(2, 4, 110);
    dashboardSheet.setColumnWidth(6, 30);
    dashboardSheet.setColumnWidths(7, 9, 115);
    dashboardSheet.setColumnWidths(16, 7, 115);
  } catch (e1) {}

  if (statusTable.length > 1) {
    var statusChart = dashboardSheet
      .newChart()
      .asPieChart()
      .addRange(dashboardSheet.getRange(tableStartRow, 4, statusTable.length, 2))
      .setPosition(chartStartRow, 1, 0, 0)
      .setOption('title', i18n_t('sidebar.stats.distribution'))
      .setOption('legend', { position: 'bottom' })
      .setOption('pieHole', 0.35)
      .setOption('colors', MOBILE_STATUS_COLORS_)
      .setOption('chartArea', { width: '88%', height: '72%' })
      .setOption('width', 560)
      .setOption('height', 280)
      .build();
    dashboardSheet.insertChart(statusChart);
  }

  if (carrierTable.length > 1) {
    var carrierChart = dashboardSheet
      .newChart()
      .asColumnChart()
      .addRange(dashboardSheet.getRange(tableStartRow, 7, carrierTable.length, 8))
      .setPosition(chartStartRow + chartRowStep, 1, 0, 0)
      .setOption('title', i18n_t('sidebar.stats.by_carrier'))
      .setOption('isStacked', true)
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', MOBILE_STATUS_COLORS_.slice(0, 7))
      .setOption('chartArea', { width: '84%', height: '66%' })
      .setOption('width', 640)
      .setOption('height', 300)
      .build();
    dashboardSheet.insertChart(carrierChart);
  }

  if (productTable.length > 1) {
    var productChart = dashboardSheet
      .newChart()
      .asBarChart()
      .addRange(dashboardSheet.getRange(productStartRow, 1, productTable.length, 3))
      .setPosition(chartStartRow + chartRowStep * 2, 1, 0, 0)
      .setOption('title', i18n_t('sidebar.stats.top_products') + ' (Orders / Qty)')
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#1a73e8', '#34a853'])
      .setOption('chartArea', { width: '78%', height: '70%' })
      .setOption('width', 620)
      .setOption('height', 300)
      .build();
    dashboardSheet.insertChart(productChart);
  }

  if (financeBreakdownTable.length > 1) {
    var financeChart = dashboardSheet
      .newChart()
      .asColumnChart()
      .addRange(dashboardSheet.getRange(financeStartRow, 13, financeBreakdownTable.length, 2))
      .setPosition(chartStartRow + chartRowStep * 3, 1, 0, 0)
      .setOption('title', 'Financial breakdown')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#ff8f00'])
      .setOption('chartArea', { width: '84%', height: '68%' })
      .setOption('width', 620)
      .setOption('height', 280)
      .build();
    dashboardSheet.insertChart(financeChart);
  }

  if (trendTable.length > 2) {
    var trendChart = dashboardSheet
      .newChart()
      .asLineChart()
      .addRange(dashboardSheet.getRange(trendStartRow, 1, trendTable.length, 4))
      .setPosition(chartStartRow + chartRowStep * 4, 1, 0, 0)
      .setOption('title', 'Trend by day')
      .setOption('legend', { position: 'bottom' })
      .setOption('colors', ['#5f6368', '#188038', '#1a73e8'])
      .setOption('chartArea', { width: '84%', height: '68%' })
      .setOption('width', 640)
      .setOption('height', 300)
      .build();
    dashboardSheet.insertChart(trendChart);
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {{ fromIso: string, toIso: string }}
 */
function mobile_readDashboardDateFilter_(sheet) {
  if (!sheet) {
    return { fromIso: '', toIso: '' };
  }
  var fromRaw = '';
  var toRaw = '';
  try {
    fromRaw = String(sheet.getRange(2, 2).getDisplayValue() || '').trim();
    toRaw = String(sheet.getRange(2, 4).getDisplayValue() || '').trim();
  } catch (e) {
    return { fromIso: '', toIso: '' };
  }
  return {
    fromIso: mobile_normalizeDateFilterInput_(fromRaw, false),
    toIso: mobile_normalizeDateFilterInput_(toRaw, true),
  };
}

/**
 * @param {string} raw
 * @param {boolean} isEnd
 * @return {string}
 */
function mobile_normalizeDateFilterInput_(raw, isEnd) {
  var s = String(raw || '').trim();
  if (!s) {
    return '';
  }
  var ms = null;
  if (isEnd && typeof stats_parseFilterEnd_ === 'function') {
    ms = stats_parseFilterEnd_(s);
  } else if (!isEnd && typeof stats_parseFilterStart_ === 'function') {
    ms = stats_parseFilterStart_(s);
  }
  if (ms == null || !isFinite(ms)) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  if (typeof stats_formatDateMsAsIso_ === 'function') {
    return stats_formatDateMsAsIso_(ms);
  }
  var d = new Date(ms);
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Range} range
 * @return {boolean}
 */
function mobile_isDashboardDateFilterEdit_(range) {
  if (!range) {
    return false;
  }
  var rowStart = range.getRow();
  var rowEnd = rowStart + range.getNumRows() - 1;
  if (2 < rowStart || 2 > rowEnd) {
    return false;
  }
  var colStart = range.getColumn();
  var colEnd = colStart + range.getNumColumns() - 1;
  var touchesFrom = colStart <= 2 && colEnd >= 2;
  var touchesTo = colStart <= 4 && colEnd >= 4;
  return touchesFrom || touchesTo;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number|null}
 */
function mobile_getStatsDashboardSourceSheetId_(sheet) {
  if (!sheet) {
    return null;
  }
  var note = '';
  try {
    note = String(sheet.getRange(1, 1).getNote() || '').trim();
  } catch (e) {
    note = '';
  }
  if (!note) {
    return null;
  }
  var m = note.match(/dt-mobile-stats-source:(\d+)/);
  if (!m) {
    return null;
  }
  var id = Number(m[1]);
  if (!isFinite(id) || id < 1) {
    return null;
  }
  return Math.floor(id);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} sourceSheetId
 * @return {boolean}
 */
function mobile_isManagedStatsSheet_(sheet, sourceSheetId) {
  if (!sheet) {
    return false;
  }
  var mappedSource = mobile_getStatsDashboardSourceSheetId_(sheet);
  if (mappedSource != null) {
    return Number(mappedSource) === Number(sourceSheetId);
  }
  var n = String(sheet.getName() || '');
  return /^DT\s/i.test(n);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {number|null}
 */
function mobile_getStatusViewSourceSheetId_(sheet) {
  if (!sheet) {
    return null;
  }
  var note = '';
  try {
    note = String(sheet.getRange(1, 1).getNote() || '').trim();
  } catch (e0) {
    note = '';
  }
  if (!note) {
    return null;
  }
  var m = note.match(/dt-mobile-view-source:(\d+)/);
  if (!m) {
    return null;
  }
  var n = Number(m[1]);
  if (!isFinite(n) || n < 1) {
    return null;
  }
  return Math.floor(n);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} sourceSheetId
 * @return {boolean}
 */
function mobile_isManagedStatusViewSheet_(sheet, sourceSheetId) {
  if (!sheet) {
    return false;
  }
  var mappedSource = mobile_getStatusViewSourceSheetId_(sheet);
  if (mappedSource != null) {
    return Number(mappedSource) === Number(sourceSheetId);
  }
  var n = String(sheet.getName() || '');
  return /^DT\s/i.test(n);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {GoogleAppsScript.Spreadsheet.Range} range
 * @return {boolean} true when dashboard date edit was handled
 */
function mobile_tryHandleStatsDashboardDateEdit_(ss, sheet, range) {
  if (!mobile_isDashboardDateFilterEdit_(range)) {
    return false;
  }
  var sourceSheetId = mobile_getStatsDashboardSourceSheetId_(sheet);
  if (sourceSheetId == null || sourceSheetId === sheet.getSheetId()) {
    return false;
  }
  var sourceSheet = getSheetById_(ss, sourceSheetId);
  if (!sourceSheet) {
    return false;
  }
  var spreadsheetId = ss.getId();
  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sourceSheetId);
  if (!mappingJson) {
    return false;
  }
  var saved;
  try {
    saved = setup_loadMapping(sourceSheetId);
  } catch (e0) {
    return false;
  }
  if (!saved || !saved.columns) {
    return false;
  }
  mobile_refreshCompanionArtifactsForSheet_(ss, sourceSheet, saved);
  return true;
}

/**
 * @param {Object} byCarrier
 * @param {number} limit
 * @return {Array<Array<*>>}
 */
function mobile_buildCarrierRows_(byCarrier, limit) {
  var keys = Object.keys(byCarrier || {});
  keys.sort(function (a, b) {
    return Number((byCarrier[b] && byCarrier[b].total) || 0) - Number((byCarrier[a] && byCarrier[a].total) || 0);
  });
  if (!keys.length) {
    return [['—', 0, 0, 0, 0, 0, 0, 0, 0]];
  }
  var out = [];
  for (var i = 0; i < keys.length && i < limit; i++) {
    var key = keys[i];
    var row = byCarrier[key] || {};
    out.push([
      key,
      Number(row.delivered || 0),
      Number(row.in_transit || 0),
      Number(row.confirmed || 0),
      Number(row.pending || 0),
      Number(row.returned || 0),
      Number(row.failed || 0),
      Number(row.cancelled || 0),
      Number(row.total || 0),
    ]);
  }
  return out;
}

/**
 * @param {Object} byProduct
 * @param {Object} byProductQty
 * @param {number} limit
 * @return {Array<Array<*>>}
 */
function mobile_buildTopProductRows_(byProduct, byProductQty, limit) {
  var keys = Object.keys(byProduct || {});
  keys.sort(function (a, b) {
    var qtyDiff = Number((byProductQty && byProductQty[b]) || 0) - Number((byProductQty && byProductQty[a]) || 0);
    if (qtyDiff !== 0) {
      return qtyDiff;
    }
    return Number(byProduct[b] || 0) - Number(byProduct[a] || 0);
  });
  if (!keys.length) {
    return [['—', 0, 0]];
  }
  var out = [];
  for (var i = 0; i < keys.length && i < limit; i++) {
    out.push([
      keys[i],
      Number(byProduct[keys[i]] || 0),
      Number((byProductQty && byProductQty[keys[i]]) || 0),
    ]);
  }
  return out;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow
 * @param {number} startCol
 * @param {number} rows
 * @param {number} cols
 * @param {string=} headerBg
 */
function mobile_styleDashboardTable_(sheet, startRow, startCol, rows, cols, headerBg) {
  if (!sheet || rows < 1 || cols < 1) {
    return;
  }
  var colors = MOBILE_UI_COLORS_;
  var safeHeaderBg = headerBg || colors.sectionBg;
  var headerRange = sheet.getRange(startRow, startCol, 1, cols);
  headerRange
    .setBackground(safeHeaderBg)
    .setFontColor('#202124')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  var allRange = sheet.getRange(startRow, startCol, rows, cols);
  allRange.setBorder(
    true,
    true,
    true,
    true,
    true,
    true,
    colors.border,
    SpreadsheetApp.BorderStyle.SOLID,
  );
  if (rows > 1) {
    var body = sheet.getRange(startRow + 1, startCol, rows - 1, cols);
    body.setBackground('#ffffff').setFontColor('#202124');
    for (var r = startRow + 2; r <= startRow + rows - 1; r += 2) {
      sheet.getRange(r, startCol, 1, cols).setBackground(colors.rowAlt);
    }
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rows
 * @param {number} cols
 */
function mobile_styleStatusViewSheet_(sheet, rows, cols) {
  if (!sheet || rows < 1 || cols < 1) {
    return;
  }
  var colors = MOBILE_UI_COLORS_;
  try {
    sheet.setTabColor('#5e35b1');
    sheet.setHiddenGridlines(false);
    mobile_clearBandings_(sheet);
  } catch (e0) {}
  sheet
    .getRange(1, 1, 1, cols)
    .setBackground(colors.headerBg)
    .setFontColor(colors.headerText)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  if (rows > 1) {
    sheet.getRange(2, 1, rows - 1, cols).setFontColor('#202124');
    try {
      var statusBanding = sheet
        .getRange(1, 1, rows, cols)
        .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
      statusBanding.setHeaderRowColor(colors.headerBg);
      statusBanding.setFirstRowColor('#ffffff');
      statusBanding.setSecondRowColor(colors.rowAlt);
    } catch (e1) {}
  }
  sheet
    .getRange(1, 1, rows, cols)
    .setBorder(true, true, true, true, true, true, colors.border, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(1, 1, rows, cols).setWrap(false);
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function mobile_clearAllCharts_(sheet) {
  var charts = sheet.getCharts();
  for (var i = 0; i < charts.length; i++) {
    sheet.removeChart(charts[i]);
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function mobile_clearBandings_(sheet) {
  if (!sheet || typeof sheet.getBandings !== 'function') {
    return;
  }
  var bandings = sheet.getBandings();
  for (var i = 0; i < bandings.length; i++) {
    try {
      bandings[i].remove();
    } catch (e) {}
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} minRows
 * @param {number} minCols
 */
function mobile_ensureSheetSize_(sheet, minRows, minCols) {
  var maxRows = sheet.getMaxRows();
  var maxCols = sheet.getMaxColumns();
  if (maxRows < minRows) {
    sheet.insertRowsAfter(maxRows, minRows - maxRows);
  }
  if (maxCols < minCols) {
    sheet.insertColumnsAfter(maxCols, minCols - maxCols);
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Array<string>>} matrix
 */
function mobile_writeMatrixToSheet_(sheet, matrix) {
  var rows = matrix && matrix.length ? matrix.length : 1;
  var cols = 1;
  for (var r = 0; r < matrix.length; r++) {
    cols = Math.max(cols, matrix[r] ? matrix[r].length : 0);
  }
  mobile_ensureSheetSize_(sheet, rows, cols);

  // Pad ragged rows to a rectangular matrix.
  var out = [];
  for (var i = 0; i < rows; i++) {
    var src = matrix[i] ? matrix[i].slice() : [];
    while (src.length < cols) {
      src.push('');
    }
    out.push(src);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, rows, cols).setValues(out);

  var maxRows = sheet.getMaxRows();
  var maxCols = sheet.getMaxColumns();
  if (maxRows > rows) {
    sheet.getRange(rows + 1, 1, maxRows - rows, maxCols).clearContent();
  }
  if (maxCols > cols) {
    sheet.getRange(1, cols + 1, rows, maxCols - cols).clearContent();
  }
}

/**
 * @param {number} len
 * @return {Array<string>}
 */
function mobile_blankRow_(len) {
  var out = [];
  var n = isFinite(len) && len > 0 ? Math.floor(len) : 1;
  for (var i = 0; i < n; i++) {
    out.push('');
  }
  return out;
}

/**
 * @return {Object}
 */
function mobile_emptyBucketCounters_() {
  return {
    delivered: 0,
    returned: 0,
    failed: 0,
    cancelled: 0,
    in_transit: 0,
    confirmed: 0,
    pending: 0,
    unknown: 0,
  };
}

/**
 * @param {Object} map
 * @param {string} key
 * @param {string} bucket
 */
function mobile_incNestedBucket_(map, key, bucket) {
  if (!map[key]) {
    var base = mobile_emptyBucketCounters_();
    base.total = 0;
    map[key] = base;
  }
  if (map[key][bucket] == null) {
    map[key][bucket] = 0;
  }
  map[key][bucket]++;
  map[key].total++;
}

/**
 * @param {Array<*>} row
 * @return {boolean}
 */
function mobile_isRowBlank_(row) {
  if (!row || !row.length) {
    return true;
  }
  for (var i = 0; i < row.length; i++) {
    if (row[i] != null && String(row[i]).trim() !== '') {
      return false;
    }
  }
  return true;
}

/**
 * @param {*} raw
 * @return {number|null}
 */
function mobile_toColumnIndex_(raw) {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  var n = Number(raw);
  if (!isFinite(n) || n < 1) {
    return null;
  }
  return Math.floor(n);
}

/**
 * @param {Object} saved
 * @return {number}
 */
function mobile_getHeaderRow_(saved) {
  var headerRow =
    saved && saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  return Math.floor(headerRow);
}

/**
 * @param {string} sourceSheetName
 * @param {string} title
 * @param {Array<string>} aliases
 * @return {Array<string>}
 */
function mobile_buildCompanionNameCandidates_(sourceSheetName, title, aliases) {
  var out = [];
  var seen = {};

  function add_(name) {
    var safe = mobile_sanitizeSheetName_(name);
    if (!safe || seen[safe]) {
      return;
    }
    seen[safe] = true;
    out.push(safe);
  }

  add_(mobile_buildCompanionSheetName_(title, sourceSheetName));
  add_(mobile_buildCompanionSheetName_(title, ''));
  add_(title);

  for (var i = 0; i < aliases.length; i++) {
    add_(aliases[i]);
    add_(mobile_buildCompanionSheetName_(aliases[i], sourceSheetName));
  }
  return out.length ? out : [mobile_buildCompanionSheetName_(title, sourceSheetName)];
}

/**
 * @param {string} title
 * @param {string} sourceSheetName
 * @return {string}
 */
function mobile_buildCompanionSheetName_(title, sourceSheetName) {
  var base = 'DT ' + String(title || '').trim();
  if (sourceSheetName && String(sourceSheetName).trim() !== '') {
    base += ' - ' + String(sourceSheetName).trim();
  }
  return mobile_sanitizeSheetName_(base);
}

/**
 * @param {string} raw
 * @return {string}
 */
function mobile_sanitizeSheetName_(raw) {
  var s = String(raw || '').replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) {
    s = 'DT View';
  }
  if (s.length > 99) {
    s = s.slice(0, 99);
  }
  return s;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} preferredName
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function mobile_createSheetWithUniqueName_(ss, preferredName) {
  var base = mobile_sanitizeSheetName_(preferredName);
  var name = base;
  var n = 2;
  while (ss.getSheetByName(name)) {
    var suffix = ' (' + n + ')';
    var maxBaseLen = 99 - suffix.length;
    var trimmed = base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base;
    name = trimmed + suffix;
    n++;
  }
  return ss.insertSheet(name);
}

/**
 * @param {string} spreadsheetId
 * @param {number|string} sheetId
 * @return {string}
 */
function mobile_viewMapStoreKey_(spreadsheetId, sheetId) {
  return MOBILE_VIEW_MAP_KEY_PREFIX_ + spreadsheetId + ':' + String(sheetId);
}

/**
 * @param {string} spreadsheetId
 * @param {number|string} sheetId
 * @return {string}
 */
function mobile_statsMapStoreKey_(spreadsheetId, sheetId) {
  return MOBILE_STATS_MAP_KEY_PREFIX_ + spreadsheetId + ':' + String(sheetId);
}

/**
 * @param {string} key
 * @return {Object|null}
 */
function mobile_readDocumentJson_(key) {
  var raw = PropertiesService.getDocumentProperties().getProperty(key);
  if (!raw) {
    return null;
  }
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} key
 * @param {Object} obj
 */
function mobile_writeDocumentJson_(key, obj) {
  try {
    var json = JSON.stringify(obj || {});
    if (json.length > 9000) {
      return;
    }
    PropertiesService.getDocumentProperties().setProperty(key, json);
  } catch (e) {}
}
