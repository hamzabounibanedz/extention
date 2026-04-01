/**

 * @fileoverview HTTP helpers for backend API (UrlFetchApp).

 */



/**

 * Headers for authenticated requests (UserProperties API key, optional).

 * @return {Object<string,string>}

 */

function apiAuthHeaders_() {

  var key = getUserApiKey_();

  if (!key) {

    return {};

  }

  // Locked checklist: always send API key in X-API-Key.
  return { 'X-API-Key': String(key) };

}



/**

 * Shipment access token from last licence validation (when server uses LICENSE_SIGNING_SECRET).

 * @return {string}

 */

function getLicenseAccessTokenFromCache_() {

  var raw = DeliveryToolStorage.getLicenseCacheJson();

  if (!raw) {

    return '';

  }

  try {

    var rec = JSON.parse(raw);

    if (rec && rec.accessToken != null && String(rec.accessToken).trim() !== '') {

      return String(rec.accessToken).trim();

    }

  } catch (e) {

    /* ignore */

  }

  return '';

}



/**

 * GET JSON from path.

 * @param {string} path Absolute path starting with /

 * @return {Object}

 */

function apiJsonGet_(path) {

  var base = getApiBaseUrl_();

  if (!base) {

    throw new Error(i18n_t('error.backend_url_missing'));

  }

  var url = base + path;

  var options = {

    method: 'get',

    muteHttpExceptions: true,

    headers: apiAuthHeaders_(),

  };

  return fetchWithRetry_(url, options);

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

    throw new Error(i18n_t('error.backend_url_missing'));

  }

  var url = base + path;

  var headers = Object.assign(

    { 'Content-Type': 'application/json' },

    apiAuthHeaders_()

  );

  if (path.indexOf('/v1/shipments/') === 0) {
    var dtTok = null;
    if (typeof license_getAccessToken_ === 'function') {
      dtTok = license_getAccessToken_();
    }
    if (!dtTok) {
      dtTok = getLicenseAccessTokenFromCache_();
    }
    if (dtTok) {
      headers['X-DT-Access-Token'] = dtTok;
    }
  }

  var options = {

    method: 'post',

    muteHttpExceptions: true,

    payload: JSON.stringify(body || {}),

    headers: headers,

  };

  return fetchWithRetry_(url, options);

}

function fetchWithRetry_(url, options) {
  var maxAttempts = 5;
  var baseDelayMs = 750;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code !== 429) {
      return parseApiResponse_(res);
    }
    if (attempt === maxAttempts) {
      return parseApiResponse_(res);
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

    var msg = i18n_format('error.api_http', code);

    try {

      var errJson = JSON.parse(text);

      if (errJson && typeof errJson === 'object') {

        if (errJson.message) {

        msg = String(errJson.message);

        } else if (errJson.error) {

          msg = String(errJson.error);

        } else if (errJson.code) {

          msg = String(errJson.code);

        }

      }

    } catch (e) {

      if (text) {

        msg = msg + ': ' + text.slice(0, 180);

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

    throw new Error(i18n_t('error.api_invalid_json'));

  }

}


