/**
 * @fileoverview Persisted send/sync journal (DocumentProperties) + sélection des lignes en échec pour réessayer.
 */

var OPS_LOG_VERSION_ = 1;
var OPS_LOG_MAX_ENTRIES_ = 22;
var OPS_LOG_MAX_DETAIL_ = 10;
var OPS_LOG_MSG_MAX_ = 140;

/**
 * @param {string} s
 * @param {number} max
 * @return {string}
 */
function ops_truncate_(s, max) {
  var t = s != null ? String(s) : '';
  if (t.length <= max) {
    return t;
  }
  return t.slice(0, max - 1) + '…';
}

/**
 * @param {string} spreadsheetId
 * @return {Array<Object>}
 */
function ops_readEntries_(spreadsheetId) {
  var raw = DeliveryToolStorage.getOpsLogJson(spreadsheetId);
  if (!raw) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
      return parsed.entries;
    }
  } catch (e) {
    return [];
  }
  return [];
}

/**
 * @param {string} spreadsheetId
 * @param {Array<Object>} entries
 */
function ops_writeEntries_(spreadsheetId, entries) {
  var payload = { v: OPS_LOG_VERSION_, entries: entries };
  var json = JSON.stringify(payload);
  while (json.length > 8800 && entries.length > 1) {
    entries.pop();
    payload.entries = entries;
    json = JSON.stringify(payload);
  }
  DeliveryToolStorage.setOpsLogJson(spreadsheetId, json);
}

/**
 * @param {string} spreadsheetId
 * @param {{
 *   kind: string,
 *   sheetId: number,
 *   sheetName: string,
 *   attempted: number,
 *   succeeded: number,
 *   failed: number,
 *   details: Array<{ rowNumber: number, ok: boolean, errorMessage: string|null }>
 * }} payload
 */
function ops_appendLogEntry_(spreadsheetId, payload) {
  if (payload.attempted < 1) {
    return;
  }

  var failedRows = [];
  var seen = {};
  var details = payload.details || [];
  for (var i = 0; i < details.length; i++) {
    var d = details[i];
    if (d && d.ok === false && d.rowNumber != null) {
      var rn = Number(d.rowNumber);
      if (!seen[rn]) {
        seen[rn] = true;
        failedRows.push(rn);
      }
    }
  }

  var preview = [];
  var lim = Math.min(details.length, OPS_LOG_MAX_DETAIL_);
  for (var j = 0; j < lim; j++) {
    var row = details[j];
    preview.push({
      rowNumber: row.rowNumber,
      ok: !!row.ok,
      errorMessage: ops_truncate_(row.errorMessage, OPS_LOG_MSG_MAX_),
    });
  }

  var entry = {
    ts: new Date().toISOString(),
    kind: payload.kind,
    sheetId: payload.sheetId,
    sheetName: ops_truncate_(payload.sheetName, 80),
    attempted: payload.attempted,
    succeeded: payload.succeeded,
    failed: payload.failed,
    failedRows: failedRows,
    detailPreview: preview,
  };

  var entries = ops_readEntries_(spreadsheetId);
  entries.unshift(entry);
  if (entries.length > OPS_LOG_MAX_ENTRIES_) {
    entries = entries.slice(0, OPS_LOG_MAX_ENTRIES_);
  }
  ops_writeEntries_(spreadsheetId, entries);
}

/**
 * @return {{ entries: Array<Object>, rawLength: number }}
 */
function ops_getLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetId = ss.getId();
  var entries = ops_readEntries_(spreadsheetId);
  var raw = DeliveryToolStorage.getOpsLogJson(spreadsheetId);
  return {
    entries: entries,
    rawLength: raw ? raw.length : 0,
  };
}

/**
 * @return {{ ok: boolean }}
 */
function ops_clearLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  DeliveryToolStorage.setOpsLogJson(ss.getId(), null);
  return { ok: true };
}

/**
 * Dernière entrée **de ce type** dans le journal : si c’est un échec partiel, on peut réessayer.
 * Si la dernière opération « send » (ou « sync ») est un succès complet, on ne remonte pas une entrée plus ancienne
 * (évite de sélectionner des lignes obsolètes après un envoi réussi).
 *
 * @param {string} kind 'send' | 'sync'
 * @return {Object|null}
 */
function ops_findLastFailed_(spreadsheetId, kind) {
  var entries = ops_readEntries_(spreadsheetId);
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.kind !== kind) {
      continue;
    }
    if (e.failed > 0 && e.failedRows && e.failedRows.length) {
      return e;
    }
    return null;
  }
  return null;
}

/**
 * Sélectionne les lignes en échec du dernier envoi (même feuille active).
 * @return {{ rowCount: number, sheetName: string }}
 */
function ops_selectLastFailedSendRows() {
  return ops_selectLastFailedRows_('send');
}

/**
 * Sélectionne les lignes en échec du dernier sync suivi (même feuille active).
 * @return {{ rowCount: number, sheetName: string }}
 */
function ops_selectLastFailedSyncRows() {
  return ops_selectLastFailedRows_('sync');
}

/**
 * @param {string} kind
 * @return {{ rowCount: number, sheetName: string }}
 */
function ops_selectLastFailedRows_(kind) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();

  var last = ops_findLastFailed_(spreadsheetId, kind);
  if (!last) {
    throw new Error(
      kind === 'send'
        ? i18n_t('error.no_recent_failed_send')
        : i18n_t('error.no_recent_failed_sync')
    );
  }
  if (Number(last.sheetId) !== sheetId) {
    throw new Error(i18n_format('error.switch_to_sheet_retry', String(last.sheetName)));
  }

  var rows = last.failedRows;
  if (!rows || !rows.length) {
    throw new Error(i18n_t('error.no_failed_rows_recorded'));
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var a1List = [];
  for (var i = 0; i < rows.length; i++) {
    var r = Number(rows[i]);
    if (!isNaN(r) && r > 0) {
      a1List.push(sheet.getRange(r, 1, 1, lastCol).getA1Notation());
    }
  }
  if (!a1List.length) {
    throw new Error(i18n_t('error.invalid_rows_in_journal'));
  }

  var rangeList = sheet.getRangeList(a1List);
  sheet.setActiveRangeList(rangeList);
  SpreadsheetApp.flush();

  return { rowCount: a1List.length, sheetName: String(last.sheetName) };
}
