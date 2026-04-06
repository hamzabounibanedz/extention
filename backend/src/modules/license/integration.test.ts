import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Env } from '../../config/env.js';
import { normalizeLicenseExpiry, resolveLicenseInMemory } from './service.js';

function envStub(over: Partial<Env> = {}): Env {
  return {
    nodeEnv: 'test',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: undefined,
    licensePepper: undefined,
    apiKey: undefined,
    activationCodes: ['DLV-TEST-KEY'],
    trialDays: 7,
    licenseSigningSecret: undefined,
    jwtSecret: undefined,
    adminSecret: undefined,
    corsOrigin: undefined,
    zrWebhookSecret: undefined,
    yalidineWebhookSecret: undefined,
    trialDailyShipmentLimit: 0,
    ...over,
  };
}

describe('license integration-style behaviour (local, no DB)', () => {
  it('treats known activation code as active subscription when no DB', () => {
    const env = envStub();
    const r = resolveLicenseInMemory(env, { activationCode: 'DLV-TEST-KEY' });
    assert.equal(r.licenseStatus, 'active');
    assert.ok(r.subscriptionEnd);
  });

  it('marks expired subscription as expired via normalizeLicenseExpiry', () => {
    const past = new Date(Date.now() - 2 * 86400000).toISOString();
    const r = normalizeLicenseExpiry({
      licenseKey: 'X',
      licenseStatus: 'active',
      trialStart: null,
      trialEnd: null,
      subscriptionEnd: past,
      customerEmail: 'user@example.com',
      planName: 'standard',
    });
    assert.equal(r.licenseStatus, 'expired');
  });
});

