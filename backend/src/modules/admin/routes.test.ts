import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import Fastify from 'fastify';
import pg from 'pg';

import type { Env } from '../../config/env.js';
import { loadEnv } from '../../config/env.js';
import { ensureAdminLicenseSchema } from './schema.js';
import { registerAdminRoutes } from './routes.js';

// Lightweight integration-style tests for critical admin flows (extend/revoke).
const describeDb_ = process.env.DATABASE_URL ? describe : describe.skip;

function envStub_(over: Partial<Env> = {}): Env {
  return {
    nodeEnv: 'test',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: undefined,
    licensePepper: 'test-pepper',
    apiKey: undefined,
    activationCodes: [],
    trialEnabled: false,
    trialDays: 7,
    licenseSigningSecret: undefined,
    jwtSecret: undefined,
    adminSecret: undefined,
    corsOrigin: undefined,
    zrWebhookSecret: undefined,
    yalidineWebhookSecret: undefined,
    trialDailyShipmentLimit: 0,
    legacyLicenseCodesEnabled: false,
    ...over,
  };
}

describe('admin route production safety', () => {
  it('hides legacy license-code routes when disabled', async () => {
    const app = Fastify();
    const pool = {
      query() {
        throw new Error('legacy license-code route should not hit the database');
      },
    } as any;
    await registerAdminRoutes(app, envStub_({ legacyLicenseCodesEnabled: false }), pool);

    const createRes = await app.inject({
      method: 'POST',
      url: '/admin/v1/license-codes',
      payload: { durationDays: 365 },
    });
    assert.equal(createRes.statusCode, 404);

    const listRes = await app.inject({
      method: 'GET',
      url: '/admin/v1/license-codes',
    });
    assert.equal(listRes.statusCode, 404);

    await app.close();
  });

  it('keeps direct email activation route visible', async () => {
    const app = Fastify();
    const pool = {
      query() {
        throw new Error('invalid email should be rejected before database access');
      },
    } as any;
    await registerAdminRoutes(app, envStub_({ legacyLicenseCodesEnabled: false }), pool);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/v1/licenses/activate-email',
      payload: { googleEmail: 'not-an-email', durationDays: 365 },
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as any).code, 'INVALID_GOOGLE_EMAIL');

    await app.close();
  });
});

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

