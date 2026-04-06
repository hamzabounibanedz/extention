import type { InternalOrder, ShipmentStatus } from '@delivery-tool/shared';

/** Carrier slug (matches saved mapping carrierId / adapter registry). */
export type CarrierId = string;

export type AdapterCredentials = Record<string, string>;

export type CreateShipmentInput = {
  order: InternalOrder;
  /** API tokens / secrets — never log in production. */
  credentials?: AdapterCredentials;
  /** Optional business-level settings (sender defaults, options, etc.). */
  businessSettings?: Record<string, unknown> | null;
};

export type CreateShipmentResult = {
  ok: boolean;
  externalShipmentId?: string | null;
  trackingNumber?: string | null;
  /** Carrier-native status string if any. */
  rawStatus?: string | null;
  /** Optional URL to a printable label, when the carrier supports it. */
  labelUrl?: string | null;
  errorMessage?: string | null;
};

export type TrackingInput = {
  externalShipmentId: string;
  trackingNumber?: string | null;
  credentials?: AdapterCredentials;
};

export type TrackingResult = {
  ok: boolean;
  /** Normalized when possible; otherwise raw carrier string. */
  status?: ShipmentStatus | string | null;
  rawStatus?: string | null;
  errorMessage?: string | null;
};

export type TerritoryRecord = {
  id: string;
  code: number | null;
  name: string;
  level: 'wilaya' | 'commune' | string;
  parentId: string | null;
  postalCode: string | null;
  hasHomeDelivery: boolean | null;
  hasPickupPoint: boolean | null;
  raw?: unknown;
};

export type BulkCreateSuccess = {
  index: number;
  parcelId?: string | null;
  trackingNumber?: string | null;
  externalId?: string | null;
  labelUrl?: string | null;
};

export type BulkCreateFailure = {
  index: number;
  errorCode?: string | null;
  errorMessage: string;
  externalId?: string | null;
};

export type BulkCreateParcelsInput = {
  parcels: Array<Record<string, unknown>>;
  credentials?: AdapterCredentials;
};

export type BulkCreateParcelsResult = {
  httpStatus: number;
  totalRequested: number;
  successCount: number;
  failureCount: number;
  successes: BulkCreateSuccess[];
  failures: BulkCreateFailure[];
  raw?: unknown;
};

export type SearchParcelsInput = {
  body: Record<string, unknown>;
  credentials?: AdapterCredentials;
};

export type ParcelStatus = {
  trackingNumber: string;
  stateName: string | null;
  stateColor: string | null;
  lastStateUpdateAt: string | null;
  amount: number | null;
  deliveryPrice: number | null;
  deliveryType: string | null;
  raw?: unknown;
};

export type SearchParcelsResult = {
  httpStatus: number;
  items: ParcelStatus[];
  raw?: unknown;
};

export type TestConnectionResult = {
  ok: boolean;
  message: string;
  memberships?: Array<{ tenantId: string | null; isActive: boolean | null; roles: string[] }>;
  raw?: unknown;
};

/**
 * One adapter per delivery company. Internal order shape stays fixed; mapping to HTTP is here.
 */
export interface CarrierAdapter {
  readonly id: CarrierId;
  readonly displayName: string;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  getTracking(input: TrackingInput): Promise<TrackingResult>;
  testConnection?(credentials?: AdapterCredentials): Promise<TestConnectionResult>;
  fetchAllTerritories?(credentials?: AdapterCredentials): Promise<TerritoryRecord[]>;
  bulkCreateParcels?(input: BulkCreateParcelsInput): Promise<BulkCreateParcelsResult>;
  searchParcels?(input: SearchParcelsInput): Promise<SearchParcelsResult>;
}
