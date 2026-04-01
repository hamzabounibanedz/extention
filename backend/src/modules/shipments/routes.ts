import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type { Env } from '../../config/env.js';
import { sendOrdersBulk, syncTrackingBulk } from './service.js';
import { tryConsumeTrialShipmentSlot } from './trial-usage.js';

const credentialsSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
} as const;

const genericOrderSchema = {
  type: 'object',
  additionalProperties: true,
} as const;

const sendBodySchema = {
  type: 'object',
  required: ['carrier', 'orders'],
  properties: {
    carrier: { type: 'string' },
    orders: {
      type: 'array',
      items: genericOrderSchema,
      minItems: 1,
      maxItems: 500,
    },
    spreadsheetId: { type: 'string' },
    sheetName: { type: 'string' },
    credentials: credentialsSchema,
    businessSettings: {
      type: 'object',
      additionalProperties: true,
    },
  },
  additionalProperties: false,
} as const;

const trackingBodySchema = {
  type: 'object',
  required: ['carrier', 'trackingNumbers'],
  properties: {
    carrier: { type: 'string' },
    trackingNumbers: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 500,
    },
    credentials: credentialsSchema,
  },
  additionalProperties: false,
} as const;

export async function registerShipmentRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool | null },
): Promise<void> {
  const { env, pool } = deps;

  app.post<{
    Body: {
      carrier: string;
      orders: Array<Record<string, unknown>>;
      spreadsheetId?: string;
      sheetName?: string;
      credentials?: Record<string, string>;
      businessSettings?: Record<string, unknown>;
    };
  }>(
    '/v1/shipments/send',
    {
      schema: {
        body: sendBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const limit =
        env.licenseSigningSecret && request.dtShipmentAccess
          ? env.trialDailyShipmentLimit
          : 0;
      const acc = request.dtShipmentAccess;
      const consumed = await tryConsumeTrialShipmentSlot(
        pool,
        limit,
        acc?.planName ?? null,
        acc?.userEmailHmac ?? acc?.usageSub ?? null,
      );
      if (!consumed.ok) {
        return reply.code(429).send({ message: consumed.message });
      }
      return sendOrdersBulk(
        {
          carrier: request.body.carrier,
          orders: request.body.orders,
          spreadsheetId: request.body.spreadsheetId ?? null,
          sheetName: request.body.sheetName ?? null,
          credentials: request.body.credentials ?? null,
          businessSettings: request.body.businessSettings ?? null,
          userEmailHmac: acc?.userEmailHmac ?? null,
        },
        { pool },
      );
    },
  );

  app.post<{
    Body: {
      carrier: string;
      trackingNumbers: string[];
      credentials?: Record<string, string>;
    };
  }>(
    '/v1/shipments/tracking',
    {
      schema: {
        body: trackingBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const limit =
        env.licenseSigningSecret && request.dtShipmentAccess
          ? env.trialDailyShipmentLimit
          : 0;
      const acc = request.dtShipmentAccess;
      const consumed = await tryConsumeTrialShipmentSlot(
        pool,
        limit,
        acc?.planName ?? null,
        acc?.userEmailHmac ?? acc?.usageSub ?? null,
      );
      if (!consumed.ok) {
        return reply.code(429).send({ message: consumed.message });
      }
      return syncTrackingBulk({
        carrier: request.body.carrier,
        trackingNumbers: request.body.trackingNumbers,
        credentials: request.body.credentials ?? null,
      });
    },
  );

  app.get<{ Querystring: { limit?: number } }>(
    '/v1/shipments/pending-updates',
    async (request, reply) => {
      if (!pool) {
        return reply.send({ items: [] });
      }
      const limit = Number.isFinite(Number(request.query.limit))
        ? Math.min(500, Math.max(1, Number(request.query.limit)))
        : 100;
      const r = await pool.query(
        `SELECT id, carrier, tracking_number, state_name, state_color, payload, created_at
         FROM dt_pending_update
         WHERE processed = FALSE
         ORDER BY created_at ASC
         LIMIT $1`,
        [limit],
      );
      return reply.send({ items: r.rows });
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    '/v1/shipments/pending-updates/ack',
    async (request, reply) => {
      if (!pool) {
        return reply.send({ ok: true, updated: 0 });
      }
      const ids = Array.isArray(request.body?.ids)
        ? request.body.ids.map((x) => String(x)).filter(Boolean)
        : [];
      if (!ids.length) {
        return reply.send({ ok: true, updated: 0 });
      }
      const r = await pool.query(
        `UPDATE dt_pending_update
         SET processed = TRUE,
             processed_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      return reply.send({ ok: true, updated: r.rowCount ?? 0 });
    },
  );
}
