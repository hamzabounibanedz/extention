/**
 * @fileoverview Carrier API keys per Google account (UserProperties) — never stored in the sheet.
 * Forwarded to the backend as `credentials` on send/tracking (not logged server-side).
 */

var DT_CARRIER_CREDS_KEY_ = 'dt.carrierCredentials.v1';

/**
 * @return {Object<string, Object>}
 */
function carrierCreds_parseMap_() {
  var raw = PropertiesService.getUserProperties().getProperty(DT_CARRIER_CREDS_KEY_);
  if (!raw || String(raw).trim() === '') {
    return {};
  }
  try {
    var o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

/**
 * Credentials object for a carrier id (adapter reads `apiKey` or `token`).
 * @param {string} carrierId
 * @return {Object<string, string>}
 */
function carrierCreds_getForCarrier_(carrierId) {
  var id = String(carrierId || '').trim();
  if (!id) {
    return {};
  }
  var map = carrierCreds_parseMap_();
  var row = map[id];
  if (!row || typeof row !== 'object') {
    return {};
  }
  var out = {};
  if (row.apiKey != null && String(row.apiKey).trim() !== '') {
    out.apiKey = String(row.apiKey).trim();
  }
  if (row.tenantId != null && String(row.tenantId).trim() !== '') {
    out.tenantId = String(row.tenantId).trim();
  }
  if (row.token != null && String(row.token).trim() !== '') {
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
    var hasZrPair =
      id === 'zr' &&
      row &&
      row.tenantId != null &&
      String(row.tenantId).trim() !== '' &&
      row.apiKey != null &&
      String(row.apiKey).trim() !== '';
    var has =
      row &&
      typeof row === 'object' &&
      ((row.apiKey && String(row.apiKey).trim() !== '') ||
        (row.token && String(row.token).trim() !== '') ||
        hasZrPair);
    byCarrier[id] = { hasApiKey: !!has };
  }
  return { carriers: carriers, byCarrier: byCarrier };
}

/**
 * Saves `apiKey` for a carrier. Pass empty string to clear keys for that carrier.
 * @param {string} carrierId
 * @param {string} apiKey
 * @return {ReturnType<typeof carrierCreds_getState>}
 */
function carrierCreds_saveApiKey(carrierId, apiKey) {
  var id = String(carrierId || '').trim();
  if (!id) {
    throw new Error(i18n_t('error.choose_carrier'));
  }
  var map = carrierCreds_parseMap_();
  var k = apiKey != null ? String(apiKey).trim() : '';
  if (!k) {
    if (map[id]) {
      delete map[id].apiKey;
      var row = map[id];
      var hasToken = row && row.token != null && String(row.token).trim() !== '';
      var hasApi = row && row.apiKey != null && String(row.apiKey).trim() !== '';
      if (!hasToken && !hasApi) {
        delete map[id];
      }
    }
  } else {
    if (!map[id] || typeof map[id] !== 'object') {
      map[id] = {};
    }
    if (id === 'zr') {
      var sep = k.indexOf('|') >= 0 ? '|' : k.indexOf(':') >= 0 ? ':' : '';
      if (sep) {
        var parts = k.split(sep);
        if (parts.length >= 2) {
          map[id].tenantId = String(parts[0]).trim();
          map[id].apiKey = String(parts.slice(1).join(sep)).trim();
        } else {
          map[id].apiKey = k;
        }
      } else {
        map[id].apiKey = k;
      }
    } else {
      map[id].apiKey = k;
    }
  }
  PropertiesService.getUserProperties().setProperty(DT_CARRIER_CREDS_KEY_, JSON.stringify(map));
  return carrierCreds_getState();
}
