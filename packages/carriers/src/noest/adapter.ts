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
  TerritoryRecord,
  TestConnectionResult,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingInput,
  TrackingResult,
} from '../core/carrier-adapter.js';

type NoestCredentials = {
  apiToken: string;
  userGuid: string;
  baseUrl: string;
};

type JsonResponse = {
  status: number;
  json: unknown;
  text: string;
  headers: Headers;
};

const NOEST_DEFAULT_BASE_URL = 'https://app.noest-dz.com';
const NOEST_RATE_LIMIT_MAX_RETRIES = 3;
const NOEST_RATE_LIMIT_BASE_DELAY_MS = 700;

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

/** Avoid `Authorization: Bearer Bearer …` when credentials were pasted with a Bearer prefix. */
function stripBearerPrefix_(token: string): string {
  const t = String(token).trim();
  if (/^bearer\s+/i.test(t)) return t.replace(/^bearer\s+/i, '').trim();
  return t;
}

function parseCredentials_(credentials?: AdapterCredentials): NoestCredentials | null {
  const apiTokenRaw = pickFirst_(credentials, [
    'apiToken',
    'api_token',
    'token',
    'authorization',
    'bearer',
    'bearerToken',
  ]);
  const apiToken = apiTokenRaw ? stripBearerPrefix_(apiTokenRaw) : '';
  const userGuid = pickFirst_(credentials, ['userGuid', 'user_guid', 'guid', 'partnerGuid']);
  if (!apiToken || !userGuid) {
    return null;
  }
  const baseUrl = (pickFirst_(credentials, ['baseUrl']) || NOEST_DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { apiToken, userGuid, baseUrl };
}

function baseHeaders_(creds: NoestCredentials): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${creds.apiToken}`,
  };
}

function asArray_(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord_(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isObjectPlaceholderText_(value: string): boolean {
  return /^\[object [^\]]+\]$/i.test(String(value || '').trim());
}

function compactErrorText_(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function coerceNoestErrorText_(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') {
    const text = compactErrorText_(value);
    if (!text || isObjectPlaceholderText_(text)) return '';
    const startsLikeJson = text.startsWith('{') || text.startsWith('[');
    const endsLikeJson = text.endsWith('}') || text.endsWith(']');
    if (startsLikeJson && endsLikeJson) {
      try {
        const parsed = JSON.parse(text);
        const inner = coerceNoestErrorText_(parsed, depth + 1);
        if (inner) return inner;
      } catch {
        // keep original
      }
    }
    return text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((x) => coerceNoestErrorText_(x, depth + 1))
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['message', 'detail', 'error', 'title', 'description', 'reason', 'cause', 'errors']) {
      if (o[k] == null) continue;
      const inner = coerceNoestErrorText_(o[k], depth + 1);
      if (inner) return inner;
    }
    const fragments: string[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (v == null || k === 'stack' || k === 'raw') continue;
      const inner = coerceNoestErrorText_(v, depth + 1);
      if (!inner) continue;
      fragments.push(inner);
      if (fragments.length >= 3) break;
    }
    if (fragments.length) return Array.from(new Set(fragments)).join(' | ');
    try {
      const encoded = compactErrorText_(JSON.stringify(value));
      if (!encoded || encoded === '{}' || encoded === '[]' || isObjectPlaceholderText_(encoded)) return '';
      return encoded.length > 600 ? `${encoded.slice(0, 597)}...` : encoded;
    } catch {
      return '';
    }
  }
  return '';
}

function buildUrl_(creds: NoestCredentials, path: string, query?: Record<string, string | number | boolean>): string {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const base = `${creds.baseUrl}/${normalizedPath}`;
  if (!query || !Object.keys(query).length) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    params.set(k, String(v));
  }
  return `${base}?${params.toString()}`;
}

async function sleep_(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs_(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(20_000, sec * 1000);
    }
  }
  return Math.min(20_000, NOEST_RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
}

async function jsonRequest_(
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
  attempt = 0,
): Promise<JsonResponse> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 429 && attempt < NOEST_RATE_LIMIT_MAX_RETRIES) {
    await sleep_(retryAfterMs_(res.headers, attempt));
    return jsonRequest_(url, init, attempt + 1);
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json, text, headers: res.headers };
}

function mapUnicodeDigitsToAscii_(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  return out;
}

/**
 * NOEST expects 9–10 digit national numbers (often 05/06/07xxxxxxxx).
 * Accepts +213 forms from the app and normalizes to 0xxxxxxxxx.
 */
function normalizeDzPhoneForNoest_(raw: unknown): string | null {
  const cleanRaw = mapUnicodeDigitsToAscii_(String(raw ?? '').trim());
  if (!cleanRaw) return null;
  let digits = cleanRaw.replace(/\D/g, '');
  if (!digits) return null;
  for (let guard = 0; guard < 6; guard++) {
    if (digits.startsWith('00213')) digits = digits.slice(5);
    else if (digits.startsWith('213') && digits.length >= 11) digits = digits.slice(3);
    else break;
  }
  while (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  if (digits.length === 9 && /^[567]\d{8}$/.test(digits)) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  return null;
}

function toInteger_(value: unknown, fallback = 0): number {
  const n = Math.round(Number(String(value ?? '').replace(',', '.')));
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function toMoney_(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function normalizeDeliveryType_(raw: unknown): 'home' | 'pickup-point' {
  const t = String(raw ?? 'home').trim().toLowerCase();
  if (t === 'pickup-point' || t === 'pickup point' || t === 'stopdesk' || t === 'stop desk') return 'pickup-point';
  return 'home';
}

function toBoolLoose_(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    if (!t) return fallback;
    if (t === 'true' || t === '1' || t === 'yes' || t === 'oui') return true;
    if (t === 'false' || t === '0' || t === 'no' || t === 'non') return false;
  }
  return fallback;
}

/** NOEST: 1=Delivery, 2=Exchange, 3=Pick-up (amount forced to 0 by API). */
function resolveNoestTypeId_(rawParcel: Record<string, unknown>): 1 | 2 | 3 {
  const explicit = toInteger_(rawParcel.noestTypeId ?? rawParcel.noest_type_id, 0);
  if (explicit >= 1 && explicit <= 3) return explicit as 1 | 2 | 3;
  if (toBoolLoose_(rawParcel.hasExchange ?? rawParcel.has_exchange, false)) return 2;
  return 1;
}

function buildNoestOrder_(rawParcel: Record<string, unknown>, rowIndex: number): { order?: Record<string, unknown>; error?: string } {
  const customer = asRecord_(rawParcel.customer);
  const phoneObj = asRecord_(customer.phone);
  const name =
    String(rawParcel.customerName ?? customer.name ?? '').trim() ||
    [String(rawParcel.customerFirstName ?? '').trim(), String(rawParcel.customerLastName ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
  const client = (name || 'Client').slice(0, 255);
  const phone =
    normalizeDzPhoneForNoest_(rawParcel.phone ?? rawParcel.phone1 ?? rawParcel.contact_phone ?? phoneObj.number1) || null;
  if (!phone) return { error: `Invalid phone for row ${rowIndex + 1}. Expected 9-10 digits.` };

  const adresse = String(rawParcel.address ?? rawParcel.deliveryAddressText ?? rawParcel.deliveryAddress ?? '').trim();
  if (!adresse) return { error: `adresse is required for row ${rowIndex + 1}.` };

  const deliveryType = normalizeDeliveryType_(rawParcel.deliveryType);
  const stopDesk = deliveryType === 'pickup-point';
  const stationCode =
    String(rawParcel.station_code ?? rawParcel.stationCode ?? rawParcel.hubId ?? rawParcel.stopDeskId ?? '').trim() || '';
  if (stopDesk && !stationCode) return { error: `station_code is required when stop_desk=1 (row ${rowIndex + 1}).` };

  const trackingRefRaw = String(rawParcel.reference ?? rawParcel.externalId ?? rawParcel.orderId ?? '').trim();
  const reference = (trackingRefRaw || `dt-${Date.now().toString(36)}-${rowIndex + 1}`).slice(0, 255);
  if (reference.length < 5) return { error: `reference must be at least 5 characters (row ${rowIndex + 1}).` };

  const wilayaId =
    toInteger_(
      rawParcel.wilaya_id ?? rawParcel.wilayaId ?? rawParcel.toWilayaId ?? rawParcel.codeWilaya ?? rawParcel.wilayaCode,
      0,
    ) || 0;
  const zipCode = String(rawParcel.zip_code ?? rawParcel.zipCode ?? rawParcel.postalCode ?? '').trim();
  const commune = String(rawParcel.commune ?? rawParcel.toCommuneName ?? rawParcel.to_commune_name ?? '').trim();

  if (!zipCode && (!wilayaId || wilayaId < 1 || wilayaId > 58)) {
    return { error: `wilaya_id (1-58) is required when zip_code is not provided (row ${rowIndex + 1}).` };
  }
  if (!zipCode && !stopDesk && !commune) {
    return { error: `commune is required when zip_code and stop_desk are not provided (row ${rowIndex + 1}).` };
  }

  const orderedProducts = asArray_(rawParcel.orderedProducts);
  const productNames = orderedProducts
    .map((p) => String(asRecord_(p).productName ?? '').trim())
    .filter(Boolean);
  const produit = (
    String(rawParcel.produit ?? rawParcel.productList ?? rawParcel.product_list ?? '') ||
    (productNames.length ? productNames.join(',') : String(rawParcel.description ?? 'Product'))
  )
    .trim()
    .slice(0, 255);
  if (!produit) return { error: `produit is required for row ${rowIndex + 1}.` };

  const typeId = resolveNoestTypeId_(rawParcel);
  let montant = toMoney_(rawParcel.amount ?? rawParcel.montant, 0);
  if (typeId === 3) {
    montant = 0;
  }
  const weightObj = rawParcel.weight && typeof rawParcel.weight === 'object' && !Array.isArray(rawParcel.weight)
    ? asRecord_(rawParcel.weight)
    : null;
  const poids =
    rawParcel.weightValue != null
      ? toMoney_(rawParcel.weightValue, 0)
      : weightObj?.weight != null
        ? toMoney_(weightObj.weight, 0)
        : rawParcel.weight != null && typeof rawParcel.weight !== 'object'
          ? toMoney_(rawParcel.weight, 0)
          : null;

  const order: Record<string, unknown> = {
    reference,
    client,
    phone,
    adresse: adresse.slice(0, 255),
    montant,
    produit,
    type_id: typeId,
    stop_desk: stopDesk ? 1 : 0,
  };
  if (zipCode) {
    order.zip_code = zipCode;
  } else {
    order.wilaya_id = wilayaId;
    if (commune) order.commune = commune.slice(0, 255);
  }
  if (stopDesk) {
    order.station_code = stationCode;
  }
  if (poids != null && Number.isFinite(Number(poids)) && Number(poids) > 0) {
    order.poids = poids;
  }
  if (rawParcel.remarque != null && String(rawParcel.remarque).trim() !== '') {
    order.remarque = String(rawParcel.remarque).trim().slice(0, 255);
  } else if (rawParcel.description != null && String(rawParcel.description).trim() !== '') {
    order.remarque = String(rawParcel.description).trim().slice(0, 255);
  }
  if (rawParcel.can_open != null) {
    const v = toInteger_(rawParcel.can_open, 0);
    if (v === 0 || v === 1) order.can_open = v;
  }
  if (rawParcel.phone_2 != null && String(rawParcel.phone_2).trim() !== '') {
    const p2 = normalizeDzPhoneForNoest_(rawParcel.phone_2);
    if (p2) order.phone_2 = p2;
  } else if (phoneObj.number2 != null) {
    const p2 = normalizeDzPhoneForNoest_(phoneObj.number2);
    if (p2) order.phone_2 = p2;
  }
  return { order };
}

function parseBulkCreateResponse_(
  status: number,
  json: unknown,
  sentIndexMap: number[],
  sentOrders: Array<Record<string, unknown>>,
  creds: NoestCredentials,
): { successes: BulkCreateSuccess[]; failures: BulkCreateFailure[] } {
  const payload = asRecord_(json);
  const successes: BulkCreateSuccess[] = [];
  const failures: BulkCreateFailure[] = [];

  const passed = asRecord_(payload.passed);
  const failed = asRecord_(payload.failed);

  const addFailureForSentIndex = (localIdx: number, message: string, errorCode?: string | null) => {
    const originalIndex = sentIndexMap[localIdx];
    const order = sentOrders[localIdx];
    failures.push({
      index: originalIndex,
      errorCode: errorCode ?? (status === 429 ? 'RATE_LIMITED' : 'CARRIER_REJECTED'),
      errorMessage: message || `NOEST create failed (${status})`,
      externalId: order.reference != null ? String(order.reference) : null,
    });
  };

  for (let localIdx = 0; localIdx < sentIndexMap.length; localIdx++) {
    const okRow = passed[String(localIdx)];
    const failRow = failed[String(localIdx)];
    if (okRow != null) {
      const o = asRecord_(okRow);
      if (o.success === true || String(o.success).toLowerCase() === 'true') {
        const tracking = o.tracking != null ? String(o.tracking).trim() : '';
        const originalIndex = sentIndexMap[localIdx];
        const ref = sentOrders[localIdx]?.reference != null ? String(sentOrders[localIdx].reference) : null;
        successes.push({
          index: originalIndex,
          trackingNumber: tracking || null,
          externalId: ref,
          parcelId: tracking || null,
          labelUrl: tracking ? buildUrl_(creds, 'api/public/get/order/label', { tracking }) : null,
        });
        continue;
      }
      const msg = coerceNoestErrorText_(o.message) || coerceNoestErrorText_(o.error) || 'NOEST: order rejected';
      addFailureForSentIndex(localIdx, msg, 'CARRIER_REJECTED');
      continue;
    }
    if (failRow != null) {
      const msg = coerceNoestErrorText_(failRow) || 'NOEST: validation error';
      addFailureForSentIndex(localIdx, msg, 'VALIDATION_ERROR');
      continue;
    }
    if (payload.success === true && sentIndexMap.length === 1) {
      // Some NOEST responses for single create are { success: true, tracking, ... }.
      const tracking = payload.tracking != null ? String(payload.tracking).trim() : '';
      const originalIndex = sentIndexMap[0];
      const ref = sentOrders[0]?.reference != null ? String(sentOrders[0].reference) : null;
      successes.push({
        index: originalIndex,
        trackingNumber: tracking || null,
        externalId: ref,
        parcelId: tracking || null,
        labelUrl: tracking ? buildUrl_(creds, 'api/public/get/order/label', { tracking }) : null,
      });
      continue;
    }
    const generic =
      coerceNoestErrorText_(payload.message) ||
      coerceNoestErrorText_(payload.error) ||
      `NOEST create failed (${status})`;
    addFailureForSentIndex(localIdx, generic, status >= 500 ? 'REQUEST_FAILED' : 'CARRIER_REJECTED');
  }

  return { successes, failures };
}

function shouldAutoValidateNoest_(businessSettings?: Record<string, unknown> | null): boolean {
  if (!businessSettings || typeof businessSettings !== 'object') return true;
  const raw = businessSettings.autoValidateNoest;
  if (raw == null) return true;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const t = String(raw).trim().toLowerCase();
  if (!t) return true;
  return !(t === 'false' || t === '0' || t === 'no' || t === 'non');
}

function isAlreadyValidatedMessage_(value: unknown): boolean {
  const text = coerceNoestErrorText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return text.includes('deja valide') || text.includes('already validated');
}

function noestValidationFailureForSuccess_(
  success: BulkCreateSuccess,
  message: unknown,
  code: string,
  creds: NoestCredentials,
): BulkCreateFailure {
  const tracking = success.trackingNumber ? String(success.trackingNumber).trim() : '';
  return {
    index: success.index,
    errorCode: code,
    errorMessage:
      coerceNoestErrorText_(message) ||
      'NOEST order was created but validation failed. Tracking was saved; do not resend as a new order.',
    externalId: success.externalId ?? success.parcelId ?? null,
    trackingNumber: tracking || null,
    labelUrl: success.labelUrl ?? (tracking ? buildUrl_(creds, 'api/public/get/order/label', { tracking }) : null),
  };
}

async function validateNoestSuccesses_(
  creds: NoestCredentials,
  successes: BulkCreateSuccess[],
): Promise<{ successes: BulkCreateSuccess[]; failures: BulkCreateFailure[]; raw: unknown; httpStatus: number | null }> {
  const withTracking = successes.filter((s) => s.trackingNumber && String(s.trackingNumber).trim() !== '');
  if (!withTracking.length) {
    return { successes, failures: [], raw: null, httpStatus: null };
  }
  const trackings = withTracking.map((s) => String(s.trackingNumber).trim());
  const res = await jsonRequest_(buildUrl_(creds, 'api/public/valid/orders'), {
    method: 'POST',
    headers: baseHeaders_(creds),
    body: {
      user_guid: creds.userGuid,
      trackings,
    },
  });
  const payload = asRecord_(res.json ?? res.text);
  const passed = asRecord_(payload.passed);
  const failed = asRecord_(payload.failed);
  const failedByTracking = new Map<string, unknown>();
  const passedByTracking = new Set<string>();

  for (const [tracking, value] of Object.entries(passed)) {
    if (value === true || String(value).toLowerCase() === 'true' || asRecord_(value).success === true) {
      passedByTracking.add(String(tracking));
    }
  }
  for (const [tracking, value] of Object.entries(failed)) {
    failedByTracking.set(String(tracking), value);
  }

  const validationFailures: BulkCreateFailure[] = [];
  const validationFailureIndexes = new Set<number>();

  if (res.status < 200 || res.status >= 300) {
    const message =
      coerceNoestErrorText_(res.json) ||
      coerceNoestErrorText_(res.text) ||
      `NOEST validation failed (${res.status})`;
    for (const success of withTracking) {
      validationFailures.push(noestValidationFailureForSuccess_(success, message, 'VALIDATION_FAILED', creds));
      validationFailureIndexes.add(success.index);
    }
  } else {
    const hasDetailedResult = passedByTracking.size > 0 || failedByTracking.size > 0;
    if (hasDetailedResult) {
      for (const success of withTracking) {
        const tracking = String(success.trackingNumber || '').trim();
        const failedValue =
          failedByTracking.get(tracking) ??
          failedByTracking.get(tracking.toUpperCase()) ??
          failedByTracking.get(tracking.toLowerCase());
        if (failedValue == null || isAlreadyValidatedMessage_(failedValue)) {
          continue;
        }
        validationFailures.push(
          noestValidationFailureForSuccess_(success, failedValue, 'VALIDATION_FAILED', creds),
        );
        validationFailureIndexes.add(success.index);
      }
    }
  }

  return {
    successes: successes.filter((s) => !validationFailureIndexes.has(s.index)),
    failures: validationFailures,
    raw: res.json ?? res.text,
    httpStatus: res.status,
  };
}

export class NoestAdapter implements CarrierAdapter {
  readonly id = 'noest';
  readonly displayName = 'NOEST';

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const order = input.order as unknown as Record<string, unknown>;
    const parcel: Record<string, unknown> = {
      externalId:
        String(order.externalId ?? order.reference ?? '').trim() ||
        `dt-${String(order.spreadsheetId ?? 'sheet')}-${String(order.rowNumber ?? '0')}-${Date.now()}`,
      customer: {
        name:
          String(order.customerName ?? '').trim() ||
          [String(order.customerFirstName ?? '').trim(), String(order.customerLastName ?? '').trim()]
            .filter(Boolean)
            .join(' ')
            .trim(),
        phone: {
          number1: String(order.phone ?? order.phone1 ?? '').trim(),
          ...(order.phone2 ? { number2: String(order.phone2).trim() } : {}),
        },
      },
      address: String(order.address ?? '').trim(),
      toWilayaId: order.codeWilaya ?? order.wilayaId ?? order.wilaya_id ?? null,
      toCommuneName: order.commune ?? null,
      zipCode: order.zip_code ?? order.zipCode ?? null,
      amount: Number(order.codAmount ?? order.totalPrice ?? 0),
      orderedProducts: [
        {
          productName: String(order.productName ?? 'Product').slice(0, 100),
        },
      ],
      deliveryType: normalizeDeliveryType_(order.deliveryType),
      hubId: order.stopDeskId ?? order.hubId ?? null,
    };
    const bulk = await this.bulkCreateParcels({
      parcels: [parcel],
      credentials: input.credentials,
      businessSettings: input.businessSettings ?? null,
    });
    if (bulk.successes.length) {
      const first = bulk.successes[0];
      return {
        ok: true,
        externalShipmentId: first.externalId ?? first.parcelId ?? null,
        trackingNumber: first.trackingNumber ?? null,
        rawStatus: 'created',
        labelUrl: first.labelUrl ?? null,
      };
    }
    return { ok: false, errorMessage: bulk.failures[0]?.errorMessage || 'NOEST create failed' };
  }

  async getTracking(input: TrackingInput): Promise<TrackingResult> {
    const tracking = String(input.trackingNumber ?? input.externalShipmentId ?? '').trim();
    if (!tracking) return { ok: false, errorMessage: 'tracking number is required' };
    const creds = parseCredentials_(input.credentials);
    if (!creds) return { ok: false, errorMessage: 'NOEST: credentials missing (api_token + user_guid).' };
    const res = await jsonRequest_(buildUrl_(creds, 'api/public/get/trackings/info'), {
      method: 'POST',
      headers: baseHeaders_(creds),
      body: { trackings: [tracking] },
    });
    if (res.status < 200 || res.status >= 300) {
      const msg =
        coerceNoestErrorText_(res.json) ||
        coerceNoestErrorText_(res.text) ||
        `NOEST tracking failed (${res.status})`;
      return { ok: false, errorMessage: msg };
    }
    const payload = asRecord_(res.json);
    const row = payload[tracking] ?? payload[tracking.toUpperCase()] ?? payload[tracking.toLowerCase()];
    if (!row) {
      const msg = coerceNoestErrorText_(payload.message) || 'Shipment not found';
      return { ok: false, errorMessage: msg, rawStatus: null };
    }
    const info = asRecord_(asRecord_(row).OrderInfo);
    const activity = asArray_(asRecord_(row).activity);
    const last = activity.length ? asRecord_(activity[activity.length - 1]) : {};
    const rawStatus =
      (last.event_key != null ? String(last.event_key) : '') ||
      (last.event != null ? String(last.event) : '') ||
      (info.status != null ? String(info.status) : '') ||
      null;
    return { ok: true, status: rawStatus, rawStatus };
  }

  async testConnection(credentials?: AdapterCredentials): Promise<TestConnectionResult> {
    const creds = parseCredentials_(credentials);
    if (!creds) {
      return { ok: false, message: 'Missing NOEST credentials (api_token + user_guid).' };
    }
    const res = await jsonRequest_(buildUrl_(creds, 'api/public/get/wilayas'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${creds.apiToken}`,
      },
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      message: res.status >= 200 && res.status < 300 ? 'NOEST credentials are valid.' : `NOEST test failed (${res.status}).`,
      raw: res.json ?? res.text,
    };
  }

  async fetchAllTerritories(credentials?: AdapterCredentials): Promise<TerritoryRecord[]> {
    const creds = parseCredentials_(credentials);
    if (!creds) throw new Error('Missing NOEST credentials (api_token + user_guid).');
    const out: TerritoryRecord[] = [];
    const wilayasRes = await jsonRequest_(buildUrl_(creds, 'api/public/get/wilayas'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${creds.apiToken}`,
      },
    });
    if (wilayasRes.status < 200 || wilayasRes.status >= 300) {
      throw new Error(`NOEST get/wilayas failed (${wilayasRes.status})`);
    }
    const wilayas = asArray_(wilayasRes.json);
    for (const w of wilayas) {
      const o = asRecord_(w);
      const code = toInteger_(o.code ?? o.id ?? null, 0);
      if (!code) continue;
      const id = String(code);
      out.push({
        id,
        code,
        name: o.nom != null ? String(o.nom) : o.name != null ? String(o.name) : '',
        level: 'wilaya',
        parentId: null,
        postalCode: null,
        hasHomeDelivery: typeof o.is_active === 'number' ? o.is_active === 1 : null,
        hasPickupPoint: null,
        raw: w,
      });
    }
    // Fetch communes per wilaya (58 requests max). API also supports /get/communes (all),
    // but docs are inconsistent; per-wilaya is reliable and bounded.
    for (const w of out.filter((x) => x.level === 'wilaya')) {
      const res = await jsonRequest_(buildUrl_(creds, `api/public/get/communes/${w.code ?? ''}`), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${creds.apiToken}`,
        },
      });
      if (res.status < 200 || res.status >= 300) continue;
      const communes = asArray_(res.json);
      for (const c of communes) {
        const o = asRecord_(c);
        const name = o.nom != null ? String(o.nom) : o.name != null ? String(o.name) : '';
        if (!name) continue;
        const postalCode = o.code_postal != null ? String(o.code_postal) : o.postalCode != null ? String(o.postalCode) : null;
        out.push({
          id: `${w.id}:${name}`,
          code: null,
          name,
          level: 'commune',
          parentId: w.id,
          postalCode,
          hasHomeDelivery: typeof o.is_active === 'number' ? o.is_active === 1 : null,
          hasPickupPoint: null,
          raw: c,
        });
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
          errorMessage: 'Missing NOEST credentials (api_token + user_guid).',
          externalId: p.externalId != null ? String(p.externalId) : null,
        })),
      };
    }

    const preValidationFailures: BulkCreateFailure[] = [];
    const sendOrders: Array<Record<string, unknown>> = [];
    const sendIndexMap: number[] = [];
    for (let i = 0; i < input.parcels.length; i++) {
      const built = buildNoestOrder_(input.parcels[i], i);
      if (built.error || !built.order) {
        preValidationFailures.push({
          index: i,
          errorCode: 'LOCAL_VALIDATION',
          errorMessage: built.error || 'Invalid NOEST order payload',
          externalId: input.parcels[i].externalId != null ? String(input.parcels[i].externalId) : null,
        });
      } else {
        sendOrders.push(built.order);
        sendIndexMap.push(i);
      }
    }

    const successes: BulkCreateSuccess[] = [];
    const failures: BulkCreateFailure[] = [...preValidationFailures];
    let httpStatus = 400;
    let raw: unknown = null;
    let validationRaw: unknown = null;

    if (sendOrders.length) {
      const res = await jsonRequest_(buildUrl_(creds, 'api/public/create/orders'), {
        method: 'POST',
        headers: baseHeaders_(creds),
        body: {
          user_guid: creds.userGuid,
          orders: sendOrders,
        },
      });
      httpStatus = res.status;
      raw = res.json ?? res.text;
      const parsed = parseBulkCreateResponse_(res.status, res.json ?? res.text, sendIndexMap, sendOrders, creds);
      successes.push(...parsed.successes);
      failures.push(...parsed.failures);
      if (successes.length && shouldAutoValidateNoest_(input.businessSettings)) {
        const validation = await validateNoestSuccesses_(creds, successes);
        successes.splice(0, successes.length, ...validation.successes);
        failures.push(...validation.failures);
        validationRaw = validation.raw;
        if (
          validation.httpStatus != null &&
          validation.httpStatus !== 429 &&
          httpStatus >= 200 &&
          httpStatus < 300
        ) {
          httpStatus = validation.httpStatus;
        }
      }
    }

    failures.sort((a, b) => a.index - b.index);
    return {
      httpStatus,
      totalRequested: input.parcels.length,
      successCount: successes.length,
      failureCount: failures.length,
      successes,
      failures,
      raw: validationRaw != null ? { create: raw, validation: validationRaw } : raw,
    };
  }

  async searchParcels(input: SearchParcelsInput): Promise<SearchParcelsResult> {
    const creds = parseCredentials_(input.credentials);
    if (!creds) {
      return { httpStatus: 400, items: [], raw: { error: 'missing_credentials' } };
    }
    const body = asRecord_(input.body);
    const trackings: string[] = [];
    const arr = asArray_(body.trackings).map((x) => String(x || '').trim()).filter(Boolean);
    trackings.push(...arr);
    const direct = String(body.tracking ?? '').trim();
    if (direct) trackings.push(...direct.split(',').map((x) => x.trim()).filter(Boolean));
    const adv = asRecord_(body.advancedSearch);
    const keyword = String(adv.keyword ?? '').trim();
    if (keyword) trackings.push(...keyword.split(',').map((x) => x.trim()).filter(Boolean));

    const unique = Array.from(new Set(trackings));
    if (!unique.length) {
      return { httpStatus: 400, items: [], raw: { error: 'tracking_required' } };
    }
    const res = await jsonRequest_(buildUrl_(creds, 'api/public/get/trackings/info'), {
      method: 'POST',
      headers: baseHeaders_(creds),
      body: { trackings: unique },
    });
    const payload = res.json ?? res.text;
    if (res.status < 200 || res.status >= 300) {
      return { httpStatus: res.status, items: [], raw: payload };
    }
    const root = asRecord_(res.json);
    const items: ParcelStatus[] = [];
    for (const trk of unique) {
      const row = root[trk] ?? root[trk.toUpperCase()] ?? root[trk.toLowerCase()];
      if (!row) continue;
      const rowObj = asRecord_(row);
      const info = asRecord_(rowObj.OrderInfo);
      const activity = asArray_(rowObj.activity);
      const last = activity.length ? asRecord_(activity[activity.length - 1]) : {};
      const stateName =
        (last.event_key != null ? String(last.event_key) : '') ||
        (last.event != null ? String(last.event) : '') ||
        (info.status != null ? String(info.status) : '') ||
        null;
      items.push({
        trackingNumber: trk,
        stateName,
        stateColor: null,
        lastStateUpdateAt:
          last.date != null ? String(last.date) : info.created_at != null ? String(info.created_at) : null,
        amount: info.montant != null && Number.isFinite(Number(info.montant)) ? Number(info.montant) : null,
        deliveryPrice: null,
        deliveryType: info.stop_desk != null ? (String(info.stop_desk) === '1' ? 'pickup-point' : 'home') : null,
        raw: row,
      });
    }
    return { httpStatus: res.status, items, raw: payload };
  }
}

