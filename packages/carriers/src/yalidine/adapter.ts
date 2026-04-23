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

type YalidineCredentials = {
  apiId: string;
  apiToken: string;
  baseUrl: string;
};

type JsonResponse = {
  status: number;
  json: unknown;
  text: string;
  headers: Headers;
};

const YALIDINE_DEFAULT_BASE_URL = 'https://api.guepex.app/v1';
const YALIDINE_RATE_LIMIT_MAX_RETRIES = 3;
const YALIDINE_RATE_LIMIT_BASE_DELAY_MS = 700;

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

function parseCombinedKey_(raw: string | undefined): { apiId: string; apiToken: string } | null {
  const value = String(raw ?? '').trim();
  if (!value) {
    return null;
  }
  const sep = value.includes('|') ? '|' : value.includes(':') ? ':' : '';
  if (!sep) {
    return null;
  }
  const parts = value.split(sep);
  const apiId = String(parts.shift() || '').trim();
  const apiToken = String(parts.join(sep) || '').trim();
  if (!apiId || !apiToken) {
    return null;
  }
  return { apiId, apiToken };
}

function parseCredentials_(credentials?: AdapterCredentials): YalidineCredentials | null {
  const apiId =
    pickFirst_(credentials, ['apiId', 'api_id', 'id', 'X-API-ID', 'xApiId', 'x-api-id']) || '';
  const apiToken =
    pickFirst_(credentials, [
      'apiToken',
      'api_token',
      'token',
      'apiKey',
      'X-API-TOKEN',
      'xApiToken',
      'x-api-token',
    ]) || '';
  const fromCombined =
    parseCombinedKey_(pickFirst_(credentials, ['apiKey'])) ||
    parseCombinedKey_(pickFirst_(credentials, ['token'])) ||
    parseCombinedKey_(pickFirst_(credentials, ['id']));
  const effectiveApiId = apiId || fromCombined?.apiId || '';
  const effectiveApiToken = apiToken || fromCombined?.apiToken || '';
  if (!effectiveApiId || !effectiveApiToken) {
    return null;
  }
  const baseUrl = (pickFirst_(credentials, ['baseUrl']) || YALIDINE_DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    apiId: effectiveApiId,
    apiToken: effectiveApiToken,
    baseUrl,
  };
}

function baseHeaders_(creds: YalidineCredentials): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-API-ID': creds.apiId,
    'X-API-TOKEN': creds.apiToken,
  };
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

function asArray_(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord_(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Yalidine sometimes returns `message` / `error` as nested objects; never stringify to "[object Object]". */
function coerceYalidineErrorText_(value: unknown, fallback = '', depth = 0): string {
  if (depth > 5 || value == null) return fallback;
  if (typeof value === 'string') {
    const text = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || /^\[object [^\]]+\]$/i.test(text)) return fallback;
    const startsLikeJson = text.startsWith('{') || text.startsWith('[');
    const endsLikeJson = text.endsWith('}') || text.endsWith(']');
    if (startsLikeJson && endsLikeJson) {
      try {
        const parsed = JSON.parse(text);
        const parsedText = coerceYalidineErrorText_(parsed, '', depth + 1);
        if (parsedText) return parsedText;
      } catch {
        // Keep original non-JSON text.
      }
    }
    return text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => coerceYalidineErrorText_(item, '', depth + 1))
      .filter(Boolean);
    return parts.length ? parts.join(' | ') : fallback;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const preferredKeys = [
      'message',
      'detail',
      'error',
      'title',
      'description',
      'reason',
      'cause',
      'errors',
    ] as const;
    for (const key of preferredKeys) {
      if (o[key] == null) continue;
      const inner = coerceYalidineErrorText_(o[key], '', depth + 1);
      if (inner) return inner;
    }

    const fragments: string[] = [];
    for (const [key, item] of Object.entries(o)) {
      if (item == null || key === 'stack' || key === 'raw') continue;
      const inner = coerceYalidineErrorText_(item, '', depth + 1);
      if (!inner) continue;
      fragments.push(inner);
      if (fragments.length >= 3) break;
    }
    if (fragments.length) {
      return Array.from(new Set(fragments)).join(' | ');
    }

    try {
      const encoded = JSON.stringify(value).replace(/\s+/g, ' ').trim();
      if (!encoded || encoded === '{}' || encoded === '[]' || /^\[object [^\]]+\]$/i.test(encoded)) {
        return fallback;
      }
      return encoded.length > 600 ? `${encoded.slice(0, 597)}...` : encoded;
    } catch {
      return fallback || 'Yalidine error';
    }
  }
  return fallback;
}

function normalizeText_(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber_(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function toInteger_(value: unknown, fallback = 0): number {
  const n = Math.round(parseNumber_(value, fallback));
  return Number.isFinite(n) ? n : fallback;
}

function mapUnicodeDigitsToAscii_(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    if (code >= 0x0660 && code <= 0x0669) {
      out += String(code - 0x0660);
    } else if (code >= 0x06f0 && code <= 0x06f9) {
      out += String(code - 0x06f0);
    } else {
      out += ch;
    }
  }
  return out;
}

function normalizeDzPhoneForYalidine_(raw: unknown): string | null {
  const cleanRaw = mapUnicodeDigitsToAscii_(String(raw ?? '').trim());
  if (!cleanRaw) return null;
  let digits = cleanRaw.replace(/\D/g, '');
  if (!digits) return null;
  for (let guard = 0; guard < 6; guard++) {
    if (digits.startsWith('00213')) {
      digits = digits.slice(5);
    } else if (digits.startsWith('213') && digits.length >= 11) {
      digits = digits.slice(3);
    } else {
      break;
    }
  }
  while (digits.startsWith('0') && digits.length > 10) {
    digits = digits.slice(1);
  }
  if (digits.length === 9 && /^[567]\d{8}$/.test(digits)) {
    return `0${digits}`;
  }
  if (digits.length === 8) {
    return `0${digits}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 9 && digits.startsWith('0')) {
    return digits;
  }
  return null;
}

function splitName_(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return { firstName: 'Client', lastName: '-' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '-' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function normalizeDeliveryType_(raw: unknown): 'home' | 'pickup-point' {
  const t = String(raw ?? 'home')
    .trim()
    .toLowerCase()
    .replace(/\u06a9/g, '\u0643')
    .replace(/\u06cc/g, '\u064a');
  if (
    t === 'pickup-point' ||
    t === 'pickup point' ||
    t === 'pickuppoint' ||
    t === 'stopdesk' ||
    t === 'stop desk' ||
    t === 'desk' ||
    t === 'bureau' ||
    t === 'office' ||
    t === 'point relais' ||
    t === 'relay' ||
    t === 'مكتب' ||
    t === 'نقطة استلام' ||
    t === 'استلام'
  ) {
    return 'pickup-point';
  }
  if (t.includes('للمكتب') || t.includes('pickup') || t.includes('stopdesk') || t.includes('مكتب')) {
    return 'pickup-point';
  }
  if (t.includes('للمنزل') || t.includes('المنزل')) {
    return 'home';
  }
  return 'home';
}

function buildUrl_(creds: YalidineCredentials, path: string, query?: Record<string, string | number | boolean>): string {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const base = `${creds.baseUrl}/${normalizedPath}`;
  if (!query || !Object.keys(query).length) {
    return base;
  }
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
  return Math.min(20_000, YALIDINE_RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
}

async function jsonRequest_(
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: unknown;
  },
  attempt = 0,
): Promise<JsonResponse> {
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 429 && attempt < YALIDINE_RATE_LIMIT_MAX_RETRIES) {
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
  return {
    status: res.status,
    json,
    text,
    headers: res.headers,
  };
}

function extractPagedData_(json: unknown): { items: unknown[]; hasMore: boolean } {
  const root = asRecord_(json);
  const items = asArray_(root.data);
  const links = asRecord_(root.links);
  const hasMore =
    typeof root.has_more === 'boolean'
      ? root.has_more
      : typeof links.next === 'string' && String(links.next).trim() !== '';
  return { items, hasMore };
}

function extractTrackingFromSearchBody_(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  const direct = String(body.tracking ?? '').trim();
  if (direct) {
    out.push(...direct.split(',').map((x) => x.trim()).filter(Boolean));
  }
  const arr = asArray_(body.trackingNumbers).map((x) => String(x || '').trim()).filter(Boolean);
  out.push(...arr);
  const adv = asRecord_(body.advancedSearch);
  const field = String(adv.field ?? '').trim().toLowerCase();
  const keyword = String(adv.keyword ?? '').trim();
  if ((field === 'tracking' || field === 'trackingnumber') && keyword) {
    out.push(...keyword.split(',').map((x) => x.trim()).filter(Boolean));
  }
  return Array.from(new Set(out));
}

/**
 * Guepex may return per-order results as:
 * - `{ [order_id]: { success, ... } }`
 * - `[ { ... }, ... ]` aligned with request order
 * - `{ data: [...] }` / `{ results: [...] }` / `{ data: { [order_id]: ... } }`
 */
function resolveYalidineParcelResult_(
  json: unknown,
  orderId: string,
  index: number,
): Record<string, unknown> | null {
  if (json == null) return null;
  if (Array.isArray(json)) {
    const row = json[index];
    return row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
  }
  if (typeof json !== 'object') return null;
  const root = json as Record<string, unknown>;
  const oid = String(orderId || '').trim();
  if (oid && root[oid] && typeof root[oid] === 'object' && !Array.isArray(root[oid])) {
    return root[oid] as Record<string, unknown>;
  }
  if (oid) {
    const lower = oid.toLowerCase();
    for (const k of Object.keys(root)) {
      if (String(k).trim().toLowerCase() === lower) {
        const v = root[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      }
    }
  }
  const data = root.data;
  if (Array.isArray(data)) {
    const row = data[index];
    if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, unknown>;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (oid && d[oid] && typeof d[oid] === 'object' && !Array.isArray(d[oid])) {
      return d[oid] as Record<string, unknown>;
    }
    if (oid) {
      const lower = oid.toLowerCase();
      for (const k of Object.keys(d)) {
        if (String(k).trim().toLowerCase() === lower) {
          const v = d[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
        }
      }
    }
  }
  const results = root.results;
  if (Array.isArray(results)) {
    const row = results[index];
    if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, unknown>;
  }
  return null;
}

function yalidineUnmatchedResponseHint_(json: unknown, orderId: string): string {
  if (typeof json === 'string') {
    const t = json.replace(/\s+/g, ' ').trim();
    return t.length > 220 ? `${t.slice(0, 217)}...` : t;
  }
  if (json && typeof json === 'object') {
    const keys = Object.keys(json as Record<string, unknown>).filter((k) => k !== 'links');
    const head = keys.slice(0, 12).join(', ');
    return head ? `response keys: ${head}` : 'empty JSON object';
  }
  return '';
}

function parseSingleCreateResult_(
  status: number,
  json: unknown,
  orderId: string,
  index: number,
): { success: BulkCreateSuccess | null; failure: BulkCreateFailure | null } {
  const payload = asRecord_(json);
  const item = resolveYalidineParcelResult_(json, orderId, index);
  if (!item) {
    const hint = yalidineUnmatchedResponseHint_(json, orderId);
    const message =
      coerceYalidineErrorText_(json, '') ||
      coerceYalidineErrorText_(payload.message, '') ||
      coerceYalidineErrorText_(payload.error, '') ||
      coerceYalidineErrorText_(payload.title, '') ||
      (hint
        ? `Yalidine: could not read parcel result for order_id "${orderId}". ${hint}`
        : `Yalidine create failed (${status})`);
    return {
      success: null,
      failure: {
        index: 0,
        errorCode: status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED',
        errorMessage: message || `Yalidine create failed (${status})`,
        externalId: orderId || null,
      },
    };
  }
  if (toBoolLoose_(item.success, false)) {
    return {
      success: {
        index: 0,
        parcelId: item.import_id != null ? String(item.import_id) : null,
        trackingNumber: item.tracking != null ? String(item.tracking) : null,
        externalId: item.order_id != null ? String(item.order_id) : orderId || null,
        labelUrl:
          item.label != null && String(item.label).trim() !== ''
            ? String(item.label)
            : item.labels != null && String(item.labels).trim() !== ''
              ? String(item.labels)
              : null,
      },
      failure: null,
    };
  }
  return {
    success: null,
    failure: {
      index: 0,
      errorCode: 'CARRIER_REJECTED',
      errorMessage:
        coerceYalidineErrorText_(item.message, '') ||
        coerceYalidineErrorText_(item.error, '') ||
        'Yalidine parcel rejected',
      externalId: item.order_id != null ? String(item.order_id) : orderId || null,
    },
  };
}

function buildYalidineParcel_(rawParcel: Record<string, unknown>, rowIndex: number): { parcel?: Record<string, unknown>; error?: string } {
  const customer = asRecord_(rawParcel.customer);
  const customerPhoneObj = asRecord_(customer.phone);
  const fullName =
    String(rawParcel.customerName ?? customer.name ?? '').trim() ||
    [String(rawParcel.customerFirstName ?? '').trim(), String(rawParcel.customerLastName ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();
  const split = splitName_(fullName);
  const phone =
    normalizeDzPhoneForYalidine_(
      rawParcel.contact_phone ??
        rawParcel.contactPhone ??
        rawParcel.phone ??
        rawParcel.phone1 ??
        customerPhoneObj.number1,
    ) || null;
  if (!phone) {
    return { error: `Invalid phone for row ${rowIndex + 1}.` };
  }
  const toWilayaName = normalizeText_(
    rawParcel.toWilayaName ?? rawParcel.to_wilaya_name ?? rawParcel.wilaya,
  );
  const fromWilayaName = normalizeText_(
    rawParcel.fromWilayaName ??
      rawParcel.from_wilaya_name ??
      rawParcel.senderWilayaName ??
      // Robust fallback: if sender wilaya is not configured yet, use destination wilaya.
      rawParcel.toWilayaName ??
      rawParcel.to_wilaya_name ??
      rawParcel.wilaya,
  );
  const toCommuneName = normalizeText_(
    rawParcel.toCommuneName ?? rawParcel.to_commune_name ?? rawParcel.commune,
  );
  const address = String(rawParcel.address ?? rawParcel.deliveryAddressText ?? '').trim();
  if (!fromWilayaName) {
    return { error: `from_wilaya_name is required for row ${rowIndex + 1}.` };
  }
  if (!toWilayaName) {
    return { error: `to_wilaya_name is required for row ${rowIndex + 1}.` };
  }
  if (!toCommuneName) {
    return { error: `to_commune_name is required for row ${rowIndex + 1}.` };
  }
  if (!address) {
    return { error: `address is required for row ${rowIndex + 1}.` };
  }
  const orderedProducts = asArray_(rawParcel.orderedProducts);
  const firstProduct = asRecord_(orderedProducts[0]);
  const productList = String(
    rawParcel.product_list ?? rawParcel.productList ?? firstProduct.productName ?? rawParcel.description ?? 'Product',
  )
    .trim()
    .slice(0, 300);
  const deliveryType = normalizeDeliveryType_(rawParcel.deliveryType);
  const isStopdesk = deliveryType === 'pickup-point';
  const stopdeskIdRaw = rawParcel.stopdesk_id ?? rawParcel.stopDeskId ?? rawParcel.hubId ?? null;
  const stopdeskId =
    stopdeskIdRaw != null && String(stopdeskIdRaw).trim() !== '' ? String(stopdeskIdRaw).trim() : null;
  if (isStopdesk && !stopdeskId) {
    return { error: `stopdesk_id is required for pickup-point row ${rowIndex + 1}.` };
  }

  const price = Math.max(0, Math.min(150000, toInteger_(rawParcel.price ?? rawParcel.amount ?? firstProduct.unitPrice)));
  const declaredValue = Math.max(
    0,
    Math.min(150000, toInteger_(rawParcel.declared_value ?? rawParcel.declaredValue ?? price)),
  );
  const length = Math.max(0, toInteger_(rawParcel.length));
  const width = Math.max(0, toInteger_(rawParcel.width));
  const height = Math.max(0, toInteger_(rawParcel.height));
  const rawWeightObj = asRecord_(rawParcel.weight);
  const weight = Math.max(0, toInteger_(rawParcel.weightValue ?? rawWeightObj.weight ?? rawParcel.weight));

  const hasExchange = toBoolLoose_(rawParcel.has_exchange ?? rawParcel.hasExchange, false);
  const productToCollect =
    hasExchange && rawParcel.product_to_collect != null
      ? String(rawParcel.product_to_collect).trim() || null
      : hasExchange && rawParcel.productToCollect != null
        ? String(rawParcel.productToCollect).trim() || null
        : null;
  if (hasExchange && !productToCollect) {
    return { error: `product_to_collect is required when has_exchange=true (row ${rowIndex + 1}).` };
  }

  const orderIdRaw = String(rawParcel.order_id ?? rawParcel.externalId ?? '').trim();
  const orderId = orderIdRaw || `dt-${Date.now().toString(36)}-${rowIndex + 1}`;

  const parcel: Record<string, unknown> = {
    order_id: orderId.slice(0, 120),
    from_wilaya_name: fromWilayaName,
    firstname: split.firstName.slice(0, 100),
    familyname: split.lastName.slice(0, 100),
    contact_phone: phone,
    address: address.slice(0, 400),
    to_commune_name: toCommuneName,
    to_wilaya_name: toWilayaName,
    product_list: productList || 'Product',
    price,
    do_insurance: toBoolLoose_(rawParcel.do_insurance ?? rawParcel.doInsurance, false),
    declared_value: declaredValue,
    length,
    width,
    height,
    weight,
    freeshipping: toBoolLoose_(rawParcel.freeshipping ?? rawParcel.freeShipping, false),
    is_stopdesk: isStopdesk,
    has_exchange: hasExchange,
    product_to_collect: productToCollect,
  };
  if (isStopdesk && stopdeskId) {
    const stopdeskNumber = Number(stopdeskId);
    parcel.stopdesk_id = Number.isFinite(stopdeskNumber) ? stopdeskNumber : stopdeskId;
  }
  if (rawParcel.economic != null) {
    parcel.economic = toBoolLoose_(rawParcel.economic);
  }
  return { parcel };
}

/**
 * Yalidine (Guepex) carrier integration.
 */
export class YalidineAdapter implements CarrierAdapter {
  readonly id = 'yalidine';
  readonly displayName = 'Yalidine';

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const order = (input.order || {}) as unknown as Record<string, unknown>;
    const senderWilaya = String(
      (input.businessSettings as Record<string, unknown> | null)?.senderWilaya ??
        (input.businessSettings as Record<string, unknown> | null)?.wilaya ??
        order.fromWilayaName ??
        order.from_wilaya_name ??
        order.toWilayaName ??
        order.to_wilaya_name ??
        order.wilaya ??
        '',
    )
      .trim()
      .slice(0, 120);
    const deliveryAddress = String(order.address ?? '').trim().slice(0, 400);
    const fullName =
      [String(order.customerFirstName ?? '').trim(), String(order.customerLastName ?? '').trim()]
        .filter(Boolean)
        .join(' ')
        .trim() || String(order.customerName ?? '').trim();
    const parcel = {
      externalId:
        String(order.externalId ?? order.externalShipmentId ?? '').trim() ||
        `dt-${String(order.spreadsheetId ?? 'sheet')}-${String(order.rowNumber ?? '0')}-${Date.now()}`,
      fromWilayaName: senderWilaya,
      toWilayaName: String(order.wilaya ?? '').trim(),
      toCommuneName: String(order.commune ?? '').trim(),
      address: deliveryAddress,
      customerName: fullName,
      phone: String(order.phone ?? order.phone1 ?? '').trim(),
      productList: String(order.productName ?? 'Product').trim(),
      amount: Number(order.codAmount ?? order.totalPrice ?? 0),
      deliveryType: order.deliveryType,
      stopDeskId: order.stopDeskId ?? order.station ?? null,
      freeshipping: toBoolLoose_(order.freeshipping ?? order.freeShipping, false),
      hasExchange: toBoolLoose_(order.hasExchange, false),
      productToCollect: order.productToCollect ?? null,
      doInsurance: false,
      declaredValue: Number(order.codAmount ?? order.totalPrice ?? 0),
      length: Number(
        (input.businessSettings as Record<string, unknown> | null)?.defaultParcelLength ?? 20,
      ),
      width: Number((input.businessSettings as Record<string, unknown> | null)?.defaultParcelWidth ?? 15),
      height: Number(
        (input.businessSettings as Record<string, unknown> | null)?.defaultParcelHeight ?? 10,
      ),
      weight: Number(
        (input.businessSettings as Record<string, unknown> | null)?.defaultParcelWeight ?? 1,
      ),
      orderedProducts: [
        {
          productName: String(order.productName ?? 'Product'),
          quantity: Math.max(1, Number(order.quantity ?? 1)),
          unitPrice: Number(order.productPrice ?? order.codAmount ?? 0),
        },
      ],
    };
    const bulk = await this.bulkCreateParcels({
      parcels: [parcel],
      credentials: input.credentials,
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
    return {
      ok: false,
      errorMessage: bulk.failures[0]?.errorMessage || 'Yalidine create failed',
    };
  }

  async getTracking(input: TrackingInput): Promise<TrackingResult> {
    const tracking = String(input.trackingNumber ?? input.externalShipmentId ?? '').trim();
    if (!tracking) {
      return { ok: false, errorMessage: 'tracking number is required' };
    }
    const res = await this.searchParcels({
      body: {
        advancedSearch: {
          field: 'tracking',
          keyword: tracking,
        },
      },
      credentials: input.credentials,
    });
    if (res.httpStatus >= 400) {
      return {
        ok: false,
        errorMessage: `Yalidine tracking failed (${res.httpStatus})`,
      };
    }
    const item = res.items.find(
      (x) => String(x.trackingNumber).toLowerCase() === tracking.toLowerCase(),
    );
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
      return {
        ok: false,
        message: 'Missing Yalidine credentials (API ID + API TOKEN).',
      };
    }
    const res = await jsonRequest_(
      buildUrl_(creds, 'wilayas/', {
        page_size: 1,
      }),
      {
        method: 'GET',
        headers: baseHeaders_(creds),
      },
    );
    return {
      ok: res.status >= 200 && res.status < 300,
      message:
        res.status >= 200 && res.status < 300
          ? 'Yalidine credentials are valid.'
          : `Yalidine test failed (${res.status}).`,
      raw: res.json ?? res.text,
    };
  }

  async fetchAllTerritories(credentials?: AdapterCredentials): Promise<TerritoryRecord[]> {
    const creds = parseCredentials_(credentials);
    if (!creds) {
      throw new Error('Missing Yalidine credentials (API ID + API TOKEN).');
    }
    const all: TerritoryRecord[] = [];

    let wilayaPage = 1;
    while (true) {
      const res = await jsonRequest_(
        buildUrl_(creds, 'wilayas/', {
          page: wilayaPage,
          page_size: 1000,
        }),
        {
          method: 'GET',
          headers: baseHeaders_(creds),
        },
      );
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Yalidine wilayas failed (${res.status})`);
      }
      const page = extractPagedData_(res.json);
      for (const row of page.items) {
        const o = asRecord_(row);
        const id = o.id != null ? String(o.id) : '';
        if (!id) continue;
        all.push({
          id,
          code: Number.isFinite(Number(o.id)) ? Number(o.id) : null,
          name: o.name != null ? String(o.name) : '',
          level: 'wilaya',
          parentId: null,
          postalCode: null,
          hasHomeDelivery: toBoolLoose_(o.is_deliverable, true),
          hasPickupPoint: null,
          raw: row,
        });
      }
      if (!page.hasMore) break;
      wilayaPage += 1;
      if (wilayaPage > 100) break;
    }

    let communePage = 1;
    while (true) {
      const res = await jsonRequest_(
        buildUrl_(creds, 'communes/', {
          page: communePage,
          page_size: 1000,
        }),
        {
          method: 'GET',
          headers: baseHeaders_(creds),
        },
      );
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Yalidine communes failed (${res.status})`);
      }
      const page = extractPagedData_(res.json);
      for (const row of page.items) {
        const o = asRecord_(row);
        const id = o.id != null ? String(o.id) : '';
        if (!id) continue;
        const parentId = o.wilaya_id != null ? String(o.wilaya_id) : null;
        all.push({
          id,
          code: Number.isFinite(Number(o.id)) ? Number(o.id) : null,
          name: o.name != null ? String(o.name) : '',
          level: 'commune',
          parentId,
          postalCode: null,
          hasHomeDelivery: toBoolLoose_(o.is_deliverable, true),
          hasPickupPoint: toBoolLoose_(o.has_stop_desk, false),
          raw: row,
        });
      }
      if (!page.hasMore) break;
      communePage += 1;
      if (communePage > 500) break;
    }
    return all;
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
          errorMessage: 'Missing Yalidine credentials (API ID + API TOKEN).',
          externalId: p.externalId != null ? String(p.externalId) : null,
        })),
      };
    }

    const preValidationFailures: BulkCreateFailure[] = [];
    const sendParcels: Array<Record<string, unknown>> = [];
    const sendIndexMap: number[] = [];
    for (let i = 0; i < input.parcels.length; i++) {
      const built = buildYalidineParcel_(input.parcels[i], i);
      if (built.error || !built.parcel) {
        preValidationFailures.push({
          index: i,
          errorCode: 'LOCAL_VALIDATION',
          errorMessage: built.error || 'Invalid parcel payload',
          externalId:
            input.parcels[i].externalId != null ? String(input.parcels[i].externalId) : null,
        });
      } else {
        sendParcels.push(built.parcel);
        sendIndexMap.push(i);
      }
    }

    const successes: BulkCreateSuccess[] = [];
    const failures: BulkCreateFailure[] = [...preValidationFailures];
    let httpStatus = 400;
    let raw: unknown = null;

    if (sendParcels.length) {
      const res = await jsonRequest_(buildUrl_(creds, 'parcels/'), {
        method: 'POST',
        headers: {
          ...baseHeaders_(creds),
          'Content-Type': 'application/json',
        },
        body: sendParcels,
      });
      httpStatus = res.status;
      raw = res.json ?? res.text;
      for (let i = 0; i < sendParcels.length; i++) {
        const localIndex = sendIndexMap[i];
        const parcel = sendParcels[i];
        const orderId = String(parcel.order_id ?? '').trim();
        const parsed = parseSingleCreateResult_(res.status, res.json ?? res.text, orderId, i);
        if (parsed.success) {
          successes.push({
            ...parsed.success,
            index: localIndex,
          });
        } else if (parsed.failure) {
          failures.push({
            ...parsed.failure,
            index: localIndex,
          });
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
    const body = asRecord_(input.body);
    const trackingList = extractTrackingFromSearchBody_(body);
    if (!trackingList.length) {
      return {
        httpStatus: 400,
        items: [],
        raw: { error: 'tracking_required' },
      };
    }

    const items: ParcelStatus[] = [];
    let lastStatus = 200;
    let raw: unknown = null;

    const chunkSize = 25;
    for (let i = 0; i < trackingList.length; i += chunkSize) {
      const chunk = trackingList.slice(i, i + chunkSize);
      const res = await jsonRequest_(
        buildUrl_(creds, 'parcels/', {
          tracking: chunk.join(','),
          page_size: 1000,
          fields:
            'tracking,last_status,date_last_status,delivery_fee,price,is_stopdesk',
        }),
        {
          method: 'GET',
          headers: baseHeaders_(creds),
        },
      );
      lastStatus = res.status;
      raw = res.json ?? res.text;
      if (res.status < 200 || res.status >= 300) {
        continue;
      }
      const page = extractPagedData_(res.json);
      for (const row of page.items) {
        const o = asRecord_(row);
        const trackingNumber = o.tracking != null ? String(o.tracking) : '';
        if (!trackingNumber) continue;
        const isStopdesk = toBoolLoose_(o.is_stopdesk, false);
        items.push({
          trackingNumber,
          stateName: o.last_status != null ? String(o.last_status) : null,
          stateColor: null,
          lastStateUpdateAt:
            o.date_last_status != null
              ? String(o.date_last_status)
              : o.date_creation != null
                ? String(o.date_creation)
                : null,
          amount: Number.isFinite(Number(o.price)) ? Number(o.price) : null,
          deliveryPrice: Number.isFinite(Number(o.delivery_fee)) ? Number(o.delivery_fee) : null,
          deliveryType: isStopdesk ? 'pickup-point' : 'home',
          raw: row,
        });
      }
    }

    return {
      httpStatus: lastStatus,
      items,
      raw,
    };
  }
}
