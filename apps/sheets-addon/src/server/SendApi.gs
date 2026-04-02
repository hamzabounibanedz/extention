/**
 * @fileoverview Send valid selected rows to backend / carrier adapter; write tracking + status columns.
 * Implements batching (50 rows), optimistic lock, checkpointing and localized messages.
 */

var SEND_BATCH_SIZE_ = 50;
var SEND_CHECKPOINT_KEY_ = 'dt.send.checkpoint';

/**
 * Batches send for selected rows, with checkpoint/resume and label URL collection.
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
function send_sendSelection() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) {
    throw new Error(i18n_t('error.send_in_progress'));
  }
  try {
  license_assertOperationsAllowed_();

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

  var preview = order_previewSelection();

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
      if (
        cp.spreadsheetId === spreadsheetId &&
        cp.sheetId === sheetId &&
        cp.startRow === preview.startRow &&
        cp.endRow === preview.endRow
      ) {
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
      var payload = {
        carrier: String(carrierId),
        spreadsheetId: spreadsheetId,
        sheetName: sheet.getName(),
        orders: carrierRows.map(function (r) {
          return send_buildBackendOrder_(r.order, r.rowNumber);
        }),
        businessSettings: businessSettings,
        credentials: creds || {},
      };
      try {
        var res = apiJsonPost_('/v1/shipments/send', payload);
        var globalErrorMessage =
          res && res.ok === false
            ? res.errorMessage != null
              ? String(res.errorMessage)
              : res.message != null
              ? String(res.message)
              : i18n_t('send.error_generic')
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
          var errMsg = f.errorMessage != null ? String(f.errorMessage) : i18n_t('send.error_generic');
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
          if (columns.statusColumn != null) {
            sheet
              .getRange(rowObj.rowNumber, Number(columns.statusColumn))
              .setValue(i18n_format('general.error', e && e.message ? e.message : e));
          }
          batchDetails.push({
            rowNumber: rowObj.rowNumber,
            ok: false,
            errorMessage: e && e.message ? String(e.message) : String(e),
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

  var failedDetails = batchDetails
    .filter(function (d) { return !d.ok && d.errorMessage; })
    .map(function (d) { return { row: d.rowNumber, error: d.errorMessage }; });
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
 * @param {Object} order
 * @param {number} rowNumber
 * @return {Object}
 */
function send_buildBackendOrder_(order, rowNumber) {
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
    customerName: customerName,
    phone1: order && order.phone ? String(order.phone) : '',
    phone2: null,
    wilaya: order && order.wilaya ? String(order.wilaya) : '',
    commune: order && order.commune ? String(order.commune) : '',
    codeWilaya: order && order.wilayaCode != null ? order.wilayaCode : null,
    deliveryMode: order && order.deliveryType ? String(order.deliveryType) : '',
    totalPrice: order && order.codAmount != null ? Number(order.codAmount) : 0,
    productName: order && order.productName ? String(order.productName) : '',
    quantity: order && order.quantity != null ? Number(order.quantity) : 1,
    productPrice:
      order && order.codAmount != null && order.quantity != null && Number(order.quantity) > 0
        ? Number(order.codAmount) / Number(order.quantity)
        : null,
    note: order && order.notes ? String(order.notes) : null,
    station: order && order.stopDeskId ? String(order.stopDeskId) : null,
    externalId: order && order.externalShipmentId ? String(order.externalShipmentId) : null,
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
