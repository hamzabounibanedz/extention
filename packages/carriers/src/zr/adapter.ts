import type {
  AdapterCredentials,
  BulkCreateFailure,
  BulkCreateParcelsInput,
  BulkCreateParcelsResult,
  BulkCreateSuccess,
  CarrierAdapter,
  ParcelStatus,
  SearchParcelsInput,
  SearchParcelsResult,
  TestConnectionResult,
  TerritoryRecord,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingInput,
  TrackingResult,
} from '../core/carrier-adapter.js';
import { randomUUID } from 'node:crypto';

type ZrCredentials = {
  tenantId: string;
  secretKey: string;
  bearerToken?: string;
  version: string;
  baseUrl: string;
};

type JsonResponse = {
  status: number;
  json: unknown;
  text: string;
};

const ZR_DEFAULT_BASE = 'https://api.zrexpress.app/api';
const ZR_DEFAULT_VERSION = '1';

function pickFirst_(obj: AdapterCredentials | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return undefined;
}

function parseCredentials_(credentials?: AdapterCredentials): ZrCredentials | null {
  const tenantId = pickFirst_(credentials, ['tenantId', 'tenant', 'xTenant', 'X-Tenant']);
  const secretKey = pickFirst_(credentials, [
    'secretKey',
    'secret',
    'apiKey',
    'xApiKey',
    'X-Api-Key',
    'api_key',
  ]);
  if (!tenantId || !secretKey) {
    return null;
  }
  const bearerToken = pickFirst_(credentials, ['bearerToken', 'token', 'bearer', 'authorization']);
  const version = pickFirst_(credentials, ['version', 'apiVersion']) || ZR_DEFAULT_VERSION;
  const baseUrl = (pickFirst_(credentials, ['baseUrl']) || ZR_DEFAULT_BASE).replace(/\/+$/, '');
  return {
    tenantId,
    secretKey,
    bearerToken: bearerToken || undefined,
    version,
    baseUrl,
  };
}

function zrBase_(creds: ZrCredentials): string {
  const version = String(creds.version || ZR_DEFAULT_VERSION).replace(/^v/i, '').trim() || ZR_DEFAULT_VERSION;
  return `${creds.baseUrl}/v${version}`;
}

function headersForKeyAuth_(creds: ZrCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Tenant': creds.tenantId,
    'X-Api-Key': creds.secretKey,
  };
}

async function jsonRequest_(
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
): Promise<JsonResponse> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text };
}

function asArray_(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function extractItems_(json: unknown): unknown[] {
  if (!json || typeof json !== 'object') return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.items)) return o.items as unknown[];
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>;
    if (Array.isArray(d.items)) return d.items as unknown[];
    if (Array.isArray(d.results)) return d.results as unknown[];
    if (Array.isArray(d.data)) return d.data as unknown[];
  }
  if (Array.isArray(o.results)) return o.results as unknown[];
  if (Array.isArray(o.data)) return o.data as unknown[];
  return [];
}

function hasNext_(json: unknown, pageNumber: number, pageSize: number, itemsLength: number): boolean {
  if (!json || typeof json !== 'object') return false;
  const o = json as Record<string, unknown>;
  if (typeof o.hasNext === 'boolean') return o.hasNext;
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>;
    if (typeof d.hasNext === 'boolean') return d.hasNext;
    const totalCount = Number(d.totalCount ?? d.total ?? NaN);
    if (Number.isFinite(totalCount)) return pageNumber * pageSize < totalCount;
  }
  const totalCount = Number(o.totalCount ?? o.total ?? NaN);
  if (Number.isFinite(totalCount)) return pageNumber * pageSize < totalCount;
  return itemsLength >= pageSize;
}

function normalizeHexColor_(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  return null;
}

function normalizeTerritory_(value: unknown): TerritoryRecord | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const id = o.id != null ? String(o.id) : '';
  if (!id) return null;
  const deliveryObj =
    o.delivery && typeof o.delivery === 'object'
      ? (o.delivery as Record<string, unknown>)
      : o.DeliveryCapability && typeof o.DeliveryCapability === 'object'
        ? (o.DeliveryCapability as Record<string, unknown>)
        : {};
  const hasHome = deliveryObj.hasHomeDelivery ?? deliveryObj.HasHomeDelivery;
  const hasPickup = deliveryObj.hasPickupPoint ?? deliveryObj.HasPickupPoint;
  const codeN = Number(o.code ?? NaN);
  return {
    id,
    code: Number.isFinite(codeN) ? codeN : null,
    name: o.name != null ? String(o.name) : '',
    level: o.level != null ? String(o.level).toLowerCase() : '',
    parentId: o.parentId != null ? String(o.parentId) : null,
    postalCode: o.postalCode != null ? String(o.postalCode) : o.PostalCode != null ? String(o.PostalCode) : null,
    hasHomeDelivery: typeof hasHome === 'boolean' ? hasHome : null,
    hasPickupPoint: typeof hasPickup === 'boolean' ? hasPickup : null,
    raw: value,
  };
}

function ensureBulkParcelValid_(parcel: Record<string, unknown>): string | null {
  const deliveryType = String(parcel.deliveryType ?? '').trim();
  if (deliveryType !== 'home' && deliveryType !== 'pickup-point') {
    return 'deliveryType must be home or pickup-point';
  }
  if (!parcel.customer || typeof parcel.customer !== 'object') return 'customer is required';
  if (!parcel.orderedProducts || !Array.isArray(parcel.orderedProducts) || parcel.orderedProducts.length < 1) {
    return 'orderedProducts must contain at least one product';
  }
  const externalId = String(parcel.externalId ?? '').trim();
  if (!externalId) return 'externalId is required for bulk';
  if (externalId.length > 100) return 'externalId must be <= 100 characters';
  const amount = Number(parcel.amount ?? NaN);
  if (!Number.isFinite(amount) || amount < 0 || amount > 150000) {
    return 'amount must be between 0 and 150000 DZD';
  }
  if (deliveryType === 'home') {
    const da = parcel.deliveryAddress as Record<string, unknown> | undefined;
    if (!da || typeof da !== 'object') return 'deliveryAddress is required when deliveryType=home';
    if (!da.cityTerritoryId || !da.districtTerritoryId) {
      return 'deliveryAddress.cityTerritoryId and districtTerritoryId are required';
    }
  }
  if (deliveryType === 'pickup-point') {
    if (!parcel.hubId || String(parcel.hubId).trim() === '') {
      return 'hubId is required when deliveryType=pickup-point';
    }
  }
  return null;
}

function parseBulkResponse_(
  status: number,
  json: unknown,
  sentIndexMap: number[],
  sentParcels: Array<Record<string, unknown>>,
): { successes: BulkCreateSuccess[]; failures: BulkCreateFailure[] } {
  const successes: BulkCreateSuccess[] = [];
  const failures: BulkCreateFailure[] = [];
  const payload = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};

  const successArr = asArray_(payload.successes);
  for (const s of successArr) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const localIndex = Number(o.index ?? NaN);
    if (!Number.isFinite(localIndex) || localIndex < 0 || localIndex >= sentIndexMap.length) continue;
    successes.push({
      index: sentIndexMap[localIndex],
      parcelId: o.parcelId != null ? String(o.parcelId) : null,
      trackingNumber: o.trackingNumber != null ? String(o.trackingNumber) : null,
      externalId: o.externalId != null ? String(o.externalId) : null,
    });
  }

  const failureArr = asArray_(payload.failures);
  for (const f of failureArr) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const localIndex = Number(o.index ?? NaN);
    if (!Number.isFinite(localIndex) || localIndex < 0 || localIndex >= sentIndexMap.length) continue;
    failures.push({
      index: sentIndexMap[localIndex],
      errorCode: o.errorCode != null ? String(o.errorCode) : null,
      errorMessage: o.errorMessage != null ? String(o.errorMessage) : `ZR error (${status})`,
      externalId:
        o.externalId != null
          ? String(o.externalId)
          : sentParcels[localIndex]?.externalId != null
            ? String(sentParcels[localIndex].externalId)
            : null,
    });
  }

  if (status >= 400 && failures.length === 0) {
    const message =
      payload.message != null
        ? String(payload.message)
        : payload.title != null
          ? String(payload.title)
          : `ZR bulk request failed (${status})`;
    for (let i = 0; i < sentIndexMap.length; i++) {
      failures.push({
        index: sentIndexMap[i],
        errorCode: status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED',
        errorMessage: message,
        externalId: sentParcels[i]?.externalId != null ? String(sentParcels[i].externalId) : null,
      });
    }
  }
  return { successes, failures };
}

/**
 * ZR — Algerian carrier. HTTP integration to be wired to official API docs.
 */
export class ZrAdapter implements CarrierAdapter {
  readonly id = 'zr';
  readonly displayName = 'ZR';

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const order = input.order as unknown as Record<string, unknown>;
    const cityTerritoryId = order.cityTerritoryId != null ? String(order.cityTerritoryId) : '';
    const districtTerritoryId = order.districtTerritoryId != null ? String(order.districtTerritoryId) : '';
    const deliveryTypeRaw = String(order.deliveryType ?? 'home').toLowerCase();
    const deliveryType = deliveryTypeRaw === 'pickup-point' || deliveryTypeRaw === 'stopdesk' ? 'pickup-point' : 'home';
    if (deliveryType === 'home' && (!cityTerritoryId || !districtTerritoryId)) {
      return {
        ok: false,
        errorMessage:
          'ZR requires cityTerritoryId and districtTerritoryId UUIDs. Resolve territories before createShipment.',
      };
    }
    const customerFirst = String(order.customerFirstName ?? '').trim();
    const customerLast = String(order.customerLastName ?? '').trim();
    const customerName = [customerFirst, customerLast].filter(Boolean).join(' ').trim() || 'Customer';
    const externalId =
      String(order.externalId ?? '').trim() ||
      `legacy-${String(order.spreadsheetId ?? 'sheet')}-${String(order.rowNumber ?? '0')}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const parcel: Record<string, unknown> = {
      customer: {
        customerId: randomUUID(),
        name: customerName.slice(0, 100),
        phone: {
          number1: String(order.phone ?? ''),
        },
      },
      deliveryType,
      description: String(order.productName ?? 'Order').slice(0, 250),
      amount: Number(order.codAmount ?? 0),
      externalId: externalId.slice(0, 100),
      orderedProducts: [
        {
          productName: String(order.productName ?? 'Product').replace(/\|/g, ' ').slice(0, 100),
          unitPrice: Number(order.codAmount ?? 0),
          quantity: Math.max(1, Number(order.quantity ?? 1)),
          stockType: 'none',
        },
      ],
    };
    if (deliveryType === 'home') {
      parcel.deliveryAddress = {
        cityTerritoryId,
        districtTerritoryId,
      };
    } else {
      parcel.hubId = String(order.hubId ?? order.stopDeskId ?? '');
    }

    const bulk = await this.bulkCreateParcels({ parcels: [parcel], credentials: input.credentials });
    if (bulk.successes.length) {
      const s = bulk.successes[0];
      return {
        ok: true,
        externalShipmentId: s.parcelId ?? null,
        trackingNumber: s.trackingNumber ?? null,
        rawStatus: 'created',
      };
    }
    return {
      ok: false,
      errorMessage: bulk.failures[0]?.errorMessage || 'ZR bulk create failed',
    };
  }

  async getTracking(input: TrackingInput): Promise<TrackingResult> {
    const trackingNumber = input.trackingNumber || input.externalShipmentId;
    if (!trackingNumber) {
      return { ok: false, errorMessage: 'tracking number is required' };
    }
    const creds = parseCredentials_(input.credentials);
    if (!creds) {
      return {
        ok: false,
        errorMessage: 'ZR: credentials missing (tenantId/secretKey).',
      };
    }
    const searchBody = {
      pageNumber: 1,
      pageSize: 20,
      advancedSearch: {
        field: 'trackingNumber',
        keyword: trackingNumber,
      },
    };
    const result = await this.searchParcels({
      body: searchBody,
      credentials: creds,
    });
    const item = result.items.find((x) => String(x.trackingNumber).toLowerCase() === String(trackingNumber).toLowerCase());
    if (!item) {
      return { ok: false, errorMessage: 'Shipment not found', rawStatus: null };
    }
    return {
      ok: true,
      status: item.stateName || null,
      rawStatus: item.stateName || null,
    };
  }

  async testConnection(credentials?: AdapterCredentials): Promise<TestConnectionResult> {
    const creds = parseCredentials_(credentials);
    if (!creds) {
      return { ok: false, message: 'Missing ZR credentials (tenantId/secretKey).' };
    }
    const url = `${zrBase_(creds)}/users/profile`;
    const keyHeaders = headersForKeyAuth_(creds);

    const primaryHeaders = creds.bearerToken
      ? {
          Accept: 'application/json',
          Authorization: `Bearer ${creds.bearerToken}`,
        }
      : keyHeaders;

    let response = await jsonRequest_(url, {
      method: 'GET',
      headers: primaryHeaders,
    });
    if (response.status === 401 && creds.bearerToken) {
      // Some tenants expose /users/profile with API-key auth despite token docs.
      response = await jsonRequest_(url, {
        method: 'GET',
        headers: keyHeaders,
      });
    }
    const ok = response.status >= 200 && response.status < 300;
    const memberships = asArray_((response.json as any)?.memberships)
      .filter((m) => m && typeof m === 'object')
      .map((m) => {
        const o = m as Record<string, unknown>;
        return {
          tenantId: o.tenantId != null ? String(o.tenantId) : null,
          isActive: typeof o.isActive === 'boolean' ? o.isActive : null,
          roles: asArray_(o.roles).map((x) => String(x)),
        };
      });
    return {
      ok,
      message: ok ? 'ZR profile check successful.' : `ZR profile failed (${response.status}).`,
      memberships,
      raw: response.json,
    };
  }

  async fetchAllTerritories(credentials?: AdapterCredentials): Promise<TerritoryRecord[]> {
    const creds = parseCredentials_(credentials);
    if (!creds) {
      throw new Error('Missing ZR credentials (tenantId/secretKey).');
    }
    const out: TerritoryRecord[] = [];
    const pageSize = 1000;
    let pageNumber = 1;
    while (true) {
      const response = await jsonRequest_(`${zrBase_(creds)}/territories/search`, {
        method: 'POST',
        headers: headersForKeyAuth_(creds),
        body: { pageNumber, pageSize },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`ZR territories/search failed (${response.status})`);
      }
      const items = extractItems_(response.json);
      for (const item of items) {
        const normalized = normalizeTerritory_(item);
        if (normalized) out.push(normalized);
      }
      if (!hasNext_(response.json, pageNumber, pageSize, items.length)) {
        break;
      }
      pageNumber += 1;
      if (pageNumber > 200) {
        // Safety stop to avoid accidental infinite pagination loops.
        break;
      }
    }
    return out;
  }

  async bulkCreateParcels(input: BulkCreateParcelsInput): Promise<BulkCreateParcelsResult> {
    const creds = parseCredentials_(input.credentials);
    if (!creds) {
      return {
        httpStatus: 400,
        totalRequested: input.parcels.length,
        successCount: 0,
        failureCount: input.parcels.length,
        successes: [],
        failures: input.parcels.map((p, index) => ({
          index,
          errorCode: 'MISSING_CREDENTIALS',
          errorMessage: 'Missing ZR credentials (tenantId/secretKey).',
          externalId: p.externalId != null ? String(p.externalId) : null,
        })),
      };
    }

    const preValidationFailures: BulkCreateFailure[] = [];
    const sendParcels: Array<Record<string, unknown>> = [];
    const sendIndexMap: number[] = [];
    for (let i = 0; i < input.parcels.length; i++) {
      const parcel = input.parcels[i];
      const error = ensureBulkParcelValid_(parcel);
      if (error) {
        preValidationFailures.push({
          index: i,
          errorCode: 'LOCAL_VALIDATION',
          errorMessage: error,
          externalId: parcel.externalId != null ? String(parcel.externalId) : null,
        });
      } else {
        sendParcels.push(parcel);
        sendIndexMap.push(i);
      }
    }

    const successes: BulkCreateSuccess[] = [];
    const failures: BulkCreateFailure[] = [...preValidationFailures];
    let httpStatus = 400;
    let raw: unknown = null;

    if (sendParcels.length) {
      const response = await jsonRequest_(`${zrBase_(creds)}/parcels/bulk`, {
        method: 'POST',
        headers: headersForKeyAuth_(creds),
        body: {
          parcels: sendParcels,
        },
      });
      httpStatus = response.status;
      raw = response.json ?? response.text;
      const parsed = parseBulkResponse_(response.status, response.json, sendIndexMap, sendParcels);
      successes.push(...parsed.successes);
      failures.push(...parsed.failures);
    }

    failures.sort((a, b) => a.index - b.index);
    return {
      httpStatus,
      totalRequested: input.parcels.length,
      successCount: successes.length,
      failureCount: failures.length,
      successes,
      failures,
      raw,
    };
  }

  async searchParcels(input: SearchParcelsInput): Promise<SearchParcelsResult> {
    const creds = parseCredentials_(input.credentials);
    if (!creds) {
      return {
        httpStatus: 400,
        items: [],
        raw: { error: 'missing_credentials' },
      };
    }
    const response = await jsonRequest_(`${zrBase_(creds)}/parcels/search`, {
      method: 'POST',
      headers: headersForKeyAuth_(creds),
      body: input.body || {},
    });
    const items = extractItems_(response.json);
    const normalized: ParcelStatus[] = items
      .filter((x) => x && typeof x === 'object')
      .map((x) => {
        const o = x as Record<string, unknown>;
        const state =
          o.state && typeof o.state === 'object' ? (o.state as Record<string, unknown>) : {};
        return {
          trackingNumber: o.trackingNumber != null ? String(o.trackingNumber) : '',
          stateName: state.name != null ? String(state.name) : null,
          stateColor: normalizeHexColor_(state.color),
          lastStateUpdateAt:
            o.lastStateUpdateAt != null ? String(o.lastStateUpdateAt) : o.updatedAt != null ? String(o.updatedAt) : null,
          amount: Number.isFinite(Number(o.amount)) ? Number(o.amount) : null,
          deliveryPrice: Number.isFinite(Number(o.deliveryPrice)) ? Number(o.deliveryPrice) : null,
          deliveryType: o.deliveryType != null ? String(o.deliveryType) : null,
          raw: o,
        };
      })
      .filter((item) => item.trackingNumber !== '');
    return {
      httpStatus: response.status,
      items: normalized,
      raw: response.json ?? response.text,
    };
  }
}
