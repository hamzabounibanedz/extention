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


