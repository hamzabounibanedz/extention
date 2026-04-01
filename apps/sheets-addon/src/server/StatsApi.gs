/**
 * @fileoverview Aggregate delivery stats from the active sheet (mapped columns + status text).
 */

/**
 * @param {string|undefined} fromIso yyyy-mm-dd or ISO (optional)
 * @param {string|undefined} toIso yyyy-mm-dd or ISO (optional)
 * @return {Object} summary, buckets, rates, byCarrier, byProduct
 */
function stats_computeSheet(fromIso, toIso) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
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
  var dateFilterOn =
    columns.orderDateColumn != null && (fromMs != null || toMs != null);

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
      var rowDate = stats_parseCellDate_(sheet, rowNum, columns.orderDateColumn);
      if (rowDate == null) {
        skippedNoDate++;
        continue;
      }
      var t = rowDate.getTime();
      if (fromMs != null && t < fromMs) {
        continue;
      }
      if (toMs != null && t > toMs) {
        continue;
      }
    }

    totalAnalyzed++;

    var statusText = order.status != null ? String(order.status) : '';
    var hasTrack =
      order.trackingNumber != null && String(order.trackingNumber).trim() !== '';
    var bucket = classifyShipmentBucket_(statusText, hasTrack);
    if (buckets[bucket] == null) {
      bucket = 'unknown';
    }
    buckets[bucket]++;

    var carrierLabel = resolveCarrierAdapterId_(order.carrier, defaultCarrierId) || '—';
    incNested_(byCarrier, carrierLabel, bucket);

    var prod =
      order.productName != null && String(order.productName).trim() !== ''
        ? String(order.productName).trim().slice(0, 80)
        : '—';
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

  return {
    sheetId: sheetId,
    sheetName: sheetName,
    lastRowScanned: lastRow,
    totalRowsAnalyzed: totalAnalyzed,
    emptyRowsSkipped: emptySkipped,
    rowsSkippedNoDateFilter: skippedNoDate,
    dateFilter: {
      active: dateFilterOn,
      fromIso: fromIso != null && String(fromIso).trim() !== '' ? String(fromIso).trim() : null,
      toIso: toIso != null && String(toIso).trim() !== '' ? String(toIso).trim() : null,
      orderDateColumnMapped: columns.orderDateColumn != null,
    },
    buckets: buckets,
    rates: rates,
    byCarrier: byCarrier,
    byProduct: byProduct,
    note: i18n_t('stats.note'),
  };
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
    var d = new Date(y, mo, day, 0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
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
    var d = new Date(y, mo, day, 23, 59, 59, 999);
    return isNaN(d.getTime()) ? null : d.getTime();
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
  var v = sheet.getRange(rowNum, c).getValue();
  if (v instanceof Date) {
    return v;
  }
  if (v == null || v === '') {
    return null;
  }
  if (typeof v === 'number' && !isNaN(v)) {
    // Évite d'interpréter montants (COD, etc.) comme date Excel.
    if (v >= 30000 && v <= 60000) {
      var d0 = new Date((v - 25569) * 86400 * 1000);
      if (!isNaN(d0.getTime())) {
        return d0;
      }
    }
  }
  var d = new Date(v);
  if (!isNaN(d.getTime())) {
    return d;
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10) - 1;
    var year = parseInt(m[3], 10);
    if (year < 100) {
      year += 2000;
    }
    var dt = new Date(year, month, day);
    if (!isNaN(dt.getTime())) {
      return dt;
    }
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

  if (/suivi échec|suivi echec|échec|echec|failed|erreur/.test(s)) {
    return 'failed';
  }
  if (/retour|returned|retourné|retourne/.test(s)) {
    return 'returned';
  }
  if (/annul|cancel|annulé|annule/.test(s)) {
    return 'cancelled';
  }
  // Before "delivered": avoid matching "livre" inside "livreur" as delivered.
  if (
    /transit|expédié|expedie|envoyé|envoye|en cours|ramassé|ramasse|livreur|chez le livreur/.test(
      s
    )
  ) {
    return 'in_transit';
  }
  if (/confirm|confirme/.test(s)) {
    return 'confirmed';
  }
  if (/attente|pending|en attente/.test(s)) {
    return 'pending';
  }
  if (/livré|delivered|distribué|distribue/.test(s)) {
    return 'delivered';
  }
  if (/\blivre\b/.test(s)) {
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
