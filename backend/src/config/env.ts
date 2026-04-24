export type Env = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string | undefined;
  /** HMAC pepper used for all email hashing (never store raw emails). */
  licensePepper: string | undefined;
  /** When set, `/v1/*` requires X-API-Key/Bearer. */
  apiKey: string | undefined;
  /** Optional dev-only activation codes for no-DB local evaluation. */
  activationCodes: string[];
  /** When false, unknown emails stay pending until an admin activates them. */
  trialEnabled: boolean;
  trialDays: number;
  /** Signing secret for shipment access tokens. */
  licenseSigningSecret: string | undefined;
  /** Alias of licenseSigningSecret sourced from JWT_SECRET (preferred). */
  jwtSecret: string | undefined;
  /** When set, enables `/admin/v1/*` with header `X-Admin-Secret`. */
  adminSecret: string | undefined;
  corsOrigin: string | undefined;
  zrWebhookSecret: string | undefined;
  yalidineWebhookSecret: string | undefined;
  trialDailyShipmentLimit: number;
};

function parsePort_(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    return fallback;
  }
  return Math.floor(n);
}

function parseTrialDays_(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(3650, Math.floor(n));
}

function parseTrialDailyShipmentLimit_(raw: string | undefined): number {
  const n = Number(raw ?? '0');
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.min(1_000_000, Math.floor(n));
}

function parseBool_(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || String(raw).trim() === '') {
    return fallback;
  }
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(v)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(v)) {
    return false;
  }
  return fallback;
}

function parseActivationCodes_(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const chunk of raw.split(',')) {
    const code = String(chunk ?? '').trim().toUpperCase();
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function loadEnv(): Env {
  const nodeEnvRaw = (process.env.NODE_ENV ?? 'development').trim().toLowerCase();
  const nodeEnv: Env['nodeEnv'] =
    nodeEnvRaw === 'production' || nodeEnvRaw === 'test' ? nodeEnvRaw : 'development';
  const rawKey = (process.env.API_KEY ?? '').trim();
  const pepper = (process.env.LICENSE_PEPPER ?? '').trim();
  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();
  const signingLegacy = (process.env.LICENSE_SIGNING_SECRET ?? '').trim();
  const signing = jwtSecret || signingLegacy;
  const adminSecret = (process.env.ADMIN_SECRET ?? '').trim();
  const licenseMode = (process.env.LICENSE_MODE ?? '').trim().toLowerCase();
  const corsOrigin = (process.env.CORS_ORIGIN ?? '').trim();
  const zrWebhookSecret = (process.env.ZR_WEBHOOK_SECRET ?? '').trim();
  const yalidineWebhookSecret = (
    process.env.YALIDINE_WEBHOOK_SECRET ??
    process.env.GUEPEX_WEBHOOK_SECRET ??
    ''
  ).trim();
  const out: Env = {
    nodeEnv,
    port: parsePort_(process.env.PORT, 3000),
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL,
    licensePepper: pepper || undefined,
    licenseSigningSecret: signing || undefined,
    jwtSecret: signing || undefined,
    apiKey: rawKey || undefined,
    activationCodes: parseActivationCodes_(process.env.ACTIVATION_CODES),
    trialEnabled:
      licenseMode === 'admin_approval' || licenseMode === 'manual'
        ? false
        : licenseMode === 'trial'
          ? true
          : parseBool_(process.env.TRIAL_ENABLED, nodeEnv !== 'production'),
    trialDays: parseTrialDays_(process.env.TRIAL_DAYS, 7),
    trialDailyShipmentLimit: parseTrialDailyShipmentLimit_(process.env.TRIAL_DAILY_SHIPMENT_LIMIT),
    adminSecret: adminSecret || undefined,
    corsOrigin: corsOrigin || undefined,
    zrWebhookSecret: zrWebhookSecret || undefined,
    yalidineWebhookSecret: yalidineWebhookSecret || undefined,
  };
  // Fail-fast in production (locked checklist).
  const isProd = nodeEnv === 'production';
  if (isProd) {
    const missing: string[] = [];
    if (!out.databaseUrl) missing.push('DATABASE_URL');
    if (!out.apiKey) missing.push('API_KEY');
    if (!out.adminSecret) missing.push('ADMIN_SECRET');
    if (!out.jwtSecret || out.jwtSecret.length < 32) {
      missing.push('JWT_SECRET(min 32 chars)');
    }
    if (!out.licensePepper) {
      missing.push('LICENSE_PEPPER');
    }
    if (missing.length) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    // Enforce locked trial duration in production.
    out.trialDays = 7;
  }
  return out;
}
