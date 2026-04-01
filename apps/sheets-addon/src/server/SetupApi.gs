/**
 * @fileoverview Setup wizard API — sheets, headers, save/load mapping (SavedSheetMapping JSON).
 */

var SETUP_SCHEMA_VERSION_ = 2;
var SETUP_ALIAS_SCHEMA_VERSION_ = 1;
var SETUP_ALIAS_KEY_PREFIX_ = 'dt.v1.mapAlias.';
var SETUP_AUTODETECT_MIN_SCORE_ = 0.66;
var SETUP_ALIAS_MAX_PER_FIELD_ = 20;

var SETUP_FIELD_KEYS_ = [
  'orderIdColumn',
  'phoneColumn',
  'addressColumn',
  'wilayaColumn',
  'codColumn',
  'customerFirstNameColumn',
  'customerLastNameColumn',
  'customerFullNameColumn',
  'wilayaCodeColumn',
  'communeColumn',
  'productColumn',
  'quantityColumn',
  'shippingFeeColumn',
  'deliveryTypeColumn',
  'stopDeskIdColumn',
  'statusColumn',
  'carrierColumn',
  'trackingColumn',
  'externalShipmentIdColumn',
  'labelUrlColumn',
  'notesColumn',
  'blacklistColumn',
  'blacklistReasonColumn',
  'orderDateColumn',
];

var SETUP_FIELD_SYNONYMS_ = {
  orderIdColumn: ['order id', 'id commande', 'numero commande', 'num commande', 'commande id', 'id'],
  phoneColumn: ['phone', 'telephone', 'tel', 'mobile', 'gsm', 'رقم الهاتف', 'الهاتف', 'phone1'],
  addressColumn: ['address', 'adresse', 'adr', 'عنوان', 'location'],
  wilayaColumn: ['wilaya', 'province', 'ولاية'],
  codColumn: ['cod', 'montant', 'amount', 'prix', 'prix livraison', 'قيمة الطلب', 'المبلغ'],
  customerFirstNameColumn: ['first name', 'prenom', 'الاسم'],
  customerLastNameColumn: ['last name', 'nom', 'family name', 'اللقب', 'النسب'],
  customerFullNameColumn: ['full name', 'nom complet', 'customer name', 'client', 'اسم و لقب', 'الاسم الكامل'],
  wilayaCodeColumn: ['wilaya code', 'code wilaya', 'province code', 'رقم الولاية'],
  communeColumn: ['commune', 'district', 'municipality', 'baladia', 'بلدية'],
  productColumn: ['product', 'produit', 'article', 'منتج'],
  quantityColumn: ['quantity', 'qty', 'qte', 'quantite', 'الكمية'],
  shippingFeeColumn: ['shipping fee', 'delivery fee', 'frais livraison', 'frais', 'سعر التوصيل'],
  deliveryTypeColumn: ['delivery type', 'delivery mode', 'type livraison', 'mode livraison', 'نوع التوصيل'],
  stopDeskIdColumn: ['stopdesk', 'pickup point', 'relay', 'hub', 'station', 'point relais', 'مكتب'],
  statusColumn: ['status', 'statut', 'etat', 'الحالة'],
  carrierColumn: ['carrier', 'transporteur', 'livreur', 'شركة التوصيل'],
  trackingColumn: ['tracking', 'tracking number', 'suivi', 'num suivi', 'رقم التتبع'],
  externalShipmentIdColumn: ['external id', 'shipment id', 'parcel id', 'id expedition', 'معرف الشحنة'],
  labelUrlColumn: ['label', 'label url', 'etiquette', 'bon', 'رابط الملصق'],
  notesColumn: ['notes', 'note', 'comment', 'remarque', 'ملاحظات'],
  blacklistColumn: ['blacklist', 'liste noire', 'blocked', 'black listed', 'محظور', 'قائمة سوداء'],
  blacklistReasonColumn: ['blacklist reason', 'raison blacklist', 'motif blacklist', 'سبب الحظر'],
  orderDateColumn: ['order date', 'date commande', 'date', 'تاريخ الطلب'],
};

/**
 * Static fallback — must match @delivery-tool/carriers registry and OrderEngine.KNOWN_CARRIER_ADAPTER_IDS_
 * @return {Array<{ id: string, label: string }>}
 */
function setup_getCarriersFallback_() {
  return [
    { id: 'yalidine', label: 'Yalidine' },
    { id: 'zr', label: 'ZR' },
  ];
}

/**
 * Uses GET /v1/carriers when backend URL is set; on failure returns static list.
 * @return {Array<{ id: string, label: string }>}
 */
function setup_resolveCarriers_() {
  var fallback = setup_getCarriersFallback_();
  if (!getApiBaseUrl_()) {
    return fallback;
  }
  try {
    var res = apiJsonGet_('/v1/carriers');
    if (res && res.carriers && res.carriers.length) {
      return res.carriers.map(function (c) {
        return { id: String(c.id), label: String(c.label != null ? c.label : c.id) };
      });
    }
  } catch (e) {
    // Locked checklist: when backend is configured, do not silently fall back.
    var msg = e && e.message ? String(e.message) : String(e);
    throw new Error(i18n_format('error.backend_carriers_load_with_reason', msg));
  }
  throw new Error(i18n_t('error.backend_carriers_load'));
}

/**
 * @return {{
 *   spreadsheetId: string,
 *   sheets: Array<{ sheetId: number, sheetName: string }>,
 *   carriers: Array<{ id: string, label: string }>
 * }}
 */
function setup_getContext() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheets = ss.getSheets().map(function (sh) {
    return { sheetId: sh.getSheetId(), sheetName: sh.getName() };
  });
  var carriers = setup_resolveCarriers_();
  return { spreadsheetId: spreadsheetId, sheets: sheets, carriers: carriers };
}

/**
 * @param {number|string} sheetId
 * @param {number|string=} headerRowRaw Optional header row index (1-based)
 * @return {{
 *   headerRow: number,
 *   columnCount: number,
 *   headers: Array<string>,
 *   columnIndices: Array<number>,
 *   columns: Array<{ index: number, letter: string, header: string }>
 * }}
 */
function setup_getHeaders(sheetId, headerRowRaw) {
  var id = Number(sheetId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetById_(ss, id);
  if (!sheet) {
    throw new Error(i18n_t('error.sheet_not_found'));
  }
  var headerRow =
    headerRowRaw != null && String(headerRowRaw).trim() !== ''
      ? Number(headerRowRaw)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }
  headerRow = Math.floor(headerRow);
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    return {
      headerRow: headerRow,
      columnCount: 0,
      headers: [],
      columnIndices: [],
      columns: [],
    };
  }
  var maxRows = sheet.getMaxRows();
  if (headerRow > maxRows) {
    headerRow = 1;
  }
  var row = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var headers = row.map(function (cell) {
    if (cell === '' || cell === null) {
      return '';
    }
    return String(cell).trim();
  });
  var columnIndices = [];
  var columns = [];
  for (var c = 1; c <= lastCol; c++) {
    columnIndices.push(c);
    columns.push({
      index: c,
      letter: columnIndexToLetter_(c),
      header: headers[c - 1] || '',
    });
  }
  return {
    headerRow: headerRow,
    columnCount: lastCol,
    headers: headers,
    columnIndices: columnIndices,
    columns: columns,
  };
}

/**
 * Stable hash for active user identity (shared-sheet safe, no raw email in keys).
 * @return {string}
 */
function setup_getActiveUserHash_() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    email = '';
  }
  var normalized = email != null ? String(email).trim().toLowerCase() : '';
  if (!normalized) {
    return 'anon';
  }
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalized,
    Utilities.Charset.UTF_8,
  );
  var out = '';
  for (var i = 0; i < digest.length; i++) {
    var v = digest[i];
    if (v < 0) v += 256;
    var hex = v.toString(16);
    out += hex.length === 1 ? '0' + hex : hex;
  }
  return out;
}

/**
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @return {string}
 */
function setup_aliasStoreKey_(spreadsheetId, sheetId) {
  return (
    SETUP_ALIAS_KEY_PREFIX_ +
    spreadsheetId +
    ':' +
    String(sheetId) +
    ':' +
    setup_getActiveUserHash_()
  );
}

/**
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @return {{ schemaVersion: number, fields: Object<string, Array<string>>, updatedAt: string|null }}
 */
function setup_getLearnedAliases_(spreadsheetId, sheetId) {
  var key = setup_aliasStoreKey_(spreadsheetId, sheetId);
  var raw = PropertiesService.getUserProperties().getProperty(key);
  if (!raw) {
    return { schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_, fields: {}, updatedAt: null };
  }
  try {
    var parsed = JSON.parse(raw);
    var fields = parsed && parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    return {
      schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_,
      fields: fields,
      updatedAt: parsed && parsed.updatedAt ? String(parsed.updatedAt) : null,
    };
  } catch (e) {
    return { schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_, fields: {}, updatedAt: null };
  }
}

/**
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @param {{ schemaVersion: number, fields: Object<string, Array<string>>, updatedAt: string|null }} payload
 */
function setup_setLearnedAliases_(spreadsheetId, sheetId, payload) {
  var key = setup_aliasStoreKey_(spreadsheetId, sheetId);
  var json = JSON.stringify(payload);
  if (json.length > 9000) {
    return;
  }
  PropertiesService.getUserProperties().setProperty(key, json);
}

/**
 * @param {string} s
 * @return {string}
 */
function setup_normalizeHeader_(s) {
  if (s == null) return '';
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_./|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} headerNorm
 * @param {string} termNorm
 * @return {number}
 */
function setup_termScore_(headerNorm, termNorm) {
  if (!headerNorm || !termNorm) return 0;
  if (headerNorm === termNorm) return 1;
  if (headerNorm.indexOf(termNorm) !== -1 || termNorm.indexOf(headerNorm) !== -1) {
    return 0.92;
  }
  var h = headerNorm.split(' ').filter(function (x) {
    return x;
  });
  var t = termNorm.split(' ').filter(function (x) {
    return x;
  });
  if (!h.length || !t.length) return 0;
  var tMap = {};
  for (var i = 0; i < t.length; i++) {
    tMap[t[i]] = true;
  }
  var overlap = 0;
  for (var j = 0; j < h.length; j++) {
    if (tMap[h[j]]) overlap++;
  }
  if (!overlap) return 0;
  return overlap / Math.max(h.length, t.length);
}

/**
 * Learn aliases from the user-confirmed mapping.
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @param {number} headerRow
 * @param {Object} columns
 */
function setup_learnAliasesFromMapping_(spreadsheetId, sheetId, headerRow, columns) {
  if (!columns || typeof columns !== 'object') return;
  var headerPayload = setup_getHeaders(sheetId, headerRow);
  var headers = headerPayload.headers || [];
  var aliases = setup_getLearnedAliases_(spreadsheetId, sheetId);
  var fields = aliases.fields || {};
  var changed = false;

  SETUP_FIELD_KEYS_.forEach(function (fieldKey) {
    var col = Number(columns[fieldKey]);
    if (!Number.isFinite(col) || col < 1 || col > headers.length) return;
    var header = headers[col - 1];
    var norm = setup_normalizeHeader_(header);
    if (!norm) return;
    var arr = Array.isArray(fields[fieldKey]) ? fields[fieldKey].map(String) : [];
    arr = arr.filter(function (x) {
      return setup_normalizeHeader_(x) !== norm;
    });
    arr.unshift(norm);
    if (arr.length > SETUP_ALIAS_MAX_PER_FIELD_) {
      arr = arr.slice(0, SETUP_ALIAS_MAX_PER_FIELD_);
    }
    fields[fieldKey] = arr;
    changed = true;
  });

  if (!changed) return;
  aliases.schemaVersion = SETUP_ALIAS_SCHEMA_VERSION_;
  aliases.fields = fields;
  aliases.updatedAt = new Date().toISOString();
  setup_setLearnedAliases_(spreadsheetId, sheetId, aliases);
}

/**
 * Suggest field mapping based on header synonyms + learned aliases (user+sheet scoped).
 * @param {number|string} sheetId
 * @param {number|string=} headerRowRaw
 * @return {{
 *   spreadsheetId: string,
 *   sheetId: number,
 *   sheetName: string,
 *   columns: Object<string, number>,
 *   defaultCarrier: string|null,
 *   headerRow: number,
 *   schemaVersion: number,
 *   confidenceByField: Object<string, number>
 * }}
 */
function setup_getSuggestedMapping(sheetId, headerRowRaw) {
  var id = Number(sheetId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheet = getSheetById_(ss, id);
  if (!sheet) {
    throw new Error(i18n_t('error.sheet_not_found'));
  }
  var headerPayload = setup_getHeaders(id, headerRowRaw);
  var cols = headerPayload.columns || [];
  var learned = setup_getLearnedAliases_(spreadsheetId, id);
  var learnedFields = learned.fields || {};
  var usedColumns = {};
  var scored = [];

  SETUP_FIELD_KEYS_.forEach(function (fieldKey) {
    var defaults = Array.isArray(SETUP_FIELD_SYNONYMS_[fieldKey]) ? SETUP_FIELD_SYNONYMS_[fieldKey] : [];
    var userTerms = Array.isArray(learnedFields[fieldKey]) ? learnedFields[fieldKey] : [];
    var termsMap = {};
    var terms = [];
    defaults.concat(userTerms).forEach(function (raw) {
      var n = setup_normalizeHeader_(raw);
      if (!n || termsMap[n]) return;
      termsMap[n] = true;
      terms.push(n);
    });
    if (!terms.length) return;

    var bestCol = null;
    var bestScore = 0;
    cols.forEach(function (c) {
      var hn = setup_normalizeHeader_(c.header || '');
      if (!hn) return;
      var localBest = 0;
      terms.forEach(function (term) {
        var s = setup_termScore_(hn, term);
        if (s > localBest) localBest = s;
      });
      if (localBest > bestScore) {
        bestScore = localBest;
        bestCol = Number(c.index);
      }
    });
    if (bestCol != null) {
      scored.push({
        fieldKey: fieldKey,
        col: bestCol,
        score: bestScore,
      });
    }
  });

  scored.sort(function (a, b) {
    return b.score - a.score;
  });

  var columns = {};
  var confidenceByField = {};
  scored.forEach(function (it) {
    if (it.score < SETUP_AUTODETECT_MIN_SCORE_) return;
    if (usedColumns[it.col]) return;
    columns[it.fieldKey] = it.col;
    confidenceByField[it.fieldKey] = Number(it.score.toFixed(3));
    usedColumns[it.col] = true;
  });

  return {
    spreadsheetId: spreadsheetId,
    sheetId: id,
    sheetName: sheet.getName(),
    columns: columns,
    defaultCarrier: null,
    headerRow: headerPayload.headerRow,
    schemaVersion: SETUP_SCHEMA_VERSION_,
    confidenceByField: confidenceByField,
  };
}

/**
 * @param {number|string} sheetId
 * @return {Object|null} Parsed SavedSheetMapping (normalized) or null
 */
function setup_loadMapping(sheetId) {
  var id = Number(sheetId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var json = DeliveryToolStorage.getMappingJson(spreadsheetId, id);
  if (!json) {
    return null;
  }

  var raw;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(i18n_t('error.mapping_invalid'));
  }

  // Normalize legacy shapes (schema v1 → v2) without breaking stored data.
  var columns = raw.columns && typeof raw.columns === 'object' ? raw.columns : {};

  // Legacy single name column → use as full name when first/last are absent.
  if (columns.customerNameColumn != null) {
    if (columns.customerFullNameColumn == null) {
      columns.customerFullNameColumn = columns.customerNameColumn;
    }
    // Keep customerNameColumn for backward compatibility for any legacy callers.
  }

  // Default carrier: prefer explicit v2 field, then legacy carrierId.
  var defaultCarrier =
    raw.defaultCarrier != null && String(raw.defaultCarrier).trim() !== ''
      ? String(raw.defaultCarrier).trim()
      : raw.carrierId != null && String(raw.carrierId).trim() !== ''
      ? String(raw.carrierId).trim()
      : null;

  // Header row: ensure configurable and >= 1. Legacy mappings defaulted to 1.
  var headerRow =
    raw.headerRow != null && String(raw.headerRow).trim() !== ''
      ? Number(raw.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var sheet = getSheetById_(ss, id);
  var payload = {
    spreadsheetId: spreadsheetId,
    sheetId: id,
    sheetName: sheet ? sheet.getName() : raw.sheetName || '',
    columns: columns,
    defaultCarrier: defaultCarrier,
    headerRow: Math.floor(headerRow),
    schemaVersion: SETUP_SCHEMA_VERSION_,
  };

  // Persist normalized shape so future reads do not need to re-migrate.
  try {
    DeliveryToolStorage.setMappingJson(spreadsheetId, id, JSON.stringify(payload));
  } catch (e2) {
    // Best-effort only.
  }

  return payload;
}

/**
 * Lightweight state used by the setup dialog checklist.
 * @return {{
 *   backendConfigured: boolean,
 *   mappingReady: boolean,
 *   testSent: boolean
 * }}
 */
function setup_getChecklistState() {
  var backendConfigured = false;
  var mappingReady = false;
  var testSent = false;

  // Backend + license: require base URL and a non-error license state. API key is optional.
  try {
    var base = getApiBaseUrl_();
    if (base && String(base).trim() !== '') {
      var lic = typeof license_getSidebarState === 'function' ? license_getSidebarState() : null;
      var st = lic && lic.status;
      backendConfigured = st === 'active' || st === 'trial';
    }
  } catch (e) {
    // Leave backendConfigured as false on error.
  }

  // Mapping: check current sheet for a stored SavedSheetMapping with required columns.
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId = ss.getId();
    var sheet = ss.getActiveSheet();
    var sheetId = sheet.getSheetId();
    var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
    if (mappingJson && String(mappingJson).trim() !== '') {
      var saved = setup_loadMapping(sheetId);
      var cols = saved && saved.columns ? saved.columns : {};
      var required = ['orderIdColumn', 'phoneColumn', 'addressColumn', 'wilayaColumn', 'codColumn'];
      var allPresent = true;
      for (var i = 0; i < required.length; i++) {
        var key = required[i];
        var v = cols[key];
        var n = Number(v);
        if (!isFinite(n) || n < 1) {
          allPresent = false;
          break;
        }
      }
      mappingReady = allPresent;
    } else {
      mappingReady = false;
    }
  } catch (e2) {
    // Leave mappingReady as false on error.
  }

  // Test send: any "send" entry ever recorded for this spreadsheet.
  try {
    var ss2 = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId2 = ss2.getId();
    if (typeof ops_readEntries_ === 'function') {
      var entries = ops_readEntries_(spreadsheetId2);
      if (entries && entries.length) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry && entry.kind === 'send' && entry.attempted > 0) {
            testSent = true;
            break;
          }
        }
      }
    }
  } catch (e3) {
    // Leave testSent as false on error.
  }

  return {
    backendConfigured: backendConfigured,
    mappingReady: mappingReady,
    testSent: testSent,
  };
}

/**
 * @param {Object} mapping SavedSheetMapping-like object from the client
 * @return {Object} Normalized payload that was stored
 */
function setup_saveMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    throw new Error(i18n_t('error.invalid_data'));
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  if (mapping.spreadsheetId !== spreadsheetId) {
    throw new Error(i18n_t('error.wrong_spreadsheet'));
  }
  var sheetId = Number(mapping.sheetId);
  var sheet = getSheetById_(ss, sheetId);
  if (!sheet) {
    throw new Error(i18n_t('error.sheet_not_found'));
  }
  var columns = {};
  if (mapping.columns != null && typeof mapping.columns === 'object') {
    if (Array.isArray(mapping.columns)) {
      throw new Error(i18n_t('error.columns_format_invalid'));
    }
    columns = mapping.columns;
  }
  var carrierRaw =
    mapping.defaultCarrier != null && String(mapping.defaultCarrier).trim() !== ''
      ? String(mapping.defaultCarrier).trim()
      : null;
  var headerRow =
    mapping.headerRow != null && String(mapping.headerRow).trim() !== ''
      ? Number(mapping.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var payload = {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId,
    sheetName: sheet.getName(),
    columns: columns,
    defaultCarrier: carrierRaw,
    headerRow: Math.floor(headerRow),
    schemaVersion: SETUP_SCHEMA_VERSION_,
  };
  var json = JSON.stringify(payload);
  if (json.length > 9000) {
    throw new Error(i18n_t('error.mapping_too_large'));
  }
  DeliveryToolStorage.setMappingJson(spreadsheetId, sheetId, json);
  try {
    setup_learnAliasesFromMapping_(spreadsheetId, sheetId, payload.headerRow, payload.columns);
  } catch (e3) {
    // Learning is best-effort and must never block explicit mapping saves.
  }
  return payload;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {number} sheetId
 * @return {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getSheetById_(ss, sheetId) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * 1-based column index → A, B, …, Z, AA, …
 * @param {number} columnIndexOneBased
 * @return {string}
 */
function columnIndexToLetter_(columnIndexOneBased) {
  var col = columnIndexOneBased;
  var result = '';
  while (col > 0) {
    var remainder = (col - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}
