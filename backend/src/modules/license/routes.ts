import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type { Env as AppEnv } from '../../config/env.js';
import { hashShipmentUsageSubject, issueShipmentAccessToken } from './access-token.js';
import {
  activateLicenseCode,
  hashClientIdentity,
  resolveLicenseInMemory,
  resolveLicenseWithPool,
} from './service.js';

const statusBodySchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: { type: 'string' },
    spreadsheetId: { type: 'string' },
  },
  additionalProperties: false,
} as const;

const activateBodySchema = {
  type: 'object',
  required: ['code', 'email'],
  properties: {
    code: { type: 'string' },
    email: { type: 'string' },
  },
  additionalProperties: false,
} as const;

export async function registerLicenseRoutes(
  app: FastifyInstance,
  env: AppEnv,
  pool: Pool | null,
): Promise<void> {
  app.post<{ Body: { email: string; spreadsheetId?: string } }>(
    '/v1/license/status',
    {
      schema: {
        body: statusBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
          400: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const emailRaw = String(request.body?.email ?? '').trim();
      if (!emailRaw) {
        return reply.code(400).send({ error: 'email_required', code: 'EMAIL_REQUIRED' });
      }
      const record = await resolveLicenseWithPool(pool, env, {
        clientEmail: emailRaw,
        spreadsheetId: request.body?.spreadsheetId ?? null,
      });
      if (!env.licenseSigningSecret) return reply.send(record as any);

      const usageSub =
        emailRaw && env.licenseSigningSecret ? hashShipmentUsageSubject(emailRaw, env.licenseSigningSecret) : null;
      const userEmailHmac =
        env.licensePepper && emailRaw ? hashClientIdentity(emailRaw, env.licensePepper) : null;
      const accessToken = issueShipmentAccessToken(
        record,
        env.licenseSigningSecret,
        usageSub,
        userEmailHmac,
      );
      let daysRemaining: number | null = null;
      if ((record as any).trialEnd) {
        daysRemaining = Math.max(
          0,
          Math.ceil((new Date((record as any).trialEnd as string).getTime() - Date.now()) / 86400000),
        );
      }
      return reply.send({ ...(record as any), accessToken: accessToken ?? null, daysRemaining });
    },
  );

  app.post<{ Body: { code: string; email: string } }>(
    '/v1/license/activate',
    {
      schema: {
        body: activateBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
          400: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (req, reply) => {
      const code = String(req.body?.code ?? '').trim().toUpperCase();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      if (!code || !email) {
        return reply.code(400).send({
          error: 'code_and_email_required',
          code: 'CODE_AND_EMAIL_REQUIRED',
        });
      }
      if (!pool) {
        const record = resolveLicenseInMemory(env, { activationCode: code, clientEmail: email });
        if (record.licenseStatus !== 'active') {
          return reply.code(400).send({
            error: 'activation_failed',
            code: 'ACTIVATION_FAILED',
            message: 'activation_failed',
          });
        }
        if (!env.licenseSigningSecret) {
          return reply.send(record as any);
        }
        const usageSub = hashShipmentUsageSubject(email, env.licenseSigningSecret);
        const userEmailHmac =
          env.licensePepper && email ? hashClientIdentity(email, env.licensePepper) : null;
        const accessToken = issueShipmentAccessToken(
          record,
          env.licenseSigningSecret,
          usageSub,
          userEmailHmac,
        );
        return reply.send({ ...(record as any), accessToken: accessToken ?? null });
      }
      try {
        const record = await activateLicenseCode(pool, { code, email }, env);
        if (!env.licenseSigningSecret) {
          return reply.send(record as any);
        }
        const usageSub = hashShipmentUsageSubject(email, env.licenseSigningSecret);
        const userEmailHmac =
          env.licensePepper && email ? hashClientIdentity(email, env.licensePepper) : null;
        const accessToken = issueShipmentAccessToken(
          record,
          env.licenseSigningSecret,
          usageSub,
          userEmailHmac,
        );
        return reply.send({ ...(record as any), accessToken: accessToken ?? null });
      } catch (e: any) {
        return reply.code(400).send({
          error: 'activation_failed',
          code: 'ACTIVATION_FAILED',
          message: e?.message || 'activation_failed',
        });
      }
    },
  );

  // Backward-compat endpoint kept for old clients that still call /validate.
  app.post('/v1/license/validate', async (req, reply) => {
    const body = (req as any).body as { activationCode?: string; clientEmail?: string; spreadsheetId?: string };
    const code = String(body?.activationCode ?? '').trim();
    const email = String(body?.clientEmail ?? '')
      .trim()
      .toLowerCase();
    if (code) {
      if (!email) {
        return reply.code(400).send({ error: 'email_required', code: 'EMAIL_REQUIRED' });
      }
      if (!pool) {
        const record = resolveLicenseInMemory(env, { activationCode: code.toUpperCase(), clientEmail: email });
        if (record.licenseStatus !== 'active') {
          return reply.code(400).send({
            error: 'activation_failed',
            code: 'ACTIVATION_FAILED',
            message: 'activation_failed',
          });
        }
        if (!env.licenseSigningSecret) {
          return reply.send(record as any);
        }
        const usageSub = hashShipmentUsageSubject(email, env.licenseSigningSecret);
        const userEmailHmac =
          env.licensePepper && email ? hashClientIdentity(email, env.licensePepper) : null;
        const accessToken = issueShipmentAccessToken(
          record,
          env.licenseSigningSecret,
          usageSub,
          userEmailHmac,
        );
        return reply.send({ ...(record as any), accessToken: accessToken ?? null });
      }
      try {
        const record = await activateLicenseCode(pool, { code: code.toUpperCase(), email }, env);
        if (!env.licenseSigningSecret) {
          return reply.send(record as any);
        }
        const usageSub = hashShipmentUsageSubject(email, env.licenseSigningSecret);
        const userEmailHmac =
          env.licensePepper && email ? hashClientIdentity(email, env.licensePepper) : null;
        const accessToken = issueShipmentAccessToken(
          record,
          env.licenseSigningSecret,
          usageSub,
          userEmailHmac,
        );
        return reply.send({ ...(record as any), accessToken: accessToken ?? null });
      } catch (e: any) {
        return reply.code(400).send({
          error: 'activation_failed',
          code: 'ACTIVATION_FAILED',
          message: e?.message || 'activation_failed',
        });
      }
    }
    if (!email) {
      return reply.code(400).send({ error: 'email_required', code: 'EMAIL_REQUIRED' });
    }
    const record = await resolveLicenseWithPool(pool, env, {
      clientEmail: email,
      spreadsheetId: body?.spreadsheetId ?? null,
    });
    const usageSub =
      env.licenseSigningSecret && email ? hashShipmentUsageSubject(email, env.licenseSigningSecret) : null;
    const userEmailHmac = env.licensePepper && email ? hashClientIdentity(email, env.licensePepper) : null;
    const accessToken = env.licenseSigningSecret
      ? issueShipmentAccessToken(record, env.licenseSigningSecret, usageSub, userEmailHmac)
      : null;
    let daysRemaining: number | null = null;
    if ((record as any).trialEnd) {
      daysRemaining = Math.max(
        0,
        Math.ceil(
          (new Date((record as any).trialEnd as string).getTime() - Date.now()) / 86400000,
        ),
      );
    }
    return reply.send({ ...(record as any), accessToken: accessToken ?? null, daysRemaining });
  });
}
