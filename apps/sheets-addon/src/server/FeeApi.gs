/**
 * @fileoverview Shipping fee rules (per carrier + optional per wilaya) and apply to selection.
 */

var FEE_RULES_SCHEMA_VERSION_ = 1;

/**
 * @return {{
 *   spreadsheetId: string,
 *   rules: Object,
 *   carriers: Array<{ id: string, label: string }>
 * }}
 */
function fee_getState() {
  var ctx = setup_getContext();
  var json = DeliveryToolStorage.getFeeRulesJson(ctx.spreadsheetId);
  var rules = parseFeeRulesJson_(json);
  return {
    spreadsheetId: ctx.spreadsheetId,
    rules: rules,
    carriers: ctx.carriers,
  };
}

/**
 * @param {Object} payload
 * @param {string} payload.carrierId
 * @param {number|string} payload.defaultFee
 * @param {string} [payload.wilayaLines] lines like 16=600 or Alger: 550
 * @return {Object} saved rules blob
 */
function fee_saveCarrierRules(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(i18n_t('error.invalid_data'));
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();

  var carrierId = payload.carrierId != null ? String(payload.carrierId).trim().toLowerCase() : '';
  if (!carrierId) {
    throw new Error(i18n_t('error.choose_carrier'));
  }

  var defNum = parseFeeAmount_(payload.defaultFee);
  if (defNum == null) {
    throw new Error(i18n_t('error.default_fee_invalid'));
  }

  var wilayaMap = parseWilayaLines_(payload.wilayaLines != null ? String(payload.wilayaLines) : '');

  var json = DeliveryToolStorage.getFeeRulesJson(spreadsheetId);
  var rules = parseFeeRulesJson_(json);
  if (!rules.carriers) {
    rules.carriers = {};
  }
  rules.schemaVersion = FEE_RULES_SCHEMA_VERSION_;
  rules.carriers[carrierId] = {
    default: defNum,
    wilaya: wilayaMap,
  };

  var out = JSON.stringify(rules);
  if (out.length > 9000) {
    throw new Error(i18n_t('error.fee_rules_too_large'));
  }
  DeliveryToolStorage.setFeeRulesJson(spreadsheetId, out);
  return rules;
}

/**
 * Writes frais column for each non-empty row in the active selection.
 * @param {boolean} [overwrite] If true, replace existing fee cells (default true).
 * @return {{
 *   applied: number,
 *   skippedEmpty: number,
 *   skippedNoRule: number,
 *   skippedExisting: number,
 *   skippedNoCarrier: number
 * }}
 */
function fee_applySelection(overwrite) {
  license_assertOperationsAllowed_();
  var doOverwrite = overwrite !== false && overwrite !== 'false' && overwrite !== 0;

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
    // Use shared normalization (v1 → v2) to get defaultCarrier, headerRow, etc.
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }

  var columns = saved.columns || {};
  if (columns.shippingFeeColumn == null) {
    throw new Error(i18n_t('error.shipping_fee_column_required'));
  }

  var defaultCarrierId =
    saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
      ? String(saved.defaultCarrier).trim()
      : null;

  var range = sheet.getActiveRange();
  if (!range) {
    throw new Error(i18n_t('error.select_rows'));
  }

  var rules = parseFeeRulesJson_(DeliveryToolStorage.getFeeRulesJson(spreadsheetId));
  var feeCol = Number(columns.shippingFeeColumn);
  var now = isoNow_();

  var startRow = range.getRow();
  var endRow = startRow + range.getNumRows() - 1;

  var lastSheetRow = Math.max(sheet.getLastRow(), 2);
  var lastCol = sheet.getLastColumn();
  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  var values =
    lastSheetRow >= headerRow + 1 && lastCol >= 1
      ? sheet.getRange(headerRow, 1, lastSheetRow - headerRow + 1, lastCol).getDisplayValues()
      : [];

  var applied = 0;
  var skippedEmpty = 0;
  var skippedNoRule = 0;
  var skippedExisting = 0;
  var skippedNoCarrier = 0;

  for (var rowNum = startRow; rowNum <= endRow; rowNum++) {
    if (rowNum <= headerRow) {
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
      skippedEmpty++;
      continue;
    }

    var carrierId = resolveCarrierAdapterId_(order.carrier, defaultCarrierId);
    if (!carrierId) {
      skippedNoCarrier++;
      continue;
    }

    var amount = lookupFeeForCarrierWilaya_(rules, carrierId, order.wilaya);
    if (amount == null || !isFinite(amount)) {
      skippedNoRule++;
      continue;
    }

    if (!doOverwrite) {
      var existing = getColumnValue_(sheet, rowNum, columns.shippingFeeColumn);
      if (existing != null && String(existing).trim() !== '') {
        skippedExisting++;
        continue;
      }
    }

    sheet.getRange(rowNum, feeCol).setValue(amount);
    applied++;
  }

  SpreadsheetApp.flush();

  return {
    applied: applied,
    skippedEmpty: skippedEmpty,
    skippedNoRule: skippedNoRule,
    skippedExisting: skippedExisting,
    skippedNoCarrier: skippedNoCarrier,
  };
}

/**
 * @param {string|null} json
 * @return {{ schemaVersion: number, carriers: Object }}
 */
function parseFeeRulesJson_(json) {
  var empty = { schemaVersion: FEE_RULES_SCHEMA_VERSION_, carriers: {} };
  if (!json) {
    return empty;
  }
  try {
    var o = JSON.parse(json);
    if (!o || typeof o !== 'object') {
      return empty;
    }
    if (!o.carriers || typeof o.carriers !== 'object') {
      o.carriers = {};
    }
    return o;
  } catch (e) {
    return empty;
  }
}

/**
 * @param {string|number|null|undefined} raw
 * @return {number|null}
 */
function parseFeeAmount_(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  var t = String(raw).replace(/\s/g, '').replace(',', '.');
  var n = parseFloat(t);
  if (!isFinite(n)) {
    return null;
  }
  return n;
}

/**
 * @param {string} text
 * @return {Object} map wilayaKey -> number
 */
function parseWilayaLines_(text) {
  var map = {};
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.indexOf('#') === 0) {
      continue;
    }
    var sep = -1;
    if (line.indexOf('=') >= 0) {
      sep = line.indexOf('=');
    } else if (line.indexOf(':') >= 0) {
      sep = line.indexOf(':');
    }
    if (sep < 0) {
      continue;
    }
    var keyPart = line.substring(0, sep).trim();
    var valPart = line.substring(sep + 1).trim();
    var key = normalizeWilayaKeyForFee_(keyPart);
    if (!key) {
      continue;
    }
    var val = parseFeeAmount_(valPart);
    if (val == null) {
      continue;
    }
    map[key] = val;
  }
  return map;
}

/**
 * @param {string|null} raw
 * @return {string}
 */
function normalizeWilayaKeyForFee_(raw) {
  if (raw == null || String(raw).trim() === '') {
    return '';
  }
  var s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return s;
}

/**
 * Keys to try for fee rules when the cell is e.g. "16 — Alger" (liste déroulante).
 * @param {string|null} raw
 * @return {Array<string>}
 */
function wilaya_feeLookupKeys_(raw) {
  var out = [];
  if (raw == null || String(raw).trim() === '') {
    return out;
  }
  var full = normalizeWilayaKeyForFee_(raw);
  if (full) {
    out.push(full);
  }
  var t = String(raw).trim();
  var m = t.match(/^(\d{1,2})\s*[-—–]\s*(.+)$/);
  if (m) {
    var code = String(parseInt(m[1], 10));
    var namePart = normalizeWilayaKeyForFee_(m[2]);
    if (code && out.indexOf(code) < 0) {
      out.push(code);
    }
    if (namePart && out.indexOf(namePart) < 0) {
      out.push(namePart);
    }
  }
  var m2 = t.match(/^(\d{1,2})\b/);
  if (m2) {
    var c2 = String(parseInt(m2[1], 10));
    if (out.indexOf(c2) < 0) {
      out.push(c2);
    }
  }
  return out;
}

/**
 * @param {{ carriers: Object }} rules
 * @param {string} carrierId
 * @param {string|null} wilayaRaw
 * @return {number|null}
 */
function lookupFeeForCarrierWilaya_(rules, carrierId, wilayaRaw) {
  var c = rules.carriers && rules.carriers[carrierId];
  if (!c) {
    return null;
  }
  var def = c.default;
  if (def == null) {
    return null;
  }
  var defN = Number(def);
  if (!isFinite(defN)) {
    return null;
  }

  var keys = wilaya_feeLookupKeys_(wilayaRaw);
  for (var i = 0; i < keys.length; i++) {
    var wkey = keys[i];
    if (wkey && c.wilaya && c.wilaya[wkey] != null) {
      var w = Number(c.wilaya[wkey]);
      if (isFinite(w)) {
        return w;
      }
    }
  }
  return defN;
}
