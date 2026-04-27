/**
 * @fileoverview Send valid selected rows to backend / carrier adapter; write tracking + status columns.
 * Implements batching (50 rows), optimistic lock, checkpointing and localized messages.
 */

var SEND_BATCH_SIZE_ = 50;
var SEND_CHECKPOINT_KEY_ = 'dt.send.checkpoint';
/** Wait for document lock (ms). Background auto-sync uses short per-sheet locks; this covers long sends/syncs. */
var SEND_DOC_LOCK_WAIT_MS_ = 120000;

function send_orderAlreadyHasTracking_(order) {
  if (!order) return false;
  var externalId =
    order.externalShipmentId != null ? String(order.externalShipmentId).trim() : '';
  var tracking =
    order.trackingNumber != null ? String(order.trackingNumber).trim() : '';
  return !!(externalId || tracking);
}

/**
 * @param {Object} previewRow
 * @param {string} fallbackText
 * @return {string}
 */
function send_rowValidationErrorMessage_(previewRow, fallbackText) {
  var fallback = fallbackText || i18n_t('send.error_generic');
  var row = previewRow && typeof previewRow === 'object' ? previewRow : {};
  var errors = Array.isArray(row.errors) ? row.errors : [];
  var parts = [];
  errors.forEach(function (err) {
    var msg = send_finalizeErrorMessage_(err, fallback);
    if (msg && parts.indexOf(msg) === -1) {
      parts.push(msg);
    }
  });
  var out = parts.length ? parts.join(' | ') : fallback;
  return out.length > 500 ? out.slice(0, 497) + '...' : out;
}

/**
 * Backend/carrier may return structured errors; never surface "[object Object]" in the sidebar.
 * @param {*} msg
 * @param {number=} depth
 * @return {string}
 */
function send_isObjectPlaceholder_(text) {
  return /^\[object [^\]]+\]$/i.test(String(text || '').trim());
}

/**
 * @param {*} text
 * @return {string}
 */
function send_compactErrorText_(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @return {*}
 */
function send_tryParseJsonText_(text) {
  var t = String(text || '').trim();
  if (!t) return null;
  var startsLikeJson = t.charAt(0) === '{' || t.charAt(0) === '[';
  var endsLikeJson =
    t.charAt(t.length - 1) === '}' || t.charAt(t.length - 1) === ']';
  if (!startsLikeJson || !endsLikeJson) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function send_coerceErrorMessage_(msg, depth) {
  var d = Number(depth || 0);
  if (!isFinite(d) || d < 0) d = 0;
  if (d > 5 || msg == null || msg === '') {
    return '';
  }
  if (typeof msg === 'string') {
    var text = send_compactErrorText_(msg);
    if (!text || send_isObjectPlaceholder_(text)) {
      return '';
    }
    var parsed = send_tryParseJsonText_(text);
    if (parsed != null) {
      var parsedText = send_coerceErrorMessage_(parsed, d + 1);
      if (parsedText) {
        return parsedText;
      }
    }
    return text;
  }
  if (typeof msg === 'number' || typeof msg === 'boolean') {
    return String(msg);
  }
  if (Array.isArray(msg)) {
    var parts = msg
      .map(function (item) {
        return send_coerceErrorMessage_(item, d + 1);
      })
      .filter(function (item) {
        return item;
      });
    return parts.join(' | ');
  }
  if (typeof msg === 'object') {
    try {
      var preferredKeys = [
        'message',
        'detail',
        'error',
        'title',
        'description',
        'reason',
        'cause',
        'errors',
      ];
      for (var i = 0; i < preferredKeys.length; i++) {
        var preferredKey = preferredKeys[i];
        if (msg[preferredKey] == null) {
          continue;
        }
        var preferredText = send_coerceErrorMessage_(msg[preferredKey], d + 1);
        if (preferredText) {
          return preferredText;
        }
      }
      var fragments = [];
      for (var k in msg) {
        if (!Object.prototype.hasOwnProperty.call(msg, k)) {
          continue;
        }
        if (k === 'stack' || k === 'raw') {
          continue;
        }
        var part = send_coerceErrorMessage_(msg[k], d + 1);
        if (!part) {
          continue;
        }
        if (fragments.indexOf(part) === -1) {
          fragments.push(part);
        }
        if (fragments.length >= 3) {
          break;
        }
      }
      if (fragments.length) {
        return fragments.join(' | ');
      }
      var encoded = send_compactErrorText_(JSON.stringify(msg));
      if (
        !encoded ||
        encoded === '{}' ||
        encoded === '[]' ||
        send_isObjectPlaceholder_(encoded)
      ) {
        return '';
      }
      if (encoded.length > 600) {
        return encoded.slice(0, 597) + '...';
      }
      return encoded;
    } catch (e) {
      var fallback = send_compactErrorText_(String(msg));
      if (!fallback || send_isObjectPlaceholder_(fallback)) {
        return '';
      }
      return fallback;
    }
  }
  var fallbackText = send_compactErrorText_(String(msg));
  if (!fallbackText || send_isObjectPlaceholder_(fallbackText)) {
    return '';
  }
  return fallbackText;
}

/**
 * Coerce then hard-sanitize the final user-facing error string.
 * This extra guard ensures placeholders such as "[object Object]" never leak.
 *
 * @param {*} raw
 * @param {string=} fallbackText
 * @return {string}
 */
function send_finalizeErrorMessage_(raw, fallbackText) {
  var fallback = send_compactErrorText_(fallbackText || '');
  if (!fallback || send_isObjectPlaceholder_(fallback)) {
    fallback = i18n_t('send.error_generic');
  }
  var text = send_coerceErrorMessage_(raw);
  if (!text || send_isObjectPlaceholder_(text)) {
    return fallback;
  }
  var normalized = send_compactErrorText_(text);
  if (!normalized || send_isObjectPlaceholder_(normalized)) {
    return fallback;
  }
  return normalized;
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
 * Guard against mis-mapping where address column actually contains carrier names.
 * @param {*} raw
 * @return {boolean}
 */
function send_looksLikeCarrierValue_(raw) {
  if (raw == null) {
    return false;
  }
  var text = String(raw).trim();
  if (!text || text.length > 50) {
    return false;
  }
  if (typeof resolveCarrierAlias_ === 'function' && resolveCarrierAlias_(text)) {
    return true;
  }
  var n = text.toLowerCase().replace(/[\s_\-./]+/g, '');
  return (
    n === 'zr' ||
    n.indexOf('zrexpress') === 0 ||
    n === 'yalidine' ||
    n === 'yallidine' ||
    n === 'noest' ||
    n === 'nouest' ||
    /نوست|زد\s*ار|زدار|ياليدين|يالدين|يالي?دين/.test(text)
  );
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
    if (typeof ownership_assertCurrentSpreadsheetOwnedByActiveUser_ === 'function') {
      ownership_assertCurrentSpreadsheetOwnedByActiveUser_();
    }
    var spreadsheetId = ss.getId();

    var requestedSheetId =
      opts.sheetId != null && String(opts.sheetId).trim() !== ''
        ? Number(opts.sheetId)
        : NaN;
    var activeSheet =
      Number.isFinite(requestedSheetId) &&
      requestedSheetId >= 1 &&
      typeof getSheetById_ === 'function'
        ? getSheetById_(ss, requestedSheetId)
        : null;
    if (!activeSheet) {
      activeSheet = ss.getActiveSheet();
    }
    if (!activeSheet) {
      throw new Error(i18n_t('error.sheet_not_found'));
    }
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
    sheetId: sheetId,
    carrierMode: opts.carrierMode === 'override' ? 'override' : 'row',
    carrierOverride: opts.carrierOverride || null,
  });
  send_assertSmartCoreMapping_(
    columns,
    preview && preview.rows ? preview.rows : [],
    mapping && mapping.defaultCarrier ? String(mapping.defaultCarrier) : null,
  );
  var genericSendError = i18n_t('send.error_generic');
  var validationFailures = preview.rows
    ? preview.rows.filter(function (r) {
        return (
          !r.skipped &&
          !r.valid &&
          r.order &&
          !send_orderAlreadyHasTracking_(r.order)
        );
      })
    : [];
  var validationFailureDetails = validationFailures.map(function (r) {
    return {
      rowNumber: r.rowNumber,
      ok: false,
      errorMessage: send_rowValidationErrorMessage_(r, genericSendError),
    };
  });
  if (validationFailureDetails.length && columns.statusColumn != null) {
    validationFailureDetails.forEach(function (d) {
      sheet
        .getRange(d.rowNumber, Number(columns.statusColumn))
        .setValue(i18n_format('general.error', d.errorMessage));
    });
    SpreadsheetApp.flush();
  }

  // If there are no valid rows at all but we did analyze some, surface a clear
  // error instead of silently returning a zero-send result. This usually means
  // required columns are missing or mis-mapped.
  var anyAnalyzedRows = preview.rows && preview.rows.some(function (r) {
    return !r.skipped;
  });
  var anyValidRows = preview.rows && preview.rows.some(function (r) {
    return !r.skipped && r.valid && r.order && !send_orderAlreadyHasTracking_(r.order);
  });
  var anyAlreadyTrackedRows = preview.rows && preview.rows.some(function (r) {
    return !r.skipped && r.order && send_orderAlreadyHasTracking_(r.order);
  });
  if (anyAnalyzedRows && !anyValidRows && !anyAlreadyTrackedRows) {
    return {
      attempted: validationFailureDetails.length,
      succeeded: 0,
      failed: validationFailureDetails.length,
      total: validationFailureDetails.length,
      done: true,
      message: i18n_t('error.no_valid_rows_for_send'),
      errors: validationFailureDetails.map(function (d) {
        return { row: d.rowNumber, error: d.errorMessage };
      }),
    };
  }

  var validRows = preview.rows.filter(function (r) {
    return !r.skipped && r.valid && r.order && !send_orderAlreadyHasTracking_(r.order);
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
      rowSig +=
        '|carrier=' +
        (opts.carrierMode === 'override'
          ? 'override:' + String(opts.carrierOverride || '').trim()
          : 'row');
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
  if (
    businessSettings &&
    typeof businessSettings_normalizeHubFields_ === 'function'
  ) {
    businessSettings_normalizeHubFields_(businessSettings);
  }
  var sent = 0;
  var failed = validationFailureDetails.length;
  var labelUrls = [];
  var batchDetails = validationFailureDetails.slice();
  var totalRowsToProcess = validRows.length + validationFailureDetails.length;

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
            (preview.selectedRowNumbers && preview.selectedRowNumbers.length
              ? preview.selectedRowNumbers.join(',')
              : preview.startRow + ':' + preview.endRow) +
            '|carrier=' +
            (opts.carrierMode === 'override'
              ? 'override:' + String(opts.carrierOverride || '').trim()
              : 'row'),
          nextIndex: i,
        }),
      );
      var attemptedSoFar = sent + failed;
      return {
        attempted: attemptedSoFar,
        succeeded: sent,
        failed: failed,
        total: totalRowsToProcess,
        done: false,
        message: i18n_format('send.partial', attemptedSoFar, totalRowsToProcess),
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
        var globalErrorMessage = '';
        if (res && res.ok === false) {
          var globalFallback =
            res.errorCode != null
              ? 'Carrier request failed (' + String(res.errorCode) + ').'
              : genericSendError;
          globalErrorMessage = send_finalizeErrorMessage_(
            res.errorMessage != null
              ? res.errorMessage
              : res.message != null
                ? res.message
                : res,
            globalFallback,
          );
        }
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
          var externalId = f.externalId != null ? String(f.externalId) : null;
          var trackingNumber = f.trackingNumber != null ? String(f.trackingNumber) : null;
          var labelUrl = f.labelUrl != null ? String(f.labelUrl) : null;
          var failureFallback =
            f && f.errorCode != null
              ? 'Carrier request failed (' + String(f.errorCode) + ').'
              : genericSendError;
          var errMsg = send_finalizeErrorMessage_(
            f && Object.prototype.hasOwnProperty.call(f, 'errorMessage')
              ? f.errorMessage
              : f,
            failureFallback,
          );
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
          var missingMsg = genericSendError;
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
          var errText = send_finalizeErrorMessage_(e, genericSendError);
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
      return !d.ok;
    })
    .map(function (d) {
      return {
        row: d.rowNumber,
        error: send_finalizeErrorMessage_(d.errorMessage, genericSendError),
      };
    });
  return {
    attempted: sent + failed,
    succeeded: sent,
    failed: failed,
    total: totalRowsToProcess,
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
  } else if (id === 'noest') {
    var noestTok =
      c.apiToken != null && String(c.apiToken).trim() !== ''
        ? String(c.apiToken).trim()
        : c.token != null
          ? String(c.token).trim()
          : c.apiKey != null
            ? String(c.apiKey).trim()
            : '';
    var noestGuid =
      c.userGuid != null && String(c.userGuid).trim() !== ''
        ? String(c.userGuid).trim()
        : c.user_guid != null
          ? String(c.user_guid).trim()
          : '';
    if (!noestTok || !noestGuid) {
      return i18n_t('error.noest_token_guid_required');
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
  var suspiciousCarrierAddressRows = [];
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
    if (send_looksLikeCarrierValue_(addr)) {
      suspiciousCarrierAddressRows.push(row.rowNumber);
    }
  }
  if (
    analyzedAddressRows > 0 &&
    suspiciousCarrierAddressRows.length > 0 &&
    suspiciousCarrierAddressRows.length === analyzedAddressRows
  ) {
    throw new Error(i18n_t('error.address_column_looks_like_carrier'));
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
  var wIsPlaceholder =
    typeof order_isPlaceholderLocationText_ === 'function'
      ? order_isPlaceholderLocationText_(w)
      : /^0+$/.test(String(w || '').trim());
  if (w && !wIsPlaceholder) {
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
  if (
    commune &&
    !(typeof order_isPlaceholderLocationText_ === 'function'
      ? order_isPlaceholderLocationText_(commune)
      : /^0+$/.test(String(commune || '').trim()))
  ) {
    return commune;
  }
  return '';
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
    station: (function () {
      var rowDesk =
        order && order.stopDeskId ? String(order.stopDeskId).trim() : '';
      if (rowDesk) {
        return rowDesk;
      }
      var isPickup =
        order &&
        order.deliveryType &&
        String(order.deliveryType).trim() === 'pickup-point';
      if (!isPickup || !bs) {
        return null;
      }
      var hub =
        bs.defaultHubId != null ? String(bs.defaultHubId).trim() : '';
      if (!hub && bs.stopDeskId != null) {
        hub = String(bs.stopDeskId).trim();
      }
      return hub || null;
    })(),
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
 * Returns all non-empty mapped label URLs from the requested or active sheet.
 * Used by "Print all labels" to reopen every available label, not only last-send cache.
 * @param {number|string=} sheetIdRaw
 * @return {{ items: Array<{ rowNumber: number, url: string }>, count: number }}
 */
function send_getAllLabelUrls(sheetIdRaw) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var requestedSheetId =
    sheetIdRaw != null && String(sheetIdRaw).trim() !== ''
      ? Number(sheetIdRaw)
      : NaN;
  var sheet =
    Number.isFinite(requestedSheetId) &&
    requestedSheetId >= 1 &&
    typeof getSheetById_ === 'function'
      ? getSheetById_(ss, requestedSheetId)
      : null;
  if (!sheet) {
    sheet = ss.getActiveSheet();
  }
  if (!sheet) {
    throw new Error(i18n_t('error.sheet_not_found'));
  }
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
