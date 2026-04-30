import type {
  AdapterCredentials,
  BulkCreateFailure,
  BulkCreateParcelsInput,
  BulkCreateParcelsResult,
  BulkCreateSuccess,
  CarrierAdapter,
  HubRecord,
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

/** NOEST sometimes returns `passed` / `failed` as arrays; our parser expects string-keyed maps. */
function noestIndexMap_(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < value.length; i++) {
      out[String(i)] = value[i];
    }
    return out;
  }
  return asRecord_(value);
}

/**
 * NOEST validates `commune` against their dropdown; Arabic wilaya-capital labels often fail.
 * Map common sheet spellings to French commune labels when wilaya_id matches.
 */
function normalizeNoestCommuneForWilaya_(wilayaId: number, communeRaw: string): string {
  const raw = String(communeRaw || '').trim();
  if (!raw || wilayaId < 1 || wilayaId > 58) return raw;
  const deAcc = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const d = deAcc(raw);

  const rules: Array<{ w: number; ok: () => boolean; out: string }> = [
    { w: 19, ok: () => /سطيف|ستيف/.test(raw) || d === 'setif', out: 'Sétif' },
    { w: 6, ok: () => /بجاية|بجايا/.test(raw) || d === 'bejaia', out: 'Béjaïa' },
    { w: 16, ok: () => /الجزائر/.test(raw) || d === 'alger', out: 'Alger' },
    { w: 25, ok: () => /قسنطينة/.test(raw) || d === 'constantine', out: 'Constantine' },
    { w: 23, ok: () => /عنابة/.test(raw) || d === 'annaba', out: 'Annaba' },
    { w: 31, ok: () => /وهران/.test(raw) || d === 'oran', out: 'Oran' },
    { w: 9, ok: () => /البليدة|بليدة/.test(raw) || d === 'blida', out: 'Blida' },
    { w: 15, ok: () => /تيزي\s*وزو|tizi\s*ouzou/i.test(raw) || d === 'tizi ouzou', out: 'Tizi Ouzou' },
    { w: 21, ok: () => /سكيكدة/.test(raw) || d === 'skikda', out: 'Skikda' },
    { w: 5, ok: () => /باتنة/.test(raw) || d === 'batna', out: 'Batna' },
    { w: 18, ok: () => /\u062c\u064a\u062c\u0644/.test(raw) || d === 'jijel', out: 'Jijel' },
  ];
  for (const r of rules) {
    if (r.w === wilayaId && r.ok()) return r.out;
  }
  return raw;
}

type NoestCommuneApiRow = {
  nom?: string;
  name?: string;
  wilaya_id?: number;
  code_postal?: string;
  is_active?: number;
};

const noestCommunesByWilayaCache_ = new Map<string, { expires: number; rows: NoestCommuneApiRow[] }>();
const NOEST_COMMUNES_TTL_MS = 4 * 60 * 60 * 1000;
const NOEST_COMMUNES_ERROR_TTL_MS = 60 * 1000;

function noestCommunesCacheKey_(userGuid: string, wilayaId: number): string {
  return `${userGuid}\0${wilayaId}`;
}

function deAccentLowerNoest_(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Match sheet commune text to NOEST's official list (GET /api/public/get/communes/{wilaya_id}).
 * Returns canonical `nom` and postal code when confident, so we can send `zip_code` (doc: replaces wilaya+commune).
 */
function matchNoestCommuneFromApi_(communeRaw: string, rows: NoestCommuneApiRow[]): { nom: string; code_postal?: string } | null {
  const raw = String(communeRaw || '').trim();
  if (!raw || !rows.length) return null;
  const n0 = deAccentLowerNoest_(raw);
  const activeFirst = rows.filter((r) => typeof r.is_active !== 'number' || r.is_active !== 0);
  const use = activeFirst.length ? activeFirst : rows;

  for (const r of use) {
    const nom = String(r.nom ?? r.name ?? '').trim();
    if (!nom) continue;
    if (deAccentLowerNoest_(nom) === n0) {
      return { nom, code_postal: r.code_postal != null ? String(r.code_postal).trim() : undefined };
    }
  }

  const fuzzy: Array<{ nom: string; code_postal?: string; score: number }> = [];
  for (const r of use) {
    const nom = String(r.nom ?? r.name ?? '').trim();
    if (!nom) continue;
    const n = deAccentLowerNoest_(nom);
    if (n.includes(n0) || n0.includes(n)) {
      const score = Math.min(n.length, n0.length) / Math.max(n.length, n0.length, 1);
      fuzzy.push({
        nom,
        code_postal: r.code_postal != null ? String(r.code_postal).trim() : undefined,
        score,
      });
    }
  }
  if (fuzzy.length === 1) return { nom: fuzzy[0].nom, code_postal: fuzzy[0].code_postal };
  if (fuzzy.length > 1) {
    fuzzy.sort((a, b) => b.score - a.score);
    if (fuzzy[0].score >= 0.55 && fuzzy[0].score - fuzzy[1].score > 0.08) {
      return { nom: fuzzy[0].nom, code_postal: fuzzy[0].code_postal };
    }
  }
  return null;
}

async function fetchNoestCommunesForWilaya_(creds: NoestCredentials, wilayaId: number): Promise<NoestCommuneApiRow[]> {
  const key = noestCommunesCacheKey_(creds.userGuid, wilayaId);
  const now = Date.now();
  const hit = noestCommunesByWilayaCache_.get(key);
  if (hit && hit.expires > now) return hit.rows;

  let res: JsonResponse;
  try {
    res = await jsonRequest_(buildUrl_(creds, `api/public/get/communes/${wilayaId}`), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${creds.apiToken}`,
      },
    });
  } catch {
    noestCommunesByWilayaCache_.set(key, { expires: now + NOEST_COMMUNES_ERROR_TTL_MS, rows: [] });
    return [];
  }

  if (res.status < 200 || res.status >= 300) {
    noestCommunesByWilayaCache_.set(key, { expires: now + NOEST_COMMUNES_ERROR_TTL_MS, rows: [] });
    return [];
  }
  const arr = asArray_(res.json);
  const rows = arr.filter((x): x is NoestCommuneApiRow => Boolean(x) && typeof x === 'object' && !Array.isArray(x));
  noestCommunesByWilayaCache_.set(key, { expires: now + NOEST_COMMUNES_TTL_MS, rows });
  return rows;
}

function shouldResolveNoestCommunesFromApi_(businessSettings?: Record<string, unknown> | null): boolean {
  if (!businessSettings || typeof businessSettings !== 'object') return true;
  const raw = businessSettings.noestResolveCommunesFromApi;
  if (raw === false || raw === 0) return false;
  const t = String(raw ?? '').trim().toLowerCase();
  return !(t === 'false' || t === '0' || t === 'no' || t === 'non');
}

async function enrichNoestParcelsWithApiCommunes_(
  creds: NoestCredentials,
  parcels: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!parcels.length) return parcels;
  const out = parcels.map((p) => ({ ...p }));

  const wilayasNeeded = new Set<number>();
  for (const p of out) {
    if (normalizeDeliveryType_(p.deliveryType) === 'pickup-point') continue;
    const z = String(p.zip_code ?? p.zipCode ?? p.postalCode ?? '').trim();
    if (z) continue;
    const wid = toInteger_(p.wilaya_id ?? p.wilayaId ?? p.toWilayaId ?? p.codeWilaya ?? p.wilayaCode, 0);
    if (wid < 1 || wid > 58) continue;
    const comm = String(p.commune ?? p.toCommuneName ?? p.to_commune_name ?? '').trim();
    if (!comm) continue;
    wilayasNeeded.add(wid);
  }
  await Promise.all([...wilayasNeeded].map((w) => fetchNoestCommunesForWilaya_(creds, w)));

  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (normalizeDeliveryType_(p.deliveryType) === 'pickup-point') continue;
    const z0 = String(p.zip_code ?? p.zipCode ?? p.postalCode ?? '').trim();
    if (z0) continue;
    const wid = toInteger_(p.wilaya_id ?? p.wilayaId ?? p.toWilayaId ?? p.codeWilaya ?? p.wilayaCode, 0);
    if (wid < 1 || wid > 58) continue;
    let communeRaw = String(p.commune ?? p.toCommuneName ?? p.to_commune_name ?? '').trim();
    if (!communeRaw) continue;
    communeRaw = normalizeNoestCommuneForWilaya_(wid, communeRaw);
    const cacheKey = noestCommunesCacheKey_(creds.userGuid, wid);
    const rows = noestCommunesByWilayaCache_.get(cacheKey)?.rows ?? [];
    if (!rows.length) {
      out[i] = { ...p, commune: communeRaw };
      continue;
    }
    const matched = matchNoestCommuneFromApi_(communeRaw, rows);
    if (!matched) {
      out[i] = { ...p, commune: communeRaw };
      continue;
    }
    const next: Record<string, unknown> = { ...p, commune: matched.nom };
    const cp = (matched.code_postal ?? '').replace(/\D/g, '');
    if (cp.length >= 4 && cp.length <= 5) {
      next.zip_code = cp;
      next.zipCode = cp;
    }
    out[i] = next;
  }
  return out;
}

function noestPickResultRoot_(json: unknown): Record<string, unknown> {
  const root = asRecord_(json);
  const nested = asRecord_(root.data ?? root.payload ?? root.result ?? root.body);
  if (nested.passed != null || nested.failed != null || nested.success != null) {
    return nested;
  }
  return root;
}

function summarizeNoestUnknownResponse_(json: unknown, status: number): string {
  const root = asRecord_(json);
  const top = coerceNoestErrorText_(root.message ?? root.error ?? root.msg);
  if (top) return top;
  const keys = Object.keys(root).slice(0, 14).join(', ');
  return `NOEST create failed (${status}) — response keys: ${keys || '(empty)'}`;
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

const NOEST_FAILED_FIELD_ORDER = [
  'commune',
  'wilaya_id',
  'zip_code',
  'phone',
  'phone_2',
  'adresse',
  'station_code',
  'montant',
  'produit',
  'type_id',
  'stop_desk',
  'reference',
  'client',
  'stock',
  'quantite',
  'poids',
  'tracking',
];

/**
 * NOEST bulk `failed` entries are often Laravel-style objects:
 * `{ reference: "…", phone: ["…"], commune: ["The selected commune is invalid."] }`.
 * Prefer explicit `field: message` text over a flat join so sheet users see what to fix.
 */
function formatNoestBulkFailedRow_(value: unknown): string {
  if (value == null) return '';
  const flat = coerceNoestErrorText_(value);
  if (typeof value !== 'object' || Array.isArray(value)) return flat;
  const o = value as Record<string, unknown>;
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const k of NOEST_FAILED_FIELD_ORDER) {
    if (o[k] == null) continue;
    const msg = coerceNoestErrorText_(o[k]);
    if (!msg) continue;
    parts.push(`${k}: ${msg}`);
    seen.add(k);
  }
  for (const [k, v] of Object.entries(o)) {
    if (seen.has(k)) continue;
    if (v == null || k === 'stack' || k === 'raw') continue;
    const msg = coerceNoestErrorText_(v);
    if (!msg) continue;
    parts.push(`${k}: ${msg}`);
  }
  return parts.join(' | ') || flat;
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
  const displayRow = toInteger_(rawParcel.rowIndex ?? rawParcel.row ?? null, rowIndex + 1);
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
  if (!phone) return { error: `Invalid phone for row ${displayRow}. Expected 9-10 digits.` };

  const adresse = String(rawParcel.address ?? rawParcel.deliveryAddressText ?? rawParcel.deliveryAddress ?? '').trim();
  if (!adresse) return { error: `adresse is required for row ${displayRow}.` };

  const deliveryType = normalizeDeliveryType_(rawParcel.deliveryType);
  const stopDesk = deliveryType === 'pickup-point';
  const stationCode =
    String(rawParcel.station_code ?? rawParcel.stationCode ?? rawParcel.hubId ?? rawParcel.stopDeskId ?? '').trim() || '';
  if (stopDesk && !stationCode) return { error: `station_code is required when stop_desk=1 (row ${displayRow}).` };

  const trackingRefRaw = String(rawParcel.reference ?? rawParcel.externalId ?? rawParcel.orderId ?? '').trim();
  let reference = (trackingRefRaw || `dt-${Date.now().toString(36)}-${displayRow}`).slice(0, 255);
  if (trackingRefRaw && reference.length < 5) {
    // NOEST requires a minimum reference length; preserve user value by prefixing.
    reference = `ORD-${reference}`.slice(0, 255);
  }
  if (reference.length < 5) {
    reference = `dt-${Date.now().toString(36)}-${displayRow}`.slice(0, 255);
  }

  const wilayaId =
    toInteger_(
      rawParcel.wilaya_id ?? rawParcel.wilayaId ?? rawParcel.toWilayaId ?? rawParcel.codeWilaya ?? rawParcel.wilayaCode,
      0,
    ) || 0;
  const zipCode = String(rawParcel.zip_code ?? rawParcel.zipCode ?? rawParcel.postalCode ?? '').trim();
  let commune = String(rawParcel.commune ?? rawParcel.toCommuneName ?? rawParcel.to_commune_name ?? '').trim();
  commune = normalizeNoestCommuneForWilaya_(wilayaId, commune);

  if (!zipCode && (!wilayaId || wilayaId < 1 || wilayaId > 58)) {
    return { error: `wilaya_id (1-58) is required when zip_code is not provided (row ${displayRow}).` };
  }
  if (!zipCode && !stopDesk && !commune) {
    return { error: `commune is required when zip_code and stop_desk are not provided (row ${displayRow}).` };
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
  if (!produit) return { error: `produit is required for row ${displayRow}.` };

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
    if (!stopDesk && commune) order.commune = commune.slice(0, 255);
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

function wilayaCodeFromDesk_(key: string, code: string): number | null {
  const candidates = [key, code];
  for (const value of candidates) {
    const m = /^0*(\d{1,2})/.exec(String(value || '').trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 58) return n;
  }
  return null;
}

function normalizeDesk_(key: string, value: unknown): HubRecord | null {
  const o = asRecord_(value);
  const code = String(o.code ?? key ?? '').trim();
  if (!code) return null;
  const wilayaCode = wilayaCodeFromDesk_(key, code);
  return {
    id: code,
    name: o.name != null ? String(o.name) : null,
    type: 'stopdesk',
    isPickupPoint: true,
    city: o.name != null ? String(o.name) : null,
    cityTerritoryId: wilayaCode != null ? String(wilayaCode) : null,
    district: null,
    districtTerritoryId: null,
    postalCode: null,
    raw: value,
  };
}

function parseBulkCreateResponse_(
  status: number,
  json: unknown,
  sentIndexMap: number[],
  sentOrders: Array<Record<string, unknown>>,
  creds: NoestCredentials,
): { successes: BulkCreateSuccess[]; failures: BulkCreateFailure[] } {
  const payload = noestPickResultRoot_(json);
  const successes: BulkCreateSuccess[] = [];
  const failures: BulkCreateFailure[] = [];

  const passed = noestIndexMap_(payload.passed);
  const failed = noestIndexMap_(payload.failed);
  const orderErrors = asArray_(payload.order_errors ?? payload.orders_errors ?? payload.errors ?? []);
  const batchDenied =
    payload.success === false ||
    payload.success === 0 ||
    String(payload.success || '').toLowerCase() === 'false';
  const batchMsg = coerceNoestErrorText_(payload.message) || coerceNoestErrorText_(payload.error);

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
    const refKey =
      sentOrders[localIdx]?.reference != null ? String(sentOrders[localIdx].reference).trim() : '';
    let okRow = passed[String(localIdx)];
    let failRow = failed[String(localIdx)];
    if (okRow == null && failRow == null && refKey) {
      okRow = passed[refKey] ?? passed[refKey.toUpperCase()] ?? passed[refKey.toLowerCase()];
      failRow = failed[refKey] ?? failed[refKey.toUpperCase()] ?? failed[refKey.toLowerCase()];
    }
    if (okRow == null && failRow == null && orderErrors.length > localIdx && orderErrors[localIdx] != null) {
      const msg = coerceNoestErrorText_(orderErrors[localIdx]) || String(orderErrors[localIdx]);
      addFailureForSentIndex(localIdx, msg, 'VALIDATION_ERROR');
      continue;
    }
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
      const msg =
        formatNoestBulkFailedRow_(okRow) ||
        coerceNoestErrorText_(o.message) ||
        coerceNoestErrorText_(o.error) ||
        'NOEST: order rejected';
      addFailureForSentIndex(localIdx, msg, 'CARRIER_REJECTED');
      continue;
    }
    if (failRow != null) {
      const msg = formatNoestBulkFailedRow_(failRow) || coerceNoestErrorText_(failRow) || 'NOEST: validation error';
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
      batchDenied && batchMsg
        ? batchMsg
        : coerceNoestErrorText_(payload.message) ||
            coerceNoestErrorText_(payload.error) ||
            summarizeNoestUnknownResponse_(json, status);
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
      formatNoestBulkFailedRow_(message) ||
      'NOEST order was created but validation failed. Tracking was saved; do not resend as a new order.',
    externalId: success.externalId ?? success.parcelId ?? null,
    trackingNumber: tracking || null,
    labelUrl: success.labelUrl ?? (tracking ? buildUrl_(creds, 'api/public/get/order/label', { tracking }) : null),
  };
}

function noestTrackingInfoRow_(payload: unknown, tracking: string): unknown {
  const root = asRecord_(payload);
  return root[tracking] ?? root[tracking.toUpperCase()] ?? root[tracking.toLowerCase()] ?? null;
}

function normalizeNoestStatusText_(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function noestTrackingLooksValidated_(row: unknown): boolean {
  const root = asRecord_(row);
  const activity = Array.isArray(root.activity) ? root.activity : [];
  for (const item of activity) {
    const entry = asRecord_(item);
    const eventKey = normalizeNoestStatusText_(entry.event_key ?? entry.key ?? '');
    const event = normalizeNoestStatusText_(entry.event ?? entry.status ?? entry.name ?? '');
    if (eventKey === 'customer_validation' || eventKey === 'already_validated') return true;
    if (eventKey.startsWith('validation_')) return true;
    if (event === 'validated' || event.includes('commande deja validee')) return true;
    if (event.includes('validated by partner') || event.includes('order validated')) return true;
  }
  const orderInfo = asRecord_(root.OrderInfo ?? root.orderInfo ?? root.order_info);
  const statusText = normalizeNoestStatusText_(
    [root.last_status, root.status, root.event_key, root.event, orderInfo.status, orderInfo.last_status]
      .filter((v) => v != null)
      .join(' '),
  );
  return (
    statusText.includes('customer_validation') ||
    statusText.includes('already_validated') ||
    statusText.includes('validated') ||
    statusText.includes('validee')
  );
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
  const payload = noestPickResultRoot_(res.json ?? res.text);
  const passed = noestIndexMap_(payload.passed);
  const failed = noestIndexMap_(payload.failed);
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

async function verifyNoestCreatedTrackings_(
  creds: NoestCredentials,
  successes: BulkCreateSuccess[],
  requireValidated: boolean,
): Promise<{ successes: BulkCreateSuccess[]; failures: BulkCreateFailure[]; raw: unknown; httpStatus: number | null }> {
  const withTracking = successes.filter((s) => s.trackingNumber && String(s.trackingNumber).trim() !== '');
  if (!withTracking.length) {
    return { successes, failures: [], raw: null, httpStatus: null };
  }
  const trackings = withTracking.map((s) => String(s.trackingNumber).trim());
  const verificationDelays = requireValidated ? [0, 1_000, 2_500] : [0];
  let raw: unknown = null;
  let httpStatus: number | null = null;
  let verificationFailures: BulkCreateFailure[] = [];
  let failedIndexes = new Set<number>();

  for (const delayMs of verificationDelays) {
    if (delayMs > 0) await sleep_(delayMs);
    const res = await jsonRequest_(buildUrl_(creds, 'api/public/get/trackings/info'), {
      method: 'POST',
      headers: baseHeaders_(creds),
      body: { trackings },
    });
    raw = res.json ?? res.text;
    httpStatus = res.status;
    verificationFailures = [];
    failedIndexes = new Set<number>();

    if (res.status >= 200 && res.status < 300) {
      for (const success of withTracking) {
        const tracking = String(success.trackingNumber || '').trim();
        const trackingInfo = noestTrackingInfoRow_(raw, tracking);
        if (trackingInfo && (!requireValidated || noestTrackingLooksValidated_(trackingInfo))) continue;
        if (trackingInfo && requireValidated) {
          verificationFailures.push(
            noestValidationFailureForSuccess_(
              success,
              `NOEST returned tracking ${tracking}, but validation was not confirmed by /get/trackings/info. Verify in NOEST before resending.`,
              'VALIDATION_NOT_CONFIRMED',
              creds,
            ),
          );
          failedIndexes.add(success.index);
          continue;
        }
        verificationFailures.push(
          noestValidationFailureForSuccess_(
            success,
            `NOEST returned tracking ${tracking}, but /get/trackings/info did not find it. Verify in NOEST before resending.`,
            'TRACKING_NOT_FOUND',
            creds,
          ),
        );
        failedIndexes.add(success.index);
      }
      if (failedIndexes.size === 0 || !requireValidated) break;
      continue;
    }

    const message =
      coerceNoestErrorText_(raw) ||
      `NOEST returned tracking numbers, but tracking verification failed (${res.status}).`;
    for (const success of withTracking) {
      verificationFailures.push(
        noestValidationFailureForSuccess_(success, message, 'TRACKING_VERIFICATION_FAILED', creds),
      );
      failedIndexes.add(success.index);
    }
    break;
  }

  return {
    successes: successes.filter((s) => !failedIndexes.has(s.index)),
    failures: verificationFailures,
    raw,
    httpStatus,
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

  async fetchAllHubs(credentials?: AdapterCredentials): Promise<HubRecord[]> {
    const creds = parseCredentials_(credentials);
    if (!creds) throw new Error('Missing NOEST credentials (api_token + user_guid).');
    const res = await jsonRequest_(buildUrl_(creds, 'api/public/desks'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${creds.apiToken}`,
      },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`NOEST desks failed (${res.status})`);
    }
    const payload = asRecord_(res.json);
    const hubs: HubRecord[] = [];
    for (const [key, value] of Object.entries(payload)) {
      const hub = normalizeDesk_(key, value);
      if (hub) hubs.push(hub);
    }
    return hubs;
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
    const parcelsForBuild = shouldResolveNoestCommunesFromApi_(input.businessSettings ?? null)
      ? await enrichNoestParcelsWithApiCommunes_(creds, input.parcels as Record<string, unknown>[])
      : (input.parcels as Record<string, unknown>[]);
    for (let i = 0; i < parcelsForBuild.length; i++) {
      const built = buildNoestOrder_(parcelsForBuild[i], i);
      if (built.error || !built.order) {
        preValidationFailures.push({
          index: i,
          errorCode: 'LOCAL_VALIDATION',
          errorMessage: built.error || 'Invalid NOEST order payload',
          externalId: parcelsForBuild[i].externalId != null ? String(parcelsForBuild[i].externalId) : null,
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
    let verificationRaw: unknown = null;

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
      const autoValidateNoest = shouldAutoValidateNoest_(input.businessSettings);
      if (successes.length && autoValidateNoest) {
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
      if (successes.length) {
        const verification = await verifyNoestCreatedTrackings_(creds, successes, autoValidateNoest);
        successes.splice(0, successes.length, ...verification.successes);
        failures.push(...verification.failures);
        verificationRaw = verification.raw;
        if (
          verification.httpStatus != null &&
          verification.httpStatus !== 429 &&
          httpStatus >= 200 &&
          httpStatus < 300
        ) {
          httpStatus = verification.httpStatus;
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
      raw:
        validationRaw != null || verificationRaw != null
          ? { create: raw, validation: validationRaw, verification: verificationRaw }
          : raw,
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
