/**
 * @fileoverview Backend URL and API key.
 * - User properties: per Google account (sidebar) — URL + key.
 * - Script properties: optional default base URL set in the Apps Script editor (all users),
 *   used only when the user has not set their own URL.
 */

var DT_SCRIPT_API_BASE_URL_KEY_ = 'dt.api.baseUrl';
/** Per-user override from the sidebar (takes precedence over script default). */
var DT_USER_API_BASE_URL_KEY_ = 'dt.api.baseUrl';
/** User-specific secret; not shared with other editors of the deployment. */
var DT_USER_API_KEY_ = 'dt.api.userApiKey';

/**
 * @return {string} Base URL without trailing slash, or empty if unset
 */
function getApiBaseUrl_() {
  var userRaw = PropertiesService.getUserProperties().getProperty(DT_USER_API_BASE_URL_KEY_);
  if (userRaw != null && String(userRaw).trim() !== '') {
    return String(userRaw).replace(/\/$/, '');
  }
  var scriptRaw = PropertiesService.getScriptProperties().getProperty(DT_SCRIPT_API_BASE_URL_KEY_);
  return scriptRaw ? String(scriptRaw).replace(/\/$/, '') : '';
}

/**
 * @return {string} API key or empty
 */
function getUserApiKey_() {
  var raw = PropertiesService.getUserProperties().getProperty(DT_USER_API_KEY_);
  return raw ? String(raw).trim() : '';
}

/**
 * Saves backend base URL for the current Google account (UserProperties).
 * Pass empty string to clear the user's URL; the script-level default in the editor still applies if set.
 * @param {string} url
 * @return {{ ok: boolean }}
 */
function config_saveApiBaseUrl(url) {
  var u = String(url || '').trim();
  if (!u) {
    PropertiesService.getUserProperties().deleteProperty(DT_USER_API_BASE_URL_KEY_);
    return { ok: true };
  }
  if (!/^https?:\/\//i.test(u)) {
    throw new Error(i18n_t('error.url_must_be_http'));
  }
  PropertiesService.getUserProperties().setProperty(DT_USER_API_BASE_URL_KEY_, u.replace(/\/$/, ''));
  return { ok: true };
}

/**
 * Saves backend API key (Bearer) for the current Google account. Pass empty to clear.
 * @param {string} key
 * @return {{ ok: boolean }}
 */
function config_saveUserApiKey(key) {
  var k = String(key || '').trim();
  if (!k) {
    PropertiesService.getUserProperties().deleteProperty(DT_USER_API_KEY_);
    return { ok: true };
  }
  PropertiesService.getUserProperties().setProperty(DT_USER_API_KEY_, k);
  return { ok: true };
}
