import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Env } from '../../config/env.js';
import {
  hashClientIdentity,
  normalizeLicenseExpiry,
  resolveLicenseInMemory,
} from './service.js';

function env_(over: Partial<Env>): Env {
  return {
    nodeEnv: 'test',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: undefined,
    licensePepper: undefined,
    apiKey: undefined,
    activationCodes: ['DEV-KEY-A'],
    trialDays: 7,
    licenseSigningSecret: undefined,
    jwtSecret: undefined,
    adminSecret: undefined,
    corsOrigin: undefined,
    zrWebhookSecret: undefined,
    trialDailyShipmentLimit: 0,
    ...over,
  };
}

describe('resolveLicenseInMemory', () => {
  it('returns active yearly plan when activation code matches', () => {
    const r = resolveLicenseInMemory(env_({}), { activationCode: 'DEV-KEY-A' });
    assert.equal(r.licenseStatus, 'active');
    assert.equal(r.planName, 'yearly');
    assert.ok(r.subscriptionEnd);
    assert.equal(r.licenseKey, 'DEV-KEY-A');
  });

  it('returns trial when code does not match', () => {
    const r = resolveLicenseInMemory(env_({}), { activationCode: 'wrong' });
    assert.equal(r.licenseStatus, 'trial');
    assert.equal(r.planName, 'trial');
    assert.ok(r.trialEnd);
  });

  it('returns trial when no code', () => {
    const r = resolveLicenseInMemory(env_({}), {});
    assert.equal(r.licenseStatus, 'trial');
  });
});

describe('normalizeLicenseExpiry', () => {
  it('marks active as expired when subscription end is past', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = normalizeLicenseExpiry({
      licenseKey: 'K',
      licenseStatus: 'active',
      trialStart: null,
      trialEnd: null,
      subscriptionEnd: past,
      customerEmail: null,
      planName: 'yearly',
    });
    assert.equal(r.licenseStatus, 'expired');
  });

  it('marks trial as expired when trial end is past', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = normalizeLicenseExpiry({
      licenseKey: null,
      licenseStatus: 'trial',
      trialStart: null,
      trialEnd: past,
      subscriptionEnd: null,
      customerEmail: null,
      planName: 'trial',
    });
    assert.equal(r.licenseStatus, 'expired');
  });

  it('leaves future trial unchanged', () => {
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    const r = normalizeLicenseExpiry({
      licenseKey: null,
      licenseStatus: 'trial',
      trialStart: new Date().toISOString(),
      trialEnd: future,
      subscriptionEnd: null,
      customerEmail: null,
      planName: 'trial',
    });
    assert.equal(r.licenseStatus, 'trial');
  });
});

describe('hashClientIdentity', () => {
  it('is stable for the same email and pepper', () => {
    const a = hashClientIdentity('User@Example.com', 'pepper');
    const b = hashClientIdentity('user@example.com', 'pepper');
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('differs when pepper changes', () => {
    const a = hashClientIdentity('a@b.co', 'p1');
    const b = hashClientIdentity('a@b.co', 'p2');
    assert.notEqual(a, b);
  });
});
