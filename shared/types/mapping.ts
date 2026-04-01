import type { SheetColumnRef } from './column.js';

/**
 * Which sheet column maps to each logical field (saved per spreadsheet + tab).
 * Absent keys mean "not mapped yet".
 */
export interface ColumnMapping {
  orderIdColumn?: SheetColumnRef;
  /** Preferred: first/last name columns (if available). */
  customerFirstNameColumn?: SheetColumnRef;
  customerLastNameColumn?: SheetColumnRef;
  /** Optional: full name column (used as fallback/splitting source). */
  customerFullNameColumn?: SheetColumnRef;
  phoneColumn?: SheetColumnRef;
  addressColumn?: SheetColumnRef;
  wilayaColumn?: SheetColumnRef;
  /** Optional wilaya code column (numeric). */
  wilayaCodeColumn?: SheetColumnRef;
  communeColumn?: SheetColumnRef;
  productColumn?: SheetColumnRef;
  quantityColumn?: SheetColumnRef;
  statusColumn?: SheetColumnRef;
  carrierColumn?: SheetColumnRef;
  trackingColumn?: SheetColumnRef;
  codColumn?: SheetColumnRef;
  shippingFeeColumn?: SheetColumnRef;
  /** Optional delivery fields. */
  deliveryTypeColumn?: SheetColumnRef;
  stopDeskIdColumn?: SheetColumnRef;
  notesColumn?: SheetColumnRef;
  blacklistColumn?: SheetColumnRef;
  /** Optional — reason code or note (shown in preview when liste noire is true). */
  blacklistReasonColumn?: SheetColumnRef;
  /** Optional write-back columns. */
  externalShipmentIdColumn?: SheetColumnRef;
  labelUrlColumn?: SheetColumnRef;
  /** Optional — date for stats filtering (sheet date or text dd/mm/yyyy). */
  orderDateColumn?: SheetColumnRef;

  /** Extra seller-specific columns by stable key (e.g. "sku", "gift_message"). */
  customFields?: Record<string, SheetColumnRef>;
}

/**
 * Persisted mapping blob (e.g. JSON in DocumentProperties).
 * Keys use sheet id so renames do not break storage.
 */
export interface SavedSheetMapping {
  spreadsheetId: string;
  sheetId: number;
  /** Denormalized for UI; optional once sheet id is canonical. */
  sheetName?: string;
  /** 1-based header row index used when reading column labels (matches Apps Script mapping payload). */
  headerRow?: number | null;

  columns: ColumnMapping;

  /** Default carrier adapter id, e.g. "yalidine" | "zr". */
  defaultCarrier?: string | null;

  /** Bump when the JSON shape changes. */
  schemaVersion?: number;
}
