import type { CreateShipmentResult, TrackingResult } from './carrier-adapter.js';

/**
 * Shared behavior for carriers whose HTTP integration is not wired yet.
 * Callers always receive {@link CreateShipmentResult.ok} / {@link TrackingResult.ok} === false.
 */
export function getCredentialsApiKey(credentials?: Record<string, string>): string | null {
  // Locked per-carrier schemas:
  // - Yalidine: { apiKey } in the add-on UI, forwarded as `apiKey` here or as { apiId, apiToken } for HTTP wiring.
  // - ZR/Procolis: { id, token }
  const candidates = [
    credentials?.apiKey,
    credentials?.apiToken,
    credentials?.token,
    credentials?.apiId,
    credentials?.id,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var t = String(candidates[i] ?? '').trim();
    if (t) return t;
  }
  return null;
}

export function createShipmentNotWired(
  carrierLabel: string,
  credentials?: Record<string, string>,
): CreateShipmentResult {
  if (!getCredentialsApiKey(credentials)) {
    return {
      ok: false,
      errorMessage: `${carrierLabel} : ajoutez une clé API dans l’add-on (carte Clés transporteurs) ou attendez l’intégration HTTP.`,
    };
  }
  return {
    ok: false,
    errorMessage: `${carrierLabel} : intégration API à brancher (authentification + endpoint colis).`,
  };
}

export function getTrackingNotWired(
  carrierLabel: string,
  credentials?: Record<string, string>,
): TrackingResult {
  if (!getCredentialsApiKey(credentials)) {
    return {
      ok: false,
      errorMessage: `${carrierLabel} : clé API manquante (carte Clés transporteurs) ou suivi non implémenté.`,
    };
  }
  return {
    ok: false,
    errorMessage: `${carrierLabel} : suivi non implémenté.`,
  };
}
