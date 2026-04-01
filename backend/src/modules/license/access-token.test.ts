import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LicenseRecord } from '@delivery-tool/shared';

import {
  computeShipmentAccessExpiryMs,
  issueShipmentAccessToken,
  verifyShipmentAccessToken,
} from './access-token.js';

const SECRET = 'test-signing-secret-min-32-chars-long!!';

function trialRecord_(daysFromNow: number): LicenseRecord {
  const trialEnd = new Date(Date.now() + daysFromNow * 86400000).toISOString();
  return {
    licenseKey: null,
    licenseStatus: 'trial',
    trialStart: new Date().toISOString(),
    trialEnd,
    subscriptionEnd: null,
    customerEmail: null,
    planName: 'trial',
  };
}

describe('computeShipmentAccessExpiryMs', () => {
  it('returns null for expired status', () => {
    assert.equal(
      computeShipmentAccessExpiryMs({
        licenseKey: null,
        licenseStatus: 'expired',
        trialStart: null,
        trialEnd: null,
        subscriptionEnd: null,
        customerEmail: null,
        planName: 'trial',
      }),
      null,
    );
  });
});

describe('issueShipmentAccessToken + verifyShipmentAccessToken', () => {
  it('round-trips for trial', () => {
    const rec = trialRecord_(7);
    const tok = issueShipmentAccessToken(rec, SECRET);
    assert.ok(tok && tok.includes('.'));
    const v = verifyShipmentAccessToken(tok!, SECRET);
    assert.ok(v);
    assert.equal(v!.licenseStatus, 'trial');
    assert.equal(v!.planName, 'trial');
    assert.equal(v!.usageSub, null);
  });

  it('round-trips usage subject when provided', () => {
    const rec = trialRecord_(7);
    const sub = 'deadbeef';
    const tok = issueShipmentAccessToken(rec, SECRET, sub);
    const v = verifyShipmentAccessToken(tok!, SECRET);
    assert.ok(v);
    assert.equal(v!.usageSub, sub);
  });

  it('rejects wrong secret', () => {
    const tok = issueShipmentAccessToken(trialRecord_(7), SECRET);
    assert.equal(verifyShipmentAccessToken(tok!, 'wrong-secret'), null);
  });

  it('rejects tampered payload', () => {
    const tok = issueShipmentAccessToken(trialRecord_(7), SECRET);
    const [p, s] = tok!.split('.');
    const broken = p!.slice(0, -2) + 'xx' + '.' + s;
    assert.equal(verifyShipmentAccessToken(broken, SECRET), null);
  });
});
