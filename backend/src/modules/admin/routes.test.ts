import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import Fastify from 'fastify';
import pg from 'pg';

import { loadEnv } from '../../config/env.js';
import { ensureAdminLicenseSchema } from './schema.js';
import { registerAdminRoutes } from './routes.js';

// Lightweight integration-style tests for critical admin flows (extend/revoke).
const describeDb_ = process.env.DATABASE_URL ? describe : describe.skip;

async function createTestApp() {
  const env = loadEnv();
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL required for admin routes tests');
  }
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 1 });
  await ensureAdminLicenseSchema(pool);

  const app = Fastify();
  await registerAdminRoutes(app, env, pool);
  return { app, pool };
}

describeDb_('admin license routes', () => {
  let app: ReturnType<typeof Fastify> | null = null;
  let pool: pg.Pool | null = null;

  before(async () => {
    const created = await createTestApp();
    app = created.app;
    pool = created.pool;
  });

  after(async () => {
    if (pool) {
      await pool.end();
    }
    if (app) {
      await app.close();
    }
  });

  it('stats buckets are mutually exclusive', async () => {
    if (!pool || !app) {
      throw new Error('test app not initialized');
    }

    // Seed three rows: active, expired, revoked.
    await pool.query('DELETE FROM dt_license');
    await pool.query(`
        INSERT INTO dt_license (user_email_hmac, activated_at, expires_at, revoked, plan)
        VALUES
          ('h_active', NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days', FALSE, 'standard'),
          ('h_expired', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day', FALSE, 'standard'),
          ('h_revoked', NOW() - INTERVAL '10 days', NOW() + INTERVAL '10 days', TRUE, 'standard')
      `);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/v1/stats',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as any;
    assert.equal(body.active, 1);
    assert.equal(body.expired, 1);
    assert.equal(body.revoked, 1);
  });
});

