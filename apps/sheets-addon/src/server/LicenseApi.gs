/**
 * @fileoverview License + trial handling for the sidebar + send/sync guards.
 * Uses backend `/v1/license/status` and `/v1/license/activate` endpoints and
 * stores both the cached record and HMAC access token in DeliveryToolStorage.
 */

// Constants
var LICENSE_CACHE_TTL_MS_ = 60 * 60 * 1000; // 1 hour
// WhatsApp contact link – configurable via script property `dt.whatsapp.link`.
var WHATSAPP_LINK_ = (function () {
  try {
    var props = PropertiesService.getScriptProperties();
    var v = props && props.getProperty("dt.whatsapp.link");
    return v && String(v).trim() !== "" ? String(v).trim() : "";
  } catch (e) {
    return "";
  }
})();

// Get current user's email — ALWAYS use getActiveUser
function license_getCurrentEmail_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email && email.trim() !== "" ? email.trim() : null;
  } catch (e) {
    // Fall back below.
  }
  // Trigger contexts can fail Session.getActiveUser(). Reuse cached identity when available.
  var cached = license_getCachedRecord_();
  if (cached) {
    var fromCache =
      cached.customerEmail != null
        ? String(cached.customerEmail).trim()
        : cached.email != null
          ? String(cached.email).trim()
          : cached.clientEmail != null
            ? String(cached.clientEmail).trim()
            : "";
    if (fromCache && fromCache.indexOf("@") > 0) {
      return fromCache.toLowerCase();
    }
  }
  return null;
}

/**
 * Called on every sidebar open — auto-starts trial if needed via backend.
 * Returns a simplified state for the client UI.
 * @return {Object}
 */
function license_getSidebarState() {
  // 1. Check cache first
  var cached = license_getCachedRecord_();
  if (
    cached &&
    cached._cachedAt &&
    Date.now() - cached._cachedAt < LICENSE_CACHE_TTL_MS_
  ) {
    var stateFromCache = license_buildSidebarState_(cached);
    // Enrich with API configuration hints for the sidebar UI.
    var baseCached = getApiBaseUrl_();
    stateFromCache.apiBaseUrl = baseCached || "";
    var userKeyCached = getUserApiKey_ && getUserApiKey_();
    stateFromCache.apiKeyConfigured = !!(
      userKeyCached && String(userKeyCached).trim() !== ""
    );
    stateFromCache.apiConfigured = !!(
      baseCached && String(baseCached).trim() !== ""
    );
    stateFromCache.record = cached;
    return stateFromCache;
  }

  // 2. Cache miss or expired — call backend
  var email = license_getCurrentEmail_();
  if (!email) {
    var baseNoEmail = getApiBaseUrl_();
    return {
      status: "no_email",
      message: i18n_t("general.error"),
      apiBaseUrl: baseNoEmail || "",
      apiConfigured: !!(baseNoEmail && String(baseNoEmail).trim() !== ""),
      apiKeyConfigured: false,
      record: null,
    };
  }
  try {
    var record = apiJsonPost_("/v1/license/status", { email: email });
    record._cachedAt = Date.now();
    DeliveryToolStorage.setLicenseCacheJson(JSON.stringify(record));
    DeliveryToolStorage.setAccessToken(record.accessToken || null);
    var state = license_buildSidebarState_(record);
    var base = getApiBaseUrl_();
    state.apiBaseUrl = base || "";
    var userKey = getUserApiKey_ && getUserApiKey_();
    state.apiKeyConfigured = !!(userKey && String(userKey).trim() !== "");
    state.apiConfigured = !!(base && String(base).trim() !== "");
    state.record = record;
    return state;
  } catch (e) {
    // Network error — use stale cache if available, otherwise error
    var stale = license_getCachedRecord_();
    if (stale) {
      var stateStale = license_buildSidebarState_(stale);
      var baseStale = getApiBaseUrl_();
      stateStale.apiBaseUrl = baseStale || "";
      var userKeyStale = getUserApiKey_ && getUserApiKey_();
      stateStale.apiKeyConfigured = !!(
        userKeyStale && String(userKeyStale).trim() !== ""
      );
      stateStale.apiConfigured = !!(
        baseStale && String(baseStale).trim() !== ""
      );
      stateStale.record = stale;
      return stateStale;
    }
    var baseErr = getApiBaseUrl_();
    return {
      status: "error",
      message: i18n_format("general.error", e && e.message ? e.message : e),
      apiBaseUrl: baseErr || "",
      apiConfigured: !!(baseErr && String(baseErr).trim() !== ""),
      apiKeyConfigured: false,
      record: null,
    };
  }
}

/**
 * Normalizes backend record into sidebar-facing shape with translated strings.
 * @param {Object} record
 * @return {Object}
 */
function license_buildSidebarState_(record) {
  var status = record.licenseStatus || record.status;
  var daysRemaining = null;
  var trialEnd = record.trialEnd || record.trialExpiresAt;
  if (trialEnd) {
    daysRemaining = Math.max(
      0,
      Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000),
    );
  }
  var expiresOn = null;
  if (record.subscriptionEnd) {
    expiresOn = new Date(record.subscriptionEnd).toLocaleDateString();
  }
  return {
    status: status,
    email: record.clientEmail || record.email || "",
    daysRemaining: daysRemaining,
    expiresOn: expiresOn,
    whatsappLink: WHATSAPP_LINK_,
    strings: {
      title:
        status === "trial"
          ? i18n_t("trial.welcome_title")
          : status === "active"
            ? i18n_t("license.active")
            : status === "expired"
              ? i18n_t("license.expired_title")
              : i18n_t("trial.expired_title"),
      body:
        status === "trial"
          ? daysRemaining > 0
            ? i18n_format("trial.days_remaining", daysRemaining)
            : i18n_t("trial.expired_body")
          : status === "active"
            ? i18n_format("license.expires_on", expiresOn || "")
            : i18n_t("license.expired_body"),
      contactLabel: i18n_t("trial.contact_whatsapp"),
      activateLabel: i18n_t("license.have_code"),
    },
  };
}

/**
 * Activate with a code sent via WhatsApp.
 * @param {string} code
 * @return {{ ok: boolean, message: string }}
 */
function license_activate(code) {
  if (!code || String(code).trim() === "") {
    throw new Error(i18n_t("license.activate_error"));
  }
  var email = license_getCurrentEmail_();
  if (!email) {
    throw new Error(i18n_t("general.error"));
  }
  var record = apiJsonPost_("/v1/license/activate", {
    code: String(code).trim().toUpperCase(),
    email: email,
  });
  // Store JWT and clear/replace cache
  DeliveryToolStorage.setAccessToken(record.accessToken || null);
  record._cachedAt = Date.now();
  DeliveryToolStorage.setLicenseCacheJson(JSON.stringify(record));
  return { ok: true, message: i18n_t("license.activate_success") };
}

/**
 * Gate for send and sync operations (used by SendApi / SyncApi).
 * Throws translated error when operations are not allowed.
 *
 * @param {{ skipRefresh?: boolean }=} opts Optional behaviour flags.
 *   When `skipRefresh` is true, the gate will only use cached state and will not
 *   call backend/Session-dependent flows. This is intended for trigger contexts.
 */
function license_assertOperationsAllowed_(opts) {
  opts = opts || {};

  var cached = license_getCachedRecord_();
  var status = cached ? cached.licenseStatus || cached.status : "invalid";

  // If cache is stale, re-validate unless explicitly disabled (e.g. time-based triggers).
  if (
    !opts.skipRefresh &&
    (!cached ||
      !cached._cachedAt ||
      Date.now() - cached._cachedAt > LICENSE_CACHE_TTL_MS_)
  ) {
    try {
      var fresh = license_getSidebarState();
      status = fresh.status;
    } catch (e) {
      // Use stale status if network fails
    }
  }

  if (status === "active" || status === "trial") {
    // For trial: check days remaining
    if (
      status === "trial" &&
      cached &&
      (cached.trialEnd || cached.trialExpiresAt)
    ) {
      var tEnd = cached.trialEnd || cached.trialExpiresAt;
      if (new Date(tEnd).getTime() < Date.now()) {
        throw new Error(
          i18n_t("trial.expired_title") + ". " + i18n_t("trial.expired_body"),
        );
      }
    }
    return true;
  }

  throw new Error(
    i18n_t("general.license_required") + ". " + i18n_t("license.expired_body"),
  );
}

/**
 * Reads cached license record from UserProperties.
 * @return {Object|null}
 */
function license_getCachedRecord_() {
  try {
    var raw = DeliveryToolStorage.getLicenseCacheJson();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Returns a valid (non-expired) access token when available.
 * May trigger a background refresh via license_getSidebarState().
 * @return {string|null}
 */
function license_getAccessToken_() {
  var token = DeliveryToolStorage.getAccessToken();
  if (!token) return null;
  var expMs = license_getTokenExpiryMs_(token);
  if (expMs != null && expMs < Date.now()) {
    // Token expired — re-validate to get fresh token.
    try {
      license_getSidebarState();
    } catch (e) {
      // Ignore and keep fallback below.
    }
    var refreshed = DeliveryToolStorage.getAccessToken();
    if (!refreshed) {
      return null;
    }
    var refreshedExp = license_getTokenExpiryMs_(refreshed);
    if (refreshedExp != null && refreshedExp < Date.now()) {
      return null;
    }
    return refreshed;
  }
  return token;
}

/**
 * @param {string} token
 * @return {number|null}
 */
function license_getTokenExpiryMs_(token) {
  try {
    var parts = String(token).split(".");
    if (parts.length !== 2) return null;
    var payloadJson = Utilities.newBlob(
      Utilities.base64DecodeWebSafe(parts[0]),
    ).getDataAsString();
    var payload = JSON.parse(payloadJson);
    return payload && typeof payload.expMs === "number" ? payload.expMs : null;
  } catch (e) {
    return null;
  }
}

/**
 * WhatsApp contact link exposed to client.
 * @return {string}
 */
function license_getWhatsappLink() {
  return WHATSAPP_LINK_;
}

/**
 * Clears cached license record and access token (used by sidebar "Forget cache" button).
 * @return {{ ok: boolean }}
 */
function license_clearCache() {
  DeliveryToolStorage.setLicenseCacheJson(null);
  DeliveryToolStorage.setAccessToken(null);
  return { ok: true };
}
