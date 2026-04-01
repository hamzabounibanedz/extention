/** Mirrors StatsApi.gs `stats_computeSheet` bucket keys and `classifyShipmentBucket_`. */
export type ShipmentBucket =
  | 'delivered'
  | 'returned'
  | 'failed'
  | 'cancelled'
  | 'in_transit'
  | 'confirmed'
  | 'pending'
  | 'unknown';

export type BucketCounts = Record<ShipmentBucket, number>;

export type StatsRates = {
  deliveryVsTerminal: number | null;
  returnVsTerminal: number | null;
  failureVsTerminal: number | null;
  deliveredShareOfAnalyzed: number | null;
};

/** Matches `stats_parseFilterStart_` / sidebar date filter inputs (yyyy-mm-dd or ISO). */
export type StatsSheetDateFilter = {
  active: boolean;
  fromIso: string | null;
  toIso: string | null;
  orderDateColumnMapped: boolean;
};

/**
 * Return shape of StatsApi.gs `stats_computeSheet` (sheet aggregate stats).
 * `byCarrier` / `byProduct` values are per-bucket counts (same keys as {@link BucketCounts}).
 */
export type StatsSheetComputeResult = {
  sheetId: number;
  sheetName: string;
  lastRowScanned: number;
  totalRowsAnalyzed: number;
  emptyRowsSkipped: number;
  rowsSkippedNoDateFilter: number;
  dateFilter: StatsSheetDateFilter;
  buckets: BucketCounts;
  rates: StatsRates;
  byCarrier: Record<string, BucketCounts>;
  byProduct: Record<string, BucketCounts>;
  note: string;
};
