/**

 * @fileoverview Wilaya list API for sidebar + column validation.

 */



/**

 * @return {{ wilayas: Array<{ code: number, label: string }> }}

 */

function lists_getWilayas() {

  var rows = wilaya_getAll_();

  var wilayas = [];

  for (var i = 0; i < rows.length; i++) {

    var w = rows[i];

    wilayas.push({ code: w.code, label: w.fr });

  }

  return { wilayas: wilayas };

}



/**

 * Applies dropdown validation on the mapped wilaya column (rows 2 → last row).

 * Existing cells may stay invalid until edited — see {@code allowInvalid}.

 *

 * @param {boolean} [allowInvalid] default true (migration-friendly)

 * @return {{ applied: boolean, rowCount: number, column: number|null }}

 */

function lists_applyWilayaColumnValidation(allowInvalid) {

  var allow =

    allowInvalid === undefined || allowInvalid === null ? true : !!allowInvalid;



  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getActiveSheet();

  var spreadsheetId = ss.getId();

  var sheetId = sheet.getSheetId();



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

  var columns = saved.columns || {};

  if (columns.wilayaColumn == null) {

    throw new Error(i18n_t('error.wilaya_column_required'));

  }



  var col = Number(columns.wilayaColumn);

  if (isNaN(col) || col < 1) {

    throw new Error(i18n_t('error.wilaya_column_invalid'));

  }



  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  var lastRow = Math.max(sheet.getLastRow(), headerRow + 1);

  var labels = wilaya_getDropdownLabels_();

  var rule = SpreadsheetApp.newDataValidation()

    .requireValueInList(labels, true)

    .setAllowInvalid(allow)

    .build();



  // Apply validation from the first data row (headerRow + 1) down to the last used row.
  sheet.getRange(headerRow + 1, col, lastRow - headerRow, 1).setDataValidation(rule);



  return {

    applied: true,

    rowCount: lastRow - headerRow,

    column: col,

  };

}



/**
 * Fetches commune labels for a wilaya from GET /v1/geo/communes (requires backend URL).
 *
 * @param {number|string} wilayaCode 1–58
 * @return {{ wilayaCode: number, communes: Array<string>, count: number }}
 */

function lists_fetchCommunesForWilaya(wilayaCode) {

  if (!getApiBaseUrl_()) {

    throw new Error(i18n_t('error.backend_url_required_for_communes'));

  }

  var n = Number(wilayaCode);

  if (isNaN(n) || n < 1 || n > 58) {

    throw new Error(i18n_t('error.wilaya_invalid_range'));

  }

  var path = '/v1/geo/communes?wilayaCode=' + encodeURIComponent(String(n));

  return apiJsonGet_(path);

}



/**

 * Applies dropdown validation on the mapped commune column for one wilaya's list.

 *

 * @param {number|string} wilayaCode

 * @param {boolean} [allowInvalid] default true

 * @return {{ applied: boolean, rowCount: number, column: number|null, wilayaCode: number }}

 */

function lists_applyCommuneColumnValidation(wilayaCode, allowInvalid) {

  var allow =

    allowInvalid === undefined || allowInvalid === null ? true : !!allowInvalid;



  var pack = lists_fetchCommunesForWilaya(wilayaCode);

  var labels = pack.communes || [];

  if (!labels.length) {

    throw new Error(i18n_t('error.no_communes_for_wilaya'));

  }



  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sheet = ss.getActiveSheet();

  var spreadsheetId = ss.getId();

  var sheetId = sheet.getSheetId();



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

  var columns = saved.columns || {};

  if (columns.communeColumn == null) {

    throw new Error(i18n_t('error.commune_column_required'));

  }



  var col = Number(columns.communeColumn);

  if (isNaN(col) || col < 1) {

    throw new Error(i18n_t('error.commune_column_invalid'));

  }



  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  var lastRow = Math.max(sheet.getLastRow(), headerRow + 1);

  var rule = SpreadsheetApp.newDataValidation()

    .requireValueInList(labels, true)

    .setAllowInvalid(allow)

    .build();



  // Apply validation from the first data row (headerRow + 1) down to the last used row.
  sheet.getRange(headerRow + 1, col, lastRow - headerRow, 1).setDataValidation(rule);



  return {

    applied: true,

    rowCount: lastRow - headerRow,

    column: col,

    wilayaCode: Number(wilayaCode),

  };

}

/**
 * Canonical status choices shown in sheet dropdowns (multi-language + canonical tokens).
 * Keep broad enough so sync write-backs remain compatible.
 */
var LISTS_STATUS_DROPDOWN_VALUES_ = [
  // Canonical tokens
  'pending',
  'confirmed',
  'in_transit',
  'delivered',
  'returned',
  'failed',
  'cancelled',
  // English
  'Pending',
  'Confirmed',
  'In transit',
  'Delivered',
  'Returned',
  'Failed',
  'Cancelled',
  // French
  'En attente',
  'Confirmee',
  'Confirmée',
  'En transit',
  'Livree',
  'Livrée',
  'Retour',
  'Echec',
  'Échec',
  'Annulee',
  'Annulée',
  // Arabic
  'قيد الانتظار',
  'مؤكد',
  'قيد النقل',
  'تم التسليم',
  'مرتجع',
  'فشل',
  'ملغي',
];

/**
 * @param {Array<string>} values
 * @return {Array<string>}
 */
function lists_uniqueNonEmpty_(values) {
  var out = [];
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var v = values[i] != null ? String(values[i]).trim() : '';
    if (!v) continue;
    var k = v.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    out.push(v);
  }
  return out;
}

/**
 * @return {Array<string>}
 */
function lists_getCarrierDropdownLabels_() {
  var out = [];
  var carriers = [];
  try {
    carriers = setup_resolveCarriers_();
  } catch (e) {
    carriers = [];
  }
  for (var i = 0; i < carriers.length; i++) {
    var c = carriers[i] || {};
    var label = c.label != null ? String(c.label).trim() : '';
    var id = c.id != null ? String(c.id).trim() : '';
    if (label) out.push(label);
    if (id) out.push(id);
    if (id) out.push(id.toUpperCase());
  }
  return lists_uniqueNonEmpty_(out);
}

/**
 * @return {Array<string>}
 */
function lists_getStatusDropdownLabels_() {
  var out = LISTS_STATUS_DROPDOWN_VALUES_.slice();
  // Include current UI language labels too.
  var keys = [
    'stats.bucket.pending',
    'stats.bucket.confirmed',
    'stats.bucket.in_transit',
    'stats.bucket.delivered',
    'stats.bucket.returned',
    'stats.bucket.failed',
    'stats.bucket.cancelled',
  ];
  for (var i = 0; i < keys.length; i++) {
    try {
      out.push(i18n_t(keys[i]));
    } catch (e) {}
  }
  return lists_uniqueNonEmpty_(out);
}

/**
 * Detect whether the mapped status column looks like a real status column.
 * Prevents applying status dropdown validation to unrelated columns by mistake.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @param {number} statusCol
 * @return {boolean}
 */
function lists_shouldApplyStatusValidation_(sheet, headerRow, statusCol) {
  if (!sheet || !isFinite(statusCol) || statusCol < 1) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) return true;

  var headerText = '';
  try {
    headerText = String(sheet.getRange(headerRow, statusCol, 1, 1).getDisplayValue() || '');
  } catch (e0) {
    headerText = '';
  }
  var headerNorm =
    typeof setup_normalizeHeader_ === 'function'
      ? setup_normalizeHeader_(headerText)
      : String(headerText || '').trim().toLowerCase();

  if (
    /status|statut|etat|state|tracking|suivi|حاله|حالة|تتبع|follow/.test(
      headerNorm
    )
  ) {
    return true;
  }

  var scanRows = Math.min(80, lastRow - headerRow);
  if (scanRows < 1) return true;
  var values = sheet
    .getRange(headerRow + 1, statusCol, scanRows, 1)
    .getDisplayValues();
  var nonEmpty = 0;
  var recognized = 0;
  for (var i = 0; i < values.length; i++) {
    var raw = values[i] && values[i][0] != null ? String(values[i][0]).trim() : '';
    if (!raw) continue;
    nonEmpty++;
    if (typeof classifyShipmentBucket_ === 'function') {
      try {
        var b = classifyShipmentBucket_(raw, false);
        if (b && b !== 'unknown') {
          recognized++;
          continue;
        }
      } catch (e1) {}
    }
    // Strong status cues
    if (
      /confirm|pending|transit|deliver|return|cancel|fail|en attente|livr|retour|annul|مؤكد|انتظار|مرتجع|فشل|ملغي|قيد/.test(
        raw.toLowerCase()
      )
    ) {
      recognized++;
    }
  }

  if (nonEmpty < 8) {
    // Not enough evidence, avoid blocking user workflow.
    return true;
  }
  return recognized / nonEmpty >= 0.25;
}

/**
 * Heuristic to identify if an existing rule is one of our status list rules.
 *
 * @param {GoogleAppsScript.Spreadsheet.DataValidation|null} rule
 * @param {Array<string>} statusLabels
 * @return {boolean}
 */
function lists_isStatusListRule_(rule, statusLabels) {
  if (!rule || !statusLabels || !statusLabels.length) return false;
  var type = null;
  try {
    type = rule.getCriteriaType();
  } catch (e0) {
    return false;
  }
  if (type !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return false;
  }
  var criteriaValues = [];
  try {
    criteriaValues = rule.getCriteriaValues() || [];
  } catch (e1) {
    criteriaValues = [];
  }
  var existing = criteriaValues && criteriaValues[0] ? criteriaValues[0] : [];
  if (!existing || !existing.length) return false;

  var set = {};
  for (var i = 0; i < statusLabels.length; i++) {
    set[String(statusLabels[i]).trim().toLowerCase()] = true;
  }
  var hits = 0;
  var checks = Math.min(existing.length, 40);
  for (var j = 0; j < checks; j++) {
    var k = String(existing[j] == null ? '' : existing[j]).trim().toLowerCase();
    if (!k) continue;
    if (set[k]) hits++;
  }
  return hits >= 3;
}

/**
 * Internal helper used by setup_saveMapping + manual list APIs.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} saved Saved mapping payload
 * @param {boolean} allowInvalid
 * @param {Array<string>} carrierLabels
 * @param {Array<string>} statusLabels
 * @return {{
 *   appliedCarrier: boolean,
 *   appliedStatus: boolean,
 *   carrierColumn: number|null,
 *   statusColumn: number|null,
 *   rowCount: number
 * }}
 */
function lists_applyCarrierAndStatusColumnValidationForSheet_(
  ss,
  sheet,
  saved,
  allowInvalid,
  carrierLabels,
  statusLabels
) {
  if (!ss || !sheet || !saved) {
    return {
      appliedCarrier: false,
      appliedStatus: false,
      carrierColumn: null,
      statusColumn: null,
      rowCount: 0,
    };
  }
  var columns = saved.columns || {};
  var carrierCol =
    columns.carrierColumn != null && isFinite(Number(columns.carrierColumn))
      ? Number(columns.carrierColumn)
      : null;
  var statusCol =
    columns.statusColumn != null && isFinite(Number(columns.statusColumn))
      ? Number(columns.statusColumn)
      : null;
  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  headerRow = Math.floor(headerRow);

  var maxRows = sheet.getMaxRows();
  var rowCount = maxRows - headerRow;
  if (!Number.isFinite(rowCount) || rowCount < 1) {
    return {
      appliedCarrier: false,
      appliedStatus: false,
      carrierColumn: carrierCol,
      statusColumn: statusCol,
      rowCount: 0,
    };
  }

  var appliedCarrier = false;
  var appliedStatus = false;
  if (
    carrierCol != null &&
    carrierCol >= 1 &&
    carrierLabels &&
    carrierLabels.length
  ) {
    var carrierRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(carrierLabels, true)
      // Keep dropdown suggestions but do not block legacy/manual aliases.
      .setAllowInvalid(true)
      .build();
    sheet
      .getRange(headerRow + 1, carrierCol, rowCount, 1)
      .setDataValidation(carrierRule);
    appliedCarrier = true;
  }
  var shouldApplyStatus =
    statusCol != null &&
    statusCol >= 1 &&
    statusLabels &&
    statusLabels.length &&
    lists_shouldApplyStatusValidation_(sheet, headerRow, statusCol);
  if (
    statusCol != null &&
    statusCol >= 1 &&
    statusLabels &&
    statusLabels.length &&
    shouldApplyStatus
  ) {
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusLabels, true)
      // Status is also updated by scripts/sync; keep list but avoid hard failures.
      .setAllowInvalid(true)
      .build();
    sheet.getRange(headerRow + 1, statusCol, rowCount, 1).setDataValidation(statusRule);
    appliedStatus = true;
  } else if (statusCol != null && statusCol >= 1 && statusLabels && statusLabels.length) {
    // If mapping appears wrong, clear stale status rules previously applied by us.
    try {
      var firstDataRule = sheet.getRange(headerRow + 1, statusCol, 1, 1).getDataValidation();
      if (lists_isStatusListRule_(firstDataRule, statusLabels)) {
        sheet.getRange(headerRow + 1, statusCol, rowCount, 1).clearDataValidations();
      }
    } catch (e2) {}
  }
  return {
    appliedCarrier: appliedCarrier,
    appliedStatus: appliedStatus,
    carrierColumn: carrierCol,
    statusColumn: statusCol,
    rowCount: rowCount,
  };
}

/**
 * Applies dropdown validation on mapped carrier + status columns for the active sheet.
 *
 * @param {boolean} [allowInvalid] kept for backwards compatibility
 * @return {{
 *   appliedCarrier: boolean,
 *   appliedStatus: boolean,
 *   carrierColumn: number|null,
 *   statusColumn: number|null,
 *   rowCount: number,
 *   carrierChoices: number,
 *   statusChoices: number
 * }}
 */
function lists_applyCarrierAndStatusColumnValidation(allowInvalid) {
  var allow =
    allowInvalid === undefined || allowInvalid === null ? false : !!allowInvalid;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();
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
  var carrierLabels = lists_getCarrierDropdownLabels_();
  var statusLabels = lists_getStatusDropdownLabels_();
  var res = lists_applyCarrierAndStatusColumnValidationForSheet_(
    ss,
    sheet,
    saved,
    allow,
    carrierLabels,
    statusLabels
  );
  if (!res.appliedCarrier && !res.appliedStatus) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }
  return {
    appliedCarrier: res.appliedCarrier,
    appliedStatus: res.appliedStatus,
    carrierColumn: res.carrierColumn,
    statusColumn: res.statusColumn,
    rowCount: res.rowCount,
    carrierChoices: carrierLabels.length,
    statusChoices: statusLabels.length,
  };
}

/**
 * Re-applies carrier/status dropdown validation to every mapped sheet in the spreadsheet.
 *
 * @param {boolean} [allowInvalid] kept for backwards compatibility
 * @return {{
 *   appliedSheets: number,
 *   appliedCarrierColumns: number,
 *   appliedStatusColumns: number
 * }}
 */
function lists_applyCarrierAndStatusValidationsForMappedSheets_(allowInvalid) {
  var allow =
    allowInvalid === undefined || allowInvalid === null ? false : !!allowInvalid;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheets = ss.getSheets();
  var carrierLabels = lists_getCarrierDropdownLabels_();
  var statusLabels = lists_getStatusDropdownLabels_();
  var appliedSheets = 0;
  var appliedCarrierColumns = 0;
  var appliedStatusColumns = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetId = sheet.getSheetId();
    var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
    if (!mappingJson) {
      continue;
    }
    var saved;
    try {
      saved = setup_loadMapping(sheetId);
    } catch (e) {
      continue;
    }
    var res = lists_applyCarrierAndStatusColumnValidationForSheet_(
      ss,
      sheet,
      saved,
      allow,
      carrierLabels,
      statusLabels
    );
    if (res.appliedCarrier || res.appliedStatus) {
      appliedSheets++;
      if (res.appliedCarrier) appliedCarrierColumns++;
      if (res.appliedStatus) appliedStatusColumns++;
    }
  }
  return {
    appliedSheets: appliedSheets,
    appliedCarrierColumns: appliedCarrierColumns,
    appliedStatusColumns: appliedStatusColumns,
  };
}


