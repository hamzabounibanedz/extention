import { randomBytes } from 'node:crypto';

import type { Pool } from 'pg';

const CODE_PREFIX = 'DLV-';
const MAX_ISSUE_ATTEMPTS = 8;

function randomSegment(): string {
  // 4 uppercase alphanumeric chars (excluding confusable chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let seg = '';
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) {
    seg += chars[bytes[i] % chars.length];
  }
  return seg;
}

export function generateAdminLicenseCode(): string {
  return `${CODE_PREFIX}${randomSegment()}-${randomSegment()}-${randomSegment()}`;
}

export type AdminLicenseRow = {
  id: string;
  code: string;
  created_at: Date;
  duration_days: number;
  notes: string | null;
  revoked: boolean;
  revoked_at: Date | null;
  activated_by: string | null;
  activated_at: Date | null;
};

export async function insertAdminLicenseCode(
  pool: Pool,
  input: { durationDays: number; notes?: string | null; activatedBy?: string | null },
): Promise<{ code: string; row: AdminLicenseRow }> {
  const durationDays = Number.isFinite(input.durationDays) && input.durationDays > 0 ? input.durationDays : 365;
  const notes =
    input.notes != null && String(input.notes).trim() !== '' ? String(input.notes).trim() : null;
  const activatedBy =
    input.activatedBy != null && String(input.activatedBy).trim() !== ''
      ? String(input.activatedBy).trim()
      : null;
  for (let i = 0; i < MAX_ISSUE_ATTEMPTS; i++) {
    const code = generateAdminLicenseCode();
    try {
      const r = await pool.query<AdminLicenseRow>(
        `INSERT INTO dt_admin_license_code (code, duration_days, notes, activated_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, created_at, duration_days, notes, revoked, revoked_at, activated_by, activated_at`,
        [code, durationDays, notes, activatedBy],
      );
      const row = r.rows[0];
      if (row) {
        return { code: row.code, row };
      }
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === '23505') {
        continue;
      }
      throw e;
    }
  }
  throw new Error('Could not generate a unique license code');
}

export async function listAdminLicenseCodes(
  pool: Pool,
  limit: number,
): Promise<AdminLicenseRow[]> {
  const lim = Math.min(500, Math.max(1, limit));
  const r = await pool.query<AdminLicenseRow>(
    `SELECT id, code, created_at, duration_days, notes, revoked, revoked_at, activated_by, activated_at
     FROM dt_admin_license_code
     ORDER BY created_at DESC
     LIMIT $1`,
    [lim],
  );
  return r.rows;
}
