/**
 * Business settings: stored in UserProperties (per Google account).
 *
 * Shape is defined in shared `BusinessSettings` (TS). In Apps Script we validate minimally.
 */

/**
 * Keep `stopDeskId` and `defaultHubId` in sync so pickup-point rows without a sheet
 * column still resolve a hub everywhere (preview, validation, backend payload).
 * @param {Object} value Mutable settings object
 */
function businessSettings_normalizeHubFields_(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  var desk =
    value.stopDeskId != null ? String(value.stopDeskId).trim() : '';
  var hub =
    value.defaultHubId != null ? String(value.defaultHubId).trim() : '';
  if (desk && hub && desk !== hub) {
    // UI / saved sender field is stopDeskId; keep both fields identical.
    value.defaultHubId = desk;
  } else if (desk && !hub) {
    value.defaultHubId = desk;
  } else if (hub && !desk) {
    value.stopDeskId = hub;
  }
  return value;
}

function businessSettings_get() {
  var raw = DeliveryToolStorage.getBusinessSettingsJson();
  if (!raw) {
    var empty = businessSettings_getDefaults_();
    businessSettings_normalizeHubFields_(empty);
    return { ok: true, value: empty };
  }
  try {
    var parsed = JSON.parse(raw);
    // Shallow merge onto defaults to tolerate future field additions.
    var defaults = businessSettings_getDefaults_();
    for (var k in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, k) && !Object.prototype.hasOwnProperty.call(parsed, k)) {
        parsed[k] = defaults[k];
      }
    }
    businessSettings_normalizeHubFields_(parsed);
    return { ok: true, value: parsed };
  } catch (e) {
    return { ok: false, error: 'BUSINESS_SETTINGS_CORRUPT' };
  }
}

function businessSettings_save(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(i18n_t('error.business_payload_required'));
  }

  // Normalize onto defaults so future fields + sender-specific fields are always present.
  var defaults = businessSettings_getDefaults_();
  var merged = {};
  for (var k in defaults) {
    if (Object.prototype.hasOwnProperty.call(defaults, k)) {
      merged[k] = defaults[k];
    }
  }
  for (var key in payload) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      merged[key] = payload[key];
    }
  }

  // Auto-populate sender-specific fields when UI payload omits them.
  if (!merged.senderWilaya && merged.wilaya) {
    merged.senderWilaya = merged.wilaya;
  }
  if ((!merged.senderWilayaCode || merged.senderWilayaCode === 0) && merged.wilayaCode != null) {
    merged.senderWilayaCode = merged.wilayaCode;
  }
  if (!merged.senderAddress && merged.address) {
    merged.senderAddress = merged.address;
  }

  // Ensure parcel dimensions are sensible positive numbers, otherwise fall back to defaults.
  function normalizePositiveNumber_(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) {
      return fallback;
    }
    return n;
  }
  merged.defaultParcelWeight = normalizePositiveNumber_(merged.defaultParcelWeight, defaults.defaultParcelWeight);
  merged.defaultParcelLength = normalizePositiveNumber_(merged.defaultParcelLength, defaults.defaultParcelLength);
  merged.defaultParcelWidth = normalizePositiveNumber_(merged.defaultParcelWidth, defaults.defaultParcelWidth);
  merged.defaultParcelHeight = normalizePositiveNumber_(merged.defaultParcelHeight, defaults.defaultParcelHeight);

  businessSettings_normalizeHubFields_(merged);

  // Minimal validation (avoid storing huge payloads in UserProperties).
  var json = JSON.stringify(merged);
  if (json.length > 9000) {
    throw new Error(i18n_t('error.business_settings_too_large'));
  }

  DeliveryToolStorage.setBusinessSettingsJson(json);
  return { ok: true };
}

function businessSettings_getDefaults_() {
  return {
    businessName: '',
    phone: '',
    address: '',
    wilaya: '',
    wilayaCode: 0,
    commune: '',
    defaultCarrier: '',
    stopDeskId: null,
    defaultHubId: null,
    senderWilaya: '',
    senderWilayaCode: 0,
    senderAddress: '',
    defaultParcelWeight: 0.5,
    defaultParcelLength: 20,
    defaultParcelWidth: 15,
    defaultParcelHeight: 10,
    autoValidateNoest: true,
  };
}
