/**
 * Shipping fee rules stored per spreadsheet (DocumentProperties JSON).
 * Mirrors Apps Script FeeApi.gs.
 */
export type CarrierFeeRule = {
  default: number;
  wilaya: Record<string, number>;
};

export type FeeRulesBlob = {
  schemaVersion: number;
  carriers: Record<string, CarrierFeeRule>;
};
