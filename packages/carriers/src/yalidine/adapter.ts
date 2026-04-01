import type {
  CarrierAdapter,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingInput,
  TrackingResult,
} from '../core/carrier-adapter.js';
import { createShipmentNotWired, getTrackingNotWired } from '../core/stub-adapter.js';

/**
 * Yalidine — Algerian carrier. HTTP integration to be wired to official API docs.
 */
export class YalidineAdapter implements CarrierAdapter {
  readonly id = 'yalidine';
  readonly displayName = 'Yalidine';

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    return createShipmentNotWired(this.displayName, input.credentials);
  }

  async getTracking(input: TrackingInput): Promise<TrackingResult> {
    return getTrackingNotWired(this.displayName, input.credentials);
  }
}
