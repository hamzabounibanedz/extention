/**

 * @fileoverview Visual highlight for rows marked as blacklist in the mapped column.

 */



/**
 *
 * Sets full-row background for data rows: pink if liste noire, white otherwise.
 *
 * Réinitialise le fond de toutes les cellules des lignes 2…dernière ligne sur la plage utilisée.
 *
 * @return {{ rowsStyled: number, lastRow: number, lastCol: number }}
 *
 */

function blacklist_applyRowHighlights() {
  license_assertOperationsAllowed_();

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

  if (columns.blacklistColumn == null) {

    throw new Error(i18n_t('error.blacklist_column_required'));

  }



  var blCol = Number(columns.blacklistColumn);

  if (isNaN(blCol) || blCol < 1) {

    throw new Error(i18n_t('error.blacklist_column_invalid'));

  }



  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  var lastRow = Math.max(sheet.getLastRow(), headerRow + 1);

  var lastCol = sheet.getLastColumn();

  var maxMap = 0;

  var keys = Object.keys(columns);

  for (var i = 0; i < keys.length; i++) {

    var v = columns[keys[i]];

    if (v != null && !isNaN(Number(v)) && Number(v) > maxMap) {

      maxMap = Number(v);

    }

  }

  lastCol = Math.max(lastCol, maxMap, blCol);



  var n = lastRow - headerRow;

  if (n < 1) {

    return { rowsStyled: 0, lastRow: lastRow, lastCol: lastCol };

  }



  var colors = [];

  var pink = '#FCE8E6';

  var white = '#FFFFFF';

  for (var r = headerRow + 1; r <= lastRow; r++) {

    var raw = getColumnValue_(sheet, r, blCol);

    var bl = parseBoolean_(raw);

    var bg = bl === true ? pink : white;

    var rowColors = [];

    for (var c = 1; c <= lastCol; c++) {

      rowColors.push(bg);

    }

    colors.push(rowColors);

  }



  sheet.getRange(headerRow + 1, 1, n, lastCol).setBackgrounds(colors);

  SpreadsheetApp.flush();



  return {

    rowsStyled: n,

    lastRow: lastRow,

    lastCol: lastCol,

  };

}


