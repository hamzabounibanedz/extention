/**
 * License / subscription state returned by the backend and cached client-side.
 */
export type LicenseStatus =
  | 'trial'
  | 'active'
  | 'pending_activation'
  | 'expired'
  | 'revoked'
  | 'invalid';

export interface LicenseRecord {
  licenseKey: string | null;
  licenseStatus: LicenseStatus;

  trialStart: string | null;
  trialEnd: string | null;
  subscriptionEnd: string | null;

  customerEmail: string | null;
  planName: string | null;

  /**
   * Set on license status/activation endpoints (e.g. POST /v1/license/status or /v1/license/activate)
   * when the backend has `LICENSE_SIGNING_SECRET`.
   * Send as `X-DT-Access-Token` on `/v1/shipments/*` calls.
   */
  accessToken?: string | null;
}
