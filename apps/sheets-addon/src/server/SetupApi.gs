/**
 * @fileoverview Setup wizard API — sheets, headers, save/load mapping (SavedSheetMapping JSON).
 */

var SETUP_SCHEMA_VERSION_ = 2;
var SETUP_ALIAS_SCHEMA_VERSION_ = 1;
var SETUP_ALIAS_KEY_PREFIX_ = "dt.v1.mapAlias.";
var SETUP_AUTODETECT_MIN_SCORE_ = 0.6;
var SETUP_ALIAS_MAX_PER_FIELD_ = 20;
var SETUP_DATE_SCAN_ROW_LIMIT_ = 120;
var SETUP_DATE_SAMPLE_TARGET_ = 40;
var SETUP_DATE_AUTODETECT_MIN_SCORE_ = 0.55;

var SETUP_FIELD_KEYS_ = [
  "orderIdColumn",
  "phoneColumn",
  "addressColumn",
  "wilayaColumn",
  "codColumn",
  "customerFirstNameColumn",
  "customerLastNameColumn",
  "customerFullNameColumn",
  "wilayaCodeColumn",
  "communeColumn",
  "productColumn",
  "quantityColumn",
  "shippingFeeColumn",
  "deliveryTypeColumn",
  "stopDeskIdColumn",
  "statusColumn",
  "carrierColumn",
  "trackingColumn",
  "externalShipmentIdColumn",
  "labelUrlColumn",
  "notesColumn",
  "blacklistColumn",
  "blacklistReasonColumn",
  "orderDateColumn",
];

var SETUP_FIELD_SYNONYMS_ = {
  orderIdColumn: [
    "order id",
    "orderid",
    "order no",
    "order number",
    "order ref",
    "id commande",
    "numero commande",
    "numéro commande",
    "num commande",
    "n commande",
    "n° commande",
    "commande id",
    "ref commande",
    "reference",
    "référence",
    "ref",
    "bon",
    "id",
    "رقم الطلب",
    "رقم الفاتورة",
    "تتبع الطلب",
  ],
  phoneColumn: [
    "phone",
    "telephone",
    "téléphone",
    "tel",
    "mobile",
    "gsm",
    "whatsapp",
    "wa",
    "رقم الهاتف",
    "الهاتف",
    "هاتف",
    "phone1",
    "phone 1",
    "tel client",
  ],
  addressColumn: [
    "address",
    "adresse",
    "adr",
    "adresse livraison",
    "adresse de livraison",
    "delivery address",
    "lieu",
    "destination",
    "localisation",
    "location",
    "عنوان",
    "عنوان التوصيل",
    "مكان التوصيل",
    "العنوان",
  ],
  wilayaColumn: [
    "wilaya",
    "province",
    "state",
    "governorate",
    "ولاية",
    "الولاية",
  ],
  codColumn: [
    "cod",
    "montant",
    "montant cod",
    "amount",
    "amount due",
    "total",
    "total da",
    "total dz",
    "prix",
    "prix total",
    "tarif",
    "prix livraison",
    "قيمة الطلب",
    "المبلغ",
    "المجموع",
    "الثمن",
    "دفع عند الاستلام",
  ],
  customerFirstNameColumn: [
    "first name",
    "firstname",
    "prenom",
    "prénom",
    "given name",
    "الاسم",
    "الاسم الاول",
    "الاسم الأول",
  ],
  customerLastNameColumn: [
    "last name",
    "lastname",
    "nom",
    "family name",
    "surname",
    "nom de famille",
    "اللقب",
    "النسب",
    "اسم العائلة",
  ],
  customerFullNameColumn: [
    "full name",
    "fullname",
    "nom complet",
    "customer name",
    "client name",
    "client",
    "name",
    "nom client",
    "اسم و لقب",
    "الاسم الكامل",
    "اسم الزبون",
  ],
  wilayaCodeColumn: [
    "wilaya code",
    "code wilaya",
    "province code",
    "code province",
    "رقم الولاية",
    "كود الولاية",
  ],
  communeColumn: [
    "commune",
    "district",
    "municipality",
    "city",
    "ville",
    "localite",
    "localité",
    "baladia",
    "بلدية",
    "مدينة",
    "البلدية",
  ],
  productColumn: [
    "product",
    "produit",
    "article",
    "item",
    "designation",
    "description",
    "منتج",
    "المنتج",
    "سلعة",
  ],
  quantityColumn: ["quantity", "qty", "qte", "quantite", "quantité", "الكمية"],
  shippingFeeColumn: [
    "shipping fee",
    "shipping",
    "delivery fee",
    "delivery cost",
    "frais livraison",
    "frais",
    "frais de livraison",
    "سعر التوصيل",
    "رسوم الشحن",
    "تكلفة التوصيل",
  ],
  deliveryTypeColumn: [
    "delivery type",
    "delivery mode",
    "type livraison",
    "mode livraison",
    "livraison",
    "نوع التوصيل",
    "طريقة التوصيل",
  ],
  stopDeskIdColumn: [
    "stopdesk",
    "stop desk",
    "pickup point",
    "pickup",
    "relay",
    "hub",
    "hub id",
    "station",
    "point relais",
    "bureau",
    "مكتب",
    "نقطة الاستلام",
    "desk",
  ],
  statusColumn: [
    "status",
    "statut",
    "etat",
    "état",
    "order status",
    "الحالة",
    "حالة الطلب",
  ],
  carrierColumn: [
    "carrier",
    "transporteur",
    "livreur",
    "delivery company",
    "expediteur",
    "شركة التوصيل",
    "الناقل",
    "شركة الشحن",
  ],
  trackingColumn: [
    "tracking",
    "tracking number",
    "track",
    "track no",
    "suivi",
    "num suivi",
    "n suivi",
    "رقم التتبع",
    "تتبع",
  ],
  externalShipmentIdColumn: [
    "external id",
    "shipment id",
    "parcel id",
    "id expedition",
    "معرف الشحنة",
  ],
  labelUrlColumn: [
    "label",
    "label url",
    "url label",
    "etiquette",
    "étiquette",
    "sticker",
    "bon de livraison",
    "رابط الملصق",
    "رابط البوليصة",
  ],
  notesColumn: [
    "notes",
    "note",
    "comment",
    "comments",
    "remarque",
    "observation",
    "ملاحظات",
    "تعليق",
  ],
  blacklistColumn: [
    "blacklist",
    "liste noire",
    "blocked",
    "black listed",
    "محظور",
    "قائمة سوداء",
  ],
  blacklistReasonColumn: [
    "blacklist reason",
    "raison blacklist",
    "motif blacklist",
    "سبب الحظر",
  ],
  orderDateColumn: [
    "order date",
    "date commande",
    "date de commande",
    "purchase date",
    "date",
    "datetime",
    "date time",
    "date/time",
    "timestamp",
    "created",
    "created at",
    "created on",
    "creation date",
    "date creation",
    "تاريخ الطلب",
    "تاريخ",
    "تاريخ ووقت",
    "تاريخ الطلب والوقت",
  ],
};

/**
 * Static fallback — must match @delivery-tool/carriers registry and OrderEngine.KNOWN_CARRIER_ADAPTER_IDS_
 * @return {Array<{ id: string, label: string }>}
 */
function setup_getCarriersFallback_() {
  return [
    { id: "yalidine", label: "Yalidine" },
    { id: "zr", label: "ZR" },
  ];
}

/**
 * Uses GET /v1/carriers when backend URL is set; on failure returns static list.
 * @return {Array<{ id: string, label: string }>}
 */
function setup_resolveCarriers_() {
  return setup_resolveCarriersWithMeta_().carriers;
}

/**
 * Resolve carriers with resilience metadata for UX messaging.
 * @return {{
 *   carriers: Array<{ id: string, label: string }>,
 *   warning: string|null
 * }}
 */
function setup_resolveCarriersWithMeta_() {
  var fallback = setup_getCarriersFallback_();
  if (!getApiBaseUrl_()) {
    return { carriers: fallback, warning: null };
  }
  try {
    var res = apiJsonGet_("/v1/carriers");
    if (res && res.carriers && res.carriers.length) {
      return {
        carriers: res.carriers.map(function (c) {
          return {
            id: String(c.id),
            label: String(c.label != null ? c.label : c.id),
          };
        }),
        warning: null,
      };
    }
    return {
      carriers: fallback,
      warning: i18n_t("warn.backend_carriers_fallback"),
    };
  } catch (e) {
    var msg = e && e.message ? String(e.message) : String(e);
    return {
      carriers: fallback,
      warning: i18n_format("warn.backend_carriers_fallback_with_reason", msg),
    };
  }
}

/**
 * @return {{
 *   spreadsheetId: string,
 *   sheets: Array<{ sheetId: number, sheetName: string }>,
 *   carriers: Array<{ id: string, label: string }>,
 *   carriersWarning: string|null
 * }}
 */
function setup_getContext() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheets = ss.getSheets().map(function (sh) {
    return { sheetId: sh.getSheetId(), sheetName: sh.getName() };
  });
  var carriersMeta = setup_resolveCarriersWithMeta_();
  return {
    spreadsheetId: spreadsheetId,
    sheets: sheets,
    carriers: carriersMeta.carriers,
    carriersWarning: carriersMeta.warning,
  };
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
    throw new Error(i18n_t("error.sheet_not_found"));
  }
  var headerRow =
    headerRowRaw != null && String(headerRowRaw).trim() !== ""
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
    if (cell === "" || cell === null) {
      return "";
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
      header: headers[c - 1] || "",
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
  var email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    email = "";
  }
  var normalized = email != null ? String(email).trim().toLowerCase() : "";
  if (!normalized) {
    return "anon";
  }
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalized,
    Utilities.Charset.UTF_8,
  );
  var out = "";
  for (var i = 0; i < digest.length; i++) {
    var v = digest[i];
    if (v < 0) v += 256;
    var hex = v.toString(16);
    out += hex.length === 1 ? "0" + hex : hex;
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
    ":" +
    String(sheetId) +
    ":" +
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
    return {
      schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_,
      fields: {},
      updatedAt: null,
    };
  }
  try {
    var parsed = JSON.parse(raw);
    var fields =
      parsed && parsed.fields && typeof parsed.fields === "object"
        ? parsed.fields
        : {};
    return {
      schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_,
      fields: fields,
      updatedAt: parsed && parsed.updatedAt ? String(parsed.updatedAt) : null,
    };
  } catch (e) {
    return {
      schemaVersion: SETUP_ALIAS_SCHEMA_VERSION_,
      fields: {},
      updatedAt: null,
    };
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
  if (s == null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_./|-]+/g, " ")
    .replace(/\s+/g, " ")
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
  if (
    headerNorm.indexOf(termNorm) !== -1 ||
    termNorm.indexOf(headerNorm) !== -1
  ) {
    return 0.92;
  }
  var hTok = headerNorm.split(" ").filter(function (x) {
    return x;
  });
  for (var ti = 0; ti < hTok.length; ti++) {
    if (hTok[ti] === termNorm) {
      return 0.9;
    }
  }
  var h = headerNorm.split(" ").filter(function (x) {
    return x;
  });
  var t = termNorm.split(" ").filter(function (x) {
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
function setup_learnAliasesFromMapping_(
  spreadsheetId,
  sheetId,
  headerRow,
  columns,
) {
  if (!columns || typeof columns !== "object") return;
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
    var arr = Array.isArray(fields[fieldKey])
      ? fields[fieldKey].map(String)
      : [];
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
    throw new Error(i18n_t("error.sheet_not_found"));
  }
  var headerPayload = setup_getHeaders(id, headerRowRaw);
  var cols = headerPayload.columns || [];
  var learned = setup_getLearnedAliases_(spreadsheetId, id);
  var learnedFields = learned.fields || {};
  var usedColumns = {};
  var scored = [];

  SETUP_FIELD_KEYS_.forEach(function (fieldKey) {
    if (fieldKey === "orderDateColumn") {
      return;
    }
    var defaults = Array.isArray(SETUP_FIELD_SYNONYMS_[fieldKey])
      ? SETUP_FIELD_SYNONYMS_[fieldKey]
      : [];
    var userTerms = Array.isArray(learnedFields[fieldKey])
      ? learnedFields[fieldKey]
      : [];
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
      var hn = setup_normalizeHeader_(c.header || "");
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

  var dateCandidate = setup_findLikelyOrderDateColumn_(
    sheet,
    headerPayload.headerRow,
  );
  if (dateCandidate && dateCandidate.col != null) {
    scored.push({
      fieldKey: "orderDateColumn",
      col: dateCandidate.col,
      score: dateCandidate.score,
    });
  }

  scored.sort(function (a, b) {
    return b.score - a.score;
  });

  var columns = {};
  var confidenceByField = {};
  scored.forEach(function (it) {
    var minScore =
      it.fieldKey === "orderDateColumn"
        ? SETUP_DATE_AUTODETECT_MIN_SCORE_
        : SETUP_AUTODETECT_MIN_SCORE_;
    if (it.score < minScore) return;
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
 * @param {Date|null} d
 * @return {boolean}
 */
function setup_isReasonableDateSafe_(d) {
  if (typeof stats_isReasonableOrderDate_ === "function") {
    return stats_isReasonableOrderDate_(d);
  }
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * @param {*} rawValue
 * @param {string} displayValue
 * @return {Date|null}
 */
function setup_tryParseDateCell_(rawValue, displayValue) {
  if (rawValue instanceof Date) {
    return setup_isReasonableDateSafe_(rawValue) ? rawValue : null;
  }

  if (typeof rawValue === "number" && !isNaN(rawValue)) {
    if (rawValue >= 20000 && rawValue <= 80000) {
      var fromSerial = new Date((rawValue - 25569) * 86400 * 1000);
      if (setup_isReasonableDateSafe_(fromSerial)) {
        return fromSerial;
      }
    }
    return null;
  }

  var text =
    displayValue != null && String(displayValue).trim() !== ""
      ? String(displayValue).trim()
      : rawValue != null && rawValue !== ""
        ? String(rawValue).trim()
        : "";
  if (!text) {
    return null;
  }

  if (typeof stats_parseDateString_ === "function") {
    return stats_parseDateString_(text);
  }
  return null;
}

/**
 * Header-only score: how likely is this column to mean "order date"?
 * @param {string} header
 * @return {number}
 */
function setup_scoreOrderDateHeader_(header) {
  var norm = setup_normalizeHeader_(header);
  if (!norm) {
    return 0;
  }

  var score = 0;
  [
    "order date",
    "date commande",
    "date de commande",
    "purchase date",
    "created at",
    "created on",
    "creation date",
    "date creation",
    "datetime",
    "timestamp",
    "تاريخ الطلب",
    "تاريخ ووقت",
  ].forEach(function (term) {
    score = Math.max(score, setup_termScore_(norm, setup_normalizeHeader_(term)));
  });

  if (norm === "date" || norm === "datetime" || norm === "timestamp") {
    score = Math.max(score, 0.95);
  }
  if (/\bdate\b/.test(norm)) {
    score = Math.max(score, 0.86);
  }
  if (
    /\b(created|creation|timestamp|datetime|time)\b/.test(norm) ||
    /تاريخ|وقت/.test(norm)
  ) {
    score = Math.max(score, 0.8);
  }
  if (
    /\b(status|statut|tracking|suivi|phone|telephone|mobile|address|adresse|wilaya|commune|carrier|transporteur|label|note|notes|livraison|delivery)\b/.test(
      norm,
    )
  ) {
    score = Math.max(0, score - 0.12);
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIndex
 * @param {number} headerRow
 * @return {{
 *   col: number,
 *   header: string,
 *   seen: number,
 *   valid: number,
 *   validRatio: number,
 *   headerScore: number,
 *   score: number,
 *   looksLikeDate: boolean
 * }}
 */
function setup_analyzeDateColumn_(sheet, colIndex, headerRow) {
  var col = Number(colIndex);
  var header = "";
  try {
    header =
      col >= 1 && headerRow >= 1
        ? String(sheet.getRange(headerRow, col, 1, 1).getDisplayValue() || "")
        : "";
  } catch (e) {
    header = "";
  }

  if (!Number.isFinite(col) || col < 1) {
    return {
      col: col,
      header: header,
      seen: 0,
      valid: 0,
      validRatio: 0,
      headerScore: setup_scoreOrderDateHeader_(header),
      score: 0,
      looksLikeDate: false,
    };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return {
      col: col,
      header: header,
      seen: 0,
      valid: 0,
      validRatio: 0,
      headerScore: setup_scoreOrderDateHeader_(header),
      score: 0,
      looksLikeDate: false,
    };
  }

  var scanRows = Math.min(SETUP_DATE_SCAN_ROW_LIMIT_, lastRow - headerRow);
  var range = sheet.getRange(headerRow + 1, col, scanRows, 1);
  var values = range.getValues();
  var displays = range.getDisplayValues();
  var seen = 0;
  var valid = 0;

  for (var i = 0; i < values.length; i++) {
    var raw = values[i] && values[i][0];
    var shown = displays[i] && displays[i][0];
    if (
      (raw == null || raw === "") &&
      (shown == null || String(shown).trim() === "")
    ) {
      continue;
    }
    seen++;
    if (setup_tryParseDateCell_(raw, shown)) {
      valid++;
    }
    if (seen >= SETUP_DATE_SAMPLE_TARGET_) {
      break;
    }
  }

  var ratio = seen > 0 ? valid / seen : 0;
  var headerScore = setup_scoreOrderDateHeader_(header);
  var looksLikeDate =
    seen > 0 && valid >= Math.max(2, Math.ceil(seen * 0.4));
  if (!looksLikeDate && seen > 0 && valid === seen && valid >= 2) {
    looksLikeDate = true;
  }

  var score = looksLikeDate
    ? ratio * 0.75 + headerScore * 0.25
    : ratio * 0.45 + headerScore * 0.15;
  if (looksLikeDate && headerScore === 0 && ratio >= 0.9 && valid >= 4) {
    score = Math.max(score, 0.72);
  }
  if (!looksLikeDate && valid === 0 && headerScore >= 0.85) {
    score = Math.min(score, 0.25);
  }

  return {
    col: col,
    header: header,
    seen: seen,
    valid: valid,
    validRatio: Number(ratio.toFixed(3)),
    headerScore: headerScore,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(3)),
    looksLikeDate: looksLikeDate,
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @return {{ col: number, header: string, seen: number, valid: number, validRatio: number, headerScore: number, score: number, looksLikeDate: boolean }|null}
 */
function setup_findLikelyOrderDateColumn_(sheet, headerRow) {
  var lastCol = sheet.getLastColumn();
  var best = null;
  for (var col = 1; col <= lastCol; col++) {
    var candidate = setup_analyzeDateColumn_(sheet, col, headerRow);
    if (!candidate.looksLikeDate) {
      continue;
    }
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.headerScore > best.headerScore) ||
      (candidate.score === best.score && candidate.valid > best.valid) ||
      (candidate.score === best.score && candidate.col < best.col)
    ) {
      best = candidate;
    }
  }

  if (!best || best.score < SETUP_DATE_AUTODETECT_MIN_SCORE_) {
    return null;
  }
  return best;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIndex
 * @param {number} headerRow
 * @return {boolean}
 */
function setup_columnLooksLikeDate_(sheet, colIndex, headerRow) {
  return !!setup_analyzeDateColumn_(sheet, colIndex, headerRow).looksLikeDate;
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
    throw new Error(i18n_t("error.mapping_invalid"));
  }

  if (!raw || typeof raw !== "object") {
    throw new Error(i18n_t("error.mapping_invalid"));
  }

  // Normalize legacy shapes (schema v1 → v2) without breaking stored data.
  var columns =
    raw.columns && typeof raw.columns === "object" ? raw.columns : {};

  // Legacy single name column → use as full name when first/last are absent.
  if (columns.customerNameColumn != null) {
    if (columns.customerFullNameColumn == null) {
      columns.customerFullNameColumn = columns.customerNameColumn;
    }
    // Keep customerNameColumn for backward compatibility for any legacy callers.
  }

  // Default carrier: prefer explicit v2 field, then legacy carrierId.
  var defaultCarrier =
    raw.defaultCarrier != null && String(raw.defaultCarrier).trim() !== ""
      ? String(raw.defaultCarrier).trim()
      : raw.carrierId != null && String(raw.carrierId).trim() !== ""
        ? String(raw.carrierId).trim()
        : null;

  // Header row: ensure configurable and >= 1. Legacy mappings defaulted to 1.
  var headerRow =
    raw.headerRow != null && String(raw.headerRow).trim() !== ""
      ? Number(raw.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var sheet = getSheetById_(ss, id);
  var payload = {
    spreadsheetId: spreadsheetId,
    sheetId: id,
    sheetName: sheet ? sheet.getName() : raw.sheetName || "",
    columns: columns,
    defaultCarrier: defaultCarrier,
    headerRow: Math.floor(headerRow),
    schemaVersion: SETUP_SCHEMA_VERSION_,
  };

  // Persist normalized shape so future reads do not need to re-migrate.
  try {
    DeliveryToolStorage.setMappingJson(
      spreadsheetId,
      id,
      JSON.stringify(payload),
    );
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
    if (base && String(base).trim() !== "") {
      var lic =
        typeof license_getSidebarState === "function"
          ? license_getSidebarState()
          : null;
      var st = lic && lic.status;
      backendConfigured = st === "active" || st === "trial";
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
    var mappingJson = DeliveryToolStorage.getMappingJson(
      spreadsheetId,
      sheetId,
    );
    if (mappingJson && String(mappingJson).trim() !== "") {
      var saved = setup_loadMapping(sheetId);
      var cols = saved && saved.columns ? saved.columns : {};
      var required = [
        "orderIdColumn",
        "phoneColumn",
        "addressColumn",
        "wilayaColumn",
        "codColumn",
      ];
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
      if (allPresent) {
        var fullN = cols.customerFullNameColumn;
        var firstN = cols.customerFirstNameColumn;
        var lastN = cols.customerLastNameColumn;
        var nameOk =
          (fullN != null &&
            String(fullN).trim() !== "" &&
            isFinite(Number(fullN)) &&
            Number(fullN) >= 1) ||
          (firstN != null &&
            String(firstN).trim() !== "" &&
            isFinite(Number(firstN)) &&
            Number(firstN) >= 1) ||
          (lastN != null &&
            String(lastN).trim() !== "" &&
            isFinite(Number(lastN)) &&
            Number(lastN) >= 1);
        if (!nameOk) {
          allPresent = false;
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
    if (typeof ops_readEntries_ === "function") {
      var entries = ops_readEntries_(spreadsheetId2);
      if (entries && entries.length) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry && entry.kind === "send" && entry.attempted > 0) {
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
  if (!mapping || typeof mapping !== "object") {
    throw new Error(i18n_t("error.invalid_data"));
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  if (mapping.spreadsheetId !== spreadsheetId) {
    throw new Error(i18n_t("error.wrong_spreadsheet"));
  }
  var sheetId = Number(mapping.sheetId);
  var sheet = getSheetById_(ss, sheetId);
  if (!sheet) {
    throw new Error(i18n_t("error.sheet_not_found"));
  }
  var columns = {};
  if (mapping.columns != null && typeof mapping.columns === "object") {
    if (Array.isArray(mapping.columns)) {
      throw new Error(i18n_t("error.columns_format_invalid"));
    }
    columns = mapping.columns;
  }
  var carrierRaw =
    mapping.defaultCarrier != null &&
    String(mapping.defaultCarrier).trim() !== ""
      ? String(mapping.defaultCarrier).trim()
      : null;
  var headerRow =
    mapping.headerRow != null && String(mapping.headerRow).trim() !== ""
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
    throw new Error(i18n_t("error.mapping_too_large"));
  }
  DeliveryToolStorage.setMappingJson(spreadsheetId, sheetId, json);
  try {
    setup_learnAliasesFromMapping_(
      spreadsheetId,
      sheetId,
      payload.headerRow,
      payload.columns,
    );
  } catch (e3) {
    // Learning is best-effort and must never block explicit mapping saves.
  }
  try {
    if (typeof mobile_ensureOnEditTriggerForSpreadsheet_ === 'function') {
      mobile_ensureOnEditTriggerForSpreadsheet_(ss);
    }
    if (typeof mobile_refreshCompanionArtifactsForSheet_ === 'function') {
      mobile_refreshCompanionArtifactsForSheet_(ss, sheet, payload);
    }
  } catch (e4) {
    // Companion sheets/charts are best-effort and should not block mapping saves.
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
  var result = "";
  while (col > 0) {
    var remainder = (col - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}
