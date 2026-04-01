/**
 * Column reference stored in {@link ColumnMapping} (typically a 1-based column index).
 * Apps Script `OrderEngine.getColumnValue_` / `stats_parseCellDate_` resolve **numeric**
 * 1-based indices only (`Number(ref)` must be ≥ 1). Non-numeric strings yield no cell read.
 */
export type SheetColumnRef = string | number;
