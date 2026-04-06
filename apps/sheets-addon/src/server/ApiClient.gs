/**

 * @fileoverview HTTP helpers for backend API (UrlFetchApp).

 */

var API_ENDPOINT_COOLDOWN_KEY_ = "dt.api.endpointCooldown";
var API_ENDPOINT_COOLDOWN_MS_ = 2 * 60 * 1000;

/**

 * Headers for authenticated requests (UserProperties API key, optional).

 * @return {Object<string,string>}

 */

function apiAuthHeaders_() {
  var headers = {
    // Prevent ngrok free-tier interstitial HTML page from replacing API JSON.
    "ngrok-skip-browser-warning": "1",
  };
  var key = getUserApiKey_();

  if (!key) {
    return headers;
  }

  // Locked checklist: always send API key in X-API-Key.
  headers["X-API-Key"] = String(key);
  return headers;
}

/**

 * Shipment access token from last licence validation (when server uses LICENSE_SIGNING_SECRET).

 * @return {string}

 */

function getLicenseAccessTokenFromCache_() {
  var raw = DeliveryToolStorage.getLicenseCacheJson();

  if (!raw) {
    return "";
  }

  try {
    var rec = JSON.parse(raw);

    if (
      rec &&
      rec.accessToken != null &&
      String(rec.accessToken).trim() !== ""
    ) {
      return String(rec.accessToken).trim();
    }
  } catch (e) {
    /* ignore */
  }

  return "";
}

/**
 * @return {{ baseUrl: string, untilMs: number, reason: string }|null}
 */
function api_getEndpointCooldown_() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty(
      API_ENDPOINT_COOLDOWN_KEY_,
    );
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    var untilMs = Number(parsed.untilMs) || 0;
    var baseUrl =
      parsed.baseUrl != null && String(parsed.baseUrl).trim() !== ""
        ? String(parsed.baseUrl).trim()
        : "";
    var reason =
      parsed.reason != null && String(parsed.reason).trim() !== ""
        ? String(parsed.reason)
        : "";
    if (!baseUrl || !Number.isFinite(untilMs) || untilMs <= 0) return null;
    return {
      baseUrl: baseUrl,
      untilMs: untilMs,
      reason: reason,
    };
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} reason
 */
function api_setEndpointCooldown_(baseUrl, reason) {
  try {
    if (!baseUrl) return;
    var payload = {
      baseUrl: String(baseUrl).trim(),
      untilMs: Date.now() + API_ENDPOINT_COOLDOWN_MS_,
      reason: reason != null ? String(reason) : "",
    };
    var json = JSON.stringify(payload);
    if (json.length > 4000) return;
    PropertiesService.getUserProperties().setProperty(
      API_ENDPOINT_COOLDOWN_KEY_,
      json,
    );
  } catch (e) {}
}

/**
 * @param {string} baseUrl
 */
function api_clearEndpointCooldown_(baseUrl) {
  try {
    var cur = api_getEndpointCooldown_();
    if (!cur) return;
    if (!baseUrl || cur.baseUrl === String(baseUrl).trim()) {
      PropertiesService.getUserProperties().deleteProperty(
        API_ENDPOINT_COOLDOWN_KEY_,
      );
    }
  } catch (e) {}
}

/**
 * @param {string} msg
 * @return {boolean}
 */
function api_isLikelyEndpointOfflineMessage_(msg) {
  var t = String(msg || "").toLowerCase();
  if (!t) return false;
  return (
    t.indexOf("err_ngrok_3200") >= 0 ||
    t.indexOf("endpoint") >= 0 && t.indexOf("offline") >= 0 ||
    t.indexOf("timed out") >= 0 ||
    t.indexOf("deadline exceeded") >= 0 ||
    t.indexOf("service unavailable") >= 0 ||
    t.indexOf("enotfound") >= 0 ||
    t.indexOf("dns") >= 0 ||
    t.indexOf("unable to resolve host") >= 0 ||
    t.indexOf("could not resolve host") >= 0 ||
    t.indexOf("failed to connect") >= 0 ||
    t.indexOf("connection reset") >= 0
  );
}

/**
 * @param {string} msg
 * @return {boolean}
 */
function api_isMissingExternalRequestPermissionMessage_(msg) {
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
 * @param {string} baseUrl
 */
function api_throwIfEndpointCoolingDown_(baseUrl) {
  var cd = api_getEndpointCooldown_();
  if (!cd) return;
  if (cd.baseUrl !== String(baseUrl || "").trim()) return;
  var now = Date.now();
  if (cd.untilMs <= now) {
    api_clearEndpointCooldown_(baseUrl);
    return;
  }
  var sec = Math.max(1, Math.ceil((cd.untilMs - now) / 1000));
  throw new Error(i18n_format("error.endpoint_temporarily_unreachable", sec));
}

/**

 * GET JSON from path.

 * @param {string} path Absolute path starting with /

 * @return {Object}

 */

function apiJsonGet_(path) {
  var base = getApiBaseUrl_();

  if (!base) {
    throw new Error(i18n_t("error.backend_url_missing"));
  }
  api_throwIfEndpointCoolingDown_(base);

  var url = base + path;

  var options = {
    method: "get",

    muteHttpExceptions: true,

    headers: apiAuthHeaders_(),
  };

  return fetchWithRetry_(url, options, base);
}

/**

 * POST JSON and parse JSON response.

 * @param {string} path Absolute path starting with /

 * @param {Object} body JSON-serializable object

 * @return {Object}

 */

function apiJsonPost_(path, body) {
  var base = getApiBaseUrl_();

  if (!base) {
    throw new Error(i18n_t("error.backend_url_missing"));
  }
  api_throwIfEndpointCoolingDown_(base);

  var url = base + path;

  var headers = Object.assign(
    { "Content-Type": "application/json" },

    apiAuthHeaders_(),
  );

  if (path.indexOf("/v1/shipments/") === 0) {
    var dtTok = null;
    if (typeof license_getAccessToken_ === "function") {
      dtTok = license_getAccessToken_();
    }
    if (!dtTok) {
      dtTok = getLicenseAccessTokenFromCache_();
    }
    if (dtTok) {
      headers["X-DT-Access-Token"] = dtTok;
    }
  }

  var options = {
    method: "post",

    muteHttpExceptions: true,

    payload: JSON.stringify(body || {}),

    headers: headers,
  };

  return fetchWithRetry_(url, options, base);
}

function fetchWithRetry_(url, options, baseUrl) {
  var maxAttempts = 5;
  var baseDelayMs = 750;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    var res;
    try {
      res = UrlFetchApp.fetch(url, options);
    } catch (fetchErr) {
      var fetchMsg =
        fetchErr && fetchErr.message ? String(fetchErr.message) : String(fetchErr);
      if (api_isMissingExternalRequestPermissionMessage_(fetchMsg)) {
        throw new Error(i18n_t("error.external_request_permission_required"));
      }
      if (api_isLikelyEndpointOfflineMessage_(fetchMsg)) {
        api_setEndpointCooldown_(baseUrl, fetchMsg);
      }
      throw new Error(fetchMsg);
    }
    var code = res.getResponseCode();
    if (code !== 429) {
      try {
        var parsed = parseApiResponse_(res);
        api_clearEndpointCooldown_(baseUrl);
        return parsed;
      } catch (parseErr) {
        var msg =
          parseErr && parseErr.message ? String(parseErr.message) : String(parseErr);
        if (api_isLikelyEndpointOfflineMessage_(msg)) {
          api_setEndpointCooldown_(baseUrl, msg);
        }
        throw parseErr;
      }
    }
    if (attempt === maxAttempts) {
      try {
        return parseApiResponse_(res);
      } catch (parseErr2) {
        var msg2 =
          parseErr2 && parseErr2.message
            ? String(parseErr2.message)
            : String(parseErr2);
        if (api_isLikelyEndpointOfflineMessage_(msg2)) {
          api_setEndpointCooldown_(baseUrl, msg2);
        }
        throw parseErr2;
      }
    }
    // Exponential backoff with cap.
    var delay = Math.min(8000, baseDelayMs * Math.pow(2, attempt - 1));
    Utilities.sleep(delay);
  }
  // Unreachable, but keep linter quiet.
  return {};
}

/**

 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} res

 * @return {Object}

 */

function parseApiResponse_(res) {
  var code = res.getResponseCode();

  var text = res.getContentText();

  if (code < 200 || code >= 300) {
    var msg = i18n_format("error.api_http", code);

    try {
      var errJson = JSON.parse(text);

      if (errJson && typeof errJson === "object") {
        if (errJson.message && typeof errJson.message === "string") {
          msg = String(errJson.message);
        } else if (errJson.error) {
          if (typeof errJson.error === "string") {
            msg = String(errJson.error);
          } else if (errJson.error && typeof errJson.error === "object" && errJson.error.message) {
            msg = String(errJson.error.message);
          } else {
            try {
              msg = JSON.stringify(errJson.error);
            } catch (e2) {
              msg = String(errJson.error);
            }
          }
        } else if (errJson.code) {
          msg = String(errJson.code);
        }
      }
    } catch (e) {
      if (text) {
        msg = msg + ": " + text.slice(0, 180);
      }
    }

    throw new Error(msg);
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    var trimmed = String(text || "").trim();
    if (trimmed && trimmed.charAt(0) === "<") {
      throw new Error(i18n_t("error.api_invalid_json_html"));
    }
    throw new Error(i18n_t("error.api_invalid_json"));
  }
}
