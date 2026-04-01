import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { Env } from '../config/env.js';
import type { VerifiedShipmentAccess } from '../modules/license/access-token.js';
import { verifyShipmentAccessToken } from '../modules/license/access-token.js';
import { resolveLicenseByHashedIdentity } from '../modules/license/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    dtShipmentAccess?: VerifiedShipmentAccess;
  }
}

/**
 * When {@link Env.licenseSigningSecret} is set, shipment routes require `X-DT-Access-Token`
 * from {@link issueShipmentAccessToken} (returned by license status/activation endpoints).
 * When a DB pool is configured and the token carries a customer email, each request also
 * revalidates the current license state so that revocations take effect quickly.
 */
export async function registerShipmentAccessTokenAuth(
  app: FastifyInstance,
  env: Env,
  pool: Pool | null,
): Promise<void> {
  const secret = env.licenseSigningSecret;
  if (!secret) {
    return;
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    let path = request.url.split('?')[0] ?? '';
    if (path.length > 1) {
      path = path.replace(/\/+$/, '');
    }
    if (path !== '/v1/shipments/send' && path !== '/v1/shipments/tracking') {
      return;
    }

    const headerRaw = request.headers['x-dt-access-token'];
    const token =
      typeof headerRaw === 'string'
        ? headerRaw.trim()
        : Array.isArray(headerRaw)
          ? String(headerRaw[0] ?? '').trim()
          : '';

    if (!token) {
      return reply.code(401).send({
        message: "Jeton d'accès requis — validez la licence dans l'add-on (carte Licence).",
      });
    }

    const verified = verifyShipmentAccessToken(token, secret);
    if (!verified) {
      return reply.code(401).send({ message: "Jeton d'accès invalide ou expiré — renouvelez la validation." });
    }

    // Trial entitlements are fully represented inside the token itself and have no
    // corresponding row in dt_license. For trials we therefore trust the verified
    // token (short-lived, signed, expiry-checked) and skip any DB lookup.
    if (verified.licenseStatus === 'trial') {
      request.dtShipmentAccess = verified;
      return;
    }

    // When a DB is available, re-check only long-lived subscriptions in dt_license
    // using the HMAC identity carried in the token.
    if (pool && verified.userEmailHmac) {
      try {
        const record = await resolveLicenseByHashedIdentity(pool, verified.userEmailHmac);

        // No stored subscription for this identity.
        if (!record) {
          if (verified.licenseStatus === 'trial') {
            request.dtShipmentAccess = verified;
            return;
          }
          return reply
            .code(403)
            .send({ message: "Licence introuvable — validez la licence dans l'add-on." });
        }

        if (
          record.licenseStatus === 'revoked' ||
          record.licenseStatus === 'expired' ||
          record.licenseStatus === 'invalid'
        ) {
          return reply
            .code(403)
            .send({ message: "Licence révoquée ou expirée — contactez le support pour réactiver." });
        }

        request.dtShipmentAccess = verified;
        return;
      } catch {
        return reply
          .code(500)
          .send({ message: 'Erreur de vérification de licence — réessayez plus tard ou contactez le support.' });
      }
    }

    // No DB available – trust the verified token.
    request.dtShipmentAccess = verified;
  });
}
