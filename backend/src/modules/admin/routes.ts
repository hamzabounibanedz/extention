import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type { Env } from '../../config/env.js';
import { insertAdminLicenseCode, listAdminLicenseCodes } from './codes.js';
import { activateLicenseByEmail, hashClientIdentity } from '../license/service.js';

const issueBodySchema = {
  type: 'object',
  properties: {
    googleEmail: { type: 'string' },
    durationDays: { type: 'number' },
    notes: { type: 'string' },
  },
  additionalProperties: false,
} as const;

function normalizeAdminEmail_(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

function normalizeDurationDays_(raw: unknown): number {
  const durationDays = Number(raw ?? 365);
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 3650) {
    return NaN;
  }
  return Math.floor(durationDays);
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  env: Env,
  pool: Pool | null,
): Promise<void> {
  if (!pool) {
    return;
  }

  app.post<{ Body: { durationDays?: number; notes?: string; googleEmail?: string } }>(
    '/admin/v1/licenses/activate-email',
    {
      schema: {
        body: issueBodySchema,
      },
    },
    async (request, reply) => {
      const durationDays = normalizeDurationDays_(request.body?.durationDays);
      if (!Number.isFinite(durationDays)) {
        return reply.code(400).send({ error: 'invalid_duration_days', code: 'INVALID_DURATION_DAYS' });
      }
      const normalizedGoogleEmail = normalizeAdminEmail_(request.body?.googleEmail);
      if (!normalizedGoogleEmail || !normalizedGoogleEmail.includes('@')) {
        return reply.code(400).send({ error: 'invalid_google_email', code: 'INVALID_GOOGLE_EMAIL' });
      }
      if (!env.licensePepper) {
        return reply
          .code(500)
          .send({ error: 'license_pepper_required', code: 'LICENSE_PEPPER_REQUIRED' });
      }

      const activatedBy = hashClientIdentity(normalizedGoogleEmail, env.licensePepper);
      const { row } = await insertAdminLicenseCode(pool, {
        durationDays,
        notes: request.body?.notes ?? null,
        activatedBy,
      });
      const record = await activateLicenseByEmail(pool, { email: normalizedGoogleEmail }, env);
      return reply.code(201).send({
        id: row.id,
        googleEmail: normalizedGoogleEmail,
        createdAt: new Date(row.created_at).toISOString(),
        durationDays: row.duration_days,
        notes: row.notes,
        activatedAt: record.licenseStatus === 'active' ? new Date().toISOString() : null,
        revoked: false,
        status: record.licenseStatus === 'active' ? 'active' : record.licenseStatus,
        subscriptionEnd: record.subscriptionEnd,
      });
    },
  );

  app.get<{ Querystring: { limit?: string; search?: string } }>(
    '/admin/v1/email-activations',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const lim = request.query.limit != null ? Number(request.query.limit) : 50;
      const safeLimit = Number.isFinite(lim) ? Math.min(500, Math.max(1, Math.floor(lim))) : 50;
      const searchRaw =
        request.query.search != null ? String(request.query.search).trim().toLowerCase() : '';
      const whereParts: string[] = [];
      const params: unknown[] = [];
      if (searchRaw) {
        if (!env.licensePepper) {
          return reply
            .code(500)
            .send({ error: 'license_pepper_required', code: 'LICENSE_PEPPER_REQUIRED' });
        }
        const activatedBy = hashClientIdentity(searchRaw, env.licensePepper);
        params.push(activatedBy, searchRaw);
        whereParts.push(
          `(c.activated_by = $${params.length - 1}
             OR (l.google_email IS NOT NULL AND POSITION($${params.length} IN LOWER(l.google_email)) > 0))`,
        );
      }
      params.push(safeLimit);

      const result = await pool.query<{
        id: string;
        created_at: Date;
        duration_days: number;
        notes: string | null;
        code_revoked: boolean;
        code_revoked_at: Date | null;
        activated_at: Date | null;
        google_email: string | null;
        license_revoked: boolean | null;
        license_revoked_at: Date | null;
        expires_at: Date | null;
      }>(
        `SELECT
           c.id,
           c.created_at,
           c.duration_days,
           c.notes,
           c.revoked AS code_revoked,
           c.revoked_at AS code_revoked_at,
           c.activated_at,
           l.google_email,
           l.revoked AS license_revoked,
           l.revoked_at AS license_revoked_at,
           l.expires_at
         FROM dt_admin_license_code c
         LEFT JOIN dt_license l ON l.code_id = c.id
         ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
         ORDER BY c.created_at DESC
         LIMIT $${params.length}`,
        params,
      );
      const now = Date.now();
      return reply.send({
        items: result.rows.map((row) => {
          const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
          const revoked = !!row.code_revoked || !!row.license_revoked;
          const status = revoked
            ? 'revoked'
            : expiresAt && Date.parse(expiresAt) <= now
              ? 'expired'
              : row.activated_at
                ? 'active'
                : 'pending';
          return {
            id: row.id,
            googleEmail: row.google_email,
            createdAt: new Date(row.created_at).toISOString(),
            durationDays: row.duration_days,
            notes: row.notes,
            activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
            revoked,
            revokedAt: row.license_revoked_at
              ? new Date(row.license_revoked_at).toISOString()
              : row.code_revoked_at
                ? new Date(row.code_revoked_at).toISOString()
                : null,
            subscriptionEnd: expiresAt,
            status,
          };
        }),
      });
    },
  );

  app.post<{ Body: { durationDays?: number; notes?: string; googleEmail?: string } }>(
    '/admin/v1/license-codes',
    {
      schema: {
        body: issueBodySchema,
      },
    },
    async (request, reply) => {
      const durationDays = normalizeDurationDays_(request.body?.durationDays);
      if (!Number.isFinite(durationDays)) {
        return reply.code(400).send({ error: 'invalid_duration_days', code: 'INVALID_DURATION_DAYS' });
      }
      const normalizedGoogleEmail = normalizeAdminEmail_((request.body as any)?.googleEmail);
      let activatedBy: string | null = null;
      if (normalizedGoogleEmail) {
        if (!normalizedGoogleEmail.includes('@')) {
          return reply.code(400).send({ error: 'invalid_google_email', code: 'INVALID_GOOGLE_EMAIL' });
        }
        if (!env.licensePepper) {
          return reply
            .code(500)
            .send({ error: 'license_pepper_required', code: 'LICENSE_PEPPER_REQUIRED' });
        }
        activatedBy = hashClientIdentity(normalizedGoogleEmail, env.licensePepper);
      }
      const { code, row } = await insertAdminLicenseCode(pool, {
        durationDays,
        notes: request.body?.notes ?? null,
        activatedBy,
      });
      let responseRow = row;
      if (normalizedGoogleEmail) {
        // Direct email activation flow: issuing a code bound to an email
        // instantly activates that email without sharing the code.
        await activateLicenseByEmail(pool, { email: normalizedGoogleEmail }, env);
        const refreshed = await pool.query<{
          id: string;
          code: string;
          created_at: Date;
          duration_days: number;
          notes: string | null;
          revoked: boolean;
          revoked_at: Date | null;
          activated_by: string | null;
          activated_at: Date | null;
        }>(
          `SELECT id, code, created_at, duration_days, notes, revoked, revoked_at, activated_by, activated_at
           FROM dt_admin_license_code
           WHERE id = $1
           LIMIT 1`,
          [row.id],
        );
        if (refreshed.rows[0]) {
          responseRow = refreshed.rows[0];
        }
      }
      return reply.code(201).send({
        code,
        id: responseRow.id,
        createdAt: new Date(responseRow.created_at).toISOString(),
        durationDays: responseRow.duration_days,
        notes: responseRow.notes,
        activatedAt: responseRow.activated_at ? new Date(responseRow.activated_at).toISOString() : null,
        revoked: responseRow.revoked,
        status: responseRow.revoked ? 'revoked' : responseRow.activated_at ? 'active' : 'pending',
        boundToEmail: normalizedGoogleEmail || null,
      });
    },
  );

  app.get<{ Querystring: { limit?: string; search?: string } }>(
    '/admin/v1/license-codes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const lim = request.query.limit != null ? Number(request.query.limit) : 50;
      const searchRaw =
        request.query.search != null ? String(request.query.search).trim().toLowerCase() : '';
      let activatedBy: string | null = null;
      if (searchRaw) {
        if (!env.licensePepper) {
          return reply
            .code(500)
            .send({ error: 'license_pepper_required', code: 'LICENSE_PEPPER_REQUIRED' });
        }
        activatedBy = hashClientIdentity(searchRaw, env.licensePepper);
      }
      const rows = await listAdminLicenseCodes(pool, Number.isFinite(lim) ? lim : 50, {
        activatedBy,
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          code: row.code,
          createdAt: new Date(row.created_at).toISOString(),
          durationDays: row.duration_days,
          notes: row.notes,
          activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : null,
          activatedBy: row.activated_by ? `${row.activated_by.slice(0, 10)}…` : null,
          revoked: row.revoked,
          revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
          status: row.revoked ? 'revoked' : row.activated_at ? 'active' : 'pending',
        })),
      };
    },
  );

  // GET /admin/v1/clients — list all clients
  app.get('/admin/v1/clients', async (request, reply) => {
    const q = (request as any).query as { search?: string };
    const search = q?.search?.trim();
    const pepper = env.licensePepper;
    if (!pepper) {
      return reply.code(500).send({ error: 'license_pepper_required' });
    }

    let sql =
      `SELECT
         user_email_hmac,
         google_email,
         revoked,
         activated_at,
         expires_at,
         plan
       FROM dt_license`;
    const params: unknown[] = [];
    if (search) {
      const normalized = search.toLowerCase();
      const h = hashClientIdentity(normalized, pepper);
      sql +=
        ' WHERE user_email_hmac = $1 OR (google_email IS NOT NULL AND POSITION($2 IN LOWER(google_email)) > 0)';
      params.push(h, normalized);
    }
    sql += ' ORDER BY activated_at DESC NULLS LAST LIMIT 200';

    const result = await pool.query(sql, params);
    return reply.send({ clients: result.rows });
  });

  // GET /admin/v1/trials — recent trial activations/entitlements
  app.get<{ Querystring: { limit?: string; search?: string } }>(
    '/admin/v1/trials',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const lim = request.query.limit != null ? Number(request.query.limit) : 200;
      const safeLimit = Number.isFinite(lim) ? Math.min(1000, Math.max(1, lim)) : 200;
      const searchRaw =
        request.query.search != null ? String(request.query.search).trim().toLowerCase() : '';

      const whereParts: string[] = [];
      const params: unknown[] = [];
      if (searchRaw) {
        if (!env.licensePepper) {
          return reply
            .code(500)
            .send({ error: 'license_pepper_required', code: 'LICENSE_PEPPER_REQUIRED' });
        }
        const hashed = hashClientIdentity(searchRaw, env.licensePepper);
        params.push(hashed);
        params.push(searchRaw);
        whereParts.push(
          `(t.user_email_hmac = $${params.length - 1}
             OR (l.google_email IS NOT NULL AND POSITION($${params.length} IN LOWER(l.google_email)) > 0))`,
        );
      }
      params.push(safeLimit);

      const sql =
        `SELECT
           t.user_email_hmac,
           t.spreadsheet_id,
           t.created_at,
           t.expires_at,
           t.used,
           l.google_email
         FROM dt_trial_entitlement t
         LEFT JOIN dt_license l ON l.user_email_hmac = t.user_email_hmac` +
        (whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '') +
        ` ORDER BY t.created_at DESC
          LIMIT $${params.length}`;

      const result = await pool.query(sql, params);
      const now = Date.now();
      return reply.send({
        items: result.rows.map((row) => {
          const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString() : null;
          const expired = expiresAt ? Date.parse(expiresAt) <= now : false;
          const used = !!row.used;
          return {
            userEmailHmac: row.user_email_hmac ? String(row.user_email_hmac) : null,
            googleEmail: row.google_email ? String(row.google_email) : null,
            spreadsheetId: row.spreadsheet_id ? String(row.spreadsheet_id) : null,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
            expiresAt,
            used,
            status: used ? 'used' : expired ? 'expired' : 'trial',
          };
        }),
      });
    },
  );

  // POST /admin/v1/licenses/extend  { email, days? }
  app.post('/admin/v1/licenses/extend', async (request, reply) => {
    const body = (request as any).body as { email?: string; days?: number };
    const email = body?.email?.trim().toLowerCase();
    const pepper = env.licensePepper;
    const days = Number.isFinite(body?.days) ? Number(body?.days) : 365;
    if (!email) {
      return reply.code(400).send({ error: 'email required' });
    }
    if (!pepper) {
      return reply.code(500).send({ error: 'license_pepper_required' });
    }

    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return reply.code(400).send({ error: 'invalid days' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const licRes = await client.query(
        `UPDATE dt_license
         SET expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + ($2 || ' days')::interval,
             revoked = FALSE,
             revoked_at = NULL,
             google_email = COALESCE(google_email, $3)
         WHERE user_email_hmac = $1
         RETURNING expires_at`,
        [hashClientIdentity(email, pepper), String(days), email],
      );
      if (licRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ ok: false, error: 'license_not_found' });
      }

      await client.query(
        `UPDATE dt_admin_license_code
         SET revoked = FALSE,
             revoked_at = NULL
         WHERE activated_by = $1
           AND revoked = TRUE`,
        [hashClientIdentity(email, pepper)],
      );

      await client.query('COMMIT');
      return reply.send({ ok: true, updated: licRes.rowCount });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      request.log.error({ err }, 'Failed to extend license');
      return reply.code(500).send({ ok: false, error: 'extend_failed' });
    } finally {
      client.release();
    }
  });

  // POST /admin/v1/licenses/revoke  { email }
  app.post('/admin/v1/licenses/revoke', async (request, reply) => {
    const body = (request as any).body as { email?: string };
    const email = body?.email?.trim().toLowerCase();
    const pepper = env.licensePepper;
    if (!email) {
      return reply.code(400).send({ error: 'email required' });
    }
    if (!pepper) {
      return reply.code(500).send({ error: 'license_pepper_required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userEmailHmac = hashClientIdentity(email, pepper);
      const licRes = await client.query(
        `UPDATE dt_license
         SET revoked = TRUE,
             revoked_at = NOW(),
             google_email = COALESCE(google_email, $2)
         WHERE user_email_hmac = $1`,
        [userEmailHmac, email],
      );
      if (licRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ ok: false, error: 'license_not_found' });
      }

      await client.query(
        `UPDATE dt_admin_license_code
         SET revoked = TRUE,
             revoked_at = NOW()
         WHERE activated_by = $1`,
        [userEmailHmac],
      );

      await client.query('COMMIT');
      return reply.send({ ok: true, updated: licRes.rowCount });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      request.log.error({ err }, 'Failed to revoke license');
      return reply.code(500).send({ ok: false, error: 'revoke_failed' });
    } finally {
      client.release();
    }
  });

  // GET /admin/v1/stats
  app.get('/admin/v1/stats', async (_request, reply) => {
    const statusRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE revoked = FALSE AND expires_at > NOW()) AS active,
         COUNT(*) FILTER (WHERE revoked = FALSE AND expires_at <= NOW()) AS expired,
         COUNT(*) FILTER (WHERE revoked = TRUE) AS revoked,
         COUNT(*) AS total
       FROM dt_license`,
    );
    const trialsRes = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE expires_at > NOW() AND used = FALSE) AS trial_count FROM dt_trial_entitlement`,
    );
    const deliveredRes = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (
           WHERE LOWER(COALESCE(state_name, '')) LIKE '%livr%'
              OR LOWER(COALESCE(state_name, '')) LIKE '%deliver%'
         ) AS delivered
       FROM dt_pending_update`,
    );
    const active = Number(statusRes.rows[0]?.active ?? 0);
    const expired = Number(statusRes.rows[0]?.expired ?? 0);
    const revoked = Number(statusRes.rows[0]?.revoked ?? 0);
    const total = Number(statusRes.rows[0]?.total ?? 0);
    const trial = Number(trialsRes.rows[0]?.trial_count ?? 0);
    const delivered = Number(deliveredRes.rows[0]?.delivered ?? 0);
    const trackedTotal = Number(deliveredRes.rows[0]?.total ?? 0);

    return reply.send({
      active,
      expired,
      revoked,
      trial,
      total,
      ratios: {
        activeRatio: total > 0 ? active / total : 0,
        expiredRatio: total > 0 ? expired / total : 0,
        revokedRatio: total > 0 ? revoked / total : 0,
        deliveredRatio: trackedTotal > 0 ? delivered / trackedTotal : 0,
      },
    });
  });
}
