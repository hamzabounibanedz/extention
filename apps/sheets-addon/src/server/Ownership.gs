/**
 * @fileoverview Spreadsheet ownership guards for production licensing.
 * The add-on license identity is the active Google account email; the active
 * spreadsheet must be owned by the same account.
 */

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
  try {
    var file = DriveApp.getFileById(spreadsheetId);
    var owner = file && file.getOwner ? file.getOwner() : null;
    ownerEmail = owner && owner.getEmail ? String(owner.getEmail() || "").trim() : "";
  } catch (e) {
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

  return {
    ok: true,
    spreadsheetId: spreadsheetId,
    activeEmail: activeNorm,
    ownerEmail: ownerNorm,
    reason: null,
    message: "",
  };
}

function ownership_assertCurrentSpreadsheetOwnedByActiveUser_() {
  var state = ownership_getSpreadsheetOwnerState_();
  if (!state || !state.ok) {
    throw new Error(
      state && state.message ? String(state.message) : i18n_t("error.shared_sheet_not_supported"),
    );
  }
  return state;
}
