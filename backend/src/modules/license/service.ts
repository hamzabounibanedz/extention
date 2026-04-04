import { createHmac } from 'node:crypto';

import type { LicenseRecord, LicenseStatus } from '@delivery-tool/shared';
import type { Pool } from 'pg';

import type { Env as AppEnv } from '../../config/env.js';

/**
 * Sets {@link LicenseRecord.licenseStatus} to `expired` when trial or subscription end is in the past.
 */
export function normalizeLicenseExpiry(record: LicenseRecord): LicenseRecord {
  const now = Date.now();
  if (record.licenseStatus === 'active' && record.subscriptionEnd) {
    if (new Date(record.subscriptionEnd).getTime() <= now) {
      return { ...record, licenseStatus: 'expired' };
    }
  }
  if (record.licenseStatus === 'trial' && record.trialEnd) {
    if (new Date(record.trialEnd).getTime() <= now) {
      return { ...record, licenseStatus: 'expired' };
    }
  }
  return record;
}

/**
 * HMAC-SHA256 hex digest used as `user_key_hash` (never store raw email).
 */
export function hashClientIdentity(email: string, pepper: string): string {
  return createHmac('sha256', pepper).update(email.trim().toLowerCase()).digest('hex');
}

/**
 * In-memory fallback used only when DATABASE_URL is missing.
 */
function normalizeActivationCode_(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase();
}

export function resolveLicenseInMemory(
  env: AppEnv,
  input: { activationCode?: string | null; clientEmail?: string | null },
): LicenseRecord {
  const activationCode = normalizeActivationCode_(input.activationCode);
  if (activationCode && env.activationCodes.includes(activationCode)) {
    const now = new Date();
    const subscriptionEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    return normalizeLicenseExpiry({
      licenseKey: activationCode,
      licenseStatus: 'active',
      trialStart: null,
      trialEnd: null,
      subscriptionEnd: subscriptionEnd.toISOString(),
      customerEmail: input.clientEmail?.trim().toLowerCase() || null,
      planName: 'yearly',
    });
  }

  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + env.trialDays * 24 * 60 * 60 * 1000);

  return normalizeLicenseExpiry({
    licenseKey: null,
    licenseStatus: 'trial',
    trialStart: trialStart.toISOString(),
    trialEnd: trialEnd.toISOString(),
    subscriptionEnd: null,
    customerEmail: null,
    planName: 'trial',
  });
}

type ResolveInput = {
  activationCode?: string | null;
  clientEmail?: string | null;
  spreadsheetId?: string | null;
};

/**
 * Resolves current license/trial state using the migrated schema.
 *
 * Identity lookups still use `user_email_hmac`; optional `google_email` is
 * populated only for admin search/display convenience.
 */
export async function resolveLicenseWithPool(
  pool: Pool | null,
  env: AppEnv,
  input: ResolveInput,
): Promise<LicenseRecord> {
  if (!pool) {
    return resolveLicenseInMemory(env, input);
  }
  const email = input.clientEmail?.trim() || '';
  if (!email || !env.licensePepper) {
    return resolveLicenseInMemory(env, input);
  }
  const userEmailHmac = hashClientIdentity(email, env.licensePepper);

  const licenseRes = await pool.query<{
    revoked: boolean;
    expires_at: Date;
    plan: string | null;
  }>(
    `SELECT revoked, expires_at, plan
     FROM dt_license
     WHERE user_email_hmac = $1
     ORDER BY activated_at DESC
     LIMIT 1`,
    [userEmailHmac],
  );
  const lic = licenseRes.rows[0];
  if (lic) {
    await pool.query(
      `UPDATE dt_license
       SET google_email = COALESCE(google_email, $1)
       WHERE user_email_hmac = $2`,
      [email.trim().toLowerCase(), userEmailHmac],
    );
    await pool.query(
      `UPDATE dt_trial_entitlement
       SET used = TRUE
       WHERE user_email_hmac = $1 AND used = FALSE`,
      [userEmailHmac],
    );
    const expiresAtIso = new Date(lic.expires_at).toISOString();
    const now = Date.now();
    const expMs = new Date(expiresAtIso).getTime();
    const status: LicenseStatus = lic.revoked
      ? 'revoked'
      : expMs <= now
        ? 'expired'
        : 'active';
    return normalizeLicenseExpiry({
      licenseKey: null,
      licenseStatus: status,
      trialStart: null,
      trialEnd: null,
      subscriptionEnd: expiresAtIso,
      customerEmail: email,
      planName: lic.plan || 'standard',
    });
  }

  const trialRes = await pool.query<{ created_at: Date; expires_at: Date }>(
    `SELECT created_at, expires_at
     FROM dt_trial_entitlement
     WHERE user_email_hmac = $1
     LIMIT 1`,
    [userEmailHmac],
  );
  const trial = trialRes.rows[0];
  if (trial) {
    const expiresIso = new Date(trial.expires_at).toISOString();
    const status: LicenseStatus = new Date(expiresIso).getTime() <= Date.now() ? 'expired' : 'trial';
    return normalizeLicenseExpiry({
      licenseKey: null,
      licenseStatus: status,
      trialStart: new Date(trial.created_at).toISOString(),
      trialEnd: expiresIso,
      subscriptionEnd: null,
      customerEmail: email,
      planName: 'trial',
    });
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + env.trialDays * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO dt_trial_entitlement (user_email_hmac, spreadsheet_id, created_at, expires_at, used)
     VALUES ($1, $2, $3, $4, FALSE)
     ON CONFLICT (user_email_hmac) DO NOTHING`,
    [userEmailHmac, input.spreadsheetId || 'unknown', now, trialEnd],
  );
  return normalizeLicenseExpiry({
    licenseKey: null,
    licenseStatus: 'trial',
    trialStart: now.toISOString(),
    trialEnd: trialEnd.toISOString(),
    subscriptionEnd: null,
    customerEmail: email,
    planName: 'trial',
  });
}

export async function activateLicenseCode(
  pool: Pool,
  input: { code: string; email: string },
  env: AppEnv,
): Promise<LicenseRecord> {
  if (!env.licensePepper) {
    throw new Error('license_pepper_required');
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  const userEmailHmac = hashClientIdentity(normalizedEmail, env.licensePepper);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const codeRow = await client.query<{
      id: string;
      code: string;
      duration_days: number;
      revoked: boolean;
      activated_by: string | null;
      activated_at: Date | null;
    }>(
      `SELECT id, code, duration_days, revoked, activated_by, activated_at
       FROM dt_admin_license_code
       WHERE code = $1
       FOR UPDATE`,
      [input.code],
    );
    if (codeRow.rows.length === 0) {
      throw new Error('code_not_found');
    }
    const row = codeRow.rows[0];

    if (row.revoked) {
      throw new Error('code_revoked');
    }
    if (row.activated_by && row.activated_by !== userEmailHmac) {
      throw new Error('code_already_used');
    }

    const activatedAt = new Date();
    const duration = Number.isFinite(row.duration_days) && row.duration_days > 0 ? row.duration_days : 365;
    const candidateExpiresAt = new Date(activatedAt.getTime() + duration * 24 * 60 * 60 * 1000);

    await client.query(
      `UPDATE dt_admin_license_code
       SET activated_by = COALESCE(activated_by, $2),
           activated_at = COALESCE(activated_at, $3)
       WHERE code = $1`,
      [input.code, userEmailHmac, activatedAt],
    );

    const upsert = await client.query<{ expires_at: Date }>(
      `INSERT INTO dt_license (user_email_hmac, code_id, activated_at, expires_at, revoked, revoked_at, plan, google_email)
       VALUES ($1, $2, $3, $4, FALSE, NULL, 'standard', $5)
       ON CONFLICT (user_email_hmac) DO UPDATE
       SET code_id = EXCLUDED.code_id,
           activated_at = EXCLUDED.activated_at,
           expires_at = GREATEST(dt_license.expires_at, EXCLUDED.expires_at),
           revoked = FALSE,
           revoked_at = NULL,
           plan = 'standard',
           google_email = COALESCE(dt_license.google_email, EXCLUDED.google_email)
       RETURNING expires_at`,
      [userEmailHmac, row.id, activatedAt, candidateExpiresAt, normalizedEmail],
    );
    const expiresAt = upsert.rows[0] ? new Date(upsert.rows[0].expires_at) : candidateExpiresAt;
    await client.query(
      `UPDATE dt_trial_entitlement
       SET used = TRUE
       WHERE user_email_hmac = $1 AND used = FALSE`,
      [userEmailHmac],
    );

    await client.query('COMMIT');

    return {
      licenseKey: null,
      licenseStatus: 'active' as LicenseStatus,
      trialStart: null,
      trialEnd: null,
      subscriptionEnd: expiresAt.toISOString(),
      customerEmail: normalizedEmail,
      planName: 'standard',
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function resolveLicenseByHashedIdentity(
  pool: Pool,
  userEmailHmac: string,
): Promise<LicenseRecord | null> {
  const r = await pool.query<{
    revoked: boolean;
    expires_at: Date;
    plan: string | null;
  }>(
    `SELECT revoked, expires_at, plan
     FROM dt_license
     WHERE user_email_hmac = $1
     ORDER BY activated_at DESC
     LIMIT 1`,
    [userEmailHmac],
  );
  const row = r.rows[0];
  if (!row) {
    return null;
  }
  const expiresIso = new Date(row.expires_at).toISOString();
  const status: LicenseStatus = row.revoked
    ? 'revoked'
    : new Date(expiresIso).getTime() <= Date.now()
      ? 'expired'
      : 'active';
  return normalizeLicenseExpiry({
    licenseKey: null,
    licenseStatus: status,
    trialStart: null,
    trialEnd: null,
    subscriptionEnd: expiresIso,
    customerEmail: null,
    planName: row.plan || 'standard',
  });
}
