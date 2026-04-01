import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

function signaturesMatch_(secret: string, payload: string, provided: string): boolean {
  const digestHex = createHmac('sha256', secret).update(payload).digest('hex');
  const digestBase64 = createHmac('sha256', secret).update(payload).digest('base64');
  const candidates = [digestHex, `sha256=${digestHex}`, digestBase64];
  for (const c of candidates) {
    const a = Buffer.from(c);
    const b = Buffer.from(provided);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { pool: Pool | null; zrWebhookSecret?: string },
): Promise<void> {
  const { pool, zrWebhookSecret } = deps;

  app.post('/webhooks/zr', async (request, reply) => {
    if (!pool) {
      return reply.send({ ok: true, queued: false, reason: 'no_database' });
    }

    if (zrWebhookSecret) {
      const rawHeader = request.headers['x-zr-signature'] ?? request.headers['svix-signature'];
      const provided = Array.isArray(rawHeader) ? String(rawHeader[0] ?? '') : String(rawHeader ?? '');
      if (!provided) {
        return reply.code(401).send({ error: 'missing_signature' });
      }
      const payloadText = JSON.stringify((request as any).body ?? {});
      if (!signaturesMatch_(zrWebhookSecret, payloadText, provided.trim())) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    }

    const body = ((request as any).body ?? {}) as Record<string, unknown>;
    const state =
      body.state && typeof body.state === 'object' ? (body.state as Record<string, unknown>) : {};
    const parcel =
      body.parcel && typeof body.parcel === 'object' ? (body.parcel as Record<string, unknown>) : {};

    const trackingNumber =
      body.trackingNumber != null
        ? String(body.trackingNumber)
        : parcel.trackingNumber != null
          ? String(parcel.trackingNumber)
          : '';
    if (!trackingNumber) {
      return reply.send({ ok: true, queued: false, reason: 'missing_tracking_number' });
    }

    const stateName = state.name != null ? String(state.name) : body.stateName != null ? String(body.stateName) : null;
    const stateColor =
      state.color != null ? String(state.color) : body.stateColor != null ? String(body.stateColor) : null;

    await pool.query(
      `INSERT INTO dt_pending_update (carrier, tracking_number, state_name, state_color, payload)
       VALUES ('zr', $1, $2, $3, $4::jsonb)`,
      [trackingNumber, stateName, stateColor, JSON.stringify(body)],
    );

    return reply.send({ ok: true, queued: true });
  });
}
