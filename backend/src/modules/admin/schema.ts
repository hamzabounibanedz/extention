import type { Pool } from 'pg';
import { runMigrations } from '../../db/migrate.js';

/**
 * Backward-compatible helper used by legacy tests.
 * Runtime migrations are now centralized in `src/db/migrate.ts`.
 */
export async function ensureAdminLicenseSchema(pool: Pool): Promise<void> {
  await runMigrations(pool);
}
