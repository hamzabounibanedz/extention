/**
 * @fileoverview Carrier API keys per Google account (UserProperties) — never stored in the sheet.
 * Forwarded to the backend as `credentials` on send/tracking (not logged server-side).
 */

var DT_CARRIER_CREDS_KEY_ = "dt.carrierCredentials.v1";

/**
 * @param {Object<string, unknown>|null|undefined} obj
 * @param {string[]} keys
 * @return {string}
 */
function carrierCreds_pickFirst_(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return "";
  }
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!k) continue;
    var v = obj[k];
    if (v != null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

/**
 * @param {Object<string, unknown>|null|undefined} row
 * @return {string}
 */
function carrierCreds_getZrSecret_(row) {
  return carrierCreds_pickFirst_(row, ["secretKey", "apiKey", "secret"]);
}

/**
 * @param {Object<string, unknown>|null|undefined} row
 * @return {string}
 */
function carrierCreds_getYalidineApiId_(row) {
  return carrierCreds_pickFirst_(row, ["apiId", "id"]);
}

/**
 * @param {Object<string, unknown>|null|undefined} row
 * @return {string}
 */
function carrierCreds_getYalidineApiToken_(row) {
  return carrierCreds_pickFirst_(row, ["apiToken", "token", "apiKey"]);
}

/**
 * Yalidine accepts either:
 * - apiId|apiToken
 * - apiId:apiToken
 * - JSON: {"apiId":"...","apiToken":"..."}
 * - apiToken alone (apiId reused from existing value)
 *
 * @param {string} rawInput
 * @param {Object<string, unknown>|null|undefined} existingRow
 * @return {{ apiId: string, apiToken: string }}
 */
function carrierCreds_parseYalidineInput_(rawInput, existingRow) {
  var text = rawInput != null ? String(rawInput).trim() : "";
  var existingId = carrierCreds_getYalidineApiId_(existingRow);
  var existingToken = carrierCreds_getYalidineApiToken_(existingRow);
  if (!text) {
    return { apiId: "", apiToken: "" };
  }

  if (text.charAt(0) === "{") {
    try {
      var parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        var parsedId = carrierCreds_pickFirst_(parsed, ["apiId", "id", "api_id"]);
        var parsedToken = carrierCreds_pickFirst_(parsed, [
          "apiToken",
          "token",
          "api_token",
          "apiKey",
        ]);
        return {
          apiId: parsedId || existingId,
          apiToken: parsedToken || existingToken,
        };
      }
    } catch (e) {
      // Fall back to other formats.
    }
  }

  var sep = text.indexOf("|") >= 0 ? "|" : text.indexOf(":") >= 0 ? ":" : "";
  if (sep) {
    var parts = text.split(sep);
    var apiId = parts.length ? String(parts.shift() || "").trim() : "";
    var apiToken = String(parts.join(sep) || "").trim();
    return {
      apiId: apiId || existingId,
      apiToken: apiToken || existingToken,
    };
  }

  return {
    apiId: existingId,
    apiToken: text,
  };
}

/**
 * ZR accepts either:
 * - tenantId|secretKey
 * - tenantId:secretKey
 * - JSON: {"tenantId":"...","secretKey":"..."}
 * - secretKey alone (tenantId reused from existing value)
 *
 * @param {string} rawInput
 * @param {Object<string, unknown>|null|undefined} existingRow
 * @return {{ tenantId: string, secretKey: string }}
 */
function carrierCreds_parseZrInput_(rawInput, existingRow) {
  var text = rawInput != null ? String(rawInput).trim() : "";
  var existingTenant = carrierCreds_pickFirst_(existingRow, ["tenantId"]);
  var existingSecret = carrierCreds_getZrSecret_(existingRow);
  if (!text) {
    return { tenantId: "", secretKey: "" };
  }

  // JSON payload support (copy/paste from admin/API response).
  if (text.charAt(0) === "{") {
    try {
      var parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        var parsedTenant = carrierCreds_pickFirst_(parsed, [
          "tenantId",
          "tenant",
          "xTenant",
          "X-Tenant",
        ]);
        var parsedSecret = carrierCreds_pickFirst_(parsed, [
          "secretKey",
          "secret",
          "apiKey",
          "xApiKey",
          "X-Api-Key",
        ]);
        return {
          tenantId: parsedTenant || existingTenant,
          secretKey: parsedSecret || existingSecret,
        };
      }
    } catch (e) {
      // Fall back to other formats.
    }
  }

  var sep = text.indexOf("|") >= 0 ? "|" : text.indexOf(":") >= 0 ? ":" : "";
  if (sep) {
    var parts = text.split(sep);
    var tenant = parts.length ? String(parts.shift() || "").trim() : "";
    var secret = String(parts.join(sep) || "").trim();
    return {
      tenantId: tenant || existingTenant,
      secretKey: secret || existingSecret,
    };
  }

  return {
    tenantId: existingTenant,
    secretKey: text,
  };
}

/**
 * @return {Object<string, Object>}
 */
function carrierCreds_parseMap_() {
  var raw = PropertiesService.getUserProperties().getProperty(
    DT_CARRIER_CREDS_KEY_,
  );
  if (!raw || String(raw).trim() === "") {
    return {};
  }
  try {
    var o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

/**
 * Credentials object for a carrier id.
 * For ZR, include tenantId + secretKey (apiKey alias kept for compatibility).
 * @param {string} carrierId
 * @return {Object<string, string>}
 */
function carrierCreds_getForCarrier_(carrierId) {
  var id = String(carrierId || "").trim();
  if (!id) {
    return {};
  }
  var map = carrierCreds_parseMap_();
  var row = map[id];
  if (!row || typeof row !== "object") {
    return {};
  }
  var out = {};
  if (id === "yalidine") {
    var yaliId = carrierCreds_getYalidineApiId_(row);
    var yaliToken = carrierCreds_getYalidineApiToken_(row);
    if (yaliId && yaliToken) {
      out.apiId = yaliId;
      out.apiToken = yaliToken;
      // Compatibility aliases for older adapter code paths.
      out.id = yaliId;
      out.token = yaliToken;
      out.apiKey = yaliToken;
    }
    return out;
  }
  var secret = carrierCreds_getZrSecret_(row);
  if (secret) {
    out.apiKey = secret;
    if (id === "zr") {
      out.secretKey = secret;
    }
  }
  if (row.tenantId != null && String(row.tenantId).trim() !== "") {
    out.tenantId = String(row.tenantId).trim();
  }
  if (row.token != null && String(row.token).trim() !== "") {
    out.bearerToken = String(row.token).trim();
  }
  return out;
}

/**
 * @return {{
 *   carriers: Array<{ id: string, label: string }>,
 *   byCarrier: Object<string, { hasApiKey: boolean }>
 * }}
 */
function carrierCreds_getState() {
  var carriers = setup_resolveCarriers_();
  var map = carrierCreds_parseMap_();
  var byCarrier = {};
  for (var i = 0; i < carriers.length; i++) {
    var id = carriers[i].id;
    var row = map[id];
    var zrSecret = carrierCreds_getZrSecret_(row);
    var yaliId = carrierCreds_getYalidineApiId_(row);
    var yaliToken = carrierCreds_getYalidineApiToken_(row);
    var hasZrPair =
      id === "zr" &&
      row &&
      row.tenantId != null &&
      String(row.tenantId).trim() !== "" &&
      zrSecret !== "";
    var hasYalidinePair =
      id === "yalidine" &&
      row &&
      yaliId !== "" &&
      yaliToken !== "";
    var has =
      row &&
      typeof row === "object" &&
      ((carrierCreds_getZrSecret_(row) !== "") ||
        (row.token && String(row.token).trim() !== "") ||
        hasZrPair ||
        hasYalidinePair);
    byCarrier[id] = { hasApiKey: !!has };
  }
  return { carriers: carriers, byCarrier: byCarrier };
}

/**
 * Saves API secret for a carrier. Pass empty string to clear keys for that carrier.
 * For ZR, accepts:
 * - tenantId|secretKey
 * - tenantId:secretKey
 * - JSON object with tenantId + secretKey/apiKey
 * @param {string} carrierId
 * @param {string} apiKey
 * @return {ReturnType<typeof carrierCreds_getState>}
 */
function carrierCreds_saveApiKey(carrierId, apiKey) {
  var id = String(carrierId || "").trim();
  if (!id) {
    throw new Error(i18n_t("error.choose_carrier"));
  }
  var map = carrierCreds_parseMap_();
  var k = apiKey != null ? String(apiKey).trim() : "";
  if (!k) {
    if (map[id]) {
      delete map[id].apiKey;
      delete map[id].apiToken;
      delete map[id].apiId;
      delete map[id].secretKey;
      if (id === "zr") {
        delete map[id].tenantId;
      }
      var row = map[id];
      var hasToken =
        row && row.token != null && String(row.token).trim() !== "";
      var hasApi =
        row && row.apiKey != null && String(row.apiKey).trim() !== "";
      var hasSecret =
        row && row.secretKey != null && String(row.secretKey).trim() !== "";
      var hasYaliId =
        row && row.apiId != null && String(row.apiId).trim() !== "";
      var hasYaliToken =
        row &&
        ((row.apiToken != null && String(row.apiToken).trim() !== "") ||
          (row.apiKey != null && String(row.apiKey).trim() !== ""));
      if (!hasToken && !hasApi && !hasSecret) {
        if (id !== "yalidine" || (!hasYaliId && !hasYaliToken)) {
          delete map[id];
        }
      }
    }
  } else {
    if (!map[id] || typeof map[id] !== "object") {
      map[id] = {};
    }
    if (id === "zr") {
      var parsed = carrierCreds_parseZrInput_(k, map[id]);
      if (!parsed.tenantId || !parsed.secretKey) {
        throw new Error(i18n_t("error.zr_tenant_secret_required"));
      }
      map[id].tenantId = parsed.tenantId;
      map[id].secretKey = parsed.secretKey;
      // Keep apiKey mirror for backward compatibility with older adapter builds.
      map[id].apiKey = parsed.secretKey;
    } else if (id === "yalidine") {
      var yaliParsed = carrierCreds_parseYalidineInput_(k, map[id]);
      if (!yaliParsed.apiId || !yaliParsed.apiToken) {
        throw new Error(i18n_t("error.yalidine_id_token_required"));
      }
      map[id].apiId = yaliParsed.apiId;
      map[id].apiToken = yaliParsed.apiToken;
      // Keep aliases for backward compatibility.
      map[id].id = yaliParsed.apiId;
      map[id].token = yaliParsed.apiToken;
      map[id].apiKey = yaliParsed.apiToken;
    } else {
      map[id].apiKey = k;
    }
  }
  PropertiesService.getUserProperties().setProperty(
    DT_CARRIER_CREDS_KEY_,
    JSON.stringify(map),
  );
  return carrierCreds_getState();
}

/**
 * Save ZR credentials from dedicated fields (tenantId + secretKey).
 * Pass both empty strings to clear saved ZR secret credentials.
 *
 * @param {string} tenantId
 * @param {string} secretKey
 * @return {ReturnType<typeof carrierCreds_getState>}
 */
function carrierCreds_saveZrCredentials(tenantId, secretKey) {
  var id = "zr";
  var tenant = tenantId != null ? String(tenantId).trim() : "";
  var secret = secretKey != null ? String(secretKey).trim() : "";
  var map = carrierCreds_parseMap_();
  if (!tenant && !secret) {
    if (map[id] && typeof map[id] === "object") {
      delete map[id].tenantId;
      delete map[id].secretKey;
      delete map[id].apiKey;
      var row = map[id];
      var hasToken =
        row && row.token != null && String(row.token).trim() !== "";
      var hasSecret = carrierCreds_getZrSecret_(row) !== "";
      if (!hasToken && !hasSecret) {
        delete map[id];
      }
    }
  } else {
    if (!tenant || !secret) {
      throw new Error(i18n_t("error.zr_tenant_secret_required"));
    }
    if (!map[id] || typeof map[id] !== "object") {
      map[id] = {};
    }
    map[id].tenantId = tenant;
    map[id].secretKey = secret;
    // Keep apiKey mirror for backward compatibility with older adapter builds.
    map[id].apiKey = secret;
  }
  PropertiesService.getUserProperties().setProperty(
    DT_CARRIER_CREDS_KEY_,
    JSON.stringify(map),
  );
  return carrierCreds_getState();
}

/**
 * Save Yalidine credentials from dedicated fields (apiId + apiToken).
 * Pass both empty strings to clear saved Yalidine credentials.
 *
 * @param {string} apiId
 * @param {string} apiToken
 * @return {ReturnType<typeof carrierCreds_getState>}
 */
function carrierCreds_saveYalidineCredentials(apiId, apiToken) {
  var id = "yalidine";
  var yaliId = apiId != null ? String(apiId).trim() : "";
  var yaliToken = apiToken != null ? String(apiToken).trim() : "";
  var map = carrierCreds_parseMap_();
  if (!yaliId && !yaliToken) {
    if (map[id] && typeof map[id] === "object") {
      delete map[id].apiId;
      delete map[id].apiToken;
      delete map[id].id;
      delete map[id].token;
      delete map[id].apiKey;
      var row = map[id];
      var hasAny =
        row &&
        ((row.apiId != null && String(row.apiId).trim() !== "") ||
          (row.apiToken != null && String(row.apiToken).trim() !== "") ||
          (row.apiKey != null && String(row.apiKey).trim() !== ""));
      if (!hasAny) {
        delete map[id];
      }
    }
  } else {
    if (!yaliId || !yaliToken) {
      throw new Error(i18n_t("error.yalidine_id_token_required"));
    }
    if (!map[id] || typeof map[id] !== "object") {
      map[id] = {};
    }
    map[id].apiId = yaliId;
    map[id].apiToken = yaliToken;
    // Keep aliases for backward compatibility.
    map[id].id = yaliId;
    map[id].token = yaliToken;
    map[id].apiKey = yaliToken;
  }
  PropertiesService.getUserProperties().setProperty(
    DT_CARRIER_CREDS_KEY_,
    JSON.stringify(map),
  );
  return carrierCreds_getState();
}

/**
 * @param {unknown} err
 * @return {boolean}
 */
function carrierCreds_isMissingTestRouteError_(err) {
  var msg = err && err.message ? String(err.message) : String(err || "");
  var lower = msg.toLowerCase();
  return (
    lower.indexOf("/v1/carriers/zr/test-connection") >= 0 &&
    lower.indexOf("not found") >= 0
  );
}

/**
 * Direct compatibility test against ZR API profile endpoint.
 * Used when backend does not expose /v1/carriers/zr/test-connection yet.
 *
 * @param {{ tenantId?: string, secretKey?: string, apiKey?: string }} creds
 * @return {Object}
 */
function carrierCreds_testZrConnectionDirect_(creds) {
  var tenant =
    creds && creds.tenantId != null ? String(creds.tenantId).trim() : "";
  var secret =
    creds && creds.secretKey != null && String(creds.secretKey).trim() !== ""
      ? String(creds.secretKey).trim()
      : creds && creds.apiKey != null
        ? String(creds.apiKey).trim()
        : "";
  if (!tenant || !secret) {
    throw new Error(i18n_t("error.zr_tenant_secret_required"));
  }

  var url = "https://api.zrexpress.app/api/v1/users/profile";
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Accept: "application/json",
      "X-Tenant": tenant,
      "X-Api-Key": secret,
    },
  });
  var code = res.getResponseCode();
  var text = res.getContentText() || "";
  var parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (e) {
    parsed = null;
  }

  if (code >= 200 && code < 300) {
    return {
      ok: true,
      message: i18n_t("carrier.test.zr_direct_ok_legacy"),
      via: "direct-zr",
      raw: parsed || {},
    };
  }

  var msg = i18n_format("carrier.test.zr_direct_fail", code);
  if (parsed && typeof parsed === "object") {
    if (parsed.message != null && String(parsed.message).trim() !== "") {
      msg = String(parsed.message);
    } else if (parsed.error != null && String(parsed.error).trim() !== "") {
      msg = String(parsed.error);
    }
  } else if (text && String(text).trim() !== "") {
    msg = msg + ": " + String(text).slice(0, 180);
  }
  throw new Error(msg);
}

/**
 * Runs backend adapter testConnection with stored credentials.
 * Optionally accepts a draft key/token (without saving) to test immediately.
 *
 * @param {string} carrierId
 * @param {string=} draftKey
 * @return {Object}
 */
function carrierCreds_testConnection(carrierId, draftKey) {
  var id = String(carrierId || "").trim();
  if (!id) {
    throw new Error(i18n_t("error.choose_carrier"));
  }
  var creds = carrierCreds_getForCarrier_(id);
  var draft = draftKey != null ? String(draftKey).trim() : "";
  if (draft) {
    if (id === "zr") {
      var map = carrierCreds_parseMap_();
      var parsed = carrierCreds_parseZrInput_(draft, map[id]);
      if (!parsed.tenantId || !parsed.secretKey) {
        throw new Error(i18n_t("error.zr_tenant_secret_required"));
      }
      creds.tenantId = parsed.tenantId;
      creds.secretKey = parsed.secretKey;
      creds.apiKey = parsed.secretKey;
    } else if (id === "yalidine") {
      var mapYali = carrierCreds_parseMap_();
      var yaliParsed = carrierCreds_parseYalidineInput_(draft, mapYali[id]);
      if (!yaliParsed.apiId || !yaliParsed.apiToken) {
        throw new Error(i18n_t("error.yalidine_id_token_required"));
      }
      creds.apiId = yaliParsed.apiId;
      creds.apiToken = yaliParsed.apiToken;
      creds.id = yaliParsed.apiId;
      creds.token = yaliParsed.apiToken;
      creds.apiKey = yaliParsed.apiToken;
    } else {
      creds.apiKey = draft;
    }
  }
  if (
    id === "zr" &&
    (!creds.tenantId ||
      String(creds.tenantId).trim() === "" ||
      !(creds.secretKey || creds.apiKey))
  ) {
    throw new Error(i18n_t("error.zr_tenant_secret_required"));
  }
  if (
    id === "yalidine" &&
    (!creds.apiId ||
      String(creds.apiId).trim() === "" ||
      !creds.apiToken ||
      String(creds.apiToken).trim() === "")
  ) {
    throw new Error(i18n_t("error.yalidine_id_token_required"));
  }
  try {
    return apiJsonPost_("/v1/carriers/" + encodeURIComponent(id) + "/test-connection", {
      credentials: creds || {},
    });
  } catch (e) {
    if (id === "zr" && carrierCreds_isMissingTestRouteError_(e)) {
      return carrierCreds_testZrConnectionDirect_(creds);
    }
    throw e;
  }
}

/**
 * Runs backend ZR adapter testConnection with optional draft tenant/secret.
 * If draft values are blank, falls back to saved ZR credentials.
 *
 * @param {string=} tenantId
 * @param {string=} secretKey
 * @return {Object}
 */
function carrierCreds_testZrConnection(tenantId, secretKey) {
  var tenant = tenantId != null ? String(tenantId).trim() : "";
  var secret = secretKey != null ? String(secretKey).trim() : "";
  var creds = carrierCreds_getForCarrier_("zr");
  if (tenant || secret) {
    if (!tenant || !secret) {
      throw new Error(i18n_t("error.zr_tenant_secret_required"));
    }
    creds.tenantId = tenant;
    creds.secretKey = secret;
    creds.apiKey = secret;
  }
  if (
    !creds.tenantId ||
    String(creds.tenantId).trim() === "" ||
    !(creds.secretKey || creds.apiKey)
  ) {
    throw new Error(i18n_t("error.zr_tenant_secret_required"));
  }
  try {
    return apiJsonPost_("/v1/carriers/zr/test-connection", {
      credentials: creds || {},
    });
  } catch (e) {
    if (carrierCreds_isMissingTestRouteError_(e)) {
      return carrierCreds_testZrConnectionDirect_(creds);
    }
    throw e;
  }
}

/**
 * Runs backend Yalidine adapter testConnection with optional draft API ID/TOKEN.
 * If draft values are blank, falls back to saved Yalidine credentials.
 *
 * @param {string=} apiId
 * @param {string=} apiToken
 * @return {Object}
 */
function carrierCreds_testYalidineConnection(apiId, apiToken) {
  var idValue = apiId != null ? String(apiId).trim() : "";
  var tokenValue = apiToken != null ? String(apiToken).trim() : "";
  var creds = carrierCreds_getForCarrier_("yalidine");
  if (idValue || tokenValue) {
    if (!idValue || !tokenValue) {
      throw new Error(i18n_t("error.yalidine_id_token_required"));
    }
    creds.apiId = idValue;
    creds.apiToken = tokenValue;
    creds.id = idValue;
    creds.token = tokenValue;
    creds.apiKey = tokenValue;
  }
  if (
    !creds.apiId ||
    String(creds.apiId).trim() === "" ||
    !creds.apiToken ||
    String(creds.apiToken).trim() === ""
  ) {
    throw new Error(i18n_t("error.yalidine_id_token_required"));
  }
  return apiJsonPost_("/v1/carriers/yalidine/test-connection", {
    credentials: creds || {},
  });
}
