/**
 * @fileoverview Spreadsheet ownership guards for production licensing.
 * The add-on license identity is the active Google account email; the active
 * spreadsheet must be owned by the same account.
 */

var OWNERSHIP_CACHE_KEY_PREFIX_ = "dt.ownership.ok.";
var OWNERSHIP_CACHE_TTL_MS_ = 24 * 60 * 60 * 1000;
var OWNERSHIP_STALE_CACHE_TTL_MS_ = 7 * 24 * 60 * 60 * 1000;
var OWNERSHIP_DRIVE_RETRY_DELAYS_MS_ = [0, 500, 1500, 3000];

function ownership_cacheKey_(spreadsheetId) {
  return OWNERSHIP_CACHE_KEY_PREFIX_ + String(spreadsheetId || "");
}

function ownership_rememberVerified_(spreadsheetId, activeEmail, ownerEmail) {
  try {
    var payload = {
      atMs: Date.now(),
      activeEmail: String(activeEmail || "").trim().toLowerCase(),
      ownerEmail: String(ownerEmail || "").trim().toLowerCase(),
    };
    PropertiesService.getUserProperties().setProperty(
      ownership_cacheKey_(spreadsheetId),
      JSON.stringify(payload),
    );
  } catch (e) {}
}

function ownership_readVerifiedCache_(spreadsheetId, activeEmail, maxAgeMs) {
  try {
    var raw = PropertiesService.getUserProperties().getProperty(
      ownership_cacheKey_(spreadsheetId),
    );
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    var atMs = Number(parsed.atMs);
    if (!Number.isFinite(atMs) || atMs <= 0) return null;
    var ttlMs = Number(maxAgeMs || OWNERSHIP_CACHE_TTL_MS_);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) ttlMs = OWNERSHIP_CACHE_TTL_MS_;
    if (Date.now() - atMs > ttlMs) return null;
    var activeNorm = String(activeEmail || "").trim().toLowerCase();
    var cachedActive = String(parsed.activeEmail || "").trim().toLowerCase();
    var cachedOwner = String(parsed.ownerEmail || "").trim().toLowerCase();
    if (!activeNorm || !cachedActive || !cachedOwner) return null;
    if (activeNorm !== cachedActive) return null;
    return {
      atMs: atMs,
      activeEmail: cachedActive,
      ownerEmail: cachedOwner,
    };
  } catch (e) {
    return null;
  }
}

function ownership_getSpreadsheetOwnerState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss ? ss.getId() : "";
  var activeEmail =
    typeof license_getCurrentEmail_ === "function" ? license_getCurrentEmail_() : null;
  if (!activeEmail) {
    return {
      ok: false,
      spreadsheetId: spreadsheetId,
      activeEmail: null,
      ownerEmail: null,
      reason: "no_active_email",
      message: i18n_t("license.no_email"),
    };
  }

  var ownerEmail = null;
  var driveError = null;
  for (var attempt = 0; attempt < OWNERSHIP_DRIVE_RETRY_DELAYS_MS_.length; attempt++) {
    try {
      var delayMs = Number(OWNERSHIP_DRIVE_RETRY_DELAYS_MS_[attempt] || 0);
      if (delayMs > 0 && typeof Utilities !== "undefined" && Utilities.sleep) {
        Utilities.sleep(delayMs);
      }
      var file = DriveApp.getFileById(spreadsheetId);
      var owner = file && file.getOwner ? file.getOwner() : null;
      ownerEmail = owner && owner.getEmail ? String(owner.getEmail() || "").trim() : "";
      driveError = null;
      break;
    } catch (e) {
      driveError = e;
    }
  }
  if (driveError) {
    var cached = ownership_readVerifiedCache_(spreadsheetId, activeEmail, OWNERSHIP_STALE_CACHE_TTL_MS_);
    if (cached) {
      return {
        ok: true,
        spreadsheetId: spreadsheetId,
        activeEmail: cached.activeEmail,
        ownerEmail: cached.ownerEmail,
        reason: "owner_verified_cache_drive_unavailable",
        message: "",
      };
    }
    return {
      ok: false,
      spreadsheetId: spreadsheetId,
      activeEmail: String(activeEmail).trim().toLowerCase(),
      ownerEmail: null,
      reason: "owner_unavailable",
      message: i18n_t("error.sheet_owner_unavailable"),
    };
  }

  if (!ownerEmail) {
    return {
      ok: false,
      spreadsheetId: spreadsheetId,
      activeEmail: String(activeEmail).trim().toLowerCase(),
      ownerEmail: null,
      reason: "shared_drive_or_hidden_owner",
      message: i18n_t("error.shared_sheet_not_supported"),
    };
  }

  var activeNorm = String(activeEmail).trim().toLowerCase();
  var ownerNorm = String(ownerEmail).trim().toLowerCase();
  if (activeNorm !== ownerNorm) {
    return {
      ok: false,
      spreadsheetId: spreadsheetId,
      activeEmail: activeNorm,
      ownerEmail: ownerNorm,
      reason: "not_owner",
      message: i18n_format("error.sheet_owner_mismatch", ownerNorm, activeNorm),
    };
  }
  ownership_rememberVerified_(spreadsheetId, activeNorm, ownerNorm);

  return {
    ok: true,
    spreadsheetId: spreadsheetId,
    activeEmail: activeNorm,
    ownerEmail: ownerNorm,
    reason: null,
    message: "",
  };
}

function ownership_assertCurrentSpreadsheetOwnedByActiveUser_(options) {
  var opts = options && typeof options === "object" ? options : {};
  var state = ownership_getSpreadsheetOwnerState_();
  if (
    state &&
    !state.ok &&
    opts.allowOwnerUnavailable === true &&
    state.reason === "owner_unavailable"
  ) {
    return state;
  }
  if (!state || !state.ok) {
    throw new Error(
      state && state.message ? String(state.message) : i18n_t("error.shared_sheet_not_supported"),
    );
  }
  return state;
}
