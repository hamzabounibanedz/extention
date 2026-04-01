/**
 * Normalized shipment / row lifecycle inside the add-on (not raw carrier strings).
 */
export type SendState =
  | 'pending'
  | 'queued'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'duplicate';

export type SyncState = 'fresh' | 'stale' | 'error' | 'never';

/**
 * Carrier-agnostic status labels written back to the sheet when possible.
 */
export type ShipmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'failed'
  | 'cancelled';

/**
 * Internal order — one row after mapping + normalization.
 * Dates are ISO 8601 strings for JSON portability (Apps Script + HTTP).
 */
export interface InternalOrder {
  spreadsheetId: string;
  sheetId: number;
  sheetName: string;
  rowNumber: number;

  orderId: string | null;
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  address: string;
  wilaya: string;
  /** May be null when the sheet only has text wilaya names. */
  wilayaCode: number | null;
  commune: string;
  productName: string;
  /** Quantity cells may be empty; treated as null when missing. */
  quantity: number | null;

  carrier: string;
  /** COD amount is nullable when the sheet omits it. */
  codAmount: number | null;
  /** Shipping fee may be computed later; allow null. */
  shippingFee: number | null;
  /** Use `pickup-point` for ZR; `stopdesk` is kept as legacy alias. */
  deliveryType: 'home' | 'pickup-point' | 'stopdesk';
  stopDeskId: string | null;
  hasExchange: boolean;
  freeShipping: boolean;
  labelUrl: string | null;

  /**
   * Row or carrier-facing status text. Normalized labels SHOULD use {@link ShipmentStatus},
   * but in practice carriers can return arbitrary strings, so we allow any non-empty text.
   */
  status: string | null;
  trackingNumber: string | null;
  externalShipmentId: string | null;

  blacklistStatus: 'clean' | 'flagged' | 'blocked';
  notes: string | null;

  sendState: SendState;
  syncState: SyncState;
  lastError: string | null;

  createdAt: string;
  updatedAt: string;
}
