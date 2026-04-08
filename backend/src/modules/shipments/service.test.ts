import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TerritoryRecord } from '@delivery-tool/carriers';

import {
  normalizeTextForTests,
  resolveTerritoriesForTests,
  sendOrdersBulk,
  syncTrackingBulk,
} from './service.js';

function makeTerritoryIndexForTests_(territories: TerritoryRecord[]) {
  const byId = new Map<string, TerritoryRecord>();
  const byCode = new Map<number, TerritoryRecord>();
  const byName = new Map<string, TerritoryRecord[]>();
  const communesByWilayaId = new Map<string, TerritoryRecord[]>();
  for (const t of territories) {
    byId.set(t.id, t);
    if (t.level === 'wilaya' && t.code != null) byCode.set(t.code, t);
    const nn = normalizeTextForTests(t.name);
    if (nn) {
      if (!byName.has(nn)) byName.set(nn, []);
      byName.get(nn)!.push(t);
    }
    if (t.level === 'commune' && t.parentId) {
      if (!communesByWilayaId.has(t.parentId)) communesByWilayaId.set(t.parentId, []);
      communesByWilayaId.get(t.parentId)!.push(t);
    }
  }
  return {
    atMs: Date.now(),
    byId,
    byCode,
    byName,
    communesByWilayaId,
  };
}

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

  it('sends NOEST parcels with wilaya_id and commune when codeWilaya is set', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;
    await withMockFetch_(
      async (url: any, init?: any) => {
        capturedUrl = String(url);
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            success: true,
            passed: { 0: { success: true, tracking: 'NOEST-TRK-1' } },
            failed: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await sendOrdersBulk(
          {
            carrier: 'noest',
            orders: [
              {
                rowIndex: 3,
                customerFirstName: 'Ali',
                customerLastName: 'Ben',
                phone1: '0550123456',
                address: 'Rue 1',
                commune: 'Bab Ezzouar',
                wilaya: 'Alger',
                codeWilaya: 16,
                totalPrice: 2400,
                productName: 'Item',
                quantity: 1,
                deliveryMode: 'home',
                deliveryType: 'home',
              },
            ],
            credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
            businessSettings: {},
          },
          { pool: null },
        );
        assert.equal(r.ok, true);
        assert.equal(r.successCount, 1);
      },
    );
    assert.ok(capturedUrl.includes('/api/public/create/orders'));
    assert.equal(capturedBody?.user_guid, 'GUID-1');
    assert.equal(capturedBody?.orders?.[0]?.wilaya_id, 16);
    assert.equal(capturedBody?.orders?.[0]?.commune, 'Bab Ezzouar');
  });

  it('rejects NOEST rows without wilaya code or zip_code', async () => {
    const r = await sendOrdersBulk(
      {
        carrier: 'noest',
        orders: [
          {
            rowIndex: 1,
            customerFirstName: 'Ali',
            customerLastName: 'Ben',
            phone1: '0550123456',
            address: 'Rue 1',
            commune: 'Bab Ezzouar',
            totalPrice: 2400,
            productName: 'Item',
            quantity: 1,
            deliveryMode: 'home',
            deliveryType: 'home',
          },
        ],
        credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
        businessSettings: {},
      },
      { pool: null },
    );
    assert.equal(r.ok, true);
    assert.equal(r.failureCount, 1);
    assert.ok(String(r.failures[0]?.errorMessage || '').includes('NOEST requires wilaya code'));
  });

  it('accepts NOEST 10-digit local phones (non +213 format)', async () => {
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            success: true,
            passed: { 0: { success: true, tracking: 'NOEST-TRK-2' } },
            failed: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await sendOrdersBulk(
          {
            carrier: 'noest',
            orders: [
              {
                rowIndex: 4,
                customerFirstName: 'Ali',
                customerLastName: 'Ben',
                // NOEST docs: 9-10 digits accepted
                phone1: '0211234567',
                address: 'Rue 1',
                commune: 'Bab Ezzouar',
                wilaya: 'Alger',
                codeWilaya: 16,
                totalPrice: 2400,
                productName: 'Item',
                quantity: 1,
                deliveryMode: 'home',
                deliveryType: 'home',
              },
            ],
            credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
            businessSettings: {},
          },
          { pool: null },
        );
        assert.equal(r.ok, true);
        assert.equal(r.successCount, 1);
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.phone, '0211234567');
  });

  it('coerces nested carrier failure objects into readable text', async () => {
    await withMockFetch_(
      async (url: any) => {
        var u = String(url || '');
        if (u.includes('/territories/search')) {
          return new Response(
            JSON.stringify({
              items: [],
              totalCount: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            successes: [],
            failures: [
              {
                index: 0,
                errorCode: 'VALIDATION_ERROR',
                errorMessage: {
                  message: 'Commune not serviceable for this hub',
                },
              },
            ],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await sendOrdersBulk(
          {
            carrier: 'zr',
            orders: [
              {
                rowIndex: 7,
                customerFirstName: 'Ali',
                customerLastName: 'Ben',
                phone1: '0550123456',
                address: 'Cite Kaidi',
                commune: 'Bordj El Kiffan',
                wilaya: 'Alger',
                totalPrice: 2400,
                productName: 'Machine a cafe',
                quantity: 1,
                deliveryMode: 'pickup-point',
                deliveryType: 'pickup-point',
                hubId: 'HUB-16',
              },
            ],
            credentials: { tenantId: 'tenant', secretKey: 'secret' },
            businessSettings: { senderWilaya: 'Batna' },
          },
          { pool: null },
        );
        assert.equal(r.ok, true);
        assert.equal(r.failureCount, 1);
        const message = String(r.failures[0]?.errorMessage || '');
        assert.ok(
          message.includes('Commune not serviceable') ||
            message.includes('VALIDATION_ERROR'),
        );
        assert.equal(message.includes('[object Object]'), false);
      },
    );
  });

  it('never returns [object Object] for Yalidine carrier failures', async () => {
    await withMockFetch_(
      async (_url: any, init?: any) => {
        const body = init?.body ? JSON.parse(String(init.body)) : [];
        const orderId = body?.[0]?.order_id || 'ORDER-YAL-FAIL';
        return new Response(
          JSON.stringify({
            [orderId]: {
              success: false,
              order_id: orderId,
              message: '[object Object]',
              error: {
                detail: 'Delivery address is invalid',
              },
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await sendOrdersBulk(
          {
            carrier: 'yalidine',
            orders: [
              {
                rowIndex: 19,
                orderId: 'ORDER-YAL-FAIL',
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
        assert.equal(r.failureCount, 1);
        const message = String(r.failures[0]?.errorMessage || '');
        assert.equal(message.includes('[object Object]'), false);
        assert.ok(message.trim().length > 0);
      },
    );
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

describe('resolveTerritories (ZR territory index)', () => {
  it('treats Arabic commune in wilaya column as commune when commune column does not match', () => {
    const wilaya: TerritoryRecord = {
      id: 'w-alger',
      code: 16,
      name: 'Alger',
      level: 'wilaya',
      parentId: null,
      postalCode: null,
      hasHomeDelivery: true,
      hasPickupPoint: true,
    };
    const commune: TerritoryRecord = {
      id: 'c-bab',
      code: null,
      name: 'Bab Ezzouar',
      level: 'commune',
      parentId: 'w-alger',
      postalCode: null,
      hasHomeDelivery: true,
      hasPickupPoint: true,
    };
    const index = makeTerritoryIndexForTests_([wilaya, commune]);
    const r = resolveTerritoriesForTests(index, 'باب الزوار', 'unrelated commune text', undefined);
    assert.ok(!('error' in r));
    assert.equal(r.districtTerritoryId, 'c-bab');
    assert.equal(r.cityTerritoryId, 'w-alger');
  });

  it('matches French commune name in wilaya column via fuzzy index when needed', () => {
    const wilaya: TerritoryRecord = {
      id: 'w-alger',
      code: 16,
      name: 'Alger',
      level: 'wilaya',
      parentId: null,
      postalCode: null,
      hasHomeDelivery: true,
      hasPickupPoint: true,
    };
    const commune: TerritoryRecord = {
      id: 'c-bab',
      code: null,
      name: 'Bab Ezzouar',
      level: 'commune',
      parentId: 'w-alger',
      postalCode: null,
      hasHomeDelivery: true,
      hasPickupPoint: true,
    };
    const index = makeTerritoryIndexForTests_([wilaya, commune]);
    const r = resolveTerritoriesForTests(index, 'bab ezzouar', 'x', undefined);
    assert.ok(!('error' in r));
    assert.equal(r.districtTerritoryId, 'c-bab');
  });
});
