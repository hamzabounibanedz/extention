import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';

/**
 * Compare API keys in constant time without leaking key length (hash both sides, then compare).
 */
function keysMatch(expected: string, provided: string): boolean {
  const eh = createHash('sha256').update(expected, 'utf8').digest();
  const ph = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(eh, ph);
}

/**
 * When {@link Env.apiKey} is set, all `/v1/*` routes require
 * `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 * Omit {@link Env.apiKey} in development to leave routes open.
 */
export async function registerApiKeyAuth(app: FastifyInstance, env: Env): Promise<void> {
  if (!env.apiKey) {
    return;
  }

  const expected = env.apiKey;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0] ?? request.url;

    if (!url.startsWith('/v1/')) {
      return;
    }

    const xRaw = request.headers['x-api-key'];
    const xKey = Array.isArray(xRaw) ? xRaw[0] : xRaw;
    const auth = request.headers.authorization;

    let provided = '';
    if (typeof xKey === 'string' && xKey.length > 0) {
      provided = xKey.trim();
    } else if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      provided = auth.slice(7).trim();
    }

    if (!keysMatch(expected, provided)) {
      return reply.code(401).send({ message: 'Non autorisé' });
    }
  });
}
