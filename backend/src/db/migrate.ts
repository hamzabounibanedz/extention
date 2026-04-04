import type { Pool } from 'pg';

const MIGRATION_SQL: string[] = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  `CREATE TABLE IF NOT EXISTS dt_admin_license_code (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_days   INT NOT NULL,
    notes           TEXT,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    activated_by    TEXT,
    activated_at    TIMESTAMPTZ
  )`,

  `CREATE TABLE IF NOT EXISTS dt_license (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email_hmac   TEXT NOT NULL UNIQUE,
    code_id           UUID REFERENCES dt_admin_license_code(id),
    activated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked           BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at        TIMESTAMPTZ,
    plan              TEXT NOT NULL DEFAULT 'standard'
  )`,

  `CREATE TABLE IF NOT EXISTS dt_trial_entitlement (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email_hmac   TEXT NOT NULL UNIQUE,
    spreadsheet_id    TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ NOT NULL,
    used              BOOLEAN NOT NULL DEFAULT FALSE
  )`,

  `CREATE TABLE IF NOT EXISTS dt_shipment_quota (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email_hmac   TEXT NOT NULL,
    period_start      TIMESTAMPTZ NOT NULL,
    period_end        TIMESTAMPTZ NOT NULL,
    shipments_sent    INT NOT NULL DEFAULT 0,
    UNIQUE(user_email_hmac, period_start)
  )`,

  `CREATE TABLE IF NOT EXISTS dt_parcel_tracking (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email_hmac   TEXT NOT NULL,
    spreadsheet_id    TEXT NOT NULL,
    sheet_name        TEXT NOT NULL,
    row_index         INT NOT NULL,
    carrier           TEXT NOT NULL,
    tracking_number   TEXT NOT NULL,
    external_id       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tracking_number)
  )`,

  `CREATE TABLE IF NOT EXISTS dt_pending_update (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier           TEXT NOT NULL,
    tracking_number   TEXT NOT NULL,
    state_name        TEXT,
    state_color       TEXT,
    payload           JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed         BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at      TIMESTAMPTZ
  )`,

  // Optional plaintext email for admin UI only (HMAC remains the stable identity key).
  `ALTER TABLE dt_license ADD COLUMN IF NOT EXISTS google_email TEXT`,

  `CREATE INDEX IF NOT EXISTS idx_license_email ON dt_license(user_email_hmac)`,
  `CREATE INDEX IF NOT EXISTS idx_trial_email ON dt_trial_entitlement(user_email_hmac)`,
  `CREATE INDEX IF NOT EXISTS idx_code_lookup ON dt_admin_license_code(code) WHERE revoked = FALSE`,
  `CREATE INDEX IF NOT EXISTS idx_parcel_tracking_number ON dt_parcel_tracking(tracking_number)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_processed ON dt_pending_update(processed, created_at)`,
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of MIGRATION_SQL) {
      await client.query(stmt);
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors: original error is what matters for fail-fast startup.
    }
    throw error;
  } finally {
    client.release();
  }
}
