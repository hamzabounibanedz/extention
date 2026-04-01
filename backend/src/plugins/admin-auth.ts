import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';

function secretsMatch(expected: string, provided: string): boolean {
  const eh = createHash('sha256').update(expected, 'utf8').digest();
  const ph = createHash('sha256').update(provided, 'utf8').digest();
  return timingSafeEqual(eh, ph);
}

/**
 * When {@link Env.adminSecret} is set, `/admin/*` requires header `X-Admin-Secret: <secret>`.
 * Routes are not registered when the secret is unset (see main).
 */
export async function registerAdminAuth(app: FastifyInstance, env: Env): Promise<void> {
  const expected = env.adminSecret;
  if (!expected) {
    return;
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0] ?? request.url;
    if (!url.startsWith('/admin/')) {
      return;
    }

    const raw = request.headers['x-admin-secret'];
    const provided = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';

    if (!secretsMatch(expected, provided)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' });
    }
  });
}
