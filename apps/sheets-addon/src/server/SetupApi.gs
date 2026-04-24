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
var SETUP_VALUE_SCAN_ROW_LIMIT_ = 80;
var SETUP_VALUE_SAMPLE_TARGET_ = 24;
var SETUP_CARRIERS_CACHE_KEY_ = "dt.v1.carriers.cache";
var SETUP_CARRIERS_CACHE_TTL_MS_ = 10 * 60 * 1000;
var SETUP_CARRIERS_FAIL_COOLDOWN_MS_ = 2 * 60 * 1000;

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
    "order_id",
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
    "id order",
    "num cmd",
    "numero cmd",
    "orderid client",
    "id colis",
    "bon",
    "id",
    "رقم الطلب",
    "رقم الفاتورة",
    "تتبع الطلب",
  ],
  phoneColumn: [
    "phone",
    "phone number",
    "phone_number",
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
    "contact phone",
    "contact_phone",
    "numero telephone",
    "num tel",
    "tel client",
  ],
  addressColumn: [
    "address",
    "adress",
    "adresse",
    "adr",
    "adrs",
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
    "to wilaya",
    "to wilaya name",
    "to_wilaya_name",
    "destination wilaya",
    "wilaya destination",
    "province",
    "state",
    "governorate",
    "ولاية",
    "الولاية",
  ],
  codColumn: [
    "cod",
    "cash on delivery",
    "cashondelivery",
    "payment on delivery",
    "montant",
    "montant cod",
    "amount",
    "amount due",
    "total",
    "total da",
    "total dz",
    "prix",
    "price",
    "price da",
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
    "first_name",
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
    "last_name",
    "familyname",
    "family_name",
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
    "full_name",
    "nom complet",
    "customer name",
    "recipient name",
    "receiver name",
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
    "to commune",
    "to commune name",
    "to_commune_name",
    "commune destination",
    "nom commune",
    "nom de la commune",
    "district",
    "municipality",
    "daira",
    "daïra",
    "daira name",
    "city",
    "city name",
    "ville",
    "localite",
    "localité",
    "locality",
    "destination city",
    "baladia",
    "baladya",
    "baladiya",
    "baladiah",
    "baldia",
    "baladeya",
    "badlaya",
    "badalia",
    "baldiya",
    "baldya",
    "laville",
    "l ville",
    "بلدية",
    "بلديه",
    "مدينة",
    "البلدية",
    "البلديه",
    "المدينة",
    "المحلة",
    "المنطقة",
    "دائرة",
    "الدائرة",
  ],
  productColumn: [
    "product",
    "product list",
    "product_list",
    "produit",
    "article",
    "item",
    "designation",
    "description",
    "منتج",
    "المنتج",
    "سلعة",
  ],
  quantityColumn: ["quantity", "qty", "qte", "quantite", "quantité", "qte.", "nbr", "الكمية", "عدد"],
  shippingFeeColumn: [
    "shipping fee",
    "shipping_fee",
    "shipping",
    "delivery fee",
    "delivery_fee",
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
    "deliverytype",
    "delivery mode type",
    "is stopdesk",
    "is_stopdesk",
    "delivery mode",
    "l livrasion",
    "l livraison",
    "l livrason",
    "LIVRASION",
    "livrasion col",
    "type livraison",
    "type de livraison",
    "mode livraison",
    "mode de livraison",
    "livraison type",
    "livraison",
    "livrasion",
    "livrason",
    "type livrasion",
    "type de livrasion",
    "mode livrasion",
    "mode de livrasion",
    "نوع التوصيل",
    "طريقة التوصيل",
    "نوع التسليم",
    "طريقة التسليم",
    "نمط التوصيل",
  ],
  stopDeskIdColumn: [
    "stopdesk",
    "stopdesk id",
    "stopdesk_id",
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
    "point relais id",
  ],
  statusColumn: [
    "status",
    "last status",
    "last_status",
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
    "societe de livraison",
    "société de livraison",
    "societe livraison",
    "expediteur",
    "شركة التوصيل",
    "الناقل",
    "شركة الشحن",
  ],
  trackingColumn: [
    "tracking",
    "tracking_number",
    "tracking number",
    "track",
    "track no",
    "suivi",
    "num suivi",
    "n suivi",
    "رقم التتبع",
    "رقم الشحنة",
    "تتبع",
  ],
  externalShipmentIdColumn: [
    "external id",
    "shipment id",
    "parcel id",
    "import id",
    "import_id",
    "id expedition",
    "معرف الشحنة",
  ],
  labelUrlColumn: [
    "label",
    "labels",
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
    { id: "noest", label: "NOEST" },
  ];
}

/**
 * @return {{
 *   atMs: number,
 *   baseUrl: string,
 *   success: boolean,
 *   carriers: Array<{ id: string, label: string }>,
 *   warning: string|null
 * }|null}
 */
function setup_getCarriersCache_() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty(
      SETUP_CARRIERS_CACHE_KEY_,
    );
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      atMs: Number(parsed.atMs) || 0,
      baseUrl:
        parsed.baseUrl != null && String(parsed.baseUrl).trim() !== ""
          ? String(parsed.baseUrl).trim()
          : "",
      success: !!parsed.success,
      carriers: Array.isArray(parsed.carriers) ? parsed.carriers : [],
      warning:
        parsed.warning != null && String(parsed.warning).trim() !== ""
          ? String(parsed.warning)
          : null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * @param {{
 *   atMs: number,
 *   baseUrl: string,
 *   success: boolean,
 *   carriers: Array<{ id: string, label: string }>,
 *   warning: string|null
 * }} payload
 */
function setup_setCarriersCache_(payload) {
  try {
    var json = JSON.stringify(payload || {});
    if (json.length > 9000) return;
    PropertiesService.getUserProperties().setProperty(
      SETUP_CARRIERS_CACHE_KEY_,
      json,
    );
  } catch (e) {}
}

/**
 * @param {string} msg
 * @return {boolean}
 */
function setup_isLikelyEndpointOfflineMessage_(msg) {
  var t = String(msg || "").toLowerCase();
  if (!t) return false;
  return (
    t.indexOf("err_ngrok_3200") >= 0 ||
    t.indexOf("endpoint") >= 0 && t.indexOf("offline") >= 0 ||
    t.indexOf("timed out") >= 0 ||
    t.indexOf("dns") >= 0 ||
    t.indexOf("enotfound") >= 0 ||
    t.indexOf("could not resolve host") >= 0 ||
    t.indexOf("failed to connect") >= 0 ||
    t.indexOf("service unavailable") >= 0
  );
}

/**
 * @param {string} msg
 * @return {boolean}
 */
function setup_isMissingExternalRequestPermissionMessage_(msg) {
  var t = String(msg || "").toLowerCase();
  if (!t) return false;
  return (
    t.indexOf("script.external_request") >= 0 ||
    t.indexOf("insufficient permissions") >= 0 ||
    t.indexOf("required permissions") >= 0 ||
    t.indexOf("autorisations requises") >= 0 ||
    t.indexOf("autorisations specifiees ne sont pas suffisantes") >= 0
  );
}

/**
 * @param {Array<{ id: string, label: string }>} rows
 * @return {Array<{ id: string, label: string }>}
 */
function setup_normalizeCarriersList_(rows) {
  var out = [];
  var seen = {};
  (rows || []).forEach(function (c) {
    var id = c && c.id != null ? String(c.id).trim() : "";
    if (!id) return;
    var key = id.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    var label = c && c.label != null ? String(c.label).trim() : "";
    out.push({
      id: id,
      label: label || id,
    });
  });
  return out;
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
  var baseUrl = getApiBaseUrl_();
  if (!baseUrl) {
    return { carriers: fallback, warning: null };
  }
  var now = Date.now();
  var cached = setup_getCarriersCache_();
  if (
    cached &&
    cached.baseUrl === baseUrl &&
    Number.isFinite(cached.atMs) &&
    cached.atMs > 0
  ) {
    if (cached.success && now - cached.atMs < SETUP_CARRIERS_CACHE_TTL_MS_) {
      var cachedCarriers = setup_normalizeCarriersList_(cached.carriers);
      return {
        carriers: cachedCarriers.length ? cachedCarriers : fallback,
        warning: null,
      };
    }
    if (
      !cached.success &&
      now - cached.atMs < SETUP_CARRIERS_FAIL_COOLDOWN_MS_
    ) {
      return {
        carriers: fallback,
        warning: cached.warning || i18n_t("warn.backend_carriers_fallback"),
      };
    }
  }
  try {
    var res = apiJsonGet_("/v1/carriers");
    var normalized = setup_normalizeCarriersList_(res && res.carriers);
    if (normalized.length) {
      setup_setCarriersCache_({
        atMs: now,
        baseUrl: baseUrl,
        success: true,
        carriers: normalized,
        warning: null,
      });
      return { carriers: normalized, warning: null };
    }
    setup_setCarriersCache_({
      atMs: now,
      baseUrl: baseUrl,
      success: false,
      carriers: fallback,
      warning: i18n_t("warn.backend_carriers_fallback"),
    });
    return {
      carriers: fallback,
      warning: i18n_t("warn.backend_carriers_fallback"),
    };
  } catch (e) {
    var msg = e && e.message ? String(e.message) : String(e);
    var warning = null;
    if (setup_isMissingExternalRequestPermissionMessage_(msg)) {
      warning = i18n_t("warn.backend_carriers_auth_required");
    } else if (setup_isLikelyEndpointOfflineMessage_(msg)) {
      warning = i18n_t("warn.backend_carriers_fallback");
    } else {
      warning = i18n_format("warn.backend_carriers_fallback_with_reason", msg);
    }
    setup_setCarriersCache_({
      atMs: now,
      baseUrl: baseUrl,
      success: false,
      carriers: fallback,
      warning: warning,
    });
    return {
      carriers: fallback,
      warning: warning,
    };
  }
}

/**
 * @return {{
 *   spreadsheetId: string,
 *   sheets: Array<{ sheetId: number, sheetName: string }>,
 *   carriers: Array<{ id: string, label: string }>,
 *   carriersWarning: string|null,
 *   preferredSidebarSheetId: number|null
 * }}
 */
function setup_getContext() {
  if (typeof license_assertOperationsAllowed_ === "function") {
    license_assertOperationsAllowed_();
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ownership =
    typeof ownership_assertCurrentSpreadsheetOwnedByActiveUser_ === "function"
      ? ownership_assertCurrentSpreadsheetOwnedByActiveUser_()
      : null;
  var spreadsheetId = ss.getId();
  var sheets = ss.getSheets().map(function (sh) {
    return { sheetId: sh.getSheetId(), sheetName: sh.getName() };
  });
  var carriersMeta = setup_resolveCarriersWithMeta_();
  var preferred = null;
  try {
    var rawPref = DeliveryToolStorage.getSidebarSheetPreference(
      spreadsheetId,
    );
    if (rawPref != null && Number.isFinite(rawPref) && rawPref >= 1) {
      for (var si = 0; si < sheets.length; si++) {
        if (sheets[si].sheetId === rawPref) {
          preferred = rawPref;
          break;
        }
      }
    }
  } catch (ePref) {
    preferred = null;
  }
  return {
    spreadsheetId: spreadsheetId,
    sheets: sheets,
    carriers: carriersMeta.carriers,
    carriersWarning: carriersMeta.warning,
    preferredSidebarSheetId: preferred,
    ownership: ownership,
  };
}

/**
 * Remember which worksheet the user selected in the sidebar (not the active tab).
 * @param {number|string} sheetId
 * @return {{ ok: boolean }}
 */
function setup_setSidebarSheetPreference(sheetId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var id = Number(sheetId);
  if (!Number.isFinite(id) || id < 1) {
    DeliveryToolStorage.setSidebarSheetPreference(spreadsheetId, null);
    return { ok: true };
  }
  var sheet = getSheetById_(ss, id);
  if (!sheet) {
    throw new Error(i18n_t("error.sheet_not_found"));
  }
  DeliveryToolStorage.setSidebarSheetPreference(spreadsheetId, id);
  return { ok: true };
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
  if (typeof license_assertOperationsAllowed_ === "function") {
    license_assertOperationsAllowed_();
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof ownership_assertCurrentSpreadsheetOwnedByActiveUser_ === "function") {
    ownership_assertCurrentSpreadsheetOwnedByActiveUser_();
  }
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
    .replace(/[()[\]{}:;,+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} s
 * @return {string}
 */
function setup_compactToken_(s) {
  return String(s || "").replace(/\s+/g, "");
}

/**
 * Bounded Levenshtein distance used for typo-tolerant header matching.
 * Returns maxDistance+1 when distance is above the bound.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance
 * @return {number}
 */
function setup_levenshteinBounded_(a, b, maxDistance) {
  if (a === b) return 0;
  var al = a.length;
  var bl = b.length;
  if (!al) return bl <= maxDistance ? bl : maxDistance + 1;
  if (!bl) return al <= maxDistance ? al : maxDistance + 1;
  if (Math.abs(al - bl) > maxDistance) return maxDistance + 1;

  var prev = [];
  var cur = [];
  for (var j = 0; j <= bl; j++) {
    prev[j] = j;
  }
  for (var i = 1; i <= al; i++) {
    cur[0] = i;
    var rowMin = cur[0];
    var from = Math.max(1, i - maxDistance);
    var to = Math.min(bl, i + maxDistance);

    for (var p = 1; p < from; p++) {
      cur[p] = maxDistance + 1;
    }
    for (var k = from; k <= to; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      var del = prev[k] + 1;
      var ins = cur[k - 1] + 1;
      var sub = prev[k - 1] + cost;
      var v = Math.min(del, ins, sub);
      cur[k] = v;
      if (v < rowMin) rowMin = v;
    }
    for (var q = to + 1; q <= bl; q++) {
      cur[q] = maxDistance + 1;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    var tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[bl];
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
  var hCompact = setup_compactToken_(headerNorm);
  var tCompact = setup_compactToken_(termNorm);
  if (hCompact && tCompact && hCompact === tCompact) {
    return 0.95;
  }
  if (
    hCompact &&
    tCompact &&
    hCompact.length >= 5 &&
    tCompact.length >= 5
  ) {
    var maxLen = Math.max(hCompact.length, tCompact.length);
    var typoBound = maxLen >= 10 ? 2 : 1;
    var typoDistance = setup_levenshteinBounded_(
      hCompact,
      tCompact,
      typoBound,
    );
    if (typoDistance <= typoBound) {
      return typoDistance <= 1 ? 0.82 : 0.74;
    }
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
 * @param {string} fieldKey
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @return {Array<string>}
 */
function setup_collectTermsForField_(fieldKey, spreadsheetId, sheetId) {
  var defaults = Array.isArray(SETUP_FIELD_SYNONYMS_[fieldKey])
    ? SETUP_FIELD_SYNONYMS_[fieldKey]
    : [];
  var learned = setup_getLearnedAliases_(spreadsheetId, sheetId);
  var learnedFields = learned && learned.fields ? learned.fields : {};
  var userTerms = Array.isArray(learnedFields[fieldKey])
    ? learnedFields[fieldKey]
    : [];
  var seen = {};
  var out = [];
  defaults.concat(userTerms).forEach(function (raw) {
    var n = setup_normalizeHeader_(raw);
    if (!n || seen[n]) return;
    seen[n] = true;
    out.push(n);
  });
  return out;
}

/**
 * @param {string} headerNorm
 * @return {boolean}
 */
function setup_headerLooksCommuneLike_(headerNorm) {
  var hn = String(headerNorm || "");
  return /commune|district|municipality|city|ville|daira|daïra|localite|locality|balad|badlay|baldia|بلدي|بلديه|مدينة|دائرة|منطقة|محلة/.test(
    hn,
  );
}

/**
 * @param {string} fieldKey
 * @param {string} headerNorm
 * @param {Array<string>} terms
 * @return {number}
 */
function setup_scoreHeaderForField_(fieldKey, headerNorm, terms) {
  if (!headerNorm) return 0;
  var best = 0;
  (terms || []).forEach(function (term) {
    var s = setup_termScore_(headerNorm, term);
    if (s > best) best = s;
  });

  var looksCommune = setup_headerLooksCommuneLike_(headerNorm);
  var looksWilaya = /wilaya|province|governorate|ولاية/.test(headerNorm);
  var looksAddress = /address|adresse|adr|عنوان|مكان/.test(headerNorm);

  if (fieldKey === "communeColumn") {
    if (looksCommune) best = Math.max(best, 0.92);
    if (looksWilaya) best = Math.max(0, best - 0.2);
  } else if (fieldKey === "wilayaColumn") {
    if (looksWilaya) best = Math.max(best, 0.93);
    if (looksCommune) best = Math.max(0, best - 0.28);
  } else if (fieldKey === "addressColumn") {
    if (looksAddress) best = Math.max(best, 0.92);
    if (looksWilaya || looksCommune) best = Math.max(0, best - 0.14);
  }

  return Number(Math.max(0, Math.min(1, best)).toFixed(3));
}

/**
 * @param {string} fieldKey
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Array<string>} terms
 * @param {Object<number, boolean>} blockedCols
 * @param {number} minScore
 * @return {{ col: number, score: number }|null}
 */
function setup_pickBestColumnForField_(
  fieldKey,
  columnsMeta,
  terms,
  blockedCols,
  minScore,
) {
  var bestCol = null;
  var bestScore = 0;
  (columnsMeta || []).forEach(function (c) {
    var col = Number(c && c.index);
    if (!Number.isFinite(col) || col < 1) return;
    if (blockedCols && blockedCols[col]) return;
    var hn = setup_normalizeHeader_(c && c.header ? c.header : "");
    if (!hn) return;
    var score = setup_scoreHeaderForField_(fieldKey, hn, terms);
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  });
  if (bestCol == null || bestScore < (Number(minScore) || SETUP_AUTODETECT_MIN_SCORE_)) {
    return null;
  }
  return { col: bestCol, score: Number(bestScore.toFixed(3)) };
}

/**
 * @param {string} headerNorm
 * @return {boolean}
 */
function setup_headerLooksCarrier_(headerNorm) {
  var hn = String(headerNorm || "");
  return /carrier|transporteur|livreur|delivery company|societe de livraison|societe livraison|expediteur|شركة التوصيل|شركة الشحن|الناقل/.test(
    hn,
  );
}

/**
 * @param {string} headerNorm
 * @return {boolean}
 */
function setup_headerLooksDeliveryType_(headerNorm) {
  var hn = String(headerNorm || "");
  return /delivery|livraison|livrasion|livrason|l\s*livrasion|l\s*livraison|livrasion|LIVRASION|stopdesk|pickup|relay|relais|bureau|office|point relais|نوع التوصيل|طريقة التوصيل|نوع التسليم|طريقة التسليم|نمط التوصيل|التوصيل/.test(
    hn,
  );
}

/**
 * @param {*} raw
 * @return {boolean}
 */
function setup_isPlaceholderValue_(raw) {
  var t = setup_normalizeHeader_(raw);
  return (
    !t ||
    /^0+$/.test(t) ||
    t === "null" ||
    t === "undefined" ||
    t === "none" ||
    t === "aucun" ||
    t === "n a" ||
    t === "na" ||
    t === "-"
  );
}

/**
 * @param {*} raw
 * @return {string}
 */
function setup_explicitDeliveryTypeToken_(raw) {
  var normalized =
    typeof order_normalizeDeliveryText_ === "function"
      ? order_normalizeDeliveryText_(raw)
      : setup_normalizeHeader_(raw);
  if (!normalized) {
    return "";
  }
  if (normalized.indexOf("للمكتب") !== -1) {
    return "pickup-point";
  }
  if (
    normalized.indexOf("للمنزل") !== -1 ||
    normalized.indexOf("المنزل") !== -1
  ) {
    return "home";
  }
  if (
    typeof ORDER_DELIVERY_PICKUP_TERMS_ === "object" &&
    ORDER_DELIVERY_PICKUP_TERMS_[normalized]
  ) {
    return "pickup-point";
  }
  if (
    typeof ORDER_DELIVERY_HOME_TERMS_ === "object" &&
    ORDER_DELIVERY_HOME_TERMS_[normalized]
  ) {
    return "home";
  }
  if (
    typeof ORDER_DELIVERY_PICKUP_HINT_RE_ !== "undefined" &&
    ORDER_DELIVERY_PICKUP_HINT_RE_ &&
    ORDER_DELIVERY_PICKUP_HINT_RE_.test(normalized)
  ) {
    return "pickup-point";
  }
  if (
    typeof ORDER_DELIVERY_HOME_HINT_RE_ !== "undefined" &&
    ORDER_DELIVERY_HOME_HINT_RE_ &&
    ORDER_DELIVERY_HOME_HINT_RE_.test(normalized)
  ) {
    return "home";
  }
  return "";
}

/**
 * @param {*} raw
 * @return {boolean}
 */
function setup_isCarrierLikeValue_(raw) {
  if (raw == null || String(raw).trim() === "") {
    return false;
  }
  if (typeof resolveCarrierAlias_ === "function" && resolveCarrierAlias_(raw)) {
    return true;
  }
  var n = setup_normalizeHeader_(raw);
  return (
    n === "zr" ||
    n === "zr express" ||
    n === "yalidine" ||
    n === "yallidine" ||
    n === "noest" ||
    n === "nouest" ||
    n === "guepex" ||
    n === "carrier" ||
    n === "transporteur" ||
    n === "livreur"
  );
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} colIndex
 * @param {number} headerRow
 * @return {{
 *   col: number,
 *   header: string,
 *   headerNorm: string,
 *   seen: number,
 *   deliveryHits: number,
 *   carrierHits: number,
 *   deliveryRatio: number,
 *   carrierRatio: number
 * }}
 */
function setup_analyzeSmartColumn_(sheet, colIndex, headerRow) {
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
  var headerNorm = setup_normalizeHeader_(header);
  if (!Number.isFinite(col) || col < 1) {
    return {
      col: col,
      header: header,
      headerNorm: headerNorm,
      seen: 0,
      deliveryHits: 0,
      carrierHits: 0,
      deliveryRatio: 0,
      carrierRatio: 0,
    };
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return {
      col: col,
      header: header,
      headerNorm: headerNorm,
      seen: 0,
      deliveryHits: 0,
      carrierHits: 0,
      deliveryRatio: 0,
      carrierRatio: 0,
    };
  }
  var scanRows = Math.min(SETUP_VALUE_SCAN_ROW_LIMIT_, lastRow - headerRow);
  var values = sheet.getRange(headerRow + 1, col, scanRows, 1).getDisplayValues();
  var seen = 0;
  var deliveryHits = 0;
  var carrierHits = 0;
  for (var i = 0; i < values.length; i++) {
    var shown = values[i] && values[i][0];
    if (setup_isPlaceholderValue_(shown)) {
      continue;
    }
    seen++;
    if (setup_explicitDeliveryTypeToken_(shown)) {
      deliveryHits++;
    }
    if (setup_isCarrierLikeValue_(shown)) {
      carrierHits++;
    }
    if (seen >= SETUP_VALUE_SAMPLE_TARGET_) {
      break;
    }
  }
  return {
    col: col,
    header: header,
    headerNorm: headerNorm,
    seen: seen,
    deliveryHits: deliveryHits,
    carrierHits: carrierHits,
    deliveryRatio: seen > 0 ? Number((deliveryHits / seen).toFixed(3)) : 0,
    carrierRatio: seen > 0 ? Number((carrierHits / seen).toFixed(3)) : 0,
  };
}

/**
 * @param {string} fieldKey
 * @param {{ headerNorm: string, seen: number, deliveryRatio: number, carrierRatio: number }} analysis
 * @param {Array<string>} terms
 * @return {number}
 */
function setup_scoreSmartColumnForField_(fieldKey, analysis, terms) {
  var a = analysis || {};
  var headerNorm = String(a.headerNorm || "");
  var headerScore = setup_scoreHeaderForField_(fieldKey, headerNorm, terms || []);
  var seen = Number(a.seen || 0);
  var deliveryRatio = Number(a.deliveryRatio || 0);
  var carrierRatio = Number(a.carrierRatio || 0);
  var score = headerScore;

  if (fieldKey === "deliveryTypeColumn") {
    if (seen >= 4) {
      score = headerScore * 0.55 + deliveryRatio * 0.45;
      if (deliveryRatio === 0 && headerScore >= 0.88) {
        score = Math.min(score, 0.54);
      }
    } else {
      score = Math.max(headerScore, deliveryRatio);
    }
    if (setup_headerLooksDeliveryType_(headerNorm) && deliveryRatio >= 0.45) {
      score = Math.max(score, 0.95);
    } else if (deliveryRatio >= 0.75) {
      score = Math.max(score, 0.9);
    }
  } else if (fieldKey === "carrierColumn") {
    if (seen >= 4) {
      score = headerScore * 0.55 + carrierRatio * 0.45;
      if (carrierRatio === 0 && headerScore >= 0.88) {
        score = Math.min(score, 0.52);
      }
    } else {
      score = Math.max(headerScore, carrierRatio);
    }
    if (setup_headerLooksCarrier_(headerNorm) && carrierRatio >= 0.45) {
      score = Math.max(score, 0.94);
    } else if (setup_headerLooksCarrier_(headerNorm)) {
      score = Math.max(score, 0.9);
    } else if (carrierRatio >= 0.75) {
      score = Math.max(score, 0.88);
    }
  } else if (fieldKey === "addressColumn") {
    if (setup_headerLooksCarrier_(headerNorm) || carrierRatio >= 0.6) {
      score = Math.max(0, score - 0.75);
    }
    if (setup_headerLooksDeliveryType_(headerNorm) || deliveryRatio >= 0.6) {
      score = Math.max(0, score - 0.65);
    }
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

/**
 * @param {string} fieldKey
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Array<string>} terms
 * @param {Object<number, boolean>} blockedCols
 * @param {number} minScore
 * @param {Object<number, Object>} analysisByCol
 * @return {{ col: number, score: number }|null}
 */
function setup_pickBestSmartColumnForField_(
  fieldKey,
  columnsMeta,
  terms,
  blockedCols,
  minScore,
  analysisByCol,
) {
  var bestCol = null;
  var bestScore = 0;
  (columnsMeta || []).forEach(function (c) {
    var col = Number(c && c.index);
    if (!Number.isFinite(col) || col < 1) return;
    if (blockedCols && blockedCols[col]) return;
    var analysis = analysisByCol && analysisByCol[col] ? analysisByCol[col] : null;
    if (!analysis) return;
    var score = setup_scoreSmartColumnForField_(fieldKey, analysis, terms || []);
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  });
  if (bestCol == null || bestScore < (Number(minScore) || SETUP_AUTODETECT_MIN_SCORE_)) {
    return null;
  }
  return { col: bestCol, score: Number(bestScore.toFixed(3)) };
}

/**
 * @param {string} fieldKey
 * @return {number}
 */
function setup_smartFieldMinScore_(fieldKey) {
  if (fieldKey === "deliveryTypeColumn" || fieldKey === "carrierColumn") {
    return 0.55;
  }
  return SETUP_AUTODETECT_MIN_SCORE_;
}

/**
 * @param {string} fieldKey
 * @return {number}
 */
function setup_smartFieldReplaceMargin_(fieldKey) {
  if (fieldKey === "deliveryTypeColumn") {
    return 0.12;
  }
  if (fieldKey === "addressColumn") {
    return 0.1;
  }
  return 0.08;
}

/**
 * True when the mapped address column is clearly a carrier / shipping-company field
 * or its cells are mostly carrier names (e.g. NOEST), not street addresses.
 *
 * @param {number} addrCol
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Object<number, Object>} analysisByCol
 * @return {boolean}
 */
function setup_addressColumnLooksLikeCarrierSlot_(
  addrCol,
  columnsMeta,
  analysisByCol,
) {
  var col = Number(addrCol);
  if (!Number.isFinite(col) || col < 1) {
    return false;
  }
  var headerNorm = "";
  for (var i = 0; i < (columnsMeta || []).length; i++) {
    if (Number(columnsMeta[i].index) === col) {
      headerNorm = setup_normalizeHeader_(columnsMeta[i].header || "");
      break;
    }
  }
  if (setup_headerLooksCarrier_(headerNorm)) {
    return true;
  }
  var a = analysisByCol && analysisByCol[col] ? analysisByCol[col] : null;
  if (!a || Number(a.seen || 0) < 3) {
    return false;
  }
  var cr = Number(a.carrierRatio || 0);
  var dr = Number(a.deliveryRatio || 0);
  return cr >= 0.28 && dr <= 0.14;
}

/**
 * When address is bound to a carrier column and no good replacement exists, clear it
 * so saves do not persist a broken mapping. Otherwise pick a better column.
 *
 * @param {Object<string, number>} out
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Object<string, Array<string>>} termsByField
 * @param {Object<number, Object>} analysisByCol
 * @param {Object<string, number>} confidenceByField
 */
function setup_stripCarrierColumnFromAddress_(
  out,
  columnsMeta,
  termsByField,
  analysisByCol,
  confidenceByField,
) {
  var addrCol = Number(out && out.addressColumn);
  if (!Number.isFinite(addrCol) || addrCol < 1) {
    return;
  }
  if (
    !setup_addressColumnLooksLikeCarrierSlot_(
      addrCol,
      columnsMeta,
      analysisByCol,
    )
  ) {
    return;
  }
  var terms = (termsByField && termsByField.addressColumn) || [];
  var blocked = {};
  Object.keys(out || {}).forEach(function (key) {
    if (key === "addressColumn") {
      return;
    }
    var n = Number(out[key]);
    if (Number.isFinite(n) && n >= 1) {
      blocked[n] = true;
    }
  });
  var picked = setup_pickBestSmartColumnForField_(
    "addressColumn",
    columnsMeta,
    terms,
    blocked,
    0.4,
    analysisByCol,
  );
  if (picked && picked.col !== addrCol) {
    out.addressColumn = picked.col;
    confidenceByField.addressColumn = picked.score;
    return;
  }
  var pickedHdr = setup_pickBestColumnForField_(
    "addressColumn",
    columnsMeta,
    terms,
    blocked,
    0.4,
  );
  if (pickedHdr && pickedHdr.col !== addrCol) {
    out.addressColumn = pickedHdr.col;
    confidenceByField.addressColumn = pickedHdr.score;
    return;
  }
  out.addressColumn = null;
  delete confidenceByField.addressColumn;
}

/**
 * If the mapped delivery-type column has almost no home/office tokens but another
 * column does (e.g. WooCommerce "DELIVERY MODE" vs Arabic LIVRASION), switch.
 *
 * @param {Object<string, number>} out
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Object<string, Array<string>>} termsByField
 * @param {Object<number, Object>} analysisByCol
 * @param {Object<string, number>} confidenceByField
 */
function setup_upgradeDeliveryTypeIfWeakSignal_(
  out,
  columnsMeta,
  termsByField,
  analysisByCol,
  confidenceByField,
) {
  var dtCol = Number(out && out.deliveryTypeColumn);
  if (!Number.isFinite(dtCol) || dtCol < 1) {
    return;
  }
  var cur = analysisByCol && analysisByCol[dtCol] ? analysisByCol[dtCol] : null;
  if (!cur || Number(cur.seen || 0) < 4) {
    return;
  }
  var curDr = Number(cur.deliveryRatio || 0);
  if (curDr >= 0.2) {
    return;
  }
  var terms = (termsByField && termsByField.deliveryTypeColumn) || [];
  var blocked = {};
  Object.keys(out || {}).forEach(function (key) {
    if (key === "deliveryTypeColumn") {
      return;
    }
    var n = Number(out[key]);
    if (Number.isFinite(n) && n >= 1) {
      blocked[n] = true;
    }
  });
  var bestCol = null;
  var bestRatio = 0;
  var bestScore = 0;
  (columnsMeta || []).forEach(function (c) {
    var col = Number(c && c.index);
    if (!Number.isFinite(col) || col < 1 || blocked[col]) {
      return;
    }
    var a = analysisByCol && analysisByCol[col] ? analysisByCol[col] : null;
    if (!a || Number(a.seen || 0) < 4) {
      return;
    }
    var dr = Number(a.deliveryRatio || 0);
    if (dr < 0.32) {
      return;
    }
    var sc = setup_scoreSmartColumnForField_(
      "deliveryTypeColumn",
      a,
      terms,
    );
    if (dr > bestRatio || (dr === bestRatio && sc > bestScore)) {
      bestRatio = dr;
      bestScore = sc;
      bestCol = col;
    }
  });
  if (
    bestCol != null &&
    bestCol !== dtCol &&
    bestRatio >= curDr + 0.18 &&
    bestRatio >= 0.32
  ) {
    out.deliveryTypeColumn = bestCol;
    confidenceByField.deliveryTypeColumn = Math.max(
      confidenceByField.deliveryTypeColumn || 0,
      bestScore,
    );
  }
}

/**
 * Yalidine can operate from a single BALADIA-like destination column.
 * If commune is the only trustworthy location field, reuse it for address and
 * wilaya instead of forcing unrelated columns from the same tab.
 *
 * @param {string} carrierId
 * @param {Object<string, number>} out
 * @param {Array<{ index: number, letter: string, header: string }>} columnsMeta
 * @param {Object<string, Array<string>>} termsByField
 * @param {Object<number, Object>} analysisByCol
 * @param {Object<string, number>} confidenceByField
 */
function setup_allowCommuneColumnFallback_(
  carrierId,
  out,
  columnsMeta,
  termsByField,
  analysisByCol,
  confidenceByField,
) {
  if (carrierId !== "yalidine") {
    return;
  }
  var communeCol = Number(out && out.communeColumn);
  if (!Number.isFinite(communeCol) || communeCol < 1) {
    return;
  }

  function headerNormForCol_(col) {
    var n = Number(col);
    if (!Number.isFinite(n) || n < 1) {
      return "";
    }
    for (var i = 0; i < (columnsMeta || []).length; i++) {
      if (Number(columnsMeta[i].index) === n) {
        return setup_normalizeHeader_(columnsMeta[i].header || "");
      }
    }
    return "";
  }

  var communeHeaderNorm = headerNormForCol_(communeCol);
  if (!communeHeaderNorm || !setup_headerLooksCommuneLike_(communeHeaderNorm)) {
    return;
  }

  function fieldLooksWeak_(fieldKey, rawCol) {
    var col = Number(rawCol);
    if (!Number.isFinite(col) || col < 1) {
      return true;
    }
    if (col === communeCol) {
      return false;
    }
    var headerNorm = headerNormForCol_(col);
    if (!headerNorm) {
      return true;
    }
    if (fieldKey === "addressColumn") {
      if (
        setup_addressColumnLooksLikeCarrierSlot_(
          col,
          columnsMeta,
          analysisByCol,
        ) ||
        setup_headerLooksDeliveryType_(headerNorm)
      ) {
        return true;
      }
    }
    var score = setup_scoreHeaderForField_(
      fieldKey,
      headerNorm,
      (termsByField && termsByField[fieldKey]) || [],
    );
    return score < 0.45;
  }

  if (fieldLooksWeak_("addressColumn", out.addressColumn)) {
    out.addressColumn = communeCol;
    confidenceByField.addressColumn = Math.max(
      confidenceByField.addressColumn || 0,
      0.46,
    );
  }
  if (fieldLooksWeak_("wilayaColumn", out.wilayaColumn)) {
    out.wilayaColumn = communeCol;
    confidenceByField.wilayaColumn = Math.max(
      confidenceByField.wilayaColumn || 0,
      0.46,
    );
  }
}

/**
 * Carrier-aware repair for commonly confused columns.
 * Keeps user choices when valid, fixes clear conflicts, and upgrades weak
 * header-only guesses using sampled cell values (delivery/carrier-like columns).
 *
 * @param {string} spreadsheetId
 * @param {number} sheetId
 * @param {{ headerRow: number, columns: Array<{ index: number, letter: string, header: string }> }} headerPayload
 * @param {string|null} carrierIdRaw
 * @param {Object<string, number>} rawColumns
 * @return {{ columns: Object<string, number>, confidenceByField: Object<string, number> }}
 */
function setup_repairColumnsForCarrier_(
  spreadsheetId,
  sheetId,
  headerPayload,
  carrierIdRaw,
  rawColumns,
) {
  var carrierId =
    carrierIdRaw != null && String(carrierIdRaw).trim() !== ""
      ? String(carrierIdRaw).trim().toLowerCase()
      : "";
  var out = {};
  Object.keys(rawColumns || {}).forEach(function (k) {
    var n = Number(rawColumns[k]);
    if (Number.isFinite(n) && n >= 1) {
      out[k] = Math.floor(n);
    }
  });

  var columnsMeta = (headerPayload && headerPayload.columns) || [];
  var termsByField = {
    addressColumn: setup_collectTermsForField_(
      "addressColumn",
      spreadsheetId,
      sheetId,
    ),
    wilayaColumn: setup_collectTermsForField_(
      "wilayaColumn",
      spreadsheetId,
      sheetId,
    ),
    communeColumn: setup_collectTermsForField_(
      "communeColumn",
      spreadsheetId,
      sheetId,
    ),
    deliveryTypeColumn: setup_collectTermsForField_(
      "deliveryTypeColumn",
      spreadsheetId,
      sheetId,
    ),
    carrierColumn: setup_collectTermsForField_(
      "carrierColumn",
      spreadsheetId,
      sheetId,
    ),
  };
  var analysisByCol = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetById_(ss, Number(sheetId));
    var headerRow =
      headerPayload && Number(headerPayload.headerRow) >= 1
        ? Number(headerPayload.headerRow)
        : 1;
    if (sheet) {
      columnsMeta.forEach(function (c) {
        var col = Number(c && c.index);
        if (!Number.isFinite(col) || col < 1 || analysisByCol[col]) return;
        analysisByCol[col] = setup_analyzeSmartColumn_(sheet, col, headerRow);
      });
    }
  } catch (eSmartCols) {
    analysisByCol = {};
  }
  var confidenceByField = {};
  var core = ["addressColumn", "wilayaColumn", "communeColumn"];
  var fieldPriority = {
    communeColumn: 3,
    wilayaColumn: 2,
    addressColumn: 1,
  };

  // De-duplicate core fields when they point to the same column.
  var colToFields = {};
  core.forEach(function (f) {
    var c = Number(out[f]);
    if (!Number.isFinite(c) || c < 1) return;
    if (!colToFields[c]) colToFields[c] = [];
    colToFields[c].push(f);
  });
  Object.keys(colToFields).forEach(function (colKey) {
    var same = colToFields[colKey] || [];
    if (same.length < 2) return;
    var col = Number(colKey);
    var headerNorm = "";
    for (var i = 0; i < columnsMeta.length; i++) {
      if (Number(columnsMeta[i].index) === col) {
        headerNorm = setup_normalizeHeader_(columnsMeta[i].header || "");
        break;
      }
    }
    var keep = same[0];
    var keepScore = -1;
    same.forEach(function (f) {
      var s = setup_scoreHeaderForField_(f, headerNorm, termsByField[f] || []);
      var p = fieldPriority[f] || 0;
      if (s > keepScore || (s === keepScore && p > (fieldPriority[keep] || 0))) {
        keep = f;
        keepScore = s;
      }
    });
    same.forEach(function (f) {
      if (f !== keep) delete out[f];
    });
    if (keepScore >= 0) {
      confidenceByField[keep] = Number(keepScore.toFixed(3));
    }
  });

  // BALADIA / commune-like headers should map to commune first.
  if (
    (!out.communeColumn || Number(out.communeColumn) < 1) &&
    ((out.wilayaColumn && Number(out.wilayaColumn) >= 1) ||
      (out.addressColumn && Number(out.addressColumn) >= 1))
  ) {
    var candidateFromOther = ["wilayaColumn", "addressColumn"];
    for (var ci = 0; ci < candidateFromOther.length; ci++) {
      var fk = candidateFromOther[ci];
      var colNum = Number(out[fk]);
      if (!Number.isFinite(colNum) || colNum < 1) continue;
      var hn = "";
      for (var z = 0; z < columnsMeta.length; z++) {
        if (Number(columnsMeta[z].index) === colNum) {
          hn = setup_normalizeHeader_(columnsMeta[z].header || "");
          break;
        }
      }
      if (hn && setup_headerLooksCommuneLike_(hn)) {
        out.communeColumn = colNum;
        delete out[fk];
        confidenceByField.communeColumn = Math.max(
          confidenceByField.communeColumn || 0,
          0.92,
        );
        break;
      }
    }
  }

  var requireCommune =
    carrierId === "yalidine" || carrierId === "zr" || carrierId === "noest";
  var usedCore = {};
  core.forEach(function (f) {
    var c = Number(out[f]);
    if (Number.isFinite(c) && c >= 1) usedCore[c] = true;
  });
  ["communeColumn", "wilayaColumn", "addressColumn"].forEach(function (f) {
    var c = Number(out[f]);
    if (Number.isFinite(c) && c >= 1) return;
    var minScore =
      f === "communeColumn" && requireCommune
        ? 0.45
        : SETUP_AUTODETECT_MIN_SCORE_;
    var picked = setup_pickBestColumnForField_(
      f,
      columnsMeta,
      termsByField[f] || [],
      usedCore,
      minScore,
    );
    if (!picked) return;
    out[f] = picked.col;
    confidenceByField[f] = picked.score;
    usedCore[picked.col] = true;
  });

  ["addressColumn", "deliveryTypeColumn", "carrierColumn"].forEach(function (f) {
    var minScore = setup_smartFieldMinScore_(f);
    var blocked = {};
    Object.keys(out).forEach(function (key) {
      if (key === f) return;
      var n = Number(out[key]);
      if (Number.isFinite(n) && n >= 1) {
        blocked[n] = true;
      }
    });

    var currentCol = Number(out[f]);
    var currentScore = -1;
    if (Number.isFinite(currentCol) && currentCol >= 1) {
      var currentAnalysis = analysisByCol[currentCol] || null;
      if (currentAnalysis) {
        currentScore = setup_scoreSmartColumnForField_(
          f,
          currentAnalysis,
          termsByField[f] || [],
        );
      } else {
        currentScore = 0;
      }
    }

    var picked = setup_pickBestSmartColumnForField_(
      f,
      columnsMeta,
      termsByField[f] || [],
      blocked,
      minScore,
      analysisByCol,
    );
    if (!picked) return;

    if (!Number.isFinite(currentCol) || currentCol < 1) {
      out[f] = picked.col;
      confidenceByField[f] = picked.score;
      return;
    }
    if (picked.col === currentCol) {
      confidenceByField[f] = Math.max(confidenceByField[f] || 0, picked.score);
      return;
    }

    var replaceMargin = setup_smartFieldReplaceMargin_(f);
    if (
      currentScore < minScore ||
      picked.score >= currentScore + replaceMargin
    ) {
      out[f] = picked.col;
      confidenceByField[f] = picked.score;
    }
  });

  try {
    setup_stripCarrierColumnFromAddress_(
      out,
      columnsMeta,
      termsByField,
      analysisByCol,
      confidenceByField,
    );
  } catch (eStripAddr) {
    // Best-effort repair only.
  }
  try {
    setup_upgradeDeliveryTypeIfWeakSignal_(
      out,
      columnsMeta,
      termsByField,
      analysisByCol,
      confidenceByField,
    );
  } catch (eUpgradeDt) {
    // Best-effort repair only.
  }
  try {
    setup_allowCommuneColumnFallback_(
      carrierId,
      out,
      columnsMeta,
      termsByField,
      analysisByCol,
      confidenceByField,
    );
  } catch (eCommuneFallback) {
    // Best-effort repair only.
  }

  return {
    columns: out,
    confidenceByField: confidenceByField,
  };
}

/**
 * Carrier-aware smart suggestion:
 * - starts from generic header auto-detect,
 * - merges current mapping where present,
 * - repairs destination column ambiguity (address/wilaya/commune).
 *
 * @param {number|string} sheetId
 * @param {number|string=} headerRowRaw
 * @param {string|null=} carrierIdRaw
 * @param {Object<string, number>=} currentColumnsRaw
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
function setup_getCarrierAwareSuggestedMapping(
  sheetId,
  headerRowRaw,
  carrierIdRaw,
  currentColumnsRaw,
) {
  var id = Number(sheetId);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheet = getSheetById_(ss, id);
  if (!sheet) {
    throw new Error(i18n_t("error.sheet_not_found"));
  }

  var generic = setup_getSuggestedMapping(id, headerRowRaw);
  var headerPayload = setup_getHeaders(id, generic.headerRow);
  var mergedColumns = {};
  var currentColumns =
    currentColumnsRaw &&
    typeof currentColumnsRaw === "object" &&
    !Array.isArray(currentColumnsRaw)
      ? currentColumnsRaw
      : {};
  Object.keys(currentColumns).forEach(function (k) {
    var n = Number(currentColumns[k]);
    if (Number.isFinite(n) && n >= 1) {
      mergedColumns[k] = Math.floor(n);
    }
  });
  Object.keys(generic.columns || {}).forEach(function (k) {
    if (mergedColumns[k] == null || String(mergedColumns[k]).trim() === "") {
      mergedColumns[k] = generic.columns[k];
    }
  });

  var normalizedCarrier =
    carrierIdRaw != null && String(carrierIdRaw).trim() !== ""
      ? String(carrierIdRaw).trim().toLowerCase()
      : generic.defaultCarrier != null &&
          String(generic.defaultCarrier).trim() !== ""
        ? String(generic.defaultCarrier).trim().toLowerCase()
        : null;

  var repaired = setup_repairColumnsForCarrier_(
    spreadsheetId,
    id,
    headerPayload,
    normalizedCarrier,
    mergedColumns,
  );

  var confidenceByField = {};
  var gcbf = generic.confidenceByField || {};
  Object.keys(gcbf).forEach(function (k) {
    confidenceByField[k] = gcbf[k];
  });
  var rcbf = repaired.confidenceByField || {};
  Object.keys(rcbf).forEach(function (k) {
    confidenceByField[k] = rcbf[k];
  });

  return {
    spreadsheetId: spreadsheetId,
    sheetId: id,
    sheetName: sheet.getName(),
    columns: repaired.columns || {},
    defaultCarrier: normalizedCarrier,
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
 * @param {number|string=} sheetIdRaw Optional sheet id to inspect instead of active/preferred
 * @return {{
 *   backendConfigured: boolean,
 *   mappingReady: boolean,
 *   testSent: boolean
 * }}
 */
function setup_getChecklistState(sheetIdRaw) {
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
    var explicitSheetId = Number(sheetIdRaw);
    var sheet =
      Number.isFinite(explicitSheetId) && explicitSheetId >= 1
        ? getSheetById_(ss, explicitSheetId)
        : null;
    if (!sheet) {
      var preferredSheetId = DeliveryToolStorage.getSidebarSheetPreference(
        spreadsheetId,
      );
      if (preferredSheetId != null) {
        sheet = getSheetById_(ss, preferredSheetId);
      }
    }
    if (!sheet) {
      sheet = ss.getActiveSheet();
    }
    var sheetId = sheet.getSheetId();
    var mappingJson = DeliveryToolStorage.getMappingJson(
      spreadsheetId,
      sheetId,
    );
    if (mappingJson && String(mappingJson).trim() !== "") {
      var saved = setup_loadMapping(sheetId);
      var cols = saved && saved.columns ? saved.columns : {};
      var carrierId =
        saved && saved.defaultCarrier != null
          ? String(saved.defaultCarrier).trim().toLowerCase()
          : "";
      var required = [
        "orderIdColumn",
        "phoneColumn",
        "addressColumn",
        "wilayaColumn",
        "codColumn",
      ];
      if (
        carrierId === "yalidine" ||
        carrierId === "zr" ||
        carrierId === "noest"
      ) {
        required.push("communeColumn");
      }
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
      if (allPresent) {
        var addrCol = Number(cols.addressColumn);
        var wilCol = Number(cols.wilayaColumn);
        var comCol = Number(cols.communeColumn);
        var allowSingleCommuneFallback = carrierId === "yalidine";
        if (
          Number.isFinite(addrCol) &&
          addrCol >= 1 &&
          Number.isFinite(wilCol) &&
          wilCol >= 1 &&
          Number.isFinite(comCol) &&
          comCol >= 1 &&
          addrCol === wilCol &&
          wilCol === comCol &&
          !allowSingleCommuneFallback
        ) {
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
 * @param {Object<string, *>} columnsRaw
 * @return {Object<string, number>}
 */
function setup_normalizeMappedColumns_(columnsRaw) {
  var out = {};
  Object.keys(columnsRaw || {}).forEach(function (k) {
    var n = Number(columnsRaw[k]);
    if (Number.isFinite(n) && n >= 1) {
      out[k] = Math.floor(n);
    }
  });
  return out;
}

/**
 * Merge user-explicit mapping with smart suggestions.
 * Explicit user choices are preserved by default; smart suggestions fill blanks.
 * High-confidence smart corrections are allowed for known error-prone fields.
 *
 * @param {Object<string, number>} explicitColumns
 * @param {Object<string, *>} smartColumns
 * @param {Object<string, number>=} confidenceByField
 * @return {Object<string, number>}
 */
function setup_mergeExplicitAndSmartColumns_(
  explicitColumns,
  smartColumns,
  confidenceByField,
) {
  var out = setup_normalizeMappedColumns_(explicitColumns || {});
  var conf =
    confidenceByField && typeof confidenceByField === "object"
      ? confidenceByField
      : {};
  var smart = smartColumns && typeof smartColumns === "object" ? smartColumns : {};
  var SMART_OVERRIDE_MIN = 0.88;
  var smartOverrideFields = {
    addressColumn: true,
    deliveryTypeColumn: true,
    carrierColumn: true,
  };

  Object.keys(smart).forEach(function (k) {
    var suggestedRaw = smart[k];
    if (suggestedRaw === null) {
      delete out[k];
      return;
    }
    var suggested = Number(suggestedRaw);
    if (!Number.isFinite(suggested) || suggested < 1) {
      return;
    }
    suggested = Math.floor(suggested);
    var current = Number(out[k]);
    if (!Number.isFinite(current) || current < 1) {
      out[k] = suggested;
      return;
    }
    if (current === suggested) {
      return;
    }
    var score = Number(conf[k]);
    if (
      smartOverrideFields[k] &&
      Number.isFinite(score) &&
      score >= SMART_OVERRIDE_MIN
    ) {
      out[k] = suggested;
    }
  });
  return out;
}

/**
 * @param {Object} mapping SavedSheetMapping-like object from the client
 * @return {Object} Normalized payload that was stored
 */
function setup_saveMapping(mapping) {
  if (!mapping || typeof mapping !== "object") {
    throw new Error(i18n_t("error.invalid_data"));
  }
  if (typeof license_assertOperationsAllowed_ === "function") {
    license_assertOperationsAllowed_();
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (typeof ownership_assertCurrentSpreadsheetOwnedByActiveUser_ === "function") {
    ownership_assertCurrentSpreadsheetOwnedByActiveUser_();
  }
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
  var explicitColumns = setup_normalizeMappedColumns_(columns);
  columns = explicitColumns;
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
  headerRow = Math.floor(headerRow);

  // Smart carrier-aware repair:
  // - preserve user mapping where valid
  // - fix clear destination conflicts (address/wilaya/commune duplicates)
  // - auto-fill missing core fields using header intelligence
  try {
    var smart = setup_getCarrierAwareSuggestedMapping(
      sheetId,
      headerRow,
      carrierRaw,
      columns,
    );
    if (smart && smart.columns && typeof smart.columns === "object") {
      columns = setup_mergeExplicitAndSmartColumns_(
        explicitColumns,
        smart.columns,
        smart.confidenceByField,
      );
    }
  } catch (eSmart) {
    // Best-effort only: explicit save must still work if smart heuristics fail.
  }

  var payload = {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId,
    sheetName: sheet.getName(),
    columns: columns,
    defaultCarrier: carrierRaw,
    headerRow: headerRow,
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
  } catch (e4) {
    // Trigger install is best-effort and must not block mapping saves.
  }
  try {
    // Enforce dropdown choices for provider + status right after mapping save.
    if (
      typeof lists_applyCarrierAndStatusColumnValidationForSheet_ === 'function'
    ) {
      // Keep mapping saves fast on large sheets; mobile/onEdit will re-apply if missing.
      var maxApplyRows = Math.min(600, Math.max(sheet.getLastRow() - payload.headerRow, 1));
      lists_applyCarrierAndStatusColumnValidationForSheet_(
        ss,
        sheet,
        payload,
        false,
        typeof lists_getCarrierDropdownLabels_ === 'function'
          ? lists_getCarrierDropdownLabels_()
          : [],
        typeof lists_getStatusDropdownLabels_ === 'function'
          ? lists_getStatusDropdownLabels_()
          : [],
        maxApplyRows,
      );
    }
  } catch (e5) {
    // Dropdown setup is best-effort and must not block mapping save.
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
