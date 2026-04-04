/**
 * @fileoverview Tracking sync: call backend bulk tracking API, refresh status column, store last sync time.
 * Uses single-range reads, i18n messages, and optional auto-sync trigger.
 */

var SYNC_TRIGGER_HANDLER_ = 'syncRunAutoTrigger';
var SYNC_TRIGGER_FREQ_HOURS_ = 1;

/**
 * Shared core for sync (selection and auto).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} sheetId
 * @param {Object} saved
 * @param {number} headerRow
 * @param {number} startRow
 * @param {number} endRow
 * @param {Array<Array<string>>} allValues
 * @param {string} defaultCarrierId
 * @param {string} spreadsheetId
 * @param {boolean} isAuto
 * @param {Array<number>|undefined} selectedRowNumbers when set, allValues must be rows headerRow..lastRow (inclusive)
 */
function sync_runCore_(
  sheet,
  sheetId,
  saved,
  headerRow,
  startRow,
  endRow,
  allValues,
  defaultCarrierId,
  spreadsheetId,
  isAuto,
  selectedRowNumbers
) {
  var columns = saved.columns || {};
  if (columns.trackingColumn == null) {
    throw new Error(i18n_t('error.tracking_column_required'));
  }

  var TRACKING_BATCH_SIZE_ = 50;
  var details = [];
  var attempted = 0;
  var succeeded = 0;
  var failed = 0;

  var lastCol = sheet.getLastColumn();
  var byCarrier = {};

  var rowNums = [];
  var idxFromHeader = false;
  if (selectedRowNumbers != null && selectedRowNumbers.length > 0) {
    rowNums = selectedRowNumbers;
    idxFromHeader = true;
  } else {
    for (var r = startRow; r <= endRow; r++) {
      rowNums.push(r);
    }
  }

  for (var ri = 0; ri < rowNums.length; ri++) {
    var rowNum = rowNums[ri];
    if (rowNum <= headerRow) continue;
    var idx = idxFromHeader ? rowNum - headerRow : rowNum - startRow;
    var row = allValues[idx] || [];
    if (!row.length && lastCol >= 1) {
      row = sheet.getRange(rowNum, 1, 1, lastCol).getDisplayValues()[0] || [];
    }
    var track = null;
    var tCol = Number(columns.trackingColumn);
    if (!isNaN(tCol) && tCol >= 1 && tCol <= row.length) {
      var rawTrack = row[tCol - 1];
      track = rawTrack != null && String(rawTrack).trim() !== '' ? String(rawTrack).trim() : null;
    }
    if (!track) continue;
    attempted++;

    var carrierRaw = null;
    if (columns.carrierColumn != null) {
      var cCol = Number(columns.carrierColumn);
      if (!isNaN(cCol) && cCol >= 1 && cCol <= row.length) {
        carrierRaw = row[cCol - 1];
      }
    }
    var effectiveCarrierId = resolveCarrierAdapterId_(carrierRaw, defaultCarrierId);
    if (!effectiveCarrierId) {
      failed++;
      var skipMsg = i18n_t('val.carrier_required');
      writeTrackingErrorToRow_(sheet, rowNum, columns, skipMsg);
      details.push({ rowNumber: rowNum, ok: false, errorMessage: skipMsg });
      continue;
    }
    if (!byCarrier[effectiveCarrierId]) {
      byCarrier[effectiveCarrierId] = [];
    }
    byCarrier[effectiveCarrierId].push({
      rowNumber: rowNum,
      trackingNumber: String(track),
    });
  }

  Object.keys(byCarrier).forEach(function (carrierId) {
    var entries = byCarrier[carrierId];
    var creds = carrierCreds_getForCarrier_(carrierId);
    for (var o = 0; o < entries.length; o += TRACKING_BATCH_SIZE_) {
      var chunk = entries.slice(o, o + TRACKING_BATCH_SIZE_);
      var trackings = [];
      var seen = {};
      chunk.forEach(function (e) {
        var k = String(e.trackingNumber || '').trim().toLowerCase();
        if (!k || seen[k]) return;
        seen[k] = true;
        trackings.push(String(e.trackingNumber));
      });
      if (!trackings.length) {
        return;
      }
      try {
        var payload = {
          carrier: String(carrierId),
          trackingNumbers: trackings,
          credentials: creds || {},
        };
        var res = apiJsonPost_('/v1/shipments/tracking', payload);
        var items = res && res.items && Array.isArray(res.items) ? res.items : [];
        var byTracking = {};
        items.forEach(function (it) {
          if (!it || it.trackingNumber == null) return;
          byTracking[String(it.trackingNumber).trim().toLowerCase()] = it;
        });
        chunk.forEach(function (entry) {
          var key = String(entry.trackingNumber).trim().toLowerCase();
          var item = byTracking[key];
          if (item) {
            var pseudo = {
              ok: true,
              stateName: item.stateName != null ? String(item.stateName) : '',
              status: item.status != null ? String(item.status) : '',
              labelFr: item.label && item.label.fr ? String(item.label.fr) : '',
              labelAr: item.label && item.label.ar ? String(item.label.ar) : '',
              rawStatus:
                item.label && item.label.fr
                  ? String(item.label.fr)
                  : item.stateName != null
                  ? String(item.stateName)
                  : i18n_t('sync.updated').replace('{0}', '1'),
            };
            writeTrackingResultToRow_(sheet, entry.rowNumber, columns, pseudo);
            succeeded++;
            details.push({ rowNumber: entry.rowNumber, ok: true, errorMessage: null });
          } else {
            var notFound = { ok: false, statusCode: 404, error: 'not_found' };
            writeTrackingResultToRow_(sheet, entry.rowNumber, columns, notFound);
            failed++;
            details.push({ rowNumber: entry.rowNumber, ok: false, errorMessage: i18n_t('sync.not_found') });
          }
        });
      } catch (e) {
        var msg = e && e.message ? String(e.message) : String(e);
        chunk.forEach(function (entry) {
          failed++;
          writeTrackingErrorToRow_(sheet, entry.rowNumber, columns, msg);
          details.push({ rowNumber: entry.rowNumber, ok: false, errorMessage: msg });
        });
      }
    }
  });

  var nowIso = new Date().toISOString();
  DeliveryToolStorage.setLastSyncAttemptIso(spreadsheetId, sheetId, nowIso);
  if (succeeded > 0) {
    DeliveryToolStorage.setLastSyncIso(spreadsheetId, sheetId, nowIso);
  }

  SpreadsheetApp.flush();

  if (succeeded > 0) {
    try {
      if (typeof mobile_refreshCompanionArtifactsForSheet_ === 'function') {
        mobile_refreshCompanionArtifactsForSheet_(sheet.getParent(), sheet, saved);
      }
    } catch (refreshErr) {}
  }

  if (attempted > 0) {
    try {
      ops_appendLogEntry_(spreadsheetId, {
        kind: isAuto ? 'sync-auto' : 'sync',
        sheetId: sheetId,
        sheetName: sheet.getName(),
        attempted: attempted,
        succeeded: succeeded,
        failed: failed,
        details: details,
      });
    } catch (logErr) {}
  }

  return {
    attempted: attempted,
    succeeded: succeeded,
    failed: failed,
    lastSyncIso: succeeded > 0 ? nowIso : null,
    lastSyncSuccessIso: succeeded > 0 ? nowIso : null,
    lastSyncAttemptIso: nowIso,
    details: details,
  };
}

/**
 * Sync tracking for the current selection or a manual row override.
 * @param {string=} rowSelectionSpec
 */
function sync_syncSelection(rowSelectionSpec) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) {
    throw new Error(i18n_t('error.sync_in_progress'));
  }
  try {
  license_assertOperationsAllowed_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();

  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
  if (!mappingJson) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }

  var saved;
  try {
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }

  var defaultCarrierId =
    saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
      ? String(saved.defaultCarrier).trim()
      : '';

  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var selectedRows = sheet_getSelectedRowNumbers_(sheet, rowSelectionSpec);
  if (!selectedRows.length) {
    throw new Error(i18n_t('error.select_rows_tracking'));
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var allValues =
    lastCol >= 1 && lastRow >= headerRow
      ? sheet.getRange(headerRow, 1, lastRow - headerRow + 1, lastCol).getDisplayValues()
      : [];

  return sync_runCore_(
    sheet,
    sheetId,
    saved,
    headerRow,
    selectedRows[0],
    selectedRows[selectedRows.length - 1],
    allValues,
    defaultCarrierId,
    spreadsheetId,
    false,
    selectedRows
  );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Document-level sync timestamps for the active spreadsheet (sidebar).
 * @return {{
 *   lastSyncAttemptIso: string|null,
 *   lastSyncSuccessIso: string|null
 * }}
 */
function sync_getMeta() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var sheet = ss.getActiveSheet();
  var sheetId = sheet.getSheetId();
  return {
    lastSyncAttemptIso: DeliveryToolStorage.getLastSyncAttemptIso(spreadsheetId, sheetId),
    lastSyncSuccessIso: DeliveryToolStorage.getLastSyncIso(spreadsheetId, sheetId),
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {Object} columns
 * @param {Object} res
 */
function writeTrackingResultToRow_(sheet, rowNum, columns, res) {
  if (!res) {
    return;
  }
  if (!res.ok) {
    var nonStatusMsg;
    if (res.statusCode === 404 || (res.error && String(res.error).indexOf('not_found') !== -1)) {
      nonStatusMsg = i18n_t('sync.not_found');
    } else {
      nonStatusMsg = i18n_format('sync.error', res.errorMessage || '');
    }
    sync_writeTrackingMessageNote_(sheet, rowNum, columns, nonStatusMsg);
    return;
  }
  if (columns.statusColumn == null) {
    return;
  }
  var text = sync_resolveSheetStatusText_(res);
  if (text.length > 500) {
    text = text.slice(0, 497) + '...';
  }
  sheet.getRange(rowNum, Number(columns.statusColumn)).setValue(text);
  sync_writeTrackingMessageNote_(sheet, rowNum, columns, '');
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {Object} columns
 * @param {string} message
 */
function writeTrackingErrorToRow_(sheet, rowNum, columns, message) {
  sync_writeTrackingMessageNote_(sheet, rowNum, columns, i18n_format('sync.error', message));
}

/**
 * Convert provider payload into a stable sheet status label.
 * We prefer canonical bucket labels so companion sheets stay consistent.
 * @param {Object} res
 * @return {string}
 */
function sync_resolveSheetStatusText_(res) {
  var stateName = res && res.stateName != null ? String(res.stateName) : '';
  var bucket = sync_bucketFromCarrierStateName_(stateName);
  var candidates = [
    res && res.rawStatus != null ? String(res.rawStatus) : '',
    res && res.status != null ? String(res.status) : '',
    res && res.labelFr != null ? String(res.labelFr) : '',
    res && res.labelAr != null ? String(res.labelAr) : '',
    stateName,
  ];
  if (!bucket && typeof classifyShipmentBucket_ === 'function') {
    for (var i = 0; i < candidates.length; i++) {
      var candidate = String(candidates[i] || '').trim();
      if (!candidate) {
        continue;
      }
      try {
        var b = classifyShipmentBucket_(candidate, false);
        if (b && b !== 'unknown') {
          bucket = b;
          break;
        }
      } catch (e0) {}
    }
  }
  if (bucket) {
    return sync_bucketToSheetStatusLabel_(bucket);
  }
  for (var j = 0; j < candidates.length; j++) {
    var fallback = String(candidates[j] || '').trim();
    if (fallback) {
      return fallback;
    }
  }
  return i18n_t('sync.updated').replace('{0}', '1');
}

/**
 * @param {string} stateName
 * @return {string|null}
 */
function sync_bucketFromCarrierStateName_(stateName) {
  var token = String(stateName || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, '_');
  if (!token) {
    return null;
  }
  if (
    token === 'livre' ||
    token === 'delivered' ||
    token === 'delivered_success' ||
    token.indexOf('deliver') >= 0 ||
    token.indexOf('livr') >= 0
  ) {
    return 'delivered';
  }
  if (token === 'returned' || token.indexOf('retour') >= 0 || token.indexOf('return') >= 0) {
    return 'returned';
  }
  if (
    token === 'en_transit' ||
    token === 'en_cours' ||
    token.indexOf('transit') >= 0 ||
    token.indexOf('shipping') >= 0 ||
    token.indexOf('dispatch') >= 0 ||
    token.indexOf('shipped') >= 0
  ) {
    return 'in_transit';
  }
  if (
    token === 'commande_recue' ||
    token === 'pending' ||
    token.indexOf('attente') >= 0 ||
    token.indexOf('waiting') >= 0
  ) {
    return 'pending';
  }
  if (token.indexOf('confirm') >= 0) {
    return 'confirmed';
  }
  if (token.indexOf('cancel') >= 0 || token.indexOf('annul') >= 0) {
    return 'cancelled';
  }
  if (token.indexOf('fail') >= 0 || token.indexOf('echec') >= 0 || token.indexOf('error') >= 0) {
    return 'failed';
  }
  return null;
}

/**
 * @param {string} bucket
 * @return {string}
 */
function sync_bucketToSheetStatusLabel_(bucket) {
  var key = String(bucket || '').trim();
  if (
    key !== 'delivered' &&
    key !== 'returned' &&
    key !== 'failed' &&
    key !== 'cancelled' &&
    key !== 'in_transit' &&
    key !== 'confirmed' &&
    key !== 'pending'
  ) {
    return i18n_t('sync.updated').replace('{0}', '1');
  }
  return i18n_t('stats.bucket.' + key);
}

/**
 * Keep sync errors as notes (non-destructive) instead of overwriting status.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {Object} columns
 * @param {string} message
 */
function sync_writeTrackingMessageNote_(sheet, rowNum, columns, message) {
  var targetCol = null;
  if (columns && columns.notesColumn != null && isFinite(Number(columns.notesColumn))) {
    targetCol = Number(columns.notesColumn);
  } else if (columns && columns.statusColumn != null && isFinite(Number(columns.statusColumn))) {
    targetCol = Number(columns.statusColumn);
  }
  if (targetCol == null || targetCol < 1) {
    return;
  }
  var note = String(message || '').trim();
  if (note.length > 500) {
    note = note.slice(0, 497) + '...';
  }
  var cell = sheet.getRange(rowNum, Math.floor(targetCol));
  cell.setNote(note ? 'SYNC: ' + note : '');
}

/**
 * Enable periodic auto-sync via time-based trigger.
 * @return {{ ok: boolean, enabled: boolean }}
 */
function sync_enableAutoSync() {
  sync_deleteAutoSyncTriggers_();
  ScriptApp.newTrigger(SYNC_TRIGGER_HANDLER_).timeBased().everyHours(SYNC_TRIGGER_FREQ_HOURS_).create();
  return { ok: true, enabled: true };
}

/**
 * Disable auto-sync triggers.
 * @return {{ ok: boolean, enabled: boolean }}
 */
function sync_disableAutoSync() {
  sync_deleteAutoSyncTriggers_();
  return { ok: true, enabled: false };
}

/**
 * Returns whether an auto-sync trigger is currently installed.
 * @return {{ enabled: boolean }}
 */
function sync_isAutoSyncEnabled() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === SYNC_TRIGGER_HANDLER_) {
      return { enabled: true };
    }
  }
  return { enabled: false };
}

/**
 * Trigger handler for time-based auto-sync.
 * For now this delegates to the interactive selection-based sync.
 * (Can be extended later to scan all mapped sheets without an active range.)
 */
function syncRunAutoTrigger() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(2000)) {
    return;
  }
  try {
    // Enforce the same license gate as interactive sync operations so that
    // premium sync behaviour is consistent between manual and trigger-based runs.
    if (typeof license_assertOperationsAllowed_ === 'function') {
      // In trigger context we rely on previously cached license state and avoid
      // calling backend/Session-dependent flows. Users should have opened the
      // sidebar at least once to populate the cache.
      license_assertOperationsAllowed_({ skipRefresh: true });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId = ss.getId();
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var sheetId = sheet.getSheetId();
      var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
      if (!mappingJson) {
        continue;
      }
      var saved;
      try {
        saved = setup_loadMapping(sheetId);
      } catch (e) {
        continue;
      }
      var columns = saved.columns || {};
      if (columns.trackingColumn == null) {
        continue;
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
        continue;
      }
      var lastCol = sheet.getLastColumn();
      if (lastCol < 1) {
        continue;
      }
      var numRows = lastRow - headerRow;
      var allValues = sheet
        .getRange(headerRow + 1, 1, numRows, lastCol)
        .getDisplayValues();
      var defaultCarrierId =
        saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
          ? String(saved.defaultCarrier).trim()
          : '';
      sync_runCore_(
        sheet,
        sheetId,
        saved,
        headerRow,
        headerRow + 1,
        lastRow,
        allValues,
        defaultCarrierId,
        spreadsheetId,
        true
      );
    }
    SpreadsheetApp.flush();
  } catch (e) {
    // Log to execution logs for diagnostics but keep the trigger alive.
    try {
      Logger.log('syncRunAutoTrigger error: %s', e && e.message ? String(e.message) : String(e));
    } catch (logErr) {}
  } finally {
    lock.releaseLock();
  }
}

function sync_deleteAutoSyncTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === SYNC_TRIGGER_HANDLER_) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
