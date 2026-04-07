/**
 * @fileoverview Send valid selected rows to backend / carrier adapter; write tracking + status columns.
 * Implements batching (50 rows), optimistic lock, checkpointing and localized messages.
 */

var SEND_BATCH_SIZE_ = 50;
var SEND_CHECKPOINT_KEY_ = 'dt.send.checkpoint';
/** Wait for document lock (ms). Background auto-sync uses short per-sheet locks; this covers long sends/syncs. */
var SEND_DOC_LOCK_WAIT_MS_ = 120000;

/**
 * Backend/carrier may return structured errors; never surface "[object Object]" in the sidebar.
 * @param {*} msg
 * @return {string}
 */
function send_coerceErrorMessage_(msg) {
  if (msg == null || msg === '') {
    return '';
  }
  if (typeof msg === 'string') {
    return msg;
  }
  if (Array.isArray(msg)) {
    var parts = msg
      .map(function (item) {
        return send_coerceErrorMessage_(item);
      })
      .filter(function (item) {
        return item;
      });
    return parts.join(' | ');
  }
  if (typeof msg === 'object') {
    try {
      if (msg.message != null) {
        var inner = send_coerceErrorMessage_(msg.message);
        if (inner) {
          return inner;
        }
      }
      if (msg.detail != null) {
        var detail = send_coerceErrorMessage_(msg.detail);
        if (detail) {
          return detail;
        }
      }
      if (msg.error != null) {
        var err = send_coerceErrorMessage_(msg.error);
        if (err) {
          return err;
        }
      }
      if (msg.title != null) {
        var title = send_coerceErrorMessage_(msg.title);
        if (title) {
          return title;
        }
      }
      return JSON.stringify(msg);
    } catch (e) {
      return String(msg);
    }
  }
  return String(msg);
}

/**
 * Guard against a common mis-mapping where the address column is actually a
 * delivery-mode column (e.g. "التوصيل للمكتب" / "A domicile").
 * @param {*} raw
 * @return {boolean}
 */
function send_looksLikeDeliveryModeValue_(raw) {
  var normalized =
    typeof order_normalizeDeliveryText_ === 'function'
      ? order_normalizeDeliveryText_(raw)
      : raw != null
        ? String(raw).trim().toLowerCase()
        : '';
  if (!normalized || normalized.length > 40) {
    return false;
  }
  if (normalized.indexOf('للمكتب') !== -1) {
    return true;
  }
  if (normalized.indexOf('للمنزل') !== -1 || normalized.indexOf('المنزل') !== -1) {
    return true;
  }
  if (typeof ORDER_DELIVERY_PICKUP_TERMS_ === 'object' && ORDER_DELIVERY_PICKUP_TERMS_[normalized]) {
    return true;
  }
  if (typeof ORDER_DELIVERY_HOME_TERMS_ === 'object' && ORDER_DELIVERY_HOME_TERMS_[normalized]) {
    return true;
  }
  if (
    typeof ORDER_DELIVERY_PICKUP_HINT_RE_ !== 'undefined' &&
    ORDER_DELIVERY_PICKUP_HINT_RE_ &&
    ORDER_DELIVERY_PICKUP_HINT_RE_.test(normalized)
  ) {
    return true;
  }
  if (
    typeof ORDER_DELIVERY_HOME_HINT_RE_ !== 'undefined' &&
    ORDER_DELIVERY_HOME_HINT_RE_ &&
    ORDER_DELIVERY_HOME_HINT_RE_.test(normalized)
  ) {
    return true;
  }
  return false;
}

/**
 * Batches send for selected rows, with checkpoint/resume and label URL collection.
 * @param {Object=} options
 * @return {{
 *   attempted: number,
 *   succeeded: number,
 *   failed: number,
 *   total: number,
 *   done: boolean,
 *   message?: string,
 *   labelUrls?: Array<{ rowNumber: number, url: string }>
 * }}
 */
function send_sendSelection(rowSelectionSpec, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SEND_DOC_LOCK_WAIT_MS_)) {
    throw new Error(i18n_t('error.send_in_progress'));
  }
  try {
    license_assertOperationsAllowed_({
      skipRefresh: !!opts.skipLicenseRefresh,
    });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId = ss.getId();

    var activeSheet = ss.getActiveSheet();
    var sheetId = activeSheet.getSheetId();

    var mapping = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
    if (!mapping) {
      throw new Error(i18n_t('error.mapping_setup_required'));
    }
    mapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;

    var columns = mapping.columns || {};
    var sheet = getSheetById_(ss, mapping.sheetId || sheetId);
    if (!sheet) {
      throw new Error(i18n_t('error.sheet_not_found'));
    }

  var fastPreviewMode =
    rowSelectionSpec != null && String(rowSelectionSpec).trim() !== '';
  var preview = order_previewSelection(rowSelectionSpec, {
    skipDuplicateScan: fastPreviewMode,
  });
  send_assertSmartCoreMapping_(
    columns,
    preview && preview.rows ? preview.rows : [],
    mapping && mapping.defaultCarrier ? String(mapping.defaultCarrier) : null,
  );

  // If there are no valid rows at all but we did analyze some, surface a clear
  // error instead of silently returning a zero-send result. This usually means
  // required columns are missing or mis-mapped.
  var anyAnalyzedRows = preview.rows && preview.rows.some(function (r) {
    return !r.skipped;
  });
  var anyValidRows = preview.rows && preview.rows.some(function (r) {
    return !r.skipped && r.valid && r.order && !r.order.externalShipmentId;
  });
  if (anyAnalyzedRows && !anyValidRows) {
    throw new Error(i18n_t('error.no_valid_rows_for_send'));
  }

  var validRows = preview.rows.filter(function (r) {
    return !r.skipped && r.valid && r.order && !r.order.externalShipmentId;
  });

  if (validRows.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, total: 0, done: true };
  }

  // Check for checkpoint (resume from previous interrupted send). Scope by
  // spreadsheet, sheet and selection window so that changing sheets or
  // selections does not resume an unrelated batch.
  var checkpointRaw = PropertiesService.getUserProperties().getProperty(
    spreadsheetId + '.' + sheetId + '.' + SEND_CHECKPOINT_KEY_,
  );
  var startIndex = 0;
  if (checkpointRaw) {
    try {
      var cp = JSON.parse(checkpointRaw);
      var rowSig =
        preview.selectedRowNumbers && preview.selectedRowNumbers.length
          ? preview.selectedRowNumbers.join(',')
          : preview.startRow + ':' + preview.endRow;
      var checkpointMatches =
        cp.spreadsheetId === spreadsheetId &&
        cp.sheetId === sheetId &&
        (cp.rowSig != null && cp.rowSig !== ''
          ? cp.rowSig === rowSig
          : cp.startRow === preview.startRow && cp.endRow === preview.endRow);
      if (checkpointMatches) {
        startIndex = cp.nextIndex || 0;
      }
    } catch (e) {}
  }

  var businessSettings = businessSettings_get().value || businessSettings_getDefaults_();
  // Compatibility bridge: older UI/settings store pickup desk as stopDeskId,
  // while backend bulk flow expects defaultHubId for pickup-point fallback.
  if (businessSettings) {
    var bsStopDesk =
      businessSettings.stopDeskId != null
        ? String(businessSettings.stopDeskId).trim()
        : '';
    if (
      bsStopDesk &&
      (businessSettings.defaultHubId == null ||
        String(businessSettings.defaultHubId).trim() === '')
    ) {
      businessSettings.defaultHubId = bsStopDesk;
    }
  }
  var sent = 0;
  var failed = 0;
  var labelUrls = [];
  var batchDetails = [];

  var startTime = Date.now();
  var MAX_MS = 5 * 60 * 1000; // 5 minutes, leave buffer before Apps Script 6-min limit.

  var i = startIndex;
  while (i < validRows.length) {
    if (Date.now() - startTime > MAX_MS) {
      // Save checkpoint and return partial result
      PropertiesService.getUserProperties().setProperty(
        spreadsheetId + '.' + sheetId + '.' + SEND_CHECKPOINT_KEY_,
        JSON.stringify({
          spreadsheetId: spreadsheetId,
          sheetId: sheetId,
          startRow: preview.startRow,
          endRow: preview.endRow,
          rowSig:
            preview.selectedRowNumbers && preview.selectedRowNumbers.length
              ? preview.selectedRowNumbers.join(',')
              : preview.startRow + ':' + preview.endRow,
          nextIndex: i,
        }),
      );
      var attemptedSoFar = sent + failed;
      return {
        attempted: attemptedSoFar,
        succeeded: sent,
        failed: failed,
        total: validRows.length,
        done: false,
        message: i18n_format('send.partial', attemptedSoFar, validRows.length),
      };
    }

    var batch = validRows.slice(i, i + SEND_BATCH_SIZE_);

    // Optimistic lock: mark as sending before API calls
    if (columns.statusColumn != null) {
      batch.forEach(function (r) {
        sheet.getRange(r.rowNumber, Number(columns.statusColumn)).setValue(i18n_t('send.sending'));
      });
      SpreadsheetApp.flush();
    }

    // Group by carrier so each request uses a single adapter + credentials payload.
    var byCarrier = {};
    batch.forEach(function (r) {
      var order = r.order;
      if (!order) return;
      var carrierId = resolveCarrierAdapterId_(
        order.carrier || null,
        mapping.defaultCarrier ? mapping.defaultCarrier : null,
      );
      if (!carrierId) {
        failed++;
        if (columns.statusColumn != null) {
          sheet.getRange(r.rowNumber, Number(columns.statusColumn)).setValue(i18n_t('val.carrier_required'));
        }
        batchDetails.push({
          rowNumber: r.rowNumber,
          ok: false,
          errorMessage: i18n_t('val.carrier_required'),
        });
        return;
      }
      if (!byCarrier[carrierId]) {
        byCarrier[carrierId] = [];
      }
      byCarrier[carrierId].push(r);
    });

    Object.keys(byCarrier).forEach(function (carrierId) {
      var carrierRows = byCarrier[carrierId];
      var creds = carrierCreds_getForCarrier_(carrierId);
      var credsError = send_getCarrierCredentialsError_(carrierId, creds);
      if (credsError) {
        carrierRows.forEach(function (rowObj) {
          failed++;
          if (columns.statusColumn != null) {
            sheet
              .getRange(rowObj.rowNumber, Number(columns.statusColumn))
              .setValue(i18n_format('general.error', credsError));
          }
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: false,
            errorMessage: credsError,
          });
        });
        return;
      }
      var payload = {
        carrier: String(carrierId),
        spreadsheetId: spreadsheetId,
        sheetName: sheet.getName(),
        orders: carrierRows.map(function (r) {
          return send_buildBackendOrder_(r.order, r.rowNumber, businessSettings);
        }),
        businessSettings: businessSettings,
        credentials: creds || {},
      };
      try {
        var res = apiJsonPost_('/v1/shipments/send', payload);
        var globalErrorMessage =
          res && res.ok === false
            ? send_coerceErrorMessage_(
                res.errorMessage != null ? res.errorMessage : res.message != null ? res.message : '',
              ) || i18n_t('send.error_generic')
            : '';
        if (globalErrorMessage) {
          carrierRows.forEach(function (rowObj) {
            failed++;
            if (columns.statusColumn != null) {
              sheet
                .getRange(rowObj.rowNumber, Number(columns.statusColumn))
                .setValue(i18n_format('general.error', globalErrorMessage));
            }
            batchDetails.push({
              rowNumber: rowObj.rowNumber,
              ok: false,
              errorMessage: globalErrorMessage,
            });
          });
          return;
        }
        var successes = res && res.successes && Array.isArray(res.successes) ? res.successes : [];
        var failuresRes = res && res.failures && Array.isArray(res.failures) ? res.failures : [];
        var handled = {};

        successes.forEach(function (s) {
          var idx = Number(s.index);
          if (isNaN(idx) || idx < 0 || idx >= carrierRows.length) return;
          handled[idx] = true;
          var rowObj = carrierRows[idx];
          var externalId = s.externalId != null ? String(s.externalId) : s.parcelId != null ? String(s.parcelId) : null;
          var trackingNumber = s.trackingNumber != null ? String(s.trackingNumber) : null;
          var labelUrl = s.labelUrl != null ? String(s.labelUrl) : null;
          if (columns.externalShipmentIdColumn != null && externalId) {
            sheet.getRange(rowObj.rowNumber, Number(columns.externalShipmentIdColumn)).setValue(externalId);
          }
          if (columns.trackingColumn != null && trackingNumber) {
            sheet.getRange(rowObj.rowNumber, Number(columns.trackingColumn)).setValue(trackingNumber);
          }
          if (columns.labelUrlColumn != null && labelUrl) {
            sheet.getRange(rowObj.rowNumber, Number(columns.labelUrlColumn)).setValue(labelUrl);
            labelUrls.push({ rowNumber: rowObj.rowNumber, url: labelUrl });
          }
          if (columns.statusColumn != null) {
            sheet.getRange(rowObj.rowNumber, Number(columns.statusColumn)).setValue(i18n_t('send.sent_status'));
          }
          sent++;
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: true,
            errorMessage: null,
          });
        });

        failuresRes.forEach(function (f) {
          var idx = Number(f.index);
          if (isNaN(idx) || idx < 0 || idx >= carrierRows.length) return;
          handled[idx] = true;
          var rowObj = carrierRows[idx];
          var errMsg =
            send_coerceErrorMessage_(f.errorMessage) || i18n_t('send.error_generic');
          if (columns.statusColumn != null) {
            sheet.getRange(rowObj.rowNumber, Number(columns.statusColumn)).setValue(i18n_format('general.error', errMsg));
          }
          failed++;
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: false,
            errorMessage: errMsg,
          });
        });

        // Defensive fallback for any row omitted by backend response arrays.
        carrierRows.forEach(function (rowObj, idx) {
          if (handled[idx]) return;
          failed++;
          var missingMsg = i18n_t('send.error_generic');
          if (columns.statusColumn != null) {
            sheet
              .getRange(rowObj.rowNumber, Number(columns.statusColumn))
              .setValue(i18n_format('general.error', missingMsg));
          }
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: false,
            errorMessage: missingMsg,
          });
        });
      } catch (e) {
        carrierRows.forEach(function (rowObj) {
          failed++;
          var errText =
            send_coerceErrorMessage_(e && e.message != null ? e.message : e) ||
            i18n_t('send.error_generic');
          if (columns.statusColumn != null) {
            sheet
              .getRange(rowObj.rowNumber, Number(columns.statusColumn))
              .setValue(i18n_format('general.error', errText));
          }
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: false,
            errorMessage: errText,
          });
        });
      }
    });

    SpreadsheetApp.flush();
    i += SEND_BATCH_SIZE_;
  }

  // Clear checkpoint on completion
  PropertiesService.getUserProperties().deleteProperty(
    spreadsheetId + '.' + sheetId + '.' + SEND_CHECKPOINT_KEY_,
  );

  // Append a single consolidated journal entry for this send run.
  try {
    if (sent + failed > 0) {
      ops_appendLogEntry_(spreadsheetId, {
        kind: 'send',
        sheetId: sheetId,
        sheetName: sheet.getName(),
        attempted: sent + failed,
        succeeded: sent,
        failed: failed,
        details: batchDetails,
      });
    }
  } catch (logErr) {}

  // Keep mobile companion sheets/charts in sync after manual sends.
  try {
    if (typeof mobile_refreshCompanionArtifactsForSheet_ === 'function') {
      mobile_refreshCompanionArtifactsForSheet_(ss, sheet, {
        columns: columns,
        defaultCarrier:
          mapping.defaultCarrier != null && String(mapping.defaultCarrier).trim() !== ''
            ? String(mapping.defaultCarrier).trim()
            : null,
        headerRow:
          mapping.headerRow != null && String(mapping.headerRow).trim() !== ''
            ? Number(mapping.headerRow)
            : 1,
      });
    }
  } catch (refreshErr) {}

  var failedDetails = batchDetails
    .filter(function (d) {
      return !d.ok && send_coerceErrorMessage_(d.errorMessage);
    })
    .map(function (d) {
      return { row: d.rowNumber, error: send_coerceErrorMessage_(d.errorMessage) };
    });
  return {
    attempted: sent + failed,
    succeeded: sent,
    failed: failed,
    total: validRows.length,
    done: true,
    labelUrls: labelUrls,
    message: i18n_format('send.success', sent),
    errors: failedDetails.length > 0 ? failedDetails : undefined,
  };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Validate required credentials for known carriers before network calls.
 *
 * @param {string} carrierId
 * @param {Object<string, *>|null|undefined} creds
 * @return {string} Empty string when credentials look valid.
 */
function send_getCarrierCredentialsError_(carrierId, creds) {
  var id = carrierId != null ? String(carrierId).trim().toLowerCase() : '';
  var c = creds && typeof creds === 'object' ? creds : {};
  if (id === 'zr') {
    var tenant = c.tenantId != null ? String(c.tenantId).trim() : '';
    var secret =
      c.secretKey != null && String(c.secretKey).trim() !== ''
        ? String(c.secretKey).trim()
        : c.apiKey != null
          ? String(c.apiKey).trim()
          : '';
    if (!tenant || !secret) {
      return i18n_t('error.zr_tenant_secret_required');
    }
  } else if (id === 'yalidine') {
    var apiId = c.apiId != null ? String(c.apiId).trim() : '';
    var apiToken = c.apiToken != null ? String(c.apiToken).trim() : '';
    if (!apiId || !apiToken) {
      return i18n_t('error.yalidine_id_token_required');
    }
  }
  return '';
}

/**
 * Smart sanity checks to catch common mapping mistakes early.
 * Prevents sending rows when core destination fields are clearly mis-mapped.
 *
 * @param {Object} columns
 * @param {Array<Object>=} previewRows
 * @param {string|null=} defaultCarrierId
 */
function send_assertSmartCoreMapping_(columns, previewRows, defaultCarrierId) {
  var c = columns || {};
  var addressCol = c.addressColumn != null ? Number(c.addressColumn) : null;
  var wilayaCol = c.wilayaColumn != null ? Number(c.wilayaColumn) : null;
  var communeCol = c.communeColumn != null ? Number(c.communeColumn) : null;

  var hasAddress = Number.isFinite(addressCol) && addressCol >= 1;
  var hasWilaya = Number.isFinite(wilayaCol) && wilayaCol >= 1;
  var hasCommune = Number.isFinite(communeCol) && communeCol >= 1;

  // If all three are mapped to the exact same column, shipping payload quality is invalid.
  if (
    hasAddress &&
    hasWilaya &&
    hasCommune &&
    addressCol === wilayaCol &&
    wilayaCol === communeCol
  ) {
    // Yalidine can work with a single BALADIA-like column when commune is present;
    // ZR and unknown carriers still need strict territory safety checks.
    var rows = Array.isArray(previewRows) ? previewRows : [];
    var analyzedCount = 0;
    var allYalidine = rows.length > 0;
    var canInferTerritory = false;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      if (row.skipped || !row.order) {
        continue;
      }
      analyzedCount++;
      var ord = row.order || {};
      var carrierId =
        typeof resolveCarrierAdapterId_ === 'function'
          ? resolveCarrierAdapterId_(ord.carrier || null, defaultCarrierId || null)
          : ord.carrier != null
            ? String(ord.carrier).trim().toLowerCase()
            : defaultCarrierId != null
              ? String(defaultCarrierId).trim().toLowerCase()
              : '';
      if (carrierId !== 'yalidine') {
        allYalidine = false;
      }
      var commune = ord.commune != null ? String(ord.commune).trim() : '';
      var wCode = Number(ord.wilayaCode);
      if (commune && isFinite(wCode) && wCode >= 1 && wCode <= 58) {
        canInferTerritory = true;
        break;
      }
    }
    if (analyzedCount > 0 && allYalidine) {
      return;
    }
    if (!canInferTerritory) {
      throw new Error(
        'ربط الأعمدة غير صحيح: لا يمكن أن تكون «العنوان» و«الولاية» و«البلدية/المدينة» نفس العمود. قم بتصحيح الربط ثم أعد الإرسال.',
      );
    }
  }

  var rowsForAddressCheck = Array.isArray(previewRows) ? previewRows : [];
  var suspiciousAddressRows = [];
  var analyzedAddressRows = 0;
  for (var j = 0; j < rowsForAddressCheck.length; j++) {
    var row = rowsForAddressCheck[j] || {};
    if (row.skipped || !row.order) {
      continue;
    }
    var addr = row.order.address != null ? String(row.order.address).trim() : '';
    if (!addr) {
      continue;
    }
    analyzedAddressRows++;
    if (send_looksLikeDeliveryModeValue_(addr)) {
      suspiciousAddressRows.push(row.rowNumber);
    }
  }
  if (
    analyzedAddressRows > 0 &&
    suspiciousAddressRows.length > 0 &&
    suspiciousAddressRows.length === analyzedAddressRows
  ) {
    throw new Error(i18n_t('error.address_column_looks_like_delivery_type'));
  }
}

/**
 * Best-effort destination wilaya string for carrier APIs (Yalidine needs non-empty names).
 * @param {Object} order
 * @return {string}
 */
function send_resolveDestinationWilayaText_(order) {
  var wc = order && order.wilayaCode != null ? Number(order.wilayaCode) : NaN;
  if (isFinite(wc) && wc >= 1 && wc <= 58 && typeof order_getWilayaLabelByCode_ === 'function') {
    var byCode = order_getWilayaLabelByCode_(wc);
    if (byCode) {
      return byCode;
    }
  }
  var w = order && order.wilaya != null ? String(order.wilaya).trim() : '';
  if (w) {
    return w;
  }
  var commune = order && order.commune != null ? String(order.commune).trim() : '';
  if (commune && typeof wilaya_resolveCodeFromText_ === 'function') {
    var inferred = wilaya_resolveCodeFromText_(commune);
    if (inferred != null && inferred >= 1 && inferred <= 58 && typeof order_getWilayaLabelByCode_ === 'function') {
      var byInf = order_getWilayaLabelByCode_(inferred);
      if (byInf) {
        return byInf;
      }
    }
  }
  return commune;
}

/**
 * @param {Object} order
 * @param {number} rowNumber
 * @param {Object=} businessSettings
 * @return {Object}
 */
function send_buildBackendOrder_(order, rowNumber, businessSettings) {
  var bs =
    businessSettings && typeof businessSettings === 'object'
      ? businessSettings
      : businessSettings_get().value || businessSettings_getDefaults_();
  var senderWilaya = bs && bs.senderWilaya != null ? String(bs.senderWilaya).trim() : '';
  if (!senderWilaya && bs && bs.wilaya != null) {
    senderWilaya = String(bs.wilaya).trim();
  }

  var destWilaya = send_resolveDestinationWilayaText_(order || {});
  var fromWilaya = senderWilaya || destWilaya;

  var first = order && order.customerFirstName ? String(order.customerFirstName).trim() : '';
  var last = order && order.customerLastName ? String(order.customerLastName).trim() : '';
  var customerName = [first, last].join(' ').trim();
  if (!customerName) {
    customerName = first || last || '';
  }
  return {
    rowIndex: rowNumber,
    spreadsheetId: order && order.spreadsheetId ? order.spreadsheetId : null,
    sheetName: order && order.sheetName ? order.sheetName : null,
    orderId: order && order.orderId ? String(order.orderId) : null,
    customerName: customerName,
    customerFirstName: first,
    customerLastName: last,
    phone1: order && order.phone ? String(order.phone) : '',
    phone2: null,
    address: order && order.address ? String(order.address) : '',
    wilaya: destWilaya,
    commune: order && order.commune ? String(order.commune) : '',
    codeWilaya: order && order.wilayaCode != null ? order.wilayaCode : null,
    fromWilayaName: fromWilaya,
    toWilayaName: destWilaya,
    from_wilaya_name: fromWilaya,
    to_wilaya_name: destWilaya,
    deliveryMode: order && order.deliveryType ? String(order.deliveryType) : '',
    deliveryType: order && order.deliveryType ? String(order.deliveryType) : '',
    totalPrice: order && order.codAmount != null ? Number(order.codAmount) : 0,
    productName: order && order.productName ? String(order.productName) : '',
    quantity: order && order.quantity != null ? Number(order.quantity) : 1,
    productPrice:
      order && order.codAmount != null && order.quantity != null && Number(order.quantity) > 0
        ? Number(order.codAmount) / Number(order.quantity)
        : null,
    note: order && order.notes ? String(order.notes) : null,
    station: order && order.stopDeskId ? String(order.stopDeskId) : null,
    hasExchange: !!(order && order.hasExchange),
    freeShipping: !!(order && order.freeShipping),
    productToCollect:
      order && order.productToCollect != null
        ? String(order.productToCollect)
        : null,
    externalId:
      order && order.externalShipmentId
        ? String(order.externalShipmentId)
        : order && order.orderId
          ? String(order.orderId)
          : null,
  };
}

/**
 * Returns all non-empty mapped label URLs from the active sheet.
 * Used by "Print all labels" to reopen every available label, not only last-send cache.
 * @return {{ items: Array<{ rowNumber: number, url: string }>, count: number }}
 */
function send_getAllLabelUrls() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();

  var saved;
  try {
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }
  if (!saved) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }

  var columns = saved.columns || {};
  if (columns.labelUrlColumn == null) {
    throw new Error(i18n_t('error.label_column_required'));
  }
  var labelCol = Number(columns.labelUrlColumn);
  if (isNaN(labelCol) || labelCol < 1) {
    throw new Error(i18n_t('error.label_column_invalid'));
  }

  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return { items: [], count: 0 };
  }

  var values = sheet
    .getRange(headerRow + 1, labelCol, lastRow - headerRow, 1)
    .getDisplayValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var raw = values[i] && values[i][0] != null ? String(values[i][0]).trim() : '';
    if (!raw) {
      continue;
    }
    out.push({
      rowNumber: headerRow + 1 + i,
      url: raw,
    });
  }
  return { items: out, count: out.length, spreadsheetId: spreadsheetId, sheetId: sheetId };
}
