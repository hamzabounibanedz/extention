/**
 * @fileoverview Document + user properties for mappings, sync time, and license cache.
 * Document properties = per spreadsheet file. User properties = per Google account using the add-on.
 *
 * Limits: each property value max ~9 KB; keys max 256 chars (use numeric sheet id for mappings, not tab names).
 */

var DeliveryToolStorage = (function () {
  var PREFIX = 'dt.v1.';

  function documentProps_() {
    return PropertiesService.getDocumentProperties();
  }

  function userProps_() {
    return PropertiesService.getUserProperties();
  }

  // User language preference key (per Google account).
  var USER_LANG_KEY_ = PREFIX + 'user.lang';
  // License access token (JWT) for backend shipments, per Google account.
  var ACCESS_TOKEN_KEY_ = PREFIX + 'license.accessToken';

  /**
   * Use sheet id from Sheet.getSheetId() — stable if the tab is renamed (unlike tab name).
   * @param {string} spreadsheetId
   * @param {number|string} sheetId
   */
  function mappingKey_(spreadsheetId, sheetId) {
    // Locked key format: "<spreadsheetId>:<sheetId>"
    return PREFIX + 'map.' + spreadsheetId + ':' + String(sheetId);
  }

  function legacyMappingKey_(spreadsheetId, sheetId) {
    return PREFIX + 'map.' + spreadsheetId + '.' + String(sheetId);
  }

  function syncKey_(spreadsheetId, sheetId) {
    // Locked key format: "<spreadsheetId>:<sheetId>" for per-feuille horodatage.
    return PREFIX + 'sync.' + spreadsheetId + ':' + String(sheetId);
  }

  function legacySyncKey_(spreadsheetId) {
    // Ancien format : par classeur seulement — lu en secours si présent.
    return PREFIX + 'sync.' + spreadsheetId;
  }

  function syncAttemptKey_(spreadsheetId, sheetId) {
    return PREFIX + 'syncAttempt.' + spreadsheetId + ':' + String(sheetId);
  }

  function legacySyncAttemptKey_(spreadsheetId) {
    return PREFIX + 'syncAttempt.' + spreadsheetId;
  }

  function feeRulesKey_(spreadsheetId) {
    return PREFIX + 'fees.' + spreadsheetId;
  }

  function opsLogKey_(spreadsheetId) {
    return PREFIX + 'opsLog.' + spreadsheetId;
  }

  var LICENSE_CACHE_KEY = PREFIX + 'license.cache';
  var BUSINESS_SETTINGS_KEY = PREFIX + 'business.settings';

  function sidebarSheetPrefKey_(spreadsheetId) {
    return PREFIX + 'sidebar.sheet.' + spreadsheetId;
  }

  return {
    /**
     * @param {string} spreadsheetId
     * @param {number|string} sheetId From {@code Sheet.getSheetId()}
     * @return {string|null} JSON string or null
     */
    getMappingJson: function (spreadsheetId, sheetId) {
      var props = documentProps_();
      var key = mappingKey_(spreadsheetId, sheetId);
      var v = props.getProperty(key);
      if (v != null) {
        return v;
      }
      // Migrate legacy key on first read.
      var legacyKey = legacyMappingKey_(spreadsheetId, sheetId);
      var legacy = props.getProperty(legacyKey);
      if (legacy != null) {
        props.setProperty(key, legacy);
        props.deleteProperty(legacyKey);
        return legacy;
      }
      return null;
    },

    /**
     * @param {string} spreadsheetId
     * @param {number|string} sheetId From {@code Sheet.getSheetId()}
     * @param {string} jsonString Column mapping JSON (see spec); keep under ~9 KB
     */
    setMappingJson: function (spreadsheetId, sheetId, jsonString) {
      var props = documentProps_();
      props.setProperty(mappingKey_(spreadsheetId, sheetId), jsonString);
      // Clean up legacy key if present.
      props.deleteProperty(legacyMappingKey_(spreadsheetId, sheetId));
    },

    /**
     * @param {string} spreadsheetId
     * @param {number|string} sheetId From {@code Sheet.getSheetId()}
     */
    removeMapping: function (spreadsheetId, sheetId) {
      var props = documentProps_();
      props.deleteProperty(mappingKey_(spreadsheetId, sheetId));
      props.deleteProperty(legacyMappingKey_(spreadsheetId, sheetId));
    },

    /**
     * Last worksheet the user chose in the sidebar mapping dropdown (numeric sheet id).
     * Per Google account + spreadsheet (sidebar preference, not active tab).
     * @param {string} spreadsheetId
     * @return {number|null}
     */
    getSidebarSheetPreference: function (spreadsheetId) {
      var key = sidebarSheetPrefKey_(spreadsheetId);
      var up = userProps_();
      var dp = documentProps_();
      var raw = up.getProperty(key);
      if (raw == null || String(raw).trim() === '') {
        // Migrate legacy document-level preference to user scope on first read.
        var legacyRaw = dp.getProperty(key);
        if (legacyRaw != null && String(legacyRaw).trim() !== '') {
          up.setProperty(key, legacyRaw);
          dp.deleteProperty(key);
          raw = legacyRaw;
        }
      }
      if (raw == null || String(raw).trim() === '') {
        return null;
      }
      var n = parseInt(String(raw).trim(), 10);
      return Number.isFinite(n) && n >= 1 ? n : null;
    },

    /**
     * @param {string} spreadsheetId
     * @param {number|string|null|undefined} sheetId Pass null to clear
     */
    setSidebarSheetPreference: function (spreadsheetId, sheetId) {
      var key = sidebarSheetPrefKey_(spreadsheetId);
      var up = userProps_();
      var dp = documentProps_();
      if (sheetId == null || String(sheetId).trim() === '') {
        up.deleteProperty(key);
        dp.deleteProperty(key);
        return;
      }
      var n = parseInt(String(sheetId).trim(), 10);
      if (!Number.isFinite(n) || n < 1) {
        up.deleteProperty(key);
        dp.deleteProperty(key);
        return;
      }
      up.setProperty(key, String(Math.floor(n)));
      // Keep only per-user scope; remove legacy shared preference.
      dp.deleteProperty(key);
    },

    /**
     * Cached license/trial payload from backend (user-specific).
     * @return {string|null} JSON or null
     */
    getLicenseCacheJson: function () {
      return userProps_().getProperty(LICENSE_CACHE_KEY);
    },

    /**
     * @param {string|null} jsonString Pass null to clear
     */
    setLicenseCacheJson: function (jsonString) {
      if (jsonString === null || jsonString === '') {
        userProps_().deleteProperty(LICENSE_CACHE_KEY);
      } else {
        userProps_().setProperty(LICENSE_CACHE_KEY, jsonString);
      }
    },

    /**
     * Last successful tracking sync time for this sheet (ISO 8601).
     * @param {string} spreadsheetId
     * @param {number|string} sheetId
     * @return {string|null}
     */
    getLastSyncIso: function (spreadsheetId, sheetId) {
      var props = documentProps_();
      var v = props.getProperty(syncKey_(spreadsheetId, sheetId));
      if (v != null) {
        return v;
      }
      // Compatibilité : lire l'ancien horodatage par classeur si présent.
      return props.getProperty(legacySyncKey_(spreadsheetId));
    },

    /**
     * @param {string} spreadsheetId
     * @param {number|string} sheetId
     * @param {string} isoString ISO 8601
     */
    setLastSyncIso: function (spreadsheetId, sheetId, isoString) {
      documentProps_().setProperty(syncKey_(spreadsheetId, sheetId), isoString);
    },

    /**
     * Last sync run end time (success or failure), per sheet (ISO 8601).
     * @param {string} spreadsheetId
     * @param {number|string} sheetId
     * @return {string|null}
     */
    getLastSyncAttemptIso: function (spreadsheetId, sheetId) {
      var props = documentProps_();
      var v = props.getProperty(syncAttemptKey_(spreadsheetId, sheetId));
      if (v != null) {
        return v;
      }
      return props.getProperty(legacySyncAttemptKey_(spreadsheetId));
    },

    /**
     * @param {string} spreadsheetId
     * @param {number|string} sheetId
     * @param {string} isoString ISO 8601
     */
    setLastSyncAttemptIso: function (spreadsheetId, sheetId, isoString) {
      documentProps_().setProperty(syncAttemptKey_(spreadsheetId, sheetId), isoString);
    },

    /**
     * Shipping fee rules JSON (per spreadsheet). See FeeApi.gs schema.
     * @param {string} spreadsheetId
     * @return {string|null}
     */
    getFeeRulesJson: function (spreadsheetId) {
      return documentProps_().getProperty(feeRulesKey_(spreadsheetId));
    },

    /**
     * @param {string} spreadsheetId
     * @param {string|null} jsonString Pass null to clear
     */
    setFeeRulesJson: function (spreadsheetId, jsonString) {
      if (jsonString === null || jsonString === '') {
        documentProps_().deleteProperty(feeRulesKey_(spreadsheetId));
      } else {
        documentProps_().setProperty(feeRulesKey_(spreadsheetId), jsonString);
      }
    },

    /**
     * Send/sync journal JSON (FIFO, max size ~9 Ko). See OpsLogApi.gs.
     * @param {string} spreadsheetId
     * @return {string|null}
     */
    getOpsLogJson: function (spreadsheetId) {
      return documentProps_().getProperty(opsLogKey_(spreadsheetId));
    },

    /**
     * @param {string} spreadsheetId
     * @param {string|null} jsonString Pass null to clear
     */
    setOpsLogJson: function (spreadsheetId, jsonString) {
      if (jsonString === null || jsonString === '') {
        documentProps_().deleteProperty(opsLogKey_(spreadsheetId));
      } else {
        documentProps_().setProperty(opsLogKey_(spreadsheetId), jsonString);
      }
    },

    /**
     * Business settings JSON (user-specific).
     * @return {string|null}
     */
    getBusinessSettingsJson: function () {
      return userProps_().getProperty(BUSINESS_SETTINGS_KEY);
    },

    /**
     * @param {string|null} jsonString Pass null to clear
     */
    setBusinessSettingsJson: function (jsonString) {
      if (jsonString === null || jsonString === '') {
        userProps_().deleteProperty(BUSINESS_SETTINGS_KEY);
      } else {
        userProps_().setProperty(BUSINESS_SETTINGS_KEY, jsonString);
      }
    },

    /**
     * Language preference for the current Google account (e.g. 'ar' | 'fr' | 'en').
     * @return {string|null}
     */
    getUserLang: function () {
      return userProps_().getProperty(USER_LANG_KEY_);
    },

    /**
     * @param {string} lang
     */
    setUserLang: function (lang) {
      userProps_().setProperty(USER_LANG_KEY_, String(lang || '').trim());
    },

    /**
     * JWT access token returned from the backend for shipment operations.
     * @return {string|null}
     */
    getAccessToken: function () {
      return userProps_().getProperty(ACCESS_TOKEN_KEY_);
    },

    /**
     * @param {string|null} token Pass null/empty to clear.
     */
    setAccessToken: function (token) {
      var t = token != null ? String(token).trim() : '';
      if (!t) {
        userProps_().deleteProperty(ACCESS_TOKEN_KEY_);
      } else {
        userProps_().setProperty(ACCESS_TOKEN_KEY_, t);
      }
    },
  };
})();
