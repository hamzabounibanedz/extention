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

var ORDER_DELIVERY_PICKUP_TERMS_ = {
  stopdesk: true,
  'stop desk': true,
  pickup: true,
  'pick up': true,
  'pickup point': true,
  pickuppoint: true,
  'pickup-point': true,
  'point relais': true,
  relay: true,
  relais: true,
  bureau: true,
  'au bureau': true,
  'livraison bureau': true,
  'livraison au bureau': true,
  'livraison stopdesk': true,
  'livraison stop desk': true,
  'livrasion bureau': true,
  'lavraison bureau': true,
  desk: true,
  office: true,
  agence: true,
  agency: true,
  'point de retrait': true,
  'point retrait': true,
  'نقطة استلام': true,
  'نقطة الاستلام': true,
  مكتب: true,
  'مكتب استلام': true,
  'مكتب التوصيل': true,
  // Common sheet phrasing (office / stop-desk) — same column as delivery type
  'التوصيل للمكتب': true,
  'توصيل للمكتب': true,
  'الى المكتب': true,
  'إلى المكتب': true,
  'استلام من المكتب': true,
};

var ORDER_DELIVERY_HOME_TERMS_ = {
  home: true,
  'at home': true,
  domicile: true,
  'a domicile': true,
  maison: true,
  house: true,
  residence: true,
  'livraison domicile': true,
  'livraison a domicile': true,
  'livrasion domicile': true,
  'livrasion a domicile': true,
  'lavraison domicile': true,
  'lavraison a domicile': true,
  منزل: true,
  'الى المنزل': true,
  'إلى المنزل': true,
  البيت: true,
  بيت: true,
  'توصيل منزلي': true,
  'توصيل للمنزل': true,
  'التوصيل للمنزل': true,
};

var ORDER_DELIVERY_PICKUP_HINT_RE_ =
  /(^|\b)(pickup|pick up|stop ?desk|desk|office|bureau|relay|relais|agence|agency|point relais|point de retrait|point retrait)(\b|$)|نقطة\s*الاستلام|نقطة\s*استلام|مكتب/;
var ORDER_DELIVERY_HOME_HINT_RE_ =
  /(^|\b)(home|domicile|maison|house|residence)(\b|$)|منزل|البيت|بيت|منزلي/;
var ORDER_WILAYA_LABEL_BY_CODE_CACHE_ = null;

/**
 * Normalize loose location text for equality checks.
 * @param {*} raw
 * @return {string}
 */
function order_normalizeLocationText_(raw) {
  if (raw == null) {
    return '';
  }
  var s = String(raw).trim().toLowerCase();
  if (!s) {
    return '';
  }
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {}
  return s
    .replace(/[_./|,\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Treat placeholder junk as missing location text so fallback inference can win.
 * @param {*} raw
 * @return {boolean}
 */
function order_isPlaceholderLocationText_(raw) {
  var n = order_normalizeLocationText_(raw);
  return (
    !n ||
    /^0+$/.test(n) ||
    n === 'null' ||
    n === 'undefined' ||
    n === 'none' ||
    n === 'aucun' ||
    n === 'n a' ||
    n === 'na' ||
    n === '-'
  );
}

/**
 * Best human-readable wilaya label by code (cached).
 * @param {number|string} code
 * @return {string}
 */
function order_getWilayaLabelByCode_(code) {
  var n = Number(code);
  if (!isFinite(n) || n < 1 || n > 58) {
    return '';
  }
  n = Math.floor(n);
  if (!ORDER_WILAYA_LABEL_BY_CODE_CACHE_) {
    ORDER_WILAYA_LABEL_BY_CODE_CACHE_ = {};
    try {
      if (typeof wilaya_getAll_ === 'function') {
        var rows = wilaya_getAll_() || [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i] || {};
          var codeNum = Number(row.code);
          if (!isFinite(codeNum) || codeNum < 1 || codeNum > 58) {
            continue;
          }
          var labelFr = row.fr != null ? String(row.fr).trim() : '';
          var labelAr = row.ar != null ? String(row.ar).trim() : '';
          var label = labelFr || labelAr;
          if (label) {
            ORDER_WILAYA_LABEL_BY_CODE_CACHE_[Math.floor(codeNum)] = label;
          }
        }
      }
    } catch (eRows) {
      ORDER_WILAYA_LABEL_BY_CODE_CACHE_ = {};
    }
  }
  return ORDER_WILAYA_LABEL_BY_CODE_CACHE_[n] || '';
}

/**
 * Parse an optional manual row selector like "4,8,10-12".
 * @param {string|null|undefined} spec
 * @return {Array<number>|null}
 */
function parseRowSelectionSpec_(spec) {
  if (spec == null) {
    return null;
  }
  var raw = String(spec).trim();
  if (!raw) {
    return null;
  }

  var seen = {};
  var tokens = raw
    .replace(/[;\n\r]+/g, ',')
    .replace(/\u060C/g, ',')
    .split(',');

  for (var i = 0; i < tokens.length; i++) {
    var part = String(tokens[i] || '').trim();
    if (!part) {
      continue;
    }

    var m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (m) {
      var start = Number(m[1]);
      var end = Number(m[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) {
        throw new Error(i18n_t('error.row_selection_invalid'));
      }
      if (start > end) {
        var tmp = start;
        start = end;
        end = tmp;
      }
      for (var row = start; row <= end; row++) {
        seen[row] = true;
      }
      continue;
    }

    if (/^\d+$/.test(part)) {
      var single = Number(part);
      if (!Number.isFinite(single) || single < 1) {
        throw new Error(i18n_t('error.row_selection_invalid'));
      }
      seen[single] = true;
      continue;
    }

    throw new Error(i18n_t('error.row_selection_invalid'));
  }

  var out = Object.keys(seen)
    .map(function (k) {
      return Number(k);
    })
    .sort(function (a, b) {
      return a - b;
    });
  if (!out.length) {
    throw new Error(i18n_t('error.row_selection_invalid'));
  }
  return out;
}

/**
 * Read selection row numbers from live spreadsheet APIs.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @return {Array<number>}
 */
function readLiveSelectionRows_(sheet) {
  var seen = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet =
      ss && typeof ss.getActiveSheet === 'function' ? ss.getActiveSheet() : null;
    if (
      sheet &&
      activeSheet &&
      typeof sheet.getSheetId === 'function' &&
      typeof activeSheet.getSheetId === 'function' &&
      sheet.getSheetId() !== activeSheet.getSheetId()
    ) {
      return [];
    }
  } catch (eSheetGuard) {}

  function addRanges_(ranges) {
    if (!ranges || !ranges.length) {
      return;
    }
    for (var i = 0; i < ranges.length; i++) {
      var rng = ranges[i];
      if (!rng) {
        continue;
      }
      var sr = rng.getRow();
      var nr = rng.getNumRows();
      for (var row = sr; row < sr + nr; row++) {
        seen[row] = true;
      }
    }
  }

  try {
    var selection = SpreadsheetApp.getSelection();
    if (selection && selection.getActiveRangeList) {
      var list = selection.getActiveRangeList();
      if (list) {
        addRanges_(list.getRanges());
      }
    }
  } catch (e) {}

  if (!Object.keys(seen).length) {
    try {
      var list2 = SpreadsheetApp.getActiveRangeList();
      if (list2) {
        addRanges_(list2.getRanges());
      }
    } catch (e2) {}
  }

  if (!Object.keys(seen).length) {
    try {
      var r = sheet.getActiveRange();
      if (r) {
        addRanges_([r]);
      }
    } catch (e3) {}
  }

  return Object.keys(seen)
    .map(function (k) {
      return Number(k);
    })
    .sort(function (a, b) {
      return a - b;
    });
}

/**
 * Returns row numbers from manual override or the live sheet selection.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string|null|undefined} rowSelectionSpec
 * @return {Array<number>} sorted unique 1-based row numbers
 */
function sheet_getSelectedRowNumbers_(sheet, rowSelectionSpec) {
  var manualRows = parseRowSelectionSpec_(rowSelectionSpec);
  if (manualRows && manualRows.length) {
    return manualRows;
  }
  return readLiveSelectionRows_(sheet);
}

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
 *   duplicateIndexLastRow: number,
 *   selectedRowNumbers: Array<number>
 * }}
 */
function order_previewSelection(rowSelectionSpec, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof ownership_assertCurrentSpreadsheetOwnedByActiveUser_ === 'function') {
    ownership_assertCurrentSpreadsheetOwnedByActiveUser_();
  }
  var requestedSheetId =
    opts.sheetId != null && String(opts.sheetId).trim() !== ''
      ? Number(opts.sheetId)
      : NaN;
  var sheet =
    Number.isFinite(requestedSheetId) &&
    requestedSheetId >= 1 &&
    typeof getSheetById_ === 'function'
      ? getSheetById_(ss, requestedSheetId)
      : null;
  if (!sheet) {
    sheet = ss.getActiveSheet();
  }
  if (!sheet) {
    throw new Error(i18n_t('error.sheet_not_found'));
  }
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
  var carrierOverrideId = null;
  if (opts.carrierMode === 'override') {
    carrierOverrideId =
      typeof resolveCarrierAdapterId_ === 'function'
        ? resolveCarrierAdapterId_(opts.carrierOverride || null, null)
        : opts.carrierOverride != null && String(opts.carrierOverride).trim() !== ''
          ? String(opts.carrierOverride).trim().toLowerCase()
          : null;
    if (!carrierOverrideId) {
      throw new Error(i18n_t('error.choose_carrier'));
    }
  }

  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var selectedRowNumbers = sheet_getSelectedRowNumbers_(sheet, rowSelectionSpec);
  if (!selectedRowNumbers.length) {
    throw new Error(i18n_t('error.select_rows'));
  }
  var businessSettings =
    typeof businessSettings_get === 'function'
      ? businessSettings_get().value || businessSettings_getDefaults_()
      : null;
  if (
    businessSettings &&
    typeof businessSettings_normalizeHubFields_ === 'function'
  ) {
    businessSettings_normalizeHubFields_(businessSettings);
  }

  var now = isoNow_();
  var lastSheetRow = Math.max(sheet.getLastRow(), headerRow + 1);
  var startRow = selectedRowNumbers[0];
  var endRow = selectedRowNumbers[selectedRowNumbers.length - 1];
  var skipDuplicateScan = !!opts.skipDuplicateScan;

  var lastCol = sheet.getLastColumn();
  var valuesStartRow = headerRow;
  var values = [];
  if (lastCol >= 1) {
    if (skipDuplicateScan) {
      valuesStartRow = startRow;
      values =
        endRow >= startRow
          ? sheet.getRange(startRow, 1, endRow - startRow + 1, lastCol).getDisplayValues()
          : [];
    } else {
      // Preview button keeps the full-sheet duplicate scan; send path can opt out for speed.
      values =
        lastSheetRow >= headerRow + 1
          ? sheet.getRange(headerRow, 1, lastSheetRow - headerRow + 1, lastCol).getDisplayValues()
          : [];
    }
  }

  var dupIndex = skipDuplicateScan
    ? { orderId: {}, phoneProduct: {}, tracking: {} }
    : buildDuplicateIndex_(sheet, columns, defaultCarrierId, now, lastSheetRow, headerRow, values);

  var rows = [];
  for (var si = 0; si < selectedRowNumbers.length; si++) {
    var rowNum = selectedRowNumbers[si];
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
      values,
      valuesStartRow
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

    if (carrierOverrideId) {
      order.carrier = carrierOverrideId;
    }
    order_applyDefaultStopDeskForPickup_(order, businessSettings);
    var warnings = blacklistWarningsForOrder_(order);
    var errors = validateOrder_(sheet, rowNum, order, columns, businessSettings);
    appendDuplicateErrors_(rowNum, order, dupIndex, errors, warnings);
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
    selectedRowNumbers: selectedRowNumbers.slice(),
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
 * @param {number=} valuesStartRow
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
  values,
  valuesStartRow
) {
  var anchorRow =
    valuesStartRow != null && isFinite(Number(valuesStartRow))
      ? Number(valuesStartRow)
      : headerRow;
  var rowIndex = rowNum - anchorRow;
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
  var carrierIdLc =
    typeof resolveCarrierAdapterId_ === 'function'
      ? resolveCarrierAdapterId_(carrier || null, defaultCarrierId || null)
      : carrier != null && String(carrier).trim() !== ''
        ? String(carrier).trim().toLowerCase()
        : defaultCarrierId != null
          ? String(defaultCarrierId).trim().toLowerCase()
          : '';

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

  if (order_isPlaceholderLocationText_(wilaya)) {
    wilaya = '';
  }
  if (order_isPlaceholderLocationText_(commune)) {
    commune = '';
  }
  if (
    isBlank_(address) &&
    commune &&
    (carrierIdLc === 'yalidine' || carrierIdLc === 'noest')
  ) {
    address = commune;
  }

  var wilayaCode = null;
  var resolvedWilayaFromText = null;
  var wilayaCodeRaw = fromValues(columns.wilayaCodeColumn);
  if (wilayaCodeRaw != null && wilayaCodeRaw !== '') {
    var wNum = parseInt(String(wilayaCodeRaw).replace(/\D/g, ''), 10);
    if (!isNaN(wNum) && wNum >= 1 && wNum <= 58) {
      wilayaCode = wNum;
    }
  }
  if (wilayaCode == null) {
    // Fallback: numeric prefix like "16 — Alger", then French/Arabic wilaya names.
    var m = wilaya.match(/^(\d{1,2})\b/);
    if (m) {
      var w = parseInt(m[1], 10);
      if (!isNaN(w) && w >= 1 && w <= 58) {
        wilayaCode = w;
      }
    }
  }
  if (wilayaCode == null) {
    resolvedWilayaFromText = wilaya_resolveCodeFromText_(wilaya);
    wilayaCode = resolvedWilayaFromText;
  }
  if (wilayaCode == null && commune) {
    wilayaCode = wilaya_resolveCodeFromText_(commune);
  }
  if (wilayaCode == null) {
    wilayaCode = 0;
  }
  // Smart fallback: when wilaya text is missing or clearly mis-mapped to the same
  // value as commune, auto-fill a valid wilaya label from inferred code.
  var canonicalWilaya =
    wilayaCode != null && Number(wilayaCode) >= 1 && Number(wilayaCode) <= 58
      ? order_getWilayaLabelByCode_(wilayaCode)
      : '';
  if (canonicalWilaya) {
    var wilayaNorm = order_normalizeLocationText_(wilaya);
    var communeNorm = order_normalizeLocationText_(commune);
    if (
      order_isPlaceholderLocationText_(wilaya) ||
      !wilayaNorm ||
      (communeNorm && wilayaNorm === communeNorm) ||
      resolvedWilayaFromText == null ||
      (Number.isFinite(resolvedWilayaFromText) &&
        resolvedWilayaFromText >= 1 &&
        resolvedWilayaFromText <= 58 &&
        resolvedWilayaFromText !== wilayaCode)
    ) {
      wilaya = canonicalWilaya;
    }
  }

  var stopDeskCol =
    columns.stopDeskIdColumn != null ? Number(columns.stopDeskIdColumn) : NaN;
  var deliveryCol =
    columns.deliveryTypeColumn != null ? Number(columns.deliveryTypeColumn) : NaN;
  var stopDeskSameAsDeliveryCol =
    Number.isFinite(stopDeskCol) &&
    stopDeskCol >= 1 &&
    Number.isFinite(deliveryCol) &&
    deliveryCol >= 1 &&
    stopDeskCol === deliveryCol;

  var stopDeskRaw = fromValues(columns.stopDeskIdColumn);
  var stopDeskId = null;
  if (stopDeskRaw != null && String(stopDeskRaw).trim() !== '') {
    var stopDeskTrim = String(stopDeskRaw).trim();
    if (stopDeskSameAsDeliveryCol) {
      // Same cell as delivery type (e.g. W = «التوصيل للمكتب»): it encodes mode, not station_code.
      if (
        typeof send_looksLikeDeliveryModeValue_ === 'function' &&
        send_looksLikeDeliveryModeValue_(stopDeskTrim)
      ) {
        stopDeskId = null;
      } else {
        stopDeskId = stopDeskTrim;
      }
    } else {
      stopDeskId = stopDeskTrim;
    }
  }
  var deliveryRaw = fromValues(columns.deliveryTypeColumn);
  if (sheet && headerRow && order_shouldUseAlternateDeliveryColumn_(deliveryRaw)) {
    var altDel = order_readDeliveryFromAlternateColumn_(
      sheet,
      rowNum,
      columns.deliveryTypeColumn,
      headerRow,
    );
    if (altDel) {
      deliveryRaw = altDel;
    }
  }
  var stopDeskRawForParse =
    stopDeskSameAsDeliveryCol ? '' : stopDeskRaw != null ? String(stopDeskRaw).trim() : '';
  var deliveryType = order_parseDeliveryType_(deliveryRaw, stopDeskRawForParse);

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
 * When the sheet has no stop-desk column, use sender default hub from business settings
 * (same value as «معرّف المكتب» in بيانات المرسل الافتراضية). Row-mapped ID always wins.
 * @param {InternalOrderLike} order
 * @param {Object|null} businessSettings
 */
function order_applyDefaultStopDeskForPickup_(order, businessSettings) {
  if (!order || typeof order !== 'object') {
    return;
  }
  if (String(order.deliveryType || '').trim() !== 'pickup-point') {
    return;
  }
  if (order.stopDeskId != null && String(order.stopDeskId).trim() !== '') {
    return;
  }
  var bs = businessSettings && typeof businessSettings === 'object' ? businessSettings : null;
  if (!bs) {
    return;
  }
  if (typeof businessSettings_normalizeHubFields_ === 'function') {
    businessSettings_normalizeHubFields_(bs);
  }
  var hub =
    bs.defaultHubId != null ? String(bs.defaultHubId).trim() : '';
  if (!hub && bs.stopDeskId != null) {
    hub = String(bs.stopDeskId).trim();
  }
  if (hub) {
    order.stopDeskId = hub;
  }
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {InternalOrderLike} order
 * @param {Object} columns
 * @param {Object=} businessSettings
 * @return {Array<string>}
 */
function validateOrder_(sheet, rowNum, order, columns, businessSettings) {
  var errors = [];
  var carrierIdLc = String(order.carrier || '').trim().toLowerCase();
  var yalidineCommuneOnlyMode = carrierIdLc === 'yalidine' && !isBlank_(order.commune);
  // ZR home flow can resolve territory from commune-only input server-side.
  // Keep preview permissive here and let backend return a precise error when commune is ambiguous.
  var zrCommuneOnlyMode =
    carrierIdLc === 'zr' && order.deliveryType === 'home' && !isBlank_(order.commune);

  if (isBlank_(order.phone)) {
    errors.push(i18n_t('val.phone_required'));
  } else if (!isPlausiblePhone_(order.phone)) {
    errors.push(i18n_t('val.phone_invalid'));
  }

  var addrColN =
    columns.addressColumn != null ? Number(columns.addressColumn) : NaN;
  var dtColN =
    columns.deliveryTypeColumn != null ? Number(columns.deliveryTypeColumn) : NaN;
  if (
    Number.isFinite(addrColN) &&
    addrColN >= 1 &&
    Number.isFinite(dtColN) &&
    dtColN >= 1 &&
    addrColN === dtColN
  ) {
    errors.push(i18n_t('error.address_and_delivery_same_column'));
  }

  var rawAddrCell = getColumnValue_(sheet, rowNum, columns.addressColumn);
  if (
    !isBlank_(rawAddrCell) &&
    typeof send_looksLikeDeliveryModeValue_ === 'function' &&
    send_looksLikeDeliveryModeValue_(rawAddrCell)
  ) {
    errors.push(i18n_t('error.address_column_looks_like_delivery_type'));
  }

  var carrierForAddrCheck = carrierIdLc;
  if (isBlank_(order.address)) {
    // ZR uses territory IDs (wilaya+commune) instead of a free-text address,
    // so address is not strictly required when wilaya+commune are present.
    if (carrierForAddrCheck === 'zr' && !isBlank_(order.wilaya) && !isBlank_(order.commune)) {
      // optional — no error
    } else {
      errors.push(i18n_t('val.address_required'));
    }
  } else if (
    typeof send_looksLikeCarrierValue_ === 'function' &&
    send_looksLikeCarrierValue_(order.address)
  ) {
    errors.push(i18n_t('error.address_column_looks_like_carrier'));
  }

  if (isBlank_(order.wilaya)) {
    if (!yalidineCommuneOnlyMode && !zrCommuneOnlyMode) {
      errors.push(i18n_t('val.wilaya_required'));
    }
  } else {
    if (
      !yalidineCommuneOnlyMode &&
      !zrCommuneOnlyMode &&
      (order.wilayaCode == null || order.wilayaCode < 1 || order.wilayaCode > 58)
    ) {
      // Guide users to either add a wilaya code column or include a numeric prefix like "16 — Alger".
      errors.push(i18n_t('val.wilaya_invalid'));
    }
  }

  if (isBlank_(order.carrier)) {
    errors.push(i18n_t('val.carrier_required'));
  }

  if (order.externalShipmentId || order.trackingNumber) {
    errors.push(i18n_t('send.already_sent'));
    return errors;
  }

  if (columns.codColumn != null) {
    var rawCod = getColumnValue_(sheet, rowNum, columns.codColumn);
    if (!isBlank_(rawCod) && order.codAmount == null) {
      errors.push(i18n_t('val.cod_invalid'));
    }
  }

  var fallbackStopDeskId =
    businessSettings && businessSettings.defaultHubId != null
      ? String(businessSettings.defaultHubId).trim()
      : businessSettings && businessSettings.stopDeskId != null
        ? String(businessSettings.stopDeskId).trim()
        : '';
  if (
    order.deliveryType === 'pickup-point' &&
    (!order.stopDeskId || order.stopDeskId.trim() === '') &&
    !fallbackStopDeskId
  ) {
    var carrierLc = String(order.carrier || '').trim().toLowerCase();
    if (carrierLc !== 'zr' && carrierLc !== 'noest') {
      errors.push(i18n_t('val.stopdesk_required'));
    }
  }

  // Carrier-specific commune requirements.
  if (carrierIdLc === 'zr' && order.deliveryType === 'home' && isBlank_(order.commune)) {
    errors.push(i18n_t('val.commune_required_zr_home'));
  }
  if (carrierIdLc === 'yalidine' && isBlank_(order.commune)) {
    errors.push(i18n_t('val.commune_required_yalidine'));
  }
  if (carrierIdLc === 'noest' && isBlank_(order.commune)) {
    errors.push(i18n_t('val.commune_required_noest'));
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
      values,
      headerRow
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
 * @param {Array<string>=} warnings mutated
 */
function appendDuplicateErrors_(rowNum, order, index, errors, warnings) {
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
      var msg = i18n_format('error.dup_phone_product_row', pRow);
      // Phone+product is a useful duplicate hint, but repeat buyers can be legitimate.
      if (warnings && typeof warnings.push === 'function') {
        warnings.push(msg);
      } else {
        errors.push(msg);
      }
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
 * Many sheets use a column titled "LIVRASION" for shipment status (LIVREE, RETOUR, …), not domicile/bureau mode.
 * When true, that cell must not win over another column that holds the real delivery mode.
 * @param {*} raw
 * @return {boolean}
 */
function order_valueLooksLikeShipmentStatusNotDeliveryMode_(raw) {
  if (isBlank_(raw)) {
    return false;
  }
  var s = String(raw).trim();
  // Arabic phrases that are status / outcome, not "ship to office vs home" choice.
  if (/[\u0600-\u06FF]/.test(s)) {
    return /(مرتجع|مرتجعة|ملغى|ملغي|مؤكد|مؤكدة|منجز|تم\s*التسليم|قيد\s*التوصيل|في\s*الطريق|رفض|ملغاة)/.test(s);
  }
  var n = order_normalizeDeliveryText_(s);
  if (!n) {
    return false;
  }
  // Do not treat real mode keywords as status-only.
  if (
    /pickup|home|domicile|maison|house|residence|desk|bureau|relay|relais|point|agence|agency|office|stop|livraison|livrasion|delivery|domicil/.test(
      n,
    )
  ) {
    return false;
  }
  // French / Latin status tokens common in export sheets (not mode selectors).
  return /^(retour|retours|livree|livré|livr[eé]s?|annul|annul[eé]e?s?|confirme|confirmee|conferme|confermee|expedi|expédi|expid[eé]|expidie|expider|expedition|inj(\s*\d+)?|unknown|inconnu|pending|rembours|rembourse|reporte|reporter|en\s*cours|en\s*transit|n\/a|na)$/i.test(
    n.replace(/\s+/g, ' ').trim(),
  );
}

/**
 * Whether to scan other columns (headers like LIVRASION) for delivery mode.
 * True when the mapped cell is empty, is a known placeholder (e.g. WooCommerce), or has no recognizable mode.
 * @param {*} deliveryRaw
 * @return {boolean}
 */
function order_shouldUseAlternateDeliveryColumn_(deliveryRaw) {
  if (isBlank_(deliveryRaw)) {
    return true;
  }
  if (order_valueLooksLikeShipmentStatusNotDeliveryMode_(deliveryRaw)) {
    return true;
  }
  var n = order_normalizeDeliveryText_(deliveryRaw);
  if (!n) {
    return true;
  }
  // WooCommerce / e-commerce placeholders — treat as missing so LIVRASION column can win.
  if (
    /no\s+shipping\s+methods?\s+set|no\s+shipping\s+methods?|shipping\s+not\s+configured|not\s+set|n\/a|none\s+selected|aucun\s+mode\s+de\s+livraison|pas\s+de\s+livraison/.test(
      n,
    )
  ) {
    return true;
  }
  if (n.indexOf('للمكتب') !== -1 || n.indexOf('للمنزل') !== -1 || n.indexOf('المنزل') !== -1) {
    return false;
  }
  if (ORDER_DELIVERY_PICKUP_TERMS_[n] || ORDER_DELIVERY_HOME_TERMS_[n]) {
    return false;
  }
  if (ORDER_DELIVERY_PICKUP_HINT_RE_.test(n) || ORDER_DELIVERY_HOME_HINT_RE_.test(n)) {
    return false;
  }
  if (/^(livraison|livrasion|lavraison|livrason|delivery)$/.test(n)) {
    return true;
  }
  if (
    /pickup|home|domicile|maison|house|residence|office|desk|bureau|relais|relay|point|stop|agence|livraison|livrasion|delivery|التوصيل|منزل|مكتب|استلام|نقطة/.test(
      n,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Prefer cells that clearly encode domicile vs bureau (e.g. column W: "التوصيل للمكتب") over
 * weaker matches when several headers look like "LIVRASION".
 * @param {string} v
 * @return {number}
 */
function order_deliveryModeCandidateScore_(v) {
  if (isBlank_(v)) {
    return -100;
  }
  if (order_valueLooksLikeShipmentStatusNotDeliveryMode_(v)) {
    return -100;
  }
  var s = String(v);
  if (/للمكتب|للمنزل|التوصيل\s*للمكتب|التوصيل\s*للمنزل|المنزل/.test(s)) {
    return 1000;
  }
  var n = order_normalizeDeliveryText_(v);
  if (!n) {
    return 0;
  }
  if (ORDER_DELIVERY_PICKUP_TERMS_[n] || ORDER_DELIVERY_HOME_TERMS_[n]) {
    return 800;
  }
  if (ORDER_DELIVERY_PICKUP_HINT_RE_.test(n)) {
    return 600;
  }
  if (ORDER_DELIVERY_HOME_HINT_RE_.test(n)) {
    return 550;
  }
  if (/[\u0600-\u06FF]/.test(s)) {
    return 200;
  }
  return 50;
}

/**
 * When the mapped delivery column is empty or does not contain a recognizable mode
 * (e.g. WooCommerce "No shipping methods set"), find another column whose header looks like
 * delivery mode (e.g. "LIVRASION", "LIVRAISON", "lavraison", "l livrasion") — common when users map
 * "DELIVERY MODE" but the sheet uses a separate livraison column (often column W).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {number|undefined|null} mappedDeliveryCol
 * @param {number} headerRow
 * @return {string|null}
 */
function order_readDeliveryFromAlternateColumn_(sheet, rowNum, mappedDeliveryCol, headerRow) {
  if (!sheet || !rowNum || !headerRow) {
    return null;
  }
  try {
    var lastCol = sheet.getLastColumn();
    if (!lastCol || lastCol < 1) {
      return null;
    }
    var mc = mappedDeliveryCol != null ? Number(mappedDeliveryCol) : NaN;
    var headers = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0];
    var candidates = [];
    for (var c = 0; c < headers.length; c++) {
      var colNum = c + 1;
      if (Number.isFinite(mc) && colNum === mc) {
        continue;
      }
      if (!order_headerLooksLikeDeliveryTypeColumn_(headers[c])) {
        continue;
      }
      var v = sheet.getRange(rowNum, colNum).getDisplayValue();
      if (v == null || String(v).trim() === '') {
        continue;
      }
      var trimmed = String(v).trim();
      if (order_valueLooksLikeShipmentStatusNotDeliveryMode_(trimmed)) {
        continue;
      }
      candidates.push(trimmed);
    }
    if (!candidates.length) {
      return null;
    }
    candidates.sort(function (a, b) {
      return order_deliveryModeCandidateScore_(b) - order_deliveryModeCandidateScore_(a);
    });
    return candidates[0];
  } catch (eAlt) {}
  return null;
}

/**
 * @param {*} headerText
 * @return {boolean}
 */
function order_headerLooksLikeDeliveryTypeColumn_(headerText) {
  var hn = String(headerText || '').toLowerCase();
  if (!hn) {
    return false;
  }
  if (
    /societe|société|carrier|transporteur|company|شركة|شركه|ناقل|الشحن|expediteur|expéditeur|bon de livraison|adresse de livraison|adresse livraison/.test(
      hn,
    )
  ) {
    return false;
  }
  return /(l\s*livrasion|l\s*livraison|^livrasion$|^livrason$|^livraison$|livrasion|livrason|livracion|type\s*livraison|mode\s*livraison|type\s*livrasion|mode\s*livrasion|delivery\s*type|delivery\s*mode|delivry|نوع\s*التوصيل|طريقة\s*التوصيل|نمط\s*التوصيل)/.test(
    hn,
  );
}

function order_normalizeDeliveryText_(raw) {
  if (raw == null) {
    return '';
  }
  var text = String(raw).trim().toLowerCase();
  if (!text) {
    return '';
  }
  try {
    text = text.replace(/[\u200c\u200d\u200e\u200f\u2066\u2067\u2068\u2069\ufeff]/g, '');
  } catch (eStrip) {}
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {}
  // Unify Persian Kaf / Farsi Yeh (common in mixed-IME Sheets dropdowns).
  text = text.replace(/\u06a9/g, '\u0643');
  text = text.replace(/\u06cc/g, '\u064a');
  return text
    .replace(/[_./|,\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse row delivery mode with multilingual + typo-tolerant matching.
 * When no explicit value is present, a filled stop-desk id implies pickup-point.
 * @param {*} deliveryRaw
 * @param {*} stopDeskRaw
 * @return {'home'|'pickup-point'}
 */
function order_parseDeliveryType_(deliveryRaw, stopDeskRaw) {
  var normalized = order_normalizeDeliveryText_(deliveryRaw);
  if (normalized) {
    // Arabic: distinguish office/stop-desk vs home using substrings (robust vs dropdown quirks).
    if (normalized.indexOf('للمكتب') !== -1) {
      return 'pickup-point';
    }
    if (normalized.indexOf('للمنزل') !== -1 || normalized.indexOf('المنزل') !== -1) {
      return 'home';
    }
    if (ORDER_DELIVERY_PICKUP_TERMS_[normalized]) {
      return 'pickup-point';
    }
    if (ORDER_DELIVERY_HOME_TERMS_[normalized]) {
      return 'home';
    }
    if (ORDER_DELIVERY_PICKUP_HINT_RE_.test(normalized)) {
      return 'pickup-point';
    }
    if (ORDER_DELIVERY_HOME_HINT_RE_.test(normalized)) {
      return 'home';
    }
  }
  if (stopDeskRaw != null && String(stopDeskRaw).trim() !== '') {
    return 'pickup-point';
  }
  return 'home';
}

/**
 * @param {string|null} phone
 * @return {boolean}
 */
/**
 * Map Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits to ASCII so replace(/\D/g) does not drop them.
 * @param {string} s
 * @return {string}
 */
function mapUnicodeDigitsToAscii_(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0x0660 && c <= 0x0669) {
      out += String(c - 0x0660);
    } else if (c >= 0x06f0 && c <= 0x06f9) {
      out += String(c - 0x06f0);
    } else {
      out += s.charAt(i);
    }
  }
  return out;
}

/**
 * Same rules as backend normalizeDzPhone_ (Algerian mobile → national 9 digits 5/6/7…).
 * @param {string|null} phone
 * @return {boolean}
 */
function isPlausiblePhone_(phone) {
  if (!phone) {
    return false;
  }
  var digits = mapUnicodeDigitsToAscii_(String(phone).trim()).replace(/\D/g, '');
  if (!digits || digits.length < 9) {
    return false;
  }

  var guard;
  for (guard = 0; guard < 6; guard++) {
    if (digits.indexOf('00213') === 0) {
      digits = digits.slice(5);
    } else if (digits.indexOf('213') === 0 && digits.length >= 12) {
      digits = digits.slice(3);
    } else {
      break;
    }
  }

  while (digits.charAt(0) === '0' && digits.length > 10) {
    digits = digits.slice(1);
  }

  if (digits.charAt(0) === '0' && digits.length === 10) {
    digits = digits.slice(1);
  }

  return /^[567]\d{8}$/.test(digits);
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
var KNOWN_CARRIER_ADAPTER_IDS_ = ['yalidine', 'zr', 'noest'];

/**
 * @param {string|null|undefined} raw
 * @return {string}
 */
function normalizeCarrierToken_(raw) {
  if (raw == null) {
    return '';
  }
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

/**
 * Accept friendly aliases from sheet cells (e.g. "Yalidine", "ZR Express").
 * @param {string|null|undefined} raw
 * @return {string|null}
 */
function resolveCarrierAlias_(raw) {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  var s = String(raw).trim().toLowerCase();
  var token = normalizeCarrierToken_(s);

  if (
    token === 'yalidine' ||
    token === 'yallidine' ||
    token.indexOf('yalidine') === 0 ||
    token.indexOf('yallidine') === 0 ||
    token.indexOf('yali') === 0 ||
    token.indexOf('yall') === 0
  ) {
    return 'yalidine';
  }
  if (/ياليدين|يالدين|يالي?دين/.test(s)) {
    return 'yalidine';
  }

  if (
    token === 'zr' ||
    token.indexOf('zrexpress') === 0 ||
    token.indexOf('zr') === 0
  ) {
    return 'zr';
  }
  if (/زد\s*ار|زدار/.test(s)) {
    return 'zr';
  }

  if (
    token === 'noest' ||
    token.indexOf('noest') === 0 ||
    token.indexOf('nouest') === 0
  ) {
    return 'noest';
  }
  if (/نوست|نويست|ن\s*و\s*ست/.test(s)) {
    return 'noest';
  }
  return null;
}

/**
 * Resolves which carrier adapter to call: explicit slug in sheet cell wins, else default from setup.
 * @param {string|null} rawFromCell
 * @param {string|null} defaultCarrierId
 * @return {string|null}
 */
function resolveCarrierAdapterId_(rawFromCell, defaultCarrierId) {
  if (rawFromCell != null && String(rawFromCell).trim() !== '') {
    var alias = resolveCarrierAlias_(rawFromCell);
    if (alias) {
      return alias;
    }
    var s = normalizeCarrierToken_(rawFromCell);
    for (var i = 0; i < KNOWN_CARRIER_ADAPTER_IDS_.length; i++) {
      if (s === KNOWN_CARRIER_ADAPTER_IDS_[i]) {
        return KNOWN_CARRIER_ADAPTER_IDS_[i];
      }
    }
  }
  if (defaultCarrierId != null && String(defaultCarrierId).trim() !== '') {
    var defAlias = resolveCarrierAlias_(defaultCarrierId);
    if (defAlias) {
      return defAlias;
    }
    var def = normalizeCarrierToken_(defaultCarrierId);
    for (var j = 0; j < KNOWN_CARRIER_ADAPTER_IDS_.length; j++) {
      if (def === KNOWN_CARRIER_ADAPTER_IDS_[j]) {
        return KNOWN_CARRIER_ADAPTER_IDS_[j];
      }
    }
  }
  return null;
}
