import { randomUUID } from 'node:crypto';

import {
  getCarrierAdapterOrThrow,
  type AdapterCredentials,
  type BulkCreateFailure,
  type ParcelStatus,
  type TerritoryRecord,
  UnknownCarrierError,
} from '@delivery-tool/carriers';
import type { Pool } from 'pg';
import type { InternalOrder } from '@delivery-tool/shared';

type GenericOrderInput = Record<string, unknown>;

type TerritoryIndex = {
  atMs: number;
  byId: Map<string, TerritoryRecord>;
  byCode: Map<number, TerritoryRecord>;
  byName: Map<string, TerritoryRecord[]>;
  communesByWilayaId: Map<string, TerritoryRecord[]>;
};

const TERRITORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEND_CHUNK_SIZE = 50;
const RETRY_BASE_MS = 600;
const RETRY_MAX_ATTEMPTS = 4;
const TRACKING_CONCURRENCY = 5;

const territoryCache = new Map<string, TerritoryIndex>();

function cleanedCredentials_(credentials?: Record<string, string> | null): AdapterCredentials {
  if (!credentials || typeof credentials !== 'object') return {};
  return Object.fromEntries(
    Object.entries(credentials).filter(([k, v]) => k && String(v ?? '').trim() !== ''),
  );
}

function normalizeText_(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    // Unify Persian-style letters often seen in Sheets dropdowns / mixed IME input.
    .replace(/\u06a9/g, 'ك')
    .replace(/\u06cc/g, 'ي')
    .replace(/[''`ʼ']/g, '')
    .replace(/[\s_./-]+/g, ' ')
    .trim();
}

/**
 * Arabic → normalized-French lookup for all 58 Algerian wilayas + their capital communes.
 * Keys are normalizeText_() output of the Arabic name.
 */
const ARABIC_TO_FRENCH_CITY_: Record<string, string> = {
  'ادرار': 'adrar',
  'الشلف': 'chlef', 'شلف': 'chlef',
  'الاغواط': 'laghouat', 'اغواط': 'laghouat',
  'ام البواقي': 'oum el bouaghi',
  'باتنه': 'batna', 'باتنا': 'batna',
  'بجايه': 'bejaia', 'بجاييه': 'bejaia',
  'بسكره': 'biskra',
  'بشار': 'bechar',
  'البليده': 'blida', 'بليده': 'blida',
  'البويره': 'bouira', 'بويره': 'bouira',
  'تمنراست': 'tamanrasset',
  'تبسه': 'tebessa',
  'تلمسان': 'tlemcen',
  'تيارت': 'tiaret',
  'تيزي وزو': 'tizi ouzou',
  'الجزائر': 'alger', 'جزائر': 'alger',
  'الجلفه': 'djelfa', 'جلفه': 'djelfa',
  'جيجل': 'jijel',
  'سطيف': 'setif',
  'سعيده': 'saida',
  'سكيكده': 'skikda',
  'سيدي بلعباس': 'sidi bel abbes',
  'عنابه': 'annaba',
  'قالمه': 'guelma',
  'قسنطينه': 'constantine',
  'المديه': 'medea', 'مديه': 'medea',
  'مستغانم': 'mostaganem',
  'المسيله': 'msila', 'مسيله': 'msila',
  'معسكر': 'mascara',
  'ورقله': 'ouargla',
  'وهران': 'oran',
  'البيض': 'el bayadh', 'بيض': 'el bayadh',
  'اليزي': 'illizi', 'يزي': 'illizi',
  'برج بوعريريج': 'bordj bou arreridj',
  'بومرداس': 'boumerdes',
  'الطارف': 'el tarf', 'طارف': 'el tarf',
  'تندوف': 'tindouf',
  'تيسمسيلت': 'tissemsilt',
  'الوادي': 'el oued', 'وادي': 'el oued',
  'خنشله': 'khenchela',
  'سوق اهراس': 'souk ahras',
  'تيبازه': 'tipaza',
  'ميله': 'mila',
  'عين الدفلي': 'ain defla', 'عين دفلي': 'ain defla',
  'النعامه': 'naama', 'نعامه': 'naama',
  'عين تموشنت': 'ain temouchent',
  'غردايه': 'ghardaia',
  'غليزان': 'relizane',
  'تيميمون': 'timimoun',
  'برج باجي مختار': 'bordj badji mokhtar',
  'اولاد جلال': 'ouled djellal',
  'بني عباس': 'beni abbes',
  'عين صالح': 'in salah',
  'عين قزام': 'in guezzam',
  'توقرت': 'touggourt',
  'جانت': 'djanet',
  'المغير': 'el meghaier', 'مغير': 'el meghaier',
  'المنيعه': 'el meniaa', 'منيعه': 'el meniaa',
};

function tryArabicToFrench_(normalizedArabic: string): string | null {
  if (ARABIC_TO_FRENCH_CITY_[normalizedArabic]) {
    return ARABIC_TO_FRENCH_CITY_[normalizedArabic];
  }
  const withoutArticle = normalizedArabic.replace(/^ال/, '');
  if (withoutArticle !== normalizedArabic && ARABIC_TO_FRENCH_CITY_[withoutArticle]) {
    return ARABIC_TO_FRENCH_CITY_[withoutArticle];
  }
  return null;
}

function similarity_(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  const all = new Set([...aTokens, ...bTokens]);
  if (all.size === 0) return 0;
  let common = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) common += 1;
  }
  return common / all.size;
}

/** Map Arabic-Indic / Eastern Arabic digits so /\D/ stripping does not erase the whole number. */
function mapUnicodeDigitsToAscii_(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c == null) continue;
    if (c >= 0x0660 && c <= 0x0669) {
      out += String(c - 0x0660);
    } else if (c >= 0x06f0 && c <= 0x06f9) {
      out += String(c - 0x06f0);
    } else {
      out += ch;
    }
  }
  return out;
}

function digitsOnlyAscii_(raw: unknown): string {
  const s = mapUnicodeDigitsToAscii_(String(raw ?? '').trim());
  return s.replace(/\D/g, '');
}

/**
 * Normalize Algerian mobile numbers to E.164 +2135/6/7XXXXXXXX.
 * Handles 00213, 213, stray leading zeros after country code, and Arabic digits in pasted values.
 */
function normalizeDzPhone_(raw: unknown): string | null {
  let digits = digitsOnlyAscii_(raw);
  if (!digits || digits.length < 9) return null;

  for (let guard = 0; guard < 6; guard++) {
    if (digits.startsWith('00213')) {
      digits = digits.slice(5);
    } else if (digits.startsWith('213') && digits.length >= 12) {
      digits = digits.slice(3);
    } else {
      break;
    }
  }

  // 00213055… → 0055… (11+ digits): peel spare leading zeros before national 0 + 9 digits
  while (digits.startsWith('0') && digits.length > 10) {
    digits = digits.slice(1);
  }

  // Trunk 0 + 9-digit national (05x, 06x, 07x)
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1);
  }

  if (/^[567]\d{8}$/.test(digits)) {
    return `+213${digits}`;
  }
  return null;
}

function normalizeDeliveryType_(raw: unknown): 'home' | 'pickup-point' | null {
  const t = normalizeText_(raw);
  if (!t) return null;
  // Arabic phrases (after normalizeText_ unifies Persian ك/ي); substring rules beat noisy regex hints.
  if (t.includes('للمكتب')) return 'pickup-point';
  if (t.includes('للمنزل') || t.includes('المنزل')) return 'home';
  const pickupSet = new Set([
    'pickup',
    'pickup point',
    'pickup-point',
    'point',
    'relay',
    'bureau',
    'desk',
    'stopdesk',
    'stop desk',
    'point relais',
    'استلام',
    'مكتب',
    'نقطه استلام',
  ]);
  const homeSet = new Set(['home', 'domicile', 'maison', 'livraison', 'منزل', 'للمنزل', 'بيت']);
  if (pickupSet.has(t)) return 'pickup-point';
  if (homeSet.has(t)) return 'home';
  if (t.includes('pickup') || t.includes('relay') || t.includes('bureau')) return 'pickup-point';
  if (t.includes('home') || t.includes('domicile') || t.includes('منزل')) return 'home';
  return null;
}

function resolveDeliveryModeRaw_(row: GenericOrderInput, defaultDeliveryType: string): string {
  const pick = (v: unknown) => {
    if (v == null) return '';
    const s = String(v).trim();
    return s;
  };
  const a = pick(row.deliveryMode);
  const b = pick(row.deliveryType);
  if (a) return a;
  if (b) return b;
  return defaultDeliveryType;
}

function coerceAdapterFailureMessage_(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail.trim();
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  return String(v);
}

function resolveOrderRowIndex_(order: GenericOrderInput, idx: number): number {
  const a = Number(order.rowIndex ?? order.rowNumber ?? idx + 1);
  return Number.isFinite(a) && a > 0 ? Math.floor(a) : idx + 1;
}

function credentialFingerprint_(carrierId: string, creds: AdapterCredentials): string {
  const sorted = Object.keys(creds)
    .sort()
    .map((k) => `${k}:${String(creds[k])}`)
    .join('|');
  return `${carrierId}|${sorted}`;
}

async function getTerritoryIndex_(carrierId: string, creds: AdapterCredentials): Promise<TerritoryIndex> {
  const key = credentialFingerprint_(carrierId, creds);
  const now = Date.now();
  const cached = territoryCache.get(key);
  if (cached && now - cached.atMs < TERRITORY_CACHE_TTL_MS) {
    return cached;
  }
  const adapter = getCarrierAdapterOrThrow(carrierId);
  if (!adapter.fetchAllTerritories) {
    throw new Error(`${carrierId} adapter does not implement fetchAllTerritories`);
  }
  const all = await adapter.fetchAllTerritories(creds);
  const byId = new Map<string, TerritoryRecord>();
  const byCode = new Map<number, TerritoryRecord>();
  const byName = new Map<string, TerritoryRecord[]>();
  const communesByWilayaId = new Map<string, TerritoryRecord[]>();

  for (const t of all) {
    byId.set(t.id, t);
    if (t.level === 'wilaya' && t.code != null) byCode.set(t.code, t);
    const nn = normalizeText_(t.name);
    if (nn) {
      if (!byName.has(nn)) byName.set(nn, []);
      byName.get(nn)!.push(t);
    }
    if (t.level === 'commune' && t.parentId) {
      if (!communesByWilayaId.has(t.parentId)) communesByWilayaId.set(t.parentId, []);
      communesByWilayaId.get(t.parentId)!.push(t);
    }
  }

  const idx: TerritoryIndex = {
    atMs: now,
    byId,
    byCode,
    byName,
    communesByWilayaId,
  };
  territoryCache.set(key, idx);
  return idx;
}

type TerritoryResolution = {
  cityTerritoryId: string;
  districtTerritoryId: string;
  city: TerritoryRecord;
  district: TerritoryRecord;
};

function resolveTerritories_(
  index: TerritoryIndex,
  wilayaRaw: unknown,
  communeRaw: unknown,
  wilayaCodeRaw: unknown,
): TerritoryResolution | { error: string } {
  const wilayaNorm = normalizeText_(wilayaRaw);
  const communeNorm = normalizeText_(communeRaw);
  if (!communeNorm) {
    return { error: 'Commune is required to resolve districtTerritoryId.' };
  }

  const inferFromGlobalCommune = (
    nameToMatch: string,
  ): TerritoryResolution | { error: string } | null => {
    const communes = (index.byName.get(nameToMatch) || []).filter(
      (x) => x.level === 'commune' && x.parentId && index.byId.has(x.parentId),
    );
    if (communes.length === 1) {
      const district = communes[0];
      const city = index.byId.get(String(district.parentId))!;
      return {
        cityTerritoryId: city.id,
        districtTerritoryId: district.id,
        city,
        district,
      };
    }
    if (communes.length > 1) {
      const parentNames = Array.from(
        new Set(
          communes
            .map((x) => (x.parentId ? index.byId.get(String(x.parentId)) : null))
            .filter(Boolean)
            .map((x) => String((x as TerritoryRecord).name)),
        ),
      );
      return {
        error: `Ambiguous commune "${String(communeRaw)}". Candidate wilayas: ${parentNames.join(', ')}`,
      };
    }
    return null;
  };

  let wilaya: TerritoryRecord | null = null;
  const codeN = Number(String(wilayaCodeRaw ?? '').replace(/[^\d]/g, ''));
  if (Number.isFinite(codeN) && codeN >= 1 && codeN <= 58 && index.byCode.has(codeN)) {
    wilaya = index.byCode.get(codeN)!;
  }
  if (!wilaya && wilayaNorm) {
    const candidates = (index.byName.get(wilayaNorm) || []).filter((x) => x.level === 'wilaya');
    if (candidates.length === 1) {
      wilaya = candidates[0];
    } else if (candidates.length > 1) {
      return { error: `Ambiguous wilaya "${String(wilayaRaw)}".` };
    }
  }
  // Arabic→French fallback for wilaya name
  if (!wilaya && wilayaNorm) {
    const frWilaya = tryArabicToFrench_(wilayaNorm);
    if (frWilaya) {
      const frCandidates = (index.byName.get(frWilaya) || []).filter((x) => x.level === 'wilaya');
      if (frCandidates.length === 1) {
        wilaya = frCandidates[0];
      }
    }
  }
  if (!wilaya) {
    const directCommune = inferFromGlobalCommune(communeNorm);
    if (directCommune) {
      return directCommune;
    }
    const frCommune = tryArabicToFrench_(communeNorm);
    if (frCommune) {
      const translatedCommune = inferFromGlobalCommune(frCommune);
      if (translatedCommune) {
        return translatedCommune;
      }
    }
  }
  if (!wilaya && wilayaNorm) {
    let best: TerritoryRecord | null = null;
    let bestScore = 0;
    for (const [nameKey, list] of index.byName.entries()) {
      const wilayaCandidates = list.filter((x) => x.level === 'wilaya');
      if (!wilayaCandidates.length) continue;
      const score = similarity_(wilayaNorm, nameKey);
      if (score > bestScore) {
        bestScore = score;
        best = wilayaCandidates[0];
      }
    }
    if (best && bestScore >= 0.88) {
      wilaya = best;
    } else if (!wilaya) {
      return { error: `Unresolved wilaya "${String(wilayaRaw)}".` };
    }
  }
  if (!wilaya) {
    return { error: `Unresolved wilaya "${String(wilayaRaw)}".` };
  }

  const communeCandidates = index.communesByWilayaId.get(wilaya.id) || [];

  const matchCommune = (nameToMatch: string): TerritoryResolution | null => {
    const exact = communeCandidates.filter((x) => normalizeText_(x.name) === nameToMatch);
    if (exact.length === 1) {
      return {
        cityTerritoryId: wilaya.id,
        districtTerritoryId: exact[0].id,
        city: wilaya,
        district: exact[0],
      };
    }
    let best: TerritoryRecord | null = null;
    let bestScore = 0;
    for (const c of communeCandidates) {
      const score = similarity_(nameToMatch, normalizeText_(c.name));
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best && bestScore >= 0.88) {
      return {
        cityTerritoryId: wilaya.id,
        districtTerritoryId: best.id,
        city: wilaya,
        district: best,
      };
    }
    return null;
  };

  const directMatch = matchCommune(communeNorm);
  if (directMatch) return directMatch;

  // Arabic→French fallback: user has Arabic commune name, ZR stores French
  const frenchName = tryArabicToFrench_(communeNorm);
  if (frenchName) {
    const translatedMatch = matchCommune(frenchName);
    if (translatedMatch) return translatedMatch;
  }

  // Wilaya-capital fallback: if user put the wilaya name as commune,
  // find the commune whose name matches the wilaya's ZR name.
  const wilayaNameNorm = normalizeText_(wilaya.name);
  if (wilayaNameNorm && wilayaNameNorm !== communeNorm) {
    const capitalMatch = matchCommune(wilayaNameNorm);
    if (capitalMatch) return capitalMatch;
  }

  const suggestions = communeCandidates.slice(0, 5).map((x) => x.name);
  return {
    error: `Unresolved commune "${String(communeRaw)}" in wilaya "${wilaya.name}". Suggestions: ${suggestions.join(', ')}`,
  };
}

function parcelExternalId_(order: GenericOrderInput, rowIndex: number): string {
  const existing = String(order.externalId ?? '').trim();
  if (existing) return existing.slice(0, 100);
  const spreadsheetId = String(order.spreadsheetId ?? 'sheet').slice(0, 24);
  const sheetName = String(order.sheetName ?? 'tab').slice(0, 20);
  const ts = Date.now().toString(36).slice(-6);
  const rand = randomUUID().slice(0, 8);
  return `${spreadsheetId}-${sheetName}-${rowIndex}-${ts}-${rand}`.slice(0, 100);
}

function toMoney_(value: unknown): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(150000, n);
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

async function persistTrackingRows_(
  pool: Pool | null,
  input: {
    userEmailHmac: string | null;
    spreadsheetId: string;
    sheetName: string;
    carrier: string;
    successes: Array<{
      rowIndex: number;
      trackingNumber: string | null;
      externalId: string | null;
    }>;
  },
): Promise<void> {
  if (!pool || !input.userEmailHmac) return;
  for (const s of input.successes) {
    if (!s.trackingNumber) continue;
    await pool.query(
      `INSERT INTO dt_parcel_tracking (
         user_email_hmac, spreadsheet_id, sheet_name, row_index, carrier, tracking_number, external_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (tracking_number) DO UPDATE
       SET user_email_hmac = EXCLUDED.user_email_hmac,
           spreadsheet_id = EXCLUDED.spreadsheet_id,
           sheet_name = EXCLUDED.sheet_name,
           row_index = EXCLUDED.row_index,
           carrier = EXCLUDED.carrier,
           external_id = EXCLUDED.external_id,
           updated_at = NOW()`,
      [
        input.userEmailHmac,
        input.spreadsheetId,
        input.sheetName,
        s.rowIndex,
        input.carrier,
        s.trackingNumber,
        s.externalId,
      ],
    );
  }
}

function carrierStatePresentation_(stateName: string | null): { fr: string; ar: string; color: string | null } {
  const key = String(stateName ?? '')
    .toLowerCase()
    .replace(/[\s\-./]+/g, '_')
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a');
  const map: Record<string, { fr: string; ar: string; color: string | null }> = {
    // ZR states
    commande_recue: { fr: 'Commande reçue', ar: 'تم استلام الطلب', color: '#5F6368' },
    en_cours: { fr: 'En cours', ar: 'قيد المعالجة', color: '#1A73E8' },
    en_transit: { fr: 'En transit', ar: 'قيد النقل', color: '#1A73E8' },
    livre: { fr: 'Livré', ar: 'تم التسليم', color: '#137333' },
    returned: { fr: 'Retour', ar: 'مرتجع', color: '#C5221F' },
    // Yalidine states
    en_preparation: { fr: 'En préparation', ar: 'قيد التحضير', color: '#5F6368' },
    vers_wilaya: { fr: 'Vers wilaya', ar: 'نحو الولاية', color: '#1A73E8' },
    centre: { fr: 'Centre', ar: 'في المركز', color: '#1A73E8' },
    en_livraison: { fr: 'En livraison', ar: 'جاري التوصيل', color: '#E37400' },
    livree: { fr: 'Livrée', ar: 'تم التسليم', color: '#137333' },
    echec_livraison: { fr: 'Échec livraison', ar: 'فشل التوصيل', color: '#C5221F' },
    retour: { fr: 'Retour', ar: 'مرتجع', color: '#C5221F' },
    retour_recu: { fr: 'Retour reçu', ar: 'تم استلام المرتجع', color: '#C5221F' },
    en_attente: { fr: 'En attente', ar: 'في الانتظار', color: '#5F6368' },
    en_alerte: { fr: 'En alerte', ar: 'تنبيه', color: '#E37400' },
    tentative_echouee: { fr: 'Tentative échouée', ar: 'محاولة فاشلة', color: '#E37400' },
    recu: { fr: 'Reçu', ar: 'مستلم', color: '#5F6368' },
    pret_a_expedier: { fr: 'Prêt à expédier', ar: 'جاهز للشحن', color: '#1A73E8' },
  };
  return map[key] || { fr: stateName || 'Unknown', ar: stateName || 'غير معروف', color: null };
}

async function sleep_(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendOrdersBulk(
  input: {
    carrier: string;
    orders: GenericOrderInput[];
    credentials?: Record<string, string> | null;
    businessSettings?: Record<string, unknown> | null;
    userEmailHmac?: string | null;
    spreadsheetId?: string | null;
    sheetName?: string | null;
  },
  deps: { pool: Pool | null },
) {
  const carrier = String(input.carrier || '').trim().toLowerCase();
  if (!carrier) return { ok: false, errorMessage: 'carrier is required' };

  let adapter;
  try {
    adapter = getCarrierAdapterOrThrow(carrier);
  } catch (e) {
    if (e instanceof UnknownCarrierError) {
      return { ok: false, errorMessage: `Unknown carrier: ${carrier}` };
    }
    throw e;
  }
  const hasBulkCreate = typeof adapter.bulkCreateParcels === 'function';
  const hasCreateShipment = typeof adapter.createShipment === 'function';
  if (!hasBulkCreate && !hasCreateShipment) {
    return { ok: false, errorMessage: `${carrier} adapter does not support parcel creation` };
  }

  const creds = cleanedCredentials_(input.credentials);
  let territoryIndex: TerritoryIndex | null = null;
  if ((carrier === 'zr' || carrier === 'yalidine') && adapter.fetchAllTerritories) {
    try {
      territoryIndex = await getTerritoryIndex_(carrier, creds);
    } catch (error) {
      return {
        ok: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : `Unable to resolve ${carrier} territories. Please verify carrier credentials.`,
      };
    }
  }
  const parcels: Array<Record<string, unknown>> = [];
  const parcelRowIndexes: number[] = [];
  const localFailures: BulkCreateFailure[] = [];

  const defaultStockType = String(input.businessSettings?.defaultStockType ?? 'none').toLowerCase();
  const defaultDeliveryType = String(input.businessSettings?.defaultDeliveryType ?? 'home');
  const defaultHubStockId =
    input.businessSettings?.defaultHubStockId != null
      ? String(input.businessSettings.defaultHubStockId)
      : null;
  const defaultHubId =
    input.businessSettings?.defaultHubId != null
      ? String(input.businessSettings.defaultHubId)
      : input.businessSettings?.stopDeskId != null
        ? String(input.businessSettings.stopDeskId)
        : null;

  for (let i = 0; i < input.orders.length; i++) {
    const row = input.orders[i];
    const rowIndex = resolveOrderRowIndex_(row, i);
    const phone = normalizeDzPhone_(row.phone1 ?? row.phone ?? row.customerPhone);
    if (!phone) {
      localFailures.push({
        index: i,
        errorCode: 'INVALID_PHONE',
        errorMessage: `Invalid phone for row ${rowIndex}. Expected +213XXXXXXXXX.`,
      });
      continue;
    }
    const deliveryType = normalizeDeliveryType_(resolveDeliveryModeRaw_(row, defaultDeliveryType));
    if (!deliveryType) {
      localFailures.push({
        index: i,
        errorCode: 'INVALID_DELIVERY_TYPE',
        errorMessage: `Invalid delivery mode for row ${rowIndex}.`,
      });
      continue;
    }
    const customerName = String(
      row.customerName ??
        [row.customerFirstName ?? '', row.customerLastName ?? ''].join(' ').trim(),
    )
      .trim()
      .slice(0, 100);
    if (!customerName || customerName.length < 2) {
      localFailures.push({
        index: i,
        errorCode: 'INVALID_NAME',
        errorMessage: `Customer name is required for row ${rowIndex}.`,
      });
      continue;
    }

    let territory: TerritoryResolution | { error: string } | null = null;
    const rawWilayaName = String(
      row.toWilayaName ?? row.to_wilaya_name ?? row.wilaya ?? '',
    ).trim();
    const rawCommuneName = String(
      row.toCommuneName ?? row.to_commune_name ?? row.commune ?? '',
    ).trim();
    let resolvedWilayaName = rawWilayaName;
    let resolvedCommuneName = rawCommuneName;
    const needsTerritoryResolution =
      (carrier === 'zr' && deliveryType === 'home') ||
      (carrier === 'yalidine' && rawCommuneName !== '');
    if (needsTerritoryResolution) {
      if (!territoryIndex) {
        localFailures.push({
          index: i,
          errorCode: 'TERRITORY_UNAVAILABLE',
          errorMessage: `Territory resolver unavailable for row ${rowIndex}.`,
        });
        continue;
      }
      territory = resolveTerritories_(
        territoryIndex,
        rawWilayaName,
        rawCommuneName,
        row.codeWilaya ?? row.wilayaCode,
      );
      if ('error' in territory) {
        localFailures.push({
          index: i,
          errorCode: 'UNRESOLVED_TERRITORY',
          errorMessage: territory.error,
        });
        continue;
      }
      if (territory.city.hasHomeDelivery === false || territory.district.hasHomeDelivery === false) {
        localFailures.push({
          index: i,
          errorCode: 'HOME_DELIVERY_UNAVAILABLE',
          errorMessage: `Home delivery unavailable for row ${rowIndex}.`,
        });
        continue;
      }
      // null means the carrier's territory data doesn't include delivery capability info;
      // allow the order through and let the carrier API reject if unsupported.
      if (carrier === 'yalidine') {
        resolvedWilayaName = String(territory.city.name ?? rawWilayaName).trim() || rawWilayaName;
        resolvedCommuneName =
          String(territory.district.name ?? rawCommuneName).trim() || rawCommuneName;
      }
    }

    const quantity = Math.max(1, Number(row.quantity ?? 1));
    const unitPrice = toMoney_(row.productPrice ?? row.unitPrice ?? row.totalPrice ?? row.codAmount ?? 0);
    const totalPrice = toMoney_(row.totalPrice ?? row.amount ?? row.codAmount ?? unitPrice * quantity);
    const stockTypeRaw = String((row.stockType ?? defaultStockType) || 'none').toLowerCase();
    const stockType =
      stockTypeRaw === 'warehouse' || stockTypeRaw === 'local' ? stockTypeRaw : 'none';
    const productName = String(row.productName ?? 'Product').replace(/\|/g, ' ').slice(0, 100) || 'Product';
    let senderWilayaName = String(
      input.businessSettings?.senderWilaya ??
        input.businessSettings?.wilaya ??
        row.fromWilayaName ??
        row.from_wilaya_name ??
        row.toWilayaName ??
        row.to_wilaya_name ??
        row.wilaya ??
        '',
    ).trim();
    if (!senderWilayaName) {
      senderWilayaName = resolvedWilayaName;
    }
    const senderAddress = String(
      input.businessSettings?.senderAddress ?? input.businessSettings?.address ?? '',
    ).trim();
    const defaultLength = Number(input.businessSettings?.defaultParcelLength ?? 0);
    const defaultWidth = Number(input.businessSettings?.defaultParcelWidth ?? 0);
    const defaultHeight = Number(input.businessSettings?.defaultParcelHeight ?? 0);
    const explicitWeight = Number(input.businessSettings?.defaultParcelWeight ?? row.weight ?? 0);
    const customerFirstName = String(row.customerFirstName ?? '').trim();
    const customerLastName = String(row.customerLastName ?? '').trim();
    const stopdeskRaw = String(row.stopDeskId ?? row.station ?? '').trim();

    const parcel: Record<string, unknown> = {
      customer: {
        customerId: randomUUID(),
        name: customerName,
        phone: {
          number1: phone,
          ...(row.phone2 ? { number2: normalizeDzPhone_(row.phone2) || undefined } : {}),
        },
      },
      deliveryType,
      description: String(row.note ?? row.description ?? productName).slice(0, 250),
      amount: totalPrice,
      externalId: parcelExternalId_(row, rowIndex),
      fromWilayaName: senderWilayaName,
      senderAddress: senderAddress,
      toWilayaName: resolvedWilayaName,
      toCommuneName: resolvedCommuneName,
      address: String(row.address ?? '').trim(),
      customerFirstName: customerFirstName,
      customerLastName: customerLastName,
      stopDeskId: stopdeskRaw || null,
      freeshipping: toBoolLoose_(row.freeShipping ?? row.freeshipping, false),
      hasExchange: toBoolLoose_(row.hasExchange ?? row.has_exchange, false),
      productToCollect:
        row.productToCollect != null && String(row.productToCollect).trim() !== ''
          ? String(row.productToCollect).trim()
          : null,
      doInsurance: toBoolLoose_(row.doInsurance ?? row.do_insurance, false),
      declaredValue: toMoney_(row.declaredValue ?? row.declared_value ?? totalPrice),
      length: Number.isFinite(defaultLength) && defaultLength > 0 ? defaultLength : 0,
      width: Number.isFinite(defaultWidth) && defaultWidth > 0 ? defaultWidth : 0,
      height: Number.isFinite(defaultHeight) && defaultHeight > 0 ? defaultHeight : 0,
      weightValue: Number.isFinite(explicitWeight) && explicitWeight > 0 ? explicitWeight : 0,
      orderedProducts: [
        {
          productName,
          unitPrice,
          quantity,
          stockType,
          ...(stockType !== 'none'
            ? {
                productId: String(row.productId ?? randomUUID()),
                productSku: String(row.productSku ?? `SKU-${rowIndex}`),
              }
            : {}),
        },
      ],
    };

    if (carrier === 'zr' && deliveryType === 'home' && territory && !('error' in territory)) {
      parcel.deliveryAddress = {
        cityTerritoryId: territory.cityTerritoryId,
        districtTerritoryId: territory.districtTerritoryId,
      };
    }
    if (deliveryType === 'pickup-point') {
      const hubId = String(row.hubId ?? row.station ?? row.stopDeskId ?? defaultHubId ?? '').trim();
      if (!hubId) {
        localFailures.push({
          index: i,
          errorCode: 'HUB_REQUIRED',
          errorMessage: `hubId is required for pickup-point row ${rowIndex}.`,
        });
        continue;
      }
      parcel.hubId = hubId;
      parcel.stopDeskId = hubId;
    }

    if (stockType === 'warehouse') {
      const hubStockId = String(row.hubStockId ?? defaultHubStockId ?? '').trim();
      if (!hubStockId) {
        localFailures.push({
          index: i,
          errorCode: 'HUB_STOCK_REQUIRED',
          errorMessage: `hubStockId is required for warehouse stock on row ${rowIndex}.`,
        });
        continue;
      }
      parcel.hubStockId = hubStockId;
    }

    const weight = explicitWeight;
    if (Number.isFinite(weight) && weight > 0) {
      parcel.weight = {
        weight,
      };
    }

    parcels.push(parcel);
    parcelRowIndexes.push(i);
  }

  const successes: Array<{
    index: number;
    rowIndex: number;
    parcelId: string | null;
    trackingNumber: string | null;
    externalId: string | null;
    labelUrl: string | null;
  }> = [];
  const failures: BulkCreateFailure[] = [...localFailures];

  for (let offset = 0; offset < parcels.length; offset += SEND_CHUNK_SIZE) {
    const chunkParcels = parcels.slice(offset, offset + SEND_CHUNK_SIZE);
    const chunkOriginalIndexes = parcelRowIndexes.slice(offset, offset + SEND_CHUNK_SIZE);

    if (hasBulkCreate && adapter.bulkCreateParcels) {
      let result: Awaited<ReturnType<NonNullable<typeof adapter.bulkCreateParcels>>> | null = null;
      for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
        result = await adapter.bulkCreateParcels({
          parcels: chunkParcels,
          credentials: creds,
        });
        if (result.httpStatus !== 429 || attempt === RETRY_MAX_ATTEMPTS) break;
        await sleep_(Math.min(8000, RETRY_BASE_MS * 2 ** (attempt - 1)));
      }
      if (!result) continue;

      for (const s of result.successes) {
        const originalIndex = chunkOriginalIndexes[s.index];
        if (originalIndex == null) continue;
        const rowIndex = resolveOrderRowIndex_(input.orders[originalIndex], originalIndex);
        successes.push({
          index: originalIndex,
          rowIndex,
          parcelId: s.parcelId ?? null,
          trackingNumber: s.trackingNumber ?? null,
          externalId: s.externalId ?? null,
          labelUrl: s.labelUrl ?? null,
        });
      }
      for (const f of result.failures) {
        const originalIndex = chunkOriginalIndexes[f.index];
        if (originalIndex == null) continue;
        failures.push({
          index: originalIndex,
          errorCode: f.errorCode ?? null,
          errorMessage: coerceAdapterFailureMessage_(f.errorMessage) || 'Carrier request failed',
          externalId: f.externalId ?? null,
        });
      }
      continue;
    }

    // Backward-compatibility path for older adapters that only implement createShipment().
    for (const originalIndex of chunkOriginalIndexes) {
      const row = input.orders[originalIndex];
      if (originalIndex == null || !row) continue;
      const rowIndex = resolveOrderRowIndex_(row, originalIndex);
      try {
        const created = await adapter.createShipment({
          order: row as unknown as InternalOrder,
          credentials: creds,
          businessSettings: input.businessSettings ?? null,
        });
        if (created.ok) {
          successes.push({
            index: originalIndex,
            rowIndex,
            parcelId: created.externalShipmentId ?? null,
            trackingNumber: created.trackingNumber ?? null,
            externalId: created.externalShipmentId ?? null,
            labelUrl: created.labelUrl ?? null,
          });
        } else {
          failures.push({
            index: originalIndex,
            errorCode: 'CREATE_FAILED',
            errorMessage: created.errorMessage || `${carrier} shipment creation failed`,
            externalId: null,
          });
        }
      } catch (error) {
        failures.push({
          index: originalIndex,
          errorCode: 'CREATE_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          externalId: null,
        });
      }
    }
  }

  failures.sort((a, b) => a.index - b.index);
  await persistTrackingRows_(
    deps.pool,
    {
      userEmailHmac: input.userEmailHmac ?? null,
      spreadsheetId: input.spreadsheetId || '',
      sheetName: input.sheetName || '',
      carrier,
      successes: successes.map((x) => ({
        rowIndex: x.rowIndex,
        trackingNumber: x.trackingNumber,
        externalId: x.externalId,
      })),
    },
  );

  return {
    ok: true,
    totalRequested: input.orders.length,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures,
  };
}

async function searchTrackingOne_(
  carrier: string,
  trackingNumber: string,
  credentials: AdapterCredentials,
): Promise<ParcelStatus | null> {
  const adapter = getCarrierAdapterOrThrow(carrier);
  if (!adapter.searchParcels) {
    throw new Error(`${carrier} adapter does not support searchParcels`);
  }
  const body = {
    pageNumber: 1,
    pageSize: 10,
    advancedSearch: {
      field: 'trackingNumber',
      keyword: trackingNumber,
    },
  };
  const result = await adapter.searchParcels({ body, credentials });
  if (result.httpStatus === 403) {
    throw new Error(`${carrier} returned 403. Supplier role/permission is required for parcel search.`);
  }
  if (result.httpStatus >= 400) {
    const raw = result.raw;
    let detail = '';
    if (typeof raw === 'string') {
      detail = raw.trim();
    } else if (raw && typeof raw === 'object') {
      const candidate = raw as { error?: unknown; message?: unknown };
      if (typeof candidate.error === 'string') {
        detail = candidate.error;
      } else if (typeof candidate.message === 'string') {
        detail = candidate.message;
      }
    }
    if (detail === 'missing_credentials') {
      detail = `Missing ${carrier} credentials.`;
    }
    throw new Error(
      detail
        ? `Tracking lookup failed (${result.httpStatus}): ${detail}`
        : `Tracking lookup failed (${result.httpStatus}).`,
    );
  }
  return result.items.find((x) => x.trackingNumber.toLowerCase() === trackingNumber.toLowerCase()) || null;
}

export async function syncTrackingBulk(input: {
  carrier: string;
  trackingNumbers: string[];
  credentials?: Record<string, string> | null;
}) {
  const carrier = String(input.carrier || '').trim().toLowerCase();
  if (!carrier) return { ok: false, errorMessage: 'carrier is required' };

  let adapter;
  try {
    adapter = getCarrierAdapterOrThrow(carrier);
  } catch (e) {
    if (e instanceof UnknownCarrierError) {
      return { ok: false, errorMessage: `Unknown carrier: ${carrier}` };
    }
    throw e;
  }
  if (!adapter.searchParcels) {
    return { ok: false, errorMessage: `${carrier} adapter does not support searchParcels` };
  }

  const credentials = cleanedCredentials_(input.credentials);
  const uniqueTracking = Array.from(
    new Set(input.trackingNumbers.map((x) => String(x || '').trim()).filter(Boolean)),
  );
  const results: Array<{
    trackingNumber: string;
    stateName: string | null;
    stateColor: string | null;
    lastStateUpdateAt: string | null;
    deliveryPrice: number | null;
    amount: number | null;
    deliveryType: string | null;
    label: { fr: string; ar: string; color: string | null };
    found: boolean;
  }> = [];
  const errors: Array<{ trackingNumber: string; message: string }> = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.min(TRACKING_CONCURRENCY, uniqueTracking.length) }).map(async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= uniqueTracking.length) return;
      const tracking = uniqueTracking[i];
      try {
        const found = await searchTrackingOne_(carrier, tracking, credentials);
        if (!found) {
          results.push({
            trackingNumber: tracking,
            stateName: null,
            stateColor: null,
            lastStateUpdateAt: null,
            deliveryPrice: null,
            amount: null,
            deliveryType: null,
            label: carrierStatePresentation_(null),
            found: false,
          });
          continue;
        }
        const label = carrierStatePresentation_(found.stateName);
        results.push({
          trackingNumber: tracking,
          stateName: found.stateName,
          stateColor: found.stateColor,
          lastStateUpdateAt: found.lastStateUpdateAt,
          deliveryPrice: found.deliveryPrice,
          amount: found.amount,
          deliveryType: found.deliveryType,
          label,
          found: true,
        });
      } catch (error) {
        errors.push({
          trackingNumber: tracking,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => a.trackingNumber.localeCompare(b.trackingNumber));
  return {
    ok: true,
    totalRequested: uniqueTracking.length,
    foundCount: results.filter((x) => x.found).length,
    missingCount: results.filter((x) => !x.found).length,
    errorCount: errors.length,
    items: results,
    errors,
  };
}
