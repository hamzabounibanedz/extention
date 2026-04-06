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

function asRecord_(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function pickHeader_(headers: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const raw = headers[name];
    const v = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
    if (v.trim()) return v.trim();
  }
  return '';
}

async function queuePendingUpdate_(
  pool: Pool,
  carrier: string,
  trackingNumber: string,
  stateName: string | null,
  stateColor: string | null,
  payload: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO dt_pending_update (carrier, tracking_number, state_name, state_color, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [carrier, trackingNumber, stateName, stateColor, JSON.stringify(payload)],
  );
}

export async function registerWebhookRoutes(
  app: FastifyInstance,
  deps: {
    pool: Pool | null;
    zrWebhookSecret?: string;
    yalidineWebhookSecret?: string;
  },
): Promise<void> {
  const { pool, zrWebhookSecret, yalidineWebhookSecret } = deps;

  app.post('/webhooks/zr', async (request, reply) => {
    if (!pool) {
      return reply.send({ ok: true, queued: false, reason: 'no_database' });
    }

    if (zrWebhookSecret) {
      const provided = pickHeader_(request.headers as Record<string, unknown>, [
        'x-zr-signature',
        'svix-signature',
      ]);
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

    await queuePendingUpdate_(pool, 'zr', trackingNumber, stateName, stateColor, body);

    return reply.send({ ok: true, queued: true });
  });

  const yalidineCrcHandler = async (request: any, reply: any) => {
    const query = asRecord_(request.query);
    const subscribe = query.subscribe != null ? String(query.subscribe) : '';
    const crcToken = query.crc_token != null ? String(query.crc_token) : '';
    if (subscribe && crcToken) {
      return reply.type('text/plain').send(crcToken);
    }
    return reply.send({ ok: true });
  };

  app.get('/webhooks/yalidine', yalidineCrcHandler);
  app.get('/webhooks/guepex', yalidineCrcHandler);

  const yalidinePostHandler = async (request: any, reply: any) => {
    if (!pool) {
      return reply.send({ ok: true, queued: false, reason: 'no_database' });
    }
    if (yalidineWebhookSecret) {
      const provided = pickHeader_(request.headers as Record<string, unknown>, [
        'x-yalidine-signature',
        'x-guepex-signature',
        'x-signature',
        'signature',
      ]);
      if (!provided) {
        return reply.code(401).send({ error: 'missing_signature' });
      }
      const payloadText = JSON.stringify((request as any).body ?? {});
      if (!signaturesMatch_(yalidineWebhookSecret, payloadText, provided)) {
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    }

    const body = asRecord_((request as any).body);
    const type = body.type != null ? String(body.type) : '';
    const events = Array.isArray(body.events) ? body.events : [];
    let queued = 0;

    for (const rawEvent of events) {
      const event = asRecord_(rawEvent);
      const data = asRecord_(event.data);
      const trackingNumber = data.tracking != null ? String(data.tracking) : '';
      if (!trackingNumber) continue;

      let stateName: string | null = null;
      if (type === 'parcel_status_updated') {
        stateName = data.status != null ? String(data.status) : null;
      } else if (type === 'parcel_payment_updated') {
        stateName = data.status != null ? `payment:${String(data.status)}` : 'payment:updated';
      } else if (type === 'parcel_created') {
        stateName = 'parcel_created';
      } else if (type === 'parcel_edited') {
        stateName = 'parcel_edited';
      } else if (type === 'parcel_deleted') {
        stateName = 'parcel_deleted';
      } else {
        stateName = type || null;
      }

      await queuePendingUpdate_(
        pool,
        'yalidine',
        trackingNumber,
        stateName,
        null,
        { type, event },
      );
      queued += 1;
    }

    return reply.send({ ok: true, queued });
  };

  app.post('/webhooks/yalidine', yalidinePostHandler);
  app.post('/webhooks/guepex', yalidinePostHandler);
}
