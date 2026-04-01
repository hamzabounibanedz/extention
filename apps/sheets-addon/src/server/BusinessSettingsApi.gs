/**
 * Business settings: stored in UserProperties (per Google account).
 *
 * Shape is defined in shared `BusinessSettings` (TS). In Apps Script we validate minimally.
 */

function businessSettings_get() {
  var raw = DeliveryToolStorage.getBusinessSettingsJson();
  if (!raw) {
    return { ok: true, value: businessSettings_getDefaults_() };
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
    senderWilaya: '',
    senderWilayaCode: 0,
    senderAddress: '',
    defaultParcelWeight: 0.5,
    defaultParcelLength: 20,
    defaultParcelWidth: 15,
    defaultParcelHeight: 10,
  };
}
