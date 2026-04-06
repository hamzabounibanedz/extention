import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sendOrdersBulk, syncTrackingBulk } from './service.js';

async function withMockFetch_(
  impl: (...args: any[]) => Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = impl;
  try {
    await run();
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
}

describe('shipments tracking sync', () => {
  it('sends Yalidine parcels without calling territory endpoints first', async () => {
    const urls: string[] = [];
    await withMockFetch_(
      async (url: any, init?: any) => {
        urls.push(String(url));
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        const orderId = body?.[0]?.order_id || 'ORDER-1';
        return new Response(
          JSON.stringify({
            [orderId]: {
              success: true,
              order_id: orderId,
              tracking: 'yal-ORDER-1',
              import_id: 42,
              label: 'https://guepex.app/label/yal-ORDER-1',
              message: '',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await sendOrdersBulk(
          {
            carrier: 'yalidine',
            orders: [
              {
                rowIndex: 19,
                orderId: 'ORDER-1',
                customerFirstName: 'Ali',
                customerLastName: 'Ben',
                phone1: '0550123456',
                address: 'Cite Kaidi',
                commune: 'Bordj El Kiffan',
                wilaya: 'Alger',
                codeWilaya: 16,
                fromWilayaName: 'Batna',
                toWilayaName: 'Alger',
                toCommuneName: 'Bordj El Kiffan',
                totalPrice: 2400,
                productName: 'Machine a cafe',
                quantity: 1,
                deliveryMode: 'home',
                deliveryType: 'home',
              },
            ],
            credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
            businessSettings: { senderWilaya: 'Batna' },
          },
          { pool: null },
        );
        assert.equal(r.ok, true);
        assert.equal(r.successCount, 1);
      },
    );
    assert.equal(urls.some((u) => u.includes('/wilayas/')), false);
    assert.equal(urls.some((u) => u.includes('/communes/')), false);
    assert.equal(urls.some((u) => u.includes('/parcels/')), true);
  });

  it('batches Yalidine tracking lookups into one carrier call per chunk', async () => {
    let fetchCount = 0;
    let capturedUrl = '';
    await withMockFetch_(
      async (url: any) => {
        fetchCount += 1;
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            has_more: false,
            data: [
              { tracking: 'yal-1', last_status: 'Centre', date_last_status: '2026-04-06 10:00:00' },
              { tracking: 'yal-2', last_status: 'Livré', date_last_status: '2026-04-06 11:00:00' },
              { tracking: 'yal-3', last_status: 'En livraison', date_last_status: '2026-04-06 12:00:00' },
            ],
            links: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await syncTrackingBulk({
          carrier: 'yalidine',
          trackingNumbers: ['yal-1', 'yal-2', 'yal-3'],
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
        });
        assert.equal(r.ok, true);
        assert.equal(r.foundCount, 3);
      },
    );
    assert.equal(fetchCount, 1);
    assert.ok(capturedUrl.includes('tracking=yal-1%2Cyal-2%2Cyal-3'));
  });

  it('batches ZR tracking lookups into one search request', async () => {
    let fetchCount = 0;
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        fetchCount += 1;
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            items: [
              { trackingNumber: 'TRK-1', state: { name: 'en_transit', color: '#1A73E8' } },
              { trackingNumber: 'TRK-2', state: { name: 'livre', color: '#137333' } },
              { trackingNumber: 'TRK-3', state: { name: 'returned', color: '#C5221F' } },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await syncTrackingBulk({
          carrier: 'zr',
          trackingNumbers: ['TRK-1', 'TRK-2', 'TRK-3'],
          credentials: { tenantId: 'tenant', secretKey: 'secret' },
        });
        assert.equal(r.ok, true);
        assert.equal(r.foundCount, 3);
      },
    );
    assert.equal(fetchCount, 1);
    assert.equal(capturedBody?.advancedSearch?.field, 'trackingNumber');
    assert.equal(capturedBody?.advancedSearch?.keyword, 'TRK-1,TRK-2,TRK-3');
  });
});
