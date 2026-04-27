export type {
  AdapterCredentials,
  BulkCreateFailure,
  BulkCreateParcelsInput,
  BulkCreateParcelsResult,
  BulkCreateSuccess,
  CarrierAdapter,
  CarrierId,
  CreateShipmentInput,
  CreateShipmentResult,
  HubRecord,
  ParcelStatus,
  SearchParcelsInput,
  SearchParcelsResult,
  TestConnectionResult,
  TerritoryRecord,
  TrackingInput,
  TrackingResult,
} from './core/carrier-adapter.js';

export { NoestAdapter } from './noest/index.js';
export { YalidineAdapter } from './yalidine/index.js';
export { ZrAdapter } from './zr/index.js';
export {
  getCarrierAdapter,
  getCarrierAdapterOrThrow,
  listCarriers,
  listCarrierIds,
  UnknownCarrierError,
} from './registry.js';
