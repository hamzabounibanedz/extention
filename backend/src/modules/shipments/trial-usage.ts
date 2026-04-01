import type { Pool } from 'pg';

/**
 * In-process fallback when Postgres is unavailable (single-instance deployments only).
 */
const memCounts = new Map<string, number>();

function utcPeriodStart_(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function utcPeriodEnd_(start: Date): Date {
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function memKey_(periodStartIso: string, subjectHash: string): string {
  return `${periodStartIso}\0${subjectHash}`;
}

type ConsumeResult = { ok: true } | { ok: false; message: string };

/**
 * Enforces {@link limit} successful reservation slots per UTC day for trial plans.
 * Each HTTP shipment call (send or tracking) should invoke this once before work.
 */
export async function tryConsumeTrialShipmentSlot(
  pool: Pool | null,
  limit: number,
  planName: string | null,
  userEmailHmac: string | null,
): Promise<ConsumeResult> {
  if (limit <= 0) {
    return { ok: true };
  }
  if (planName !== 'trial') {
    return { ok: true };
  }
  if (!userEmailHmac) {
    return { ok: true };
  }

  const periodStart = utcPeriodStart_();
  const periodEnd = utcPeriodEnd_(periodStart);
  const periodStartIso = periodStart.toISOString();

  if (!pool) {
    const key = memKey_(periodStartIso, userEmailHmac);
    const next = (memCounts.get(key) ?? 0) + 1;
    if (next > limit) {
      return {
        ok: false,
        message:
          "Quota d'essai journalier atteint pour les envois/suivi. Passez à une offre active ou réessayez demain (UTC).",
      };
    }
    memCounts.set(key, next);
    return { ok: true };
  }

  const msg =
    "Quota d'essai journalier atteint pour les envois/suivi. Passez à une offre active ou réessayez demain (UTC).";

  const up = await pool.query<{ shipments_sent: number }>(
    `INSERT INTO dt_shipment_quota (user_email_hmac, period_start, period_end, shipments_sent)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (user_email_hmac, period_start)
     DO UPDATE SET shipments_sent = dt_shipment_quota.shipments_sent + 1
     WHERE dt_shipment_quota.shipments_sent < $4
     RETURNING shipments_sent`,
    [userEmailHmac, periodStart, periodEnd, limit],
  );

  if (!up.rows[0]) {
    return { ok: false, message: msg };
  }

  return { ok: true };
}
