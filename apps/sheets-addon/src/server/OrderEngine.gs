/**
 * @fileoverview Read sheet rows using saved mapping, normalize to InternalOrder, validate.
 * Mirrors shared/types/order.ts (Apps Script has no TS import).
 */

/**
 * Locked InternalOrder mirror (Apps Script JSDoc only — keep in sync with shared/types/order.ts).
 * @typedef {Object} InternalOrderLike
 * @property {string} spreadsheetId
 * @property {number} sheetId
 * @property {string} sheetName
 * @property {number} rowNumber
 * @property {string|null} orderId
 * @property {string} customerFirstName
 * @property {string} customerLastName
 * @property {string} phone
 * @property {string} address
 * @property {string} wilaya
 * @property {number} wilayaCode
 * @property {string} commune
 * @property {string} productName
 * @property {number} quantity
 * @property {string} carrier
 * @property {number} codAmount
 * @property {number} shippingFee
 * @property {'home'|'pickup-point'} deliveryType
 * @property {string|null} stopDeskId
 * @property {boolean} hasExchange
 * @property {boolean} freeShipping
 * @property {string|null} labelUrl
 * @property {string|null} status
 * @property {string|null} trackingNumber
 * @property {string|null} externalShipmentId
 * @property {'clean'|'flagged'|'blocked'} blacklistStatus
 * @property {string|null} notes
 * @property {'pending'|'queued'|'sent'|'failed'|'skipped'|'duplicate'} sendState
 * @property {'fresh'|'stale'|'error'|'never'} syncState
 * @property {string|null} lastError
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Preview selected rows: normalize + validate. Skips row 1 (headers). Empty data rows marked skipped.
 * @return {{
 *   sheetId: number,
 *   sheetName: string,
 *   spreadsheetId: string,
 *   startRow: number,
 *   endRow: number,
 *   rows: Array<{
 *     rowNumber: number,
 *     skipped: boolean,
 *     skipReason: string|null,
 *     valid: boolean,
 *     errors: Array<string>,
 *     warnings: Array<string>,
 *     order: InternalOrderLike|null
 *   }>,
 *   duplicateIndexLastRow: number
 * }}
 */
function order_previewSelection() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();
  var sheetName = sheet.getName();

  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
  if (!mappingJson) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }

  var saved;
  try {
    // Use shared normalization / migration logic (schema v1 → v2), so callers
    // always see the locked mapping shape (defaultCarrier, headerRow, etc.).
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }
  var columns = saved.columns || {};
  var defaultCarrierId =
    saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
      ? String(saved.defaultCarrier).trim()
      : null;

  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var range = sheet.getActiveRange();
  if (!range) {
    throw new Error(i18n_t('error.select_rows'));
  }

  var now = isoNow_();
  var lastSheetRow = Math.max(sheet.getLastRow(), headerRow + 1);

  // Read entire used range once for performance.
  var lastCol = sheet.getLastColumn();
  var values =
    lastSheetRow >= headerRow + 1 && lastCol >= 1
      ? sheet.getRange(headerRow, 1, lastSheetRow - headerRow + 1, lastCol).getDisplayValues()
      : [];

  var dupIndex = buildDuplicateIndex_(sheet, columns, defaultCarrierId, now, lastSheetRow, headerRow, values);

  var startRow = range.getRow();
  var endRow = startRow + range.getNumRows() - 1;

  var rows = [];
  for (var rowNum = startRow; rowNum <= endRow; rowNum++) {
    if (rowNum === headerRow) {
      rows.push({
        rowNumber: rowNum,
        skipped: true,
        skipReason: 'header',
        valid: false,
        errors: [],
        warnings: [],
        order: null,
      });
      continue;
    }

    var order = buildOrderFromRow_(
      sheet,
      rowNum,
      columns,
      spreadsheetId,
      sheetId,
      sheetName,
      defaultCarrierId,
      now,
      headerRow,
      values
    );

    if (isRowEmpty_(order)) {
      rows.push({
        rowNumber: rowNum,
        skipped: true,
        skipReason: 'empty',
        valid: false,
        errors: [],
        warnings: [],
        order: null,
      });
      continue;
    }

    var errors = validateOrder_(sheet, rowNum, order, columns);
    appendDuplicateErrors_(rowNum, order, dupIndex, errors);
    var warnings = blacklistWarningsForOrder_(order);
    rows.push({
      rowNumber: rowNum,
      skipped: false,
      skipReason: null,
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      order: order,
    });
  }

  return {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId,
    sheetName: sheetName,
    startRow: startRow,
    endRow: endRow,
    rows: rows,
    duplicateIndexLastRow: lastSheetRow,
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {Object} columns
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @param {string} sheetName
 * @param {string|null} defaultCarrierId
 * @param {string} nowIso
 * @param {number} headerRow
 * @param {Array<Array<string>>} values
 * @return {InternalOrderLike}
 */
function buildOrderFromRow_(
  sheet,
  rowNum,
  columns,
  spreadsheetId,
  sheetId,
  sheetName,
  defaultCarrierId,
  nowIso,
  headerRow,
  values
) {
  var rowIndex = rowNum - headerRow;
  if (!values || rowIndex < 0 || rowIndex >= values.length) {
    values = [];
  }

  function fromValues(colIndex) {
    if (!values || colIndex == null || colIndex === '' || isNaN(Number(colIndex))) {
      return null;
    }
    var c = Number(colIndex);
    if (c < 1) return null;
    var row = values[rowIndex];
    if (!row || c - 1 >= row.length) {
      return null;
    }
    var raw = row[c - 1];
    if (raw === '' || raw === null) {
      return null;
    }
    return String(raw).trim();
  }

  var carrierFromColumn = fromValues(columns.carrierColumn);
  var carrier = carrierFromColumn != null && carrierFromColumn !== '' ? carrierFromColumn : defaultCarrierId;

  // Keep nullable numeric fields for accurate emptiness detection.
  var qtyRaw = fromValues(columns.quantityColumn);
  var codRaw = fromValues(columns.codColumn);
  var feeRaw = fromValues(columns.shippingFeeColumn);

  var qty = parseNumber_(qtyRaw);
  var cod = parseNumber_(codRaw);
  var fee = parseNumber_(feeRaw);

  // Names: prefer explicit first/last; else split full name when available.
  var firstName = fromValues(columns.customerFirstNameColumn);
  var lastName = fromValues(columns.customerLastNameColumn);
  if ((!firstName || !lastName) && columns.customerFullNameColumn != null) {
    var full = fromValues(columns.customerFullNameColumn);
    if (full) {
      var parts = String(full).trim().split(/\s+/);
      if (!firstName && parts.length) {
        firstName = parts[0];
      }
      if (!lastName && parts.length > 1) {
        lastName = parts.slice(1).join(' ');
      }
    }
  }
  if (!firstName) firstName = '';
  if (!lastName) lastName = '';

  var phone = fromValues(columns.phoneColumn) || '';
  var address = fromValues(columns.addressColumn) || '';
  var wilaya = fromValues(columns.wilayaColumn) || '';
  var commune = fromValues(columns.communeColumn) || '';
  var productName = fromValues(columns.productColumn) || '';

  var wilayaCode = null;
  var wilayaCodeRaw = fromValues(columns.wilayaCodeColumn);
  if (wilayaCodeRaw != null && wilayaCodeRaw !== '') {
    var wNum = parseInt(String(wilayaCodeRaw).replace(/\D/g, ''), 10);
    if (!isNaN(wNum) && wNum >= 1 && wNum <= 58) {
      wilayaCode = wNum;
    }
  }
  if (wilayaCode == null) {
    // Fallback: attempt to extract numeric prefix like "16 — Alger".
    var m = wilaya.match(/^(\d{1,2})\b/);
    if (m) {
      var w = parseInt(m[1], 10);
      if (!isNaN(w) && w >= 1 && w <= 58) {
        wilayaCode = w;
      }
    }
  }
  if (wilayaCode == null) {
    wilayaCode = 0;
  }

  var deliveryType = 'home';
  var deliveryRaw = fromValues(columns.deliveryTypeColumn);
  if (deliveryRaw) {
    var d = String(deliveryRaw).trim().toLowerCase();
    if (
      d === 'stopdesk' ||
      d === 'pickup-point' ||
      d === 'pickup point' ||
      d === 'pickuppoint' ||
      d === 'point' ||
      d === 'pickup' ||
      d === 'relay' ||
      d === 'bureau' ||
      d === 'point relais'
    ) {
      deliveryType = 'pickup-point';
    } else if (d === 'home' || d === 'domicile' || d === 'livraison' || d === 'منزل') {
      deliveryType = 'home';
    }
  }

  var stopDeskId = null;
  var stopDeskRaw = fromValues(columns.stopDeskIdColumn);
  if (stopDeskRaw != null && String(stopDeskRaw).trim() !== '') {
    stopDeskId = String(stopDeskRaw).trim();
  }

  var blRaw = fromValues(columns.blacklistColumn);
  var blParsed = parseBoolean_(blRaw);
  var blacklistStatus = 'clean';
  if (blParsed === true) {
    blacklistStatus = 'flagged';
  }

  // Optional: store human-readable blacklist reason when a dedicated column
  // is mapped. This is surfaced to operators as part of warnings.
  var blacklistReason = null;
  if (columns.blacklistReasonColumn != null) {
    var blReasonRaw = fromValues(columns.blacklistReasonColumn);
    if (blReasonRaw != null && blReasonRaw !== '') {
      blacklistReason = String(blReasonRaw);
    }
  }

  var freeShipping = false;
  if (fee != null && fee === 0) {
    freeShipping = true;
  }

  var status = fromValues(columns.statusColumn);
  var trackingNumber = fromValues(columns.trackingColumn);
  var labelUrl = fromValues(columns.labelUrlColumn);
  var externalShipmentId =
    columns.externalShipmentIdColumn != null
      ? (String(fromValues(columns.externalShipmentIdColumn) || '').trim() || null)
      : null;

  return {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId,
    sheetName: sheetName,
    rowNumber: rowNum,
    orderId: fromValues(columns.orderIdColumn),
    customerFirstName: firstName,
    customerLastName: lastName,
    phone: phone,
    address: address,
    wilaya: wilaya,
    wilayaCode: wilayaCode,
    commune: commune,
    productName: productName,
    quantity: qty != null ? qty : null,
    carrier: carrier != null ? String(carrier) : '',
    codAmount: cod != null ? cod : null,
    shippingFee: fee != null ? fee : null,
    deliveryType: deliveryType,
    stopDeskId: stopDeskId,
    hasExchange: false,
    freeShipping: freeShipping,
    labelUrl: labelUrl != null ? String(labelUrl) : null,
    status: status != null ? String(status) : null,
    trackingNumber: trackingNumber != null ? String(trackingNumber) : null,
    externalShipmentId: externalShipmentId,
    blacklistStatus: /** @type {'clean'|'flagged'|'blocked'} */ (blacklistStatus),
    // When present, append blacklist reason to notes so that warning context is visible.
    notes:
      blacklistReason != null && blacklistReason !== ''
        ? (fromValues(columns.notesColumn) || '') +
          (fromValues(columns.notesColumn) ? ' — ' : '') +
          String(blacklistReason)
        : fromValues(columns.notesColumn),
    sendState: 'pending',
    syncState: 'never',
    lastError: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * @param {InternalOrderLike} order
 * @return {boolean}
 */
function isRowEmpty_(order) {
  if (
    order.orderId ||
    order.phone ||
    order.address ||
    order.wilaya ||
    order.commune ||
    order.productName ||
    order.customerFirstName ||
    order.customerLastName
  ) {
    return false;
  }
  if (order.blacklistStatus === 'flagged' || order.blacklistStatus === 'blocked') {
    return false;
  }
  if (order.quantity != null || order.codAmount != null || order.shippingFee != null) {
    return false;
  }
  if (order.trackingNumber || order.status || order.notes) {
    return false;
  }
  return true;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {InternalOrderLike} order
 * @param {Object} columns
 * @return {Array<string>}
 */
function validateOrder_(sheet, rowNum, order, columns) {
  var errors = [];

  if (isBlank_(order.phone)) {
    errors.push(i18n_t('val.phone_required'));
  } else if (!isPlausiblePhone_(order.phone)) {
    errors.push(i18n_t('val.phone_invalid'));
  }

  if (isBlank_(order.address)) {
    errors.push(i18n_t('val.address_required'));
  }

  if (isBlank_(order.wilaya)) {
    errors.push(i18n_t('val.wilaya_required'));
  } else {
    if (order.wilayaCode == null || order.wilayaCode < 1 || order.wilayaCode > 58) {
      // Guide users to either add a wilaya code column or include a numeric prefix like "16 — Alger".
      errors.push(i18n_t('val.wilaya_invalid'));
    }
  }

  if (isBlank_(order.carrier)) {
    errors.push(i18n_t('val.carrier_required'));
  }

  if (columns.codColumn != null) {
    var rawCod = getColumnValue_(sheet, rowNum, columns.codColumn);
    if (!isBlank_(rawCod) && order.codAmount == null) {
      errors.push(i18n_t('val.cod_invalid'));
    }
  }

  if (order.deliveryType === 'pickup-point' && (!order.stopDeskId || order.stopDeskId.trim() === '')) {
    errors.push(i18n_t('val.stopdesk_required'));
  }

  if (order.externalShipmentId) {
    errors.push(i18n_t('send.already_sent'));
  }

  // Names: resolve from first/last/full name columns and validate
  var firstName = '';
  var lastName = '';
  if (columns.customerFirstNameColumn != null && columns.customerLastNameColumn != null) {
    firstName = String(
      getColumnValue_(sheet, rowNum, columns.customerFirstNameColumn) || '',
    ).trim();
    lastName = String(getColumnValue_(sheet, rowNum, columns.customerLastNameColumn) || '').trim();
  } else if (columns.customerFullNameColumn != null) {
    var fullName = String(
      getColumnValue_(sheet, rowNum, columns.customerFullNameColumn) || '',
    ).trim();
    var spaceIdx = fullName.indexOf(' ');
    if (spaceIdx > -1) {
      firstName = fullName.substring(0, spaceIdx);
      lastName = fullName.substring(spaceIdx + 1);
    } else {
      firstName = fullName;
      lastName = '';
    }
  } else if (columns.customerFirstNameColumn != null) {
    firstName = String(
      getColumnValue_(sheet, rowNum, columns.customerFirstNameColumn) || '',
    ).trim();
  } else if (columns.customerLastNameColumn != null) {
    lastName = String(getColumnValue_(sheet, rowNum, columns.customerLastNameColumn) || '').trim();
  }
  if (!firstName && !lastName) {
    errors.push(i18n_t('val.name_required'));
  }
  order.customerFirstName = firstName;
  order.customerLastName = lastName;

  return errors;
}

/**
 * Liste noire : avertissement seulement (spec : prévenir avant envoi, ne pas bloquer).
 * @param {InternalOrderLike} order
 * @return {Array<string>}
 */
function blacklistWarningsForOrder_(order) {
  if (order.blacklistStatus !== 'flagged' && order.blacklistStatus !== 'blocked') {
    return [];
  }
  return [i18n_t('blacklist.warning')];
}

/**
 * Index used rows (headerRow+1…lastRow) for duplicate detection — full sheet scan once per preview.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} columns
 * @param {string|null} defaultCarrierId
 * @param {string} nowIso
 * @param {number} lastRow
 * @param {number} headerRow
 * @param {Array<Array<string>>} values
 * @return {{ orderId: Object, phoneProduct: Object, tracking: Object }}
 */
function buildDuplicateIndex_(sheet, columns, defaultCarrierId, nowIso, lastRow, headerRow, values) {
  var idx = {
    orderId: {},
    phoneProduct: {},
    tracking: {},
  };
  var spreadsheetId = sheet.getParent().getId();
  var sheetId = sheet.getSheetId();
  var sheetName = sheet.getName();

  for (var r = headerRow + 1; r <= lastRow; r++) {
    var order = buildOrderFromRow_(
      sheet,
      r,
      columns,
      spreadsheetId,
      sheetId,
      sheetName,
      defaultCarrierId,
      nowIso,
      headerRow,
      values
    );
    if (isRowEmpty_(order)) {
      continue;
    }

    var oid = normalizeOrderIdKey_(order.orderId);
    if (oid) {
      duplicateIndexAdd_(idx.orderId, oid, r);
    }
    var pp = phoneProductKey_(order.phone, order.productName);
    if (pp) {
      duplicateIndexAdd_(idx.phoneProduct, pp, r);
    }
    var tr = normalizeTrackingKey_(order.trackingNumber);
    if (tr) {
      duplicateIndexAdd_(idx.tracking, tr, r);
    }
  }
  return idx;
}

/**
 * @param {Object} map key -> Array<number>
 * @param {string} key
 * @param {number} row
 */
function duplicateIndexAdd_(map, key, row) {
  if (!map[key]) {
    map[key] = [];
  }
  map[key].push(row);
}

/**
 * @param {string|null} s
 * @return {string}
 */
function normalizeOrderIdKey_(s) {
  if (s == null || String(s).trim() === '') {
    return '';
  }
  return String(s).trim().toLowerCase();
}

/**
 * @param {string|null} s
 * @return {string}
 */
function normalizePhoneDigits_(s) {
  if (s == null || s === '') {
    return '';
  }
  return String(s).replace(/\D/g, '');
}

/**
 * @param {string|null} phone
 * @param {string|null} product
 * @return {string}
 */
function phoneProductKey_(phone, product) {
  var d = normalizePhoneDigits_(phone);
  if (d.length < 8) {
    return '';
  }
  if (product == null || String(product).trim() === '') {
    return '';
  }
  var p = String(product).trim().toLowerCase();
  return d + '|' + p;
}

/**
 * @param {string|null} s
 * @return {string}
 */
function normalizeTrackingKey_(s) {
  if (s == null || String(s).trim() === '') {
    return '';
  }
  return String(s).trim().toLowerCase();
}

/**
 * @param {Array<number>} rows
 * @param {number} rowNum
 * @return {number|null}
 */
function firstDuplicateOtherRow_(rows, rowNum) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] !== rowNum) {
      return rows[i];
    }
  }
  return null;
}

/**
 * @param {number} rowNum
 * @param {InternalOrderLike} order
 * @param {{ orderId: Object, phoneProduct: Object, tracking: Object }} index
 * @param {Array<string>} errors mutated
 */
function appendDuplicateErrors_(rowNum, order, index, errors) {
  var tr = normalizeTrackingKey_(order.trackingNumber);
  if (tr) {
    var tlist = index.tracking[tr];
    if (tlist && tlist.length > 1) {
      var dupTrackRow = firstDuplicateOtherRow_(tlist, rowNum);
      if (dupTrackRow != null) {
        errors.push(i18n_format('error.dup_tracking_row', dupTrackRow));
      }
    }
  }

  var oid = normalizeOrderIdKey_(order.orderId);
  if (oid && index.orderId[oid] && index.orderId[oid].length > 1) {
    var oRow = firstDuplicateOtherRow_(index.orderId[oid], rowNum);
    if (oRow != null) {
      errors.push(i18n_format('error.dup_order_id_row', oRow));
    }
  }

  var pp = phoneProductKey_(order.phone, order.productName);
  if (pp && index.phoneProduct[pp] && index.phoneProduct[pp].length > 1) {
    var pRow = firstDuplicateOtherRow_(index.phoneProduct[pp], rowNum);
    if (pRow != null) {
      errors.push(i18n_format('error.dup_phone_product_row', pRow));
    }
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {number|string|undefined|null} colIndex
 * @return {string|null}
 */
function getColumnValue_(sheet, rowNum, colIndex) {
  if (colIndex === undefined || colIndex === null || colIndex === '') {
    return null;
  }
  var c = Number(colIndex);
  if (isNaN(c) || c < 1) {
    return null;
  }
  var raw = sheet.getRange(rowNum, c).getDisplayValue();
  if (raw === '' || raw === null) {
    return null;
  }
  return String(raw).trim();
}

/**
 * @param {string|null} s
 * @return {boolean}
 */
function isBlank_(s) {
  return s == null || String(s).trim() === '';
}

/**
 * @param {string|null} phone
 * @return {boolean}
 */
function isPlausiblePhone_(phone) {
  if (!phone) {
    return false;
  }
  var digits = String(phone).replace(/\D/g, '');
  if (/^0[567]\d{8}$/.test(digits)) {
    return true;
  }
  if (/^213[567]\d{8}$/.test(digits)) {
    return true;
  }
  if (/^[567]\d{8}$/.test(digits)) {
    return true;
  }
  return false;
}

/**
 * @param {string|null} s
 * @return {number|null}
 */
function parseNumber_(s) {
  if (s == null || s === '') {
    return null;
  }
  var t = String(s).replace(/\s/g, '').replace(',', '.');
  var n = parseFloat(t);
  if (isNaN(n)) {
    return null;
  }
  return n;
}

/**
 * @param {string|null} s
 * @return {boolean|null}
 */
function parseBoolean_(s) {
  if (s == null || s === '') {
    return null;
  }
  var raw = String(s).trim();
  var t = raw.toLowerCase();
  if (t === 'true' || t === '1' || t === 'oui' || t === 'yes' || t === 'x') {
    return true;
  }
  if (t === 'false' || t === '0' || t === 'non' || t === 'no') {
    return false;
  }
  if (
    t === 'liste noire' ||
    t === 'blacklist' ||
    t === 'bloque' ||
    t === 'bloqué' ||
    t === 'blocked' ||
    t === 'ln'
  ) {
    return true;
  }
  if (/[\u0600-\u06FF]/.test(raw)) {
    if (/نعم|^حظر$|قائمة سوداء|لائحة سوداء|بالحظر/.test(raw)) {
      return true;
    }
  }
  return null;
}

/**
 * @return {string}
 */
function isoNow_() {
  return new Date().toISOString();
}

/**
 * Adapter ids registered in packages/carriers — keep in sync with setup_getContext carriers list.
 * @type {Array<string>}
 */
var KNOWN_CARRIER_ADAPTER_IDS_ = ['yalidine', 'zr'];

/**
 * Resolves which carrier adapter to call: explicit slug in sheet cell wins, else default from setup.
 * @param {string|null} rawFromCell
 * @param {string|null} defaultCarrierId
 * @return {string|null}
 */
function resolveCarrierAdapterId_(rawFromCell, defaultCarrierId) {
  if (rawFromCell != null && String(rawFromCell).trim() !== '') {
    var s = String(rawFromCell).trim().toLowerCase();
    for (var i = 0; i < KNOWN_CARRIER_ADAPTER_IDS_.length; i++) {
      if (s === KNOWN_CARRIER_ADAPTER_IDS_[i]) {
        return KNOWN_CARRIER_ADAPTER_IDS_[i];
      }
    }
  }
  if (defaultCarrierId != null && String(defaultCarrierId).trim() !== '') {
    return String(defaultCarrierId).trim().toLowerCase();
  }
  return null;
}
