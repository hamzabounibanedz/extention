import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import Fastify from 'fastify';
import pg from 'pg';

import { loadEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { registerAdminAuth } from './plugins/admin-auth.js';
import { registerApiKeyAuth } from './plugins/api-key-auth.js';
import { registerShipmentAccessTokenAuth } from './plugins/shipment-access-token.js';
import { registerCarrierRoutes } from './modules/carriers/routes.js';
import { registerGeoRoutes } from './modules/geo/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { registerLicenseRoutes } from './modules/license/routes.js';
import { registerShipmentRoutes } from './modules/shipments/routes.js';
import { registerWebhookRoutes } from './modules/webhooks/routes.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootEnvPath = resolve(projectRoot, '.env');
if (existsSync(rootEnvPath)) {
  loadDotenv({ path: rootEnvPath });
} else {
  // Fallback for environments that inject vars externally.
  loadDotenv();
}

const env = loadEnv();
const app = Fastify({ logger: true });

app.setErrorHandler((err, _request, reply) => {
  const status = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
  const code =
    typeof (err as any)?.code === 'string'
      ? String((err as any).code)
      : status === 500
        ? 'INTERNAL_ERROR'
        : undefined;
  const message =
    status >= 500 ? 'Internal server error' : (err as any)?.message ? String((err as any).message) : 'Error';
  reply.code(status).send({ error: message, code });
});

let licensePool: pg.Pool | null = null;
if (env.databaseUrl) {
  const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
  try {
    await runMigrations(pool);
    licensePool = pool;
    app.log.info('Database migrations completed.');
  } catch (err) {
    app.log.error({ err }, 'DATABASE_URL is set but license DB init failed; shutting down.');
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    // Fail-fast: do not continue with in-memory license in production when a DB URL is configured.
    process.exitCode = 1;
    throw err;
  }
}

app.addHook('onClose', async () => {
  if (licensePool) {
    await licensePool.end();
  }
});

await registerApiKeyAuth(app, env);
await registerAdminAuth(app, env);
await registerShipmentAccessTokenAuth(app, env, licensePool);
await registerHealthRoutes(app);
await registerCarrierRoutes(app);
await registerGeoRoutes(app);
await registerLicenseRoutes(app, env, licensePool);
if (licensePool && env.adminSecret) {
  await registerAdminRoutes(app, env, licensePool);
} else if (env.adminSecret && !licensePool) {
  app.log.warn('ADMIN_SECRET is set but DATABASE_URL is missing or DB init failed; admin API is disabled.');
}
await registerShipmentRoutes(app, { env, pool: licensePool });
await registerWebhookRoutes(app, {
  pool: licensePool,
  zrWebhookSecret: env.zrWebhookSecret,
  yalidineWebhookSecret: env.yalidineWebhookSecret,
});

const port = env.port;
const host = env.host;

await app.listen({ port, host });
app.log.info(`listening on ${host}:${port}`);

process.on('SIGTERM', async () => {
  app.log.info('Received SIGTERM, shutting down...');
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, 'Error during graceful shutdown');
  } finally {
    // Let Node exit once all handles are closed.
  }
});
