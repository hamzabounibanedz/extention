import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { YalidineAdapter } from './yalidine/adapter.js';
import { ZrAdapter } from './zr/adapter.js';

describe('stub adapters', () => {
  it('Yalidine rejects send without apiKey', async () => {
    const a = new YalidineAdapter();
    const r = await a.createShipment({
      order: {} as never,
      credentials: {},
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').includes('clé'));
  });

  it('Yalidine returns stub message when apiKey present', async () => {
    const a = new YalidineAdapter();
    const r = await a.createShipment({
      order: {} as never,
      credentials: { apiKey: 'x' },
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').includes('brancher'));
  });

  it('ZR rejects tracking without credentials', async () => {
    const a = new ZrAdapter();
    const r = await a.getTracking({
      externalShipmentId: '1',
      credentials: {},
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').includes('manquante'));
  });
});
