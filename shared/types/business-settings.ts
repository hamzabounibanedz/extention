export interface BusinessSettings {
  /** Display/business name used as sender name. */
  businessName: string;
  /** Sender phone (e.g., Algerian mobile). */
  phone: string;
  /** Sender address line(s). */
  address: string;
  /** Sender wilaya name. */
  wilaya: string;
  /** Sender wilaya code (1..58). */
  wilayaCode: number;
  /** Sender commune name. */
  commune: string;
  /** Default carrier id/name chosen in the add-on. */
  defaultCarrier: string;
  /** Optional pickup point id when deliveryType=pickup-point (legacy: stopdesk). */
  stopDeskId: string | null;
  // Required by carrier adapters (e.g. Yalidine) for parcel + sender details.
  senderWilaya: string;
  senderWilayaCode: number;
  senderAddress: string;
  defaultParcelWeight: number; // kg
  defaultParcelLength: number; // cm
  defaultParcelWidth: number; // cm
  defaultParcelHeight: number; // cm
}

