/**
 * @fileoverview Aggregate delivery stats from the active sheet (mapped columns + status text).
 */

/**
 * @param {string|undefined} fromIso yyyy-mm-dd or ISO (optional)
 * @param {string|undefined} toIso yyyy-mm-dd or ISO (optional)
 * @param {number|string|undefined} targetSheetId optional mapped sheet id from sidebar selector
 * @return {Object} summary, buckets, rates, byCarrier, byProduct
 */
function stats_computeSheet(fromIso, toIso, targetSheetId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var targetId = Number(targetSheetId);
  if (isFinite(targetId) && targetId > 0) {
    try {
      var byId = typeof getSheetById_ === 'function' ? getSheetById_(ss, targetId) : null;
      if (byId) {
        sheet = byId;
      }
    } catch (eById) {}
  }
  var spreadsheetId = ss.getId();
  var sheetId = sheet.getSheetId();
  var sheetName = sheet.getName();

  var mappingJson = DeliveryToolStorage.getMappingJson(spreadsheetId, sheetId);
  if (!mappingJson) {
    throw new Error(i18n_t('error.mapping_setup_required'));
  }

  var saved;
  try {
    // Reuse centralized mapping normalization / migration logic.
    saved = setup_loadMapping(sheetId);
  } catch (e) {
    throw new Error(i18n_t('error.mapping_invalid'));
  }

  var columns = saved.columns || {};
  if (columns.statusColumn == null && columns.trackingColumn == null) {
    throw new Error(i18n_t('error.stats_require_status_or_tracking'));
  }

  var headerRow =
    saved.headerRow != null && String(saved.headerRow).trim() !== ''
      ? Number(saved.headerRow)
      : 1;
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    headerRow = 1;
  }

  var defaultCarrierId =
    saved.defaultCarrier != null && String(saved.defaultCarrier).trim() !== ''
      ? String(saved.defaultCarrier).trim()
      : null;

  var lastRow = Math.max(sheet.getLastRow(), headerRow + 1);
  var now = isoNow_();

  var lastCol = sheet.getLastColumn();
  var values =
    lastRow >= headerRow && lastCol >= 1
      ? sheet.getRange(headerRow, 1, lastRow - headerRow + 1, lastCol).getDisplayValues()
      : [];

  var fromMs = stats_parseFilterStart_(fromIso);
  var toMs = stats_parseFilterEnd_(toIso);
  if (fromMs != null && toMs != null && fromMs > toMs) {
    var tmpRange = fromMs;
    fromMs = toMs;
    toMs = tmpRange;
  }
  var dateFilterRequested = fromMs != null || toMs != null;
  var resolvedDateColumn = stats_resolveOrderDateColumn_(
    sheetId,
    sheet,
    headerRow,
    columns,
    dateFilterRequested
  );
  var effectiveOrderDateColumn = resolvedDateColumn.col;
  var dateFilterOn = effectiveOrderDateColumn != null && dateFilterRequested;
  var mappedOrderDateColumn =
    columns.orderDateColumn != null && isFinite(Number(columns.orderDateColumn))
      ? Math.floor(Number(columns.orderDateColumn))
      : null;
  var mappedOrderDateMeta = stats_describeSheetColumn_(
    sheet,
    headerRow,
    mappedOrderDateColumn
  );
  var effectiveOrderDateMeta = stats_describeSheetColumn_(
    sheet,
    headerRow,
    effectiveOrderDateColumn
  );
  var fallbackStatusColumn = stats_findFallbackStatusColumn_(values, columns);

  var buckets = {
    delivered: 0,
    returned: 0,
    failed: 0,
    cancelled: 0,
    in_transit: 0,
    confirmed: 0,
    pending: 0,
    unknown: 0,
  };

  var byCarrier = {};
  var byProduct = {};

  var totalAnalyzed = 0;
  var emptySkipped = 0;
  var skippedNoDate = 0;
  var filteredBeforeRange = 0;
  var filteredAfterRange = 0;
  var minParsedDateMs = null;
  var maxParsedDateMs = null;

  for (var rowNum = headerRow + 1; rowNum <= lastRow; rowNum++) {
    var order = buildOrderFromRow_(
      sheet,
      rowNum,
      columns,
      spreadsheetId,
      sheetId,
      sheetName,
      defaultCarrierId,
      now,
      headerRow,
      values
    );

    if (isRowEmpty_(order)) {
      emptySkipped++;
      continue;
    }

    if (dateFilterOn) {
      var rowDate = stats_parseCellDate_(sheet, rowNum, effectiveOrderDateColumn);
      if (rowDate == null) {
        skippedNoDate++;
        continue;
      }
      var t = rowDate.getTime();
      if (minParsedDateMs == null || t < minParsedDateMs) {
        minParsedDateMs = t;
      }
      if (maxParsedDateMs == null || t > maxParsedDateMs) {
        maxParsedDateMs = t;
      }
      if (fromMs != null && t < fromMs) {
        filteredBeforeRange++;
        continue;
      }
      if (toMs != null && t > toMs) {
        filteredAfterRange++;
        continue;
      }
    }

    totalAnalyzed++;

    var statusText = order.status != null ? String(order.status) : '';
    var hasTrack =
      order.trackingNumber != null && String(order.trackingNumber).trim() !== '';
    var bucket = classifyShipmentBucket_(statusText, hasTrack);
    if (bucket === 'unknown' && fallbackStatusColumn != null) {
      var altStatus = stats_getMatrixCellDisplay_(
        values,
        rowNum,
        headerRow,
        fallbackStatusColumn
      );
      if (altStatus) {
        var mergedStatus = statusText ? statusText + ' ' + altStatus : altStatus;
        var altBucket = classifyShipmentBucket_(mergedStatus, hasTrack);
        if (altBucket !== 'unknown') {
          statusText = mergedStatus;
          bucket = altBucket;
        }
      }
    }
    if (buckets[bucket] == null) {
      bucket = 'unknown';
    }
    buckets[bucket]++;

    var carrierLabel = resolveCarrierAdapterId_(order.carrier, defaultCarrierId) || '—';
    incNested_(byCarrier, carrierLabel, bucket);

    var prod = stats_normalizeProductKey_(
      order.productName != null ? String(order.productName) : ''
    );
    incNested_(byProduct, prod, bucket);
  }

  var terminal = buckets.delivered + buckets.returned + buckets.failed;
  var rates = {
    deliveryVsTerminal:
      terminal > 0 ? Math.round((100 * buckets.delivered) / terminal) / 100 : null,
    returnVsTerminal:
      terminal > 0 ? Math.round((100 * buckets.returned) / terminal) / 100 : null,
    failureVsTerminal:
      terminal > 0 ? Math.round((100 * buckets.failed) / terminal) / 100 : null,
    deliveredShareOfAnalyzed:
      totalAnalyzed > 0
        ? Math.round((100 * buckets.delivered) / totalAnalyzed) / 100
        : null,
  };

  var result = {
    sheetId: sheetId,
    sheetName: sheetName,
    lastRowScanned: lastRow,
    totalRowsAnalyzed: totalAnalyzed,
    emptyRowsSkipped: emptySkipped,
    rowsSkippedNoDateFilter: skippedNoDate,
    rowsFilteredBeforeDateRange: filteredBeforeRange,
    rowsFilteredAfterDateRange: filteredAfterRange,
    dateFilter: {
      active: dateFilterOn,
      requested: dateFilterRequested,
      fromIso:
        fromMs != null ? stats_formatDateMsAsIso_(fromMs) : null,
      toIso:
        toMs != null ? stats_formatDateMsAsIso_(toMs) : null,
      orderDateColumnMapped: mappedOrderDateColumn != null,
      orderDateColumnMappedLabel: mappedOrderDateMeta
        ? mappedOrderDateMeta.label
        : null,
      orderDateColumnUsable: effectiveOrderDateColumn != null,
      orderDateColumnSource: resolvedDateColumn.source,
      orderDateColumnEffective: effectiveOrderDateColumn,
      orderDateColumnEffectiveLabel: effectiveOrderDateMeta
        ? effectiveOrderDateMeta.label
        : null,
      detectedMinIso:
        minParsedDateMs != null ? stats_formatDateMsAsIso_(minParsedDateMs) : null,
      detectedMaxIso:
        maxParsedDateMs != null ? stats_formatDateMsAsIso_(maxParsedDateMs) : null,
    },
    buckets: buckets,
    rates: rates,
    byCarrier: byCarrier,
    byProduct: byProduct,
    note: i18n_t('stats.note'),
  };
  try {
    // Keep mobile companion artifacts (status tabs + dashboard + finance inputs)
    // in sync when users compute stats from sidebar.
    if (typeof mobile_refreshCompanionArtifactsForSheet_ === 'function') {
      mobile_refreshCompanionArtifactsForSheet_(ss, sheet, saved);
    }
  } catch (refreshErr) {}
  return result;
}

/**
 * @param {number} sheetId
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @param {Object} columns
 * @param {boolean=} dateFilterRequested
 * @return {{ col: number|null, source: string }}
 */
function stats_resolveOrderDateColumn_(
  sheetId,
  sheet,
  headerRow,
  columns,
  dateFilterRequested
) {
  var requireUsable = !!dateFilterRequested;
  var mapped =
    columns && columns.orderDateColumn != null
      ? Number(columns.orderDateColumn)
      : null;
  if (
    mapped != null &&
    isFinite(mapped) &&
    mapped >= 1 &&
    (!requireUsable || stats_isDateColumnUsableForFilter_(sheet, headerRow, mapped))
  ) {
    return { col: mapped, source: "mapped" };
  }

  if (typeof setup_getSuggestedMapping === "function") {
    try {
      var suggested = setup_getSuggestedMapping(sheetId, headerRow);
      var sug =
        suggested &&
        suggested.columns &&
        suggested.columns.orderDateColumn != null
          ? Number(suggested.columns.orderDateColumn)
          : null;
      if (
        sug != null &&
        isFinite(sug) &&
        sug >= 1 &&
        (!requireUsable || stats_isDateColumnUsableForFilter_(sheet, headerRow, sug))
      ) {
        return { col: sug, source: "suggested" };
      }
    } catch (e) {}
  }

  if (typeof setup_findLikelyOrderDateColumn_ === "function") {
    try {
      var inferred = setup_findLikelyOrderDateColumn_(sheet, headerRow);
      if (
        inferred &&
        inferred.col != null &&
        isFinite(inferred.col) &&
        inferred.col >= 1 &&
        (!requireUsable ||
          stats_isDateColumnUsableForFilter_(sheet, headerRow, inferred.col))
      ) {
        return { col: inferred.col, source: "autodetected" };
      }
    } catch (e2) {}
  }

  var byData = stats_findLikelyOrderDateColumnByData_(sheet, headerRow);
  if (byData != null) {
    return { col: byData, source: "stats_autodetected" };
  }

  return {
    col: null,
    source: mapped != null && isFinite(mapped) && mapped >= 1 ? "mapped_invalid" : "missing",
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @param {number} col
 * @return {boolean}
 */
function stats_isDateColumnUsableForFilter_(sheet, headerRow, col) {
  return stats_analyzeDateColumnForFilter_(sheet, headerRow, col).usable;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @return {number|null}
 */
function stats_findLikelyOrderDateColumnByData_(sheet, headerRow) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) {
    return null;
  }
  var best = null;
  for (var col = 1; col <= lastCol; col++) {
    var candidate = stats_analyzeDateColumnForFilter_(sheet, headerRow, col);
    if (!candidate.usable) {
      continue;
    }
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.valid > best.valid) ||
      (candidate.score === best.score && candidate.col < best.col)
    ) {
      best = candidate;
    }
  }
  return best ? best.col : null;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @param {number} colIndex
 * @return {{ col: number, seen: number, valid: number, ratio: number, score: number, usable: boolean }}
 */
function stats_analyzeDateColumnForFilter_(sheet, headerRow, colIndex) {
  var col = Number(colIndex);
  if (!isFinite(col) || col < 1) {
    return { col: col, seen: 0, valid: 0, ratio: 0, score: 0, usable: false };
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) {
    return { col: col, seen: 0, valid: 0, ratio: 0, score: 0, usable: false };
  }

  var headerText = '';
  try {
    headerText = String(sheet.getRange(headerRow, col, 1, 1).getDisplayValue() || '').trim();
  } catch (e0) {
    headerText = '';
  }
  var headerScore = stats_scoreDateHeader_(headerText);

  var scanRows = Math.min(160, lastRow - headerRow);
  var range = sheet.getRange(headerRow + 1, col, scanRows, 1);
  var rawValues = range.getValues();
  var displayValues = range.getDisplayValues();
  var seen = 0;
  var valid = 0;

  for (var i = 0; i < rawValues.length; i++) {
    var raw = rawValues[i] ? rawValues[i][0] : null;
    var disp = displayValues[i] ? displayValues[i][0] : '';
    var emptyRaw = raw == null || raw === '';
    var emptyDisp = disp == null || String(disp).trim() === '';
    if (emptyRaw && emptyDisp) {
      continue;
    }
    seen++;
    if (stats_parseRawCellDate_(raw, disp) != null) {
      valid++;
    }
    if (seen >= 50) {
      break;
    }
  }

  var ratio = seen > 0 ? valid / seen : 0;
  var usable = false;
  if (seen === 0) {
    usable = headerScore >= 0.95;
  } else {
    usable =
      valid >= Math.max(2, Math.ceil(seen * 0.2)) ||
      (ratio >= 0.6 && valid >= 1);
  }
  var score = ratio * 0.8 + headerScore * 0.2;
  if (!usable) {
    score = score * 0.6;
  }
  return {
    col: col,
    seen: seen,
    valid: valid,
    ratio: Number(ratio.toFixed(3)),
    score: Number(Math.max(0, Math.min(1, score)).toFixed(3)),
    usable: usable,
  };
}

/**
 * @param {string} header
 * @return {number}
 */
function stats_scoreDateHeader_(header) {
  var s = stats_digitsToAscii_(String(header || ''));
  try {
    s = s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    s = s.toLowerCase();
  }
  s = s
    .replace(/[_./|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) {
    return 0;
  }
  if (
    s === 'date' ||
    s === 'order date' ||
    s === 'date commande' ||
    s === 'datetime' ||
    s === 'timestamp' ||
    s === 'تاريخ الطلب'
  ) {
    return 1;
  }
  var score = 0;
  if (/date|created|creation|timestamp|datetime|heure|time|تاريخ|وقت/.test(s)) {
    score = Math.max(score, 0.9);
  }
  if (/commande|order|achat/.test(s)) {
    score = Math.max(score, 0.95);
  }
  if (/status|statut|tracking|suivi|phone|telephone|mobile|address|adresse|wilaya|commune|carrier|transporteur|label|note/.test(s)) {
    score = Math.max(0, score - 0.2);
  }
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerRow
 * @param {number|null} col
 * @return {{ index: number, letter: string, header: string, label: string }|null}
 */
function stats_describeSheetColumn_(sheet, headerRow, col) {
  if (col == null || !isFinite(Number(col)) || Number(col) < 1) {
    return null;
  }
  var index = Math.floor(Number(col));
  var letter =
    typeof columnIndexToLetter_ === "function"
      ? columnIndexToLetter_(index)
      : String(index);
  var header = "";
  try {
    header = String(sheet.getRange(headerRow, index, 1, 1).getDisplayValue() || "").trim();
  } catch (e) {
    header = "";
  }
  return {
    index: index,
    letter: letter,
    header: header,
    label: header ? letter + " · " + header : letter,
  };
}

/**
 * @param {Array<Array<string>>} values
 * @param {Object} columns
 * @return {number|null}
 */
function stats_findFallbackStatusColumn_(values, columns) {
  if (!values || !values.length) {
    return null;
  }
  var headers = values[0] || [];
  if (!headers.length) {
    return null;
  }
  var mapped = columns && columns.statusColumn != null ? Number(columns.statusColumn) : null;
  var bestCol = null;
  var bestScore = 0;

  for (var col = 1; col <= headers.length; col++) {
    if (mapped != null && isFinite(mapped) && col === Math.floor(mapped)) {
      continue;
    }
    var headerRaw = headers[col - 1] != null ? String(headers[col - 1]) : '';
    var headerScore = stats_scoreStatusHeader_(headerRaw);
    var seen = 0;
    var recognized = 0;
    var keywordSeen = 0;
    var bucketKinds = {};
    for (var r = 1; r < values.length && seen < 70; r++) {
      var row = values[r] || [];
      var txt = col <= row.length ? String(row[col - 1] || '').trim() : '';
      if (!txt) {
        continue;
      }
      seen++;
      var bucket = classifyShipmentBucket_(txt, false);
      if (bucket !== 'unknown') {
        recognized++;
        bucketKinds[bucket] = true;
      }
      if (stats_looksLikeStatusText_(txt)) {
        keywordSeen++;
      }
    }
    if (seen < 3) {
      continue;
    }
    var quality = seen > 0 ? recognized / seen : 0;
    var keywordRatio = seen > 0 ? keywordSeen / seen : 0;
    var diversity = Object.keys(bucketKinds).length;
    var score = quality * 0.65 + headerScore * 0.2 + keywordRatio * 0.15;
    if (diversity >= 2) {
      score += 0.05;
    }
    if (seen >= 6 && recognized >= 2) {
      score += 0.05;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestScore >= 0.38 ? bestCol : null;
}

/**
 * @param {string} raw
 * @return {number}
 */
function stats_scoreStatusHeader_(raw) {
  var s = stats_digitsToAscii_(String(raw || ''));
  try {
    s = s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    s = s.toLowerCase();
  }
  s = s
    .replace(/[_./|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) {
    return 0;
  }
  var score = 0;
  if (
    /status|statut|etat|state|confirm|confirmation|conformation|confarmation|livraison|delivery|tracking|suivi|حالة|تأكيد/.test(
      s
    )
  ) {
    score = Math.max(score, 0.9);
  }
  if (/date|phone|telephone|address|adresse|wilaya|commune|carrier|product|total|prix|amount|montant|note/.test(s)) {
    score = Math.max(0, score - 0.45);
  }
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

/**
 * @param {string} raw
 * @return {boolean}
 */
function stats_looksLikeStatusText_(raw) {
  var s = stats_digitsToAscii_(String(raw || ''));
  var sn = s.toLowerCase();
  try {
    sn = sn.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {}
  return /conf|annul|cancel|livr|retour|expid|exped|echec|failed|pending|attent|\binj\b|تأكيد|ملغي|مرتجع|فشل|تسليم|قيد/.test(
    sn
  );
}

/**
 * @param {Array<Array<string>>} values
 * @param {number} rowNum
 * @param {number} headerRow
 * @param {number} col
 * @return {string}
 */
function stats_getMatrixCellDisplay_(values, rowNum, headerRow, col) {
  if (!values || !values.length) {
    return '';
  }
  var r = rowNum - headerRow;
  if (r < 0 || r >= values.length) {
    return '';
  }
  var row = values[r] || [];
  if (col < 1 || col > row.length) {
    return '';
  }
  return String(row[col - 1] || '').trim();
}

/**
 * @param {string} raw
 * @return {string}
 */
function stats_normalizeProductKey_(raw) {
  var s = raw != null ? String(raw).trim() : '';
  if (!s) {
    return '—';
  }
  s = s.replace(/\(\d+\)\s*$/g, '').replace(/\s+/g, ' ').trim();
  var parts = s.split(/\s+-\s+/);
  if (parts.length > 1) {
    var left = parts[0].trim();
    var right = parts.slice(1).join(' - ').trim();
    if (
      /[0-9٠-٩]/.test(right) ||
      /قطعة|قطع|مجانا|free|pcs?|piece|pi[eè]ce|pack|x\s*\d+/i.test(right)
    ) {
      s = left || s;
    }
  }
  return s ? s.slice(0, 80) : '—';
}

/**
 * @param {number} ms
 * @return {string}
 */
function stats_formatDateMsAsIso_(ms) {
  var d = new Date(ms);
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

/**
 * Order stats only accept plausible business dates.
 * @param {Date|null} d
 * @return {boolean}
 */
function stats_isReasonableOrderDate_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return false;
  }
  var y = d.getFullYear();
  return y >= 2000 && y <= 2100;
}

/**
 * @param {number} year
 * @param {number} monthZero
 * @param {number} day
 * @param {number=} hours
 * @param {number=} minutes
 * @param {number=} seconds
 * @param {number=} ms
 * @return {Date|null}
 */
function stats_buildValidatedDate_(
  year,
  monthZero,
  day,
  hours,
  minutes,
  seconds,
  ms
) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthZero) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  var d = new Date(
    year,
    monthZero,
    day,
    hours || 0,
    minutes || 0,
    seconds || 0,
    ms || 0
  );
  if (
    isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== monthZero ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

/**
 * Map Arabic-Indic digits to ASCII for date parsing.
 * @param {string} s
 * @return {string}
 */
function stats_digitsToAscii_(s) {
  var out = '';
  var src = String(s || '');
  for (var i = 0; i < src.length; i++) {
    var c = src.charCodeAt(i);
    if (c >= 0x0660 && c <= 0x0669) {
      out += String(c - 0x0660);
    } else if (c >= 0x06f0 && c <= 0x06f9) {
      out += String(c - 0x06f0);
    } else {
      out += src.charAt(i);
    }
  }
  return out;
}

/**
 * Parse common sheet date strings, preferring y-m-d and d/m/y explicitly.
 * @param {string} raw
 * @return {Date|null}
 */
function stats_parseDateString_(raw) {
  var s = stats_digitsToAscii_(String(raw || '').trim());
  if (!s) {
    return null;
  }
  s = s
    .replace(/[·•]/g, ' ')
    .replace(/[.]/g, '/')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  var compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    var compactDt = stats_buildValidatedDate_(
      parseInt(compact[1], 10),
      parseInt(compact[2], 10) - 1,
      parseInt(compact[3], 10)
    );
    return stats_isReasonableOrderDate_(compactDt) ? compactDt : null;
  }

  var iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    var isoDt = stats_buildValidatedDate_(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10) - 1,
      parseInt(iso[3], 10)
    );
    return stats_isReasonableOrderDate_(isoDt) ? isoDt : null;
  }

  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s].*)?$/);
  if (dmy) {
    var day = parseInt(dmy[1], 10);
    var month = parseInt(dmy[2], 10) - 1;
    var year = parseInt(dmy[3], 10);
    if (year < 100) {
      year += 2000;
    }
    var dmyDt = stats_buildValidatedDate_(year, month, day);
    return stats_isReasonableOrderDate_(dmyDt) ? dmyDt : null;
  }

  var byMonthName = stats_parseMonthNameDate_(s);
  if (byMonthName) {
    return byMonthName;
  }

  if (/[A-Za-z\u0600-\u06FF]/.test(s)) {
    var parsed = new Date(s);
    if (stats_isReasonableOrderDate_(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Parse date strings with month names (EN/FR), e.g. "5 February 2026 3:06 am".
 * @param {string} raw
 * @return {Date|null}
 */
function stats_parseMonthNameDate_(raw) {
  if (!raw) {
    return null;
  }
  var s = String(raw)
    .replace(/[·•]/g, ' ')
    .replace(/([A-Za-zÀ-ÿ]+)\s*:\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) {
    return null;
  }
  var m = s.match(
    /^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{2,4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i
  );
  if (!m) {
    return null;
  }
  var day = parseInt(m[1], 10);
  var monthName = String(m[2] || '');
  var year = parseInt(m[3], 10);
  if (year < 100) {
    year += 2000;
  }
  var monthIndex = stats_monthNameToIndex_(monthName);
  if (monthIndex == null) {
    return null;
  }
  var hour = m[4] != null ? parseInt(m[4], 10) : 0;
  var minute = m[5] != null ? parseInt(m[5], 10) : 0;
  var second = m[6] != null ? parseInt(m[6], 10) : 0;
  var ampm = m[7] != null ? String(m[7]).toLowerCase() : '';
  if (ampm === 'pm' && hour < 12) {
    hour += 12;
  } else if (ampm === 'am' && hour === 12) {
    hour = 0;
  }
  var dt = stats_buildValidatedDate_(year, monthIndex, day, hour, minute, second, 0);
  return stats_isReasonableOrderDate_(dt) ? dt : null;
}

/**
 * @param {string} monthRaw
 * @return {number|null}
 */
function stats_monthNameToIndex_(monthRaw) {
  var m = String(monthRaw || '');
  try {
    m = m
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    m = m.toLowerCase();
  }
  m = m.replace(/[^a-z]/g, '');
  if (!m) {
    return null;
  }
  var map = {
    jan: 0, janvier: 0, january: 0,
    fev: 1, fevr: 1, fevrier: 1, feb: 1, february: 1,
    mar: 2, mars: 2, march: 2,
    avr: 3, avril: 3, apr: 3, april: 3,
    mai: 4, may: 4,
    jun: 5, juin: 5, june: 5,
    jul: 6, juillet: 6, july: 6,
    aou: 7, aout: 7, aug: 7, august: 7,
    sep: 8, sept: 8, septembre: 8, september: 8,
    oct: 9, octobre: 9, october: 9,
    nov: 10, novembre: 10, november: 10,
    dec: 11, decembre: 11, december: 11,
  };
  return map[m] != null ? map[m] : null;
}

/**
 * Parse sidebar date (yyyy-mm-dd) as local calendar day — avoids UTC off-by-one vs sheet dates.
 * @param {string|undefined} raw
 * @return {number|null} start of local day ms
 */
function stats_parseFilterStart_(raw) {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  var s = String(raw).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var day = parseInt(m[3], 10);
    var d = stats_buildValidatedDate_(y, mo, day, 0, 0, 0, 0);
    return d ? d.getTime() : null;
  }
  var d2 = new Date(s);
  if (isNaN(d2.getTime())) {
    return null;
  }
  d2.setHours(0, 0, 0, 0);
  return d2.getTime();
}

/**
 * @param {string|undefined} raw
 * @return {number|null} end of local day ms
 */
function stats_parseFilterEnd_(raw) {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  var s = String(raw).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10) - 1;
    var day = parseInt(m[3], 10);
    var d = stats_buildValidatedDate_(y, mo, day, 23, 59, 59, 999);
    return d ? d.getTime() : null;
  }
  var d2 = new Date(s);
  if (isNaN(d2.getTime())) {
    return null;
  }
  d2.setHours(23, 59, 59, 999);
  return d2.getTime();
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} rowNum
 * @param {number|string} col
 * @return {Date|null}
 */
function stats_parseCellDate_(sheet, rowNum, col) {
  if (col == null) {
    return null;
  }
  var c = Number(col);
  if (isNaN(c) || c < 1) {
    return null;
  }
  var cell = sheet.getRange(rowNum, c, 1, 1);
  var raw = cell.getValue();
  var display = cell.getDisplayValue();
  return stats_parseRawCellDate_(raw, display);
}

/**
 * Parse either raw sheet value or display text into a valid order date.
 * @param {*} rawValue
 * @param {string|undefined} displayValue
 * @return {Date|null}
 */
function stats_parseRawCellDate_(rawValue, displayValue) {
  if (rawValue instanceof Date) {
    return stats_isReasonableOrderDate_(rawValue) ? rawValue : null;
  }
  if (rawValue != null && rawValue !== '' && typeof rawValue === 'number' && !isNaN(rawValue)) {
    // Spreadsheet serial date
    if (rawValue >= 20000 && rawValue <= 80000) {
      var serialDate = new Date((rawValue - 25569) * 86400 * 1000);
      if (stats_isReasonableOrderDate_(serialDate)) {
        return serialDate;
      }
    }
    // Compact yyyyMMdd
    var asInt = Math.round(rawValue);
    if (Math.abs(rawValue - asInt) < 1e-6) {
      var compact = stats_parseDateString_(String(asInt));
      if (compact) {
        return compact;
      }
    }
  }
  var shown =
    displayValue != null && String(displayValue).trim() !== ''
      ? String(displayValue).trim()
      : rawValue != null && rawValue !== ''
        ? String(rawValue).trim()
        : '';
  if (!shown) {
    return null;
  }
  var parsed = stats_parseDateString_(shown);
  if (parsed) {
    return parsed;
  }
  return null;
}

/**
 * @param {string} statusText
 * @param {boolean} hasTracking
 * @return {string} bucket key
 */
function classifyShipmentBucket_(statusText, hasTracking) {
  var raw = statusText ? String(statusText) : '';
  var s = raw.toLowerCase();
  var sn = s;
  try {
    sn = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    sn = s;
  }

  if (/[\u0600-\u06FF]/.test(raw)) {
    if (/مرتجع|مسترجع|إرجاع|استرجاع/.test(raw)) {
      return 'returned';
    }
    if (/ملغي|ألغي|إلغاء|الغاء/.test(raw)) {
      return 'cancelled';
    }
    if (/فشل|خطأ|إخفاق|مشكل/.test(raw)) {
      return 'failed';
    }
    if (/في الطريق|قيد النقل|خارج|المركز|مندوب|جاري|الشحن|الإرسال|للتوصيل/.test(raw)) {
      return 'in_transit';
    }
    if (/تسليم|تم التسليم|تم التوصيل|تم التوزيع|مسلّم|وصلت|وصل\b/.test(raw)) {
      return 'delivered';
    }
    if (/تأكيد|مؤكد|تم التأكيد/.test(raw)) {
      return 'confirmed';
    }
    if (/انتظار|معلق|قيد الانتظار/.test(raw)) {
      return 'pending';
    }
  }

  if (/suivi echec|echec|failed|erreur|error|#error/.test(sn)) {
    return 'failed';
  }
  if (/retour|returned|retourne/.test(sn)) {
    return 'returned';
  }
  if (/annul|cancel|annule/.test(sn)) {
    return 'cancelled';
  }
  // Before "delivered": avoid matching "livre" inside "livreur" as delivered.
  if (
    /transit|exped|expid|envoye|en cours|ramasse|livreur|chez le livreur|sortie|dispatch|shipping/.test(
      sn
    )
  ) {
    return 'in_transit';
  }
  if (/\bconf(?:irm|erm)(?:e|ee|es|ees|er)?\b/.test(sn)) {
    return 'confirmed';
  }
  if (/attente|pending|en attente|a confirmer|to confirm/.test(sn)) {
    return 'pending';
  }
  if (/\binj(?:\s*\d+)?\b/.test(sn)) {
    return 'in_transit';
  }
  if (/livree|livre\b|delivered|distribue|distribution/.test(sn)) {
    return 'delivered';
  }
  if (hasTracking) {
    return 'in_transit';
  }
  return 'unknown';
}

/**
 * @param {Object} map
 * @param {string} groupKey
 * @param {string} bucket
 */
function incNested_(map, groupKey, bucket) {
  if (!map[groupKey]) {
    map[groupKey] = {
      delivered: 0,
      returned: 0,
      failed: 0,
      cancelled: 0,
      in_transit: 0,
      confirmed: 0,
      pending: 0,
      unknown: 0,
    };
  }
  if (map[groupKey][bucket] == null) {
    map[groupKey][bucket] = 0;
  }
  map[groupKey][bucket]++;
}
