import { createHmac, timingSafeEqual } from 'node:crypto';

import type { LicenseRecord } from '@delivery-tool/shared';

const VERSION = 1;

// Maximum wall-clock lifetime for a shipment access token, regardless of subscription end.
// This bounds how long a revoked license can keep using an already-issued token.
const MAX_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Stable pseudonymous id for trial shipment quotas (embed in access token, never raw email).
 */
export function hashShipmentUsageSubject(email: string, secret: string): string {
  const norm = email.trim().toLowerCase();
  return createHmac('sha256', secret).update('dt-shipment-usage|').update(norm).digest('hex');
}

/**
 * Latest instant the token remains valid (UTC ms). Null if no shipment access should be granted.
 */
export function computeShipmentAccessExpiryMs(record: LicenseRecord): number | null {
  const st = record.licenseStatus;
  if (st === 'expired' || st === 'invalid' || st === 'revoked') {
    return null;
  }

  let hardExpiry: number | null = null;

  if (st === 'trial' && record.trialEnd) {
    const t = new Date(record.trialEnd).getTime();
    hardExpiry = Number.isFinite(t) ? t : null;
  }
  if (st === 'active') {
    if (record.subscriptionEnd) {
      const t = new Date(record.subscriptionEnd).getTime();
      hardExpiry = Number.isFinite(t) ? t : null;
    } else {
      // Fallback when subscriptionEnd is missing: keep legacy behaviour but still cap wall-clock.
      hardExpiry = Date.now() + 365 * 24 * 60 * 60 * 1000;
    }
  }

  if (hardExpiry == null) {
    return null;
  }

  // Short-lived token: never longer than MAX_TOKEN_LIFETIME_MS from now,
  // but also never beyond the underlying entitlement end.
  const softCap = Date.now() + MAX_TOKEN_LIFETIME_MS;
  return Math.min(hardExpiry, softCap);
}

export function issueShipmentAccessToken(
  record: LicenseRecord,
  secret: string,
  usageSub?: string | null,
  userEmailHmac?: string | null,
): string | null {
  const expMs = computeShipmentAccessExpiryMs(record);
  if (expMs == null || expMs <= Date.now()) {
    return null;
  }
  const payload: Record<string, unknown> = {
    v: 1,
    licenseStatus: record.licenseStatus,
    planName: record.planName,
    expMs,
  };
  const sub = usageSub != null && String(usageSub).trim() !== '' ? String(usageSub).trim() : null;
  if (sub) {
    payload.sub = sub;
  }
  const hmac =
    userEmailHmac != null && String(userEmailHmac).trim() !== '' ? String(userEmailHmac).trim() : null;
  if (hmac) {
    payload.userEmailHmac = hmac;
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

export type VerifiedShipmentAccess = {
  licenseStatus: string;
  planName: string | null;
  expMs: number;
  /** HMAC identity associated with the entitlement, when available. */
  userEmailHmac: string | null;
  /** Present when client validated with email — used for trial shipment quotas. */
  usageSub: string | null;
};

export function verifyShipmentAccessToken(
  token: string,
  secret: string,
  clockSkewMs = 120_000,
): VerifiedShipmentAccess | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return null;
  }
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== expectedSig.length || !timingSafeEqual(expectedSig, sigBuf)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const o = parsed as Record<string, unknown>;
  if (o.v !== VERSION) {
    return null;
  }
  if (typeof o.expMs !== 'number' || typeof o.licenseStatus !== 'string') {
    return null;
  }
  if (o.expMs + clockSkewMs <= Date.now()) {
    return null;
  }
  if (o.licenseStatus === 'expired' || o.licenseStatus === 'invalid' || o.licenseStatus === 'revoked') {
    return null;
  }
  const pn = o.planName;
  const planName = pn === null || pn === undefined ? null : typeof pn === 'string' ? pn : null;
  const userEmailHmacRaw = (o as any).userEmailHmac;
  const userEmailHmac =
    typeof userEmailHmacRaw === 'string' && userEmailHmacRaw.trim() !== ''
      ? userEmailHmacRaw.trim()
      : null;
  const subRaw = o.sub;
  const usageSub =
    typeof subRaw === 'string' && subRaw.trim() !== '' ? subRaw.trim() : null;
  return {
    licenseStatus: o.licenseStatus,
    planName,
    expMs: o.expMs,
    userEmailHmac,
    usageSub,
  };
}
