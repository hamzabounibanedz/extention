/**
 * @fileoverview Backend URL and API key.
 * - User properties: per Google account (sidebar) — URL + key.
 * - Script properties: optional default base URL set in the Apps Script editor (all users),
 *   used only when the user has not set their own URL.
 */

var DT_SCRIPT_API_BASE_URL_KEY_ = 'dt.api.baseUrl';
var DT_SCRIPT_API_KEY_ = 'dt.api.key';
var DT_SCRIPT_UI_MODE_KEY_ = 'dt.ui.mode';
var DT_SCRIPT_ALLOW_USER_BACKEND_CONFIG_KEY_ = 'dt.ui.allowUserBackendConfig';
var DT_SCRIPT_SHOW_TECHNICAL_DETAILS_KEY_ = 'dt.ui.showTechnicalDetails';
/** Per-user override from the sidebar (takes precedence only in local mode). */
var DT_USER_API_BASE_URL_KEY_ = 'dt.api.baseUrl';
/** User-specific secret; not shared with other editors of the deployment. */
var DT_USER_API_KEY_ = 'dt.api.userApiKey';

/**
 * @param {string|null|undefined} raw
 * @param {boolean} defaultValue
 * @return {boolean}
 */
function config_parseBoolean_(raw, defaultValue) {
  if (raw == null) {
    return defaultValue;
  }
  var s = String(raw).trim().toLowerCase();
  if (s === '') {
    return defaultValue;
  }
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') {
    return true;
  }
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') {
    return false;
  }
  return defaultValue;
}

/**
 * @return {'local'|'prod'}
 */
function config_getUiMode_() {
  var raw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_UI_MODE_KEY_,
  );
  var s = raw != null ? String(raw).trim().toLowerCase() : '';
  // Explicit override always wins.
  if (s === 'local' || s === 'dev' || s === 'development') {
    return 'local';
  }
  if (s === 'prod' || s === 'production') {
    return 'prod';
  }
  // Auto mode:
  // - if script backend URL is set => production UX (client cannot edit backend)
  // - otherwise => local testing UX (backend URL editable)
  var scriptRaw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_API_BASE_URL_KEY_,
  );
  return scriptRaw != null && String(scriptRaw).trim() !== '' ? 'prod' : 'local';
}

/**
 * @return {boolean}
 */
function config_allowUserBackendConfig_() {
  if (config_getUiMode_() === 'prod') {
    return false;
  }
  var raw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_ALLOW_USER_BACKEND_CONFIG_KEY_,
  );
  return config_parseBoolean_(raw, true);
}

/**
 * @return {boolean}
 */
function config_showTechnicalDetails_() {
  if (config_getUiMode_() === 'prod') {
    return false;
  }
  var raw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_SHOW_TECHNICAL_DETAILS_KEY_,
  );
  return config_parseBoolean_(raw, true);
}

/**
 * @return {{ uiMode: 'local'|'prod', allowBackendConfig: boolean, showTechnicalDetails: boolean }}
 */
function config_getUiSettings_() {
  return {
    uiMode: config_getUiMode_(),
    allowBackendConfig: config_allowUserBackendConfig_(),
    showTechnicalDetails: config_showTechnicalDetails_(),
  };
}

/**
 * @param {string|null|undefined} raw
 * @return {string}
 */
function normalizeApiBaseUrl_(raw) {
  var url = String(raw || '').trim();
  if (!url) {
    return '';
  }
  url = url.replace(/\s+/g, '');

  // Heal accidental duplicated pastes like:
  // https://foo.ngrok-free.apphttps://foo.ngrok-free.app
  while (true) {
    var iHttp = url.indexOf('http://', 7);
    var iHttps = url.indexOf('https://', 8);
    var secondIdx = -1;
    if (iHttp >= 0 && iHttps >= 0) {
      secondIdx = Math.min(iHttp, iHttps);
    } else {
      secondIdx = Math.max(iHttp, iHttps);
    }
    if (secondIdx <= 0) {
      break;
    }
    var first = url.slice(0, secondIdx);
    var tail = url.slice(secondIdx);
    if (first === tail) {
      url = first;
      continue;
    }
    break;
  }

  if (/^https?:\/\/[^/]*ngrok-free$/i.test(url)) {
    url += '.app';
  }
  return url.replace(/\/+$/, '');
}

/**
 * @return {string}
 */
function getScriptApiKey_() {
  var raw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_API_KEY_,
  );
  return raw ? String(raw).trim() : '';
}

/**
 * @return {string} Base URL without trailing slash, or empty if unset
 */
function getApiBaseUrl_() {
  var userRaw = PropertiesService.getUserProperties().getProperty(
    DT_USER_API_BASE_URL_KEY_,
  );
  if (
    config_allowUserBackendConfig_() &&
    userRaw != null &&
    String(userRaw).trim() !== ''
  ) {
    return normalizeApiBaseUrl_(userRaw);
  }
  var scriptRaw = PropertiesService.getScriptProperties().getProperty(
    DT_SCRIPT_API_BASE_URL_KEY_,
  );
  if (scriptRaw && String(scriptRaw).trim() !== '') {
    return normalizeApiBaseUrl_(scriptRaw);
  }
  // Compatibility fallback: if a user had previously configured a URL in local mode
  // and deployment switched to locked prod mode without script URL yet, keep read-only usage.
  if (userRaw != null && String(userRaw).trim() !== '') {
    return normalizeApiBaseUrl_(userRaw);
  }
  return '';
}

/**
 * @return {string} API key or empty
 */
function getUserApiKey_() {
  var userRaw = PropertiesService.getUserProperties().getProperty(
    DT_USER_API_KEY_,
  );
  if (
    config_allowUserBackendConfig_() &&
    userRaw &&
    String(userRaw).trim() !== ''
  ) {
    return String(userRaw).trim();
  }
  var scriptKey = getScriptApiKey_();
  if (scriptKey) {
    return scriptKey;
  }
  // Compatibility fallback for existing test users if script key is not set yet.
  return userRaw ? String(userRaw).trim() : '';
}

/**
 * Saves backend base URL for the current Google account (UserProperties).
 * Pass empty string to clear the user's URL; the script-level default in the editor still applies if set.
 * @param {string} url
 * @return {{ ok: boolean }}
 */
function config_saveApiBaseUrl(url) {
  if (!config_allowUserBackendConfig_()) {
    throw new Error(i18n_t('error.backend_config_locked'));
  }
  var u = normalizeApiBaseUrl_(url);
  if (!u) {
    PropertiesService.getUserProperties().deleteProperty(DT_USER_API_BASE_URL_KEY_);
    // URL changed/cleared: reset temporary endpoint cooldown.
    PropertiesService.getUserProperties().deleteProperty('dt.api.endpointCooldown');
    return { ok: true };
  }
  if (!/^https?:\/\//i.test(u)) {
    throw new Error(i18n_t('error.url_must_be_http'));
  }
  PropertiesService.getUserProperties().setProperty(DT_USER_API_BASE_URL_KEY_, u.replace(/\/$/, ''));
  // URL updated: clear stale "endpoint unreachable" cooldown from previous host.
  PropertiesService.getUserProperties().deleteProperty('dt.api.endpointCooldown');
  return { ok: true };
}

/**
 * Saves backend API key (Bearer) for the current Google account. Pass empty to clear.
 * @param {string} key
 * @return {{ ok: boolean }}
 */
function config_saveUserApiKey(key) {
  if (!config_allowUserBackendConfig_()) {
    throw new Error(i18n_t('error.backend_config_locked'));
  }
  var k = String(key || '').trim();
  if (!k) {
    PropertiesService.getUserProperties().deleteProperty(DT_USER_API_KEY_);
    return { ok: true };
  }
  PropertiesService.getUserProperties().setProperty(DT_USER_API_KEY_, k);
  return { ok: true };
}
