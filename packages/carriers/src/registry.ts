import type { CarrierAdapter } from './core/carrier-adapter.js';
import { NoestAdapter } from './noest/adapter.js';
import { YalidineAdapter } from './yalidine/adapter.js';
import { ZrAdapter } from './zr/adapter.js';

const adapters: CarrierAdapter[] = [new YalidineAdapter(), new ZrAdapter(), new NoestAdapter()];

const byId = new Map<string, CarrierAdapter>(
  adapters.map((a) => [a.id.toLowerCase(), a]),
);

export class UnknownCarrierError extends Error {
  public readonly carrierId: string;
  constructor(carrierId: string) {
    super(`Unknown carrier: ${carrierId}`);
    this.carrierId = carrierId;
  }
}

export function getCarrierAdapterOrThrow(carrierId: string): CarrierAdapter {
  const id = String(carrierId).trim().toLowerCase();
  const a = byId.get(id);
  if (!a) {
    throw new UnknownCarrierError(carrierId);
  }
  return a;
}

export function listCarriers(): Array<{ id: string; displayName: string }> {
  return adapters.map((a) => ({ id: a.id, displayName: a.displayName }));
}

export function listCarrierIds(): string[] {
  return adapters.map((a) => a.id);
}

/**
 * Legacy helper kept for compatibility. Prefer {@link getCarrierAdapterOrThrow}.
 */
export function getCarrierAdapter(carrierId: string): CarrierAdapter | undefined {
  try {
    return getCarrierAdapterOrThrow(carrierId);
  } catch {
    return undefined;
  }
}
