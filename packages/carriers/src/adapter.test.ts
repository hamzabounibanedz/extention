import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { YalidineAdapter } from './yalidine/adapter.js';
import { ZrAdapter } from './zr/adapter.js';

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

describe('carrier adapters', () => {
  it('Yalidine rejects send without API ID/TOKEN', async () => {
    const a = new YalidineAdapter();
    const r = await a.createShipment({
      order: {} as never,
      credentials: {},
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').toLowerCase().includes('credentials'));
  });

  it('Yalidine createShipment sends Guepex-compatible payload', async () => {
    const a = new YalidineAdapter();
    let capturedBody: any = null;
    let capturedHeaders: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedHeaders = init?.headers || {};
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        const orderId = capturedBody?.[0]?.order_id || 'ORDER-1';
        return new Response(
          JSON.stringify({
            [orderId]: {
              success: true,
              order_id: orderId,
              tracking: 'yal-ABC123',
              import_id: 42,
              label: 'https://guepex.app/label/yal-ABC123',
              message: '',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.createShipment({
          order: {
            customerFirstName: 'Ali',
            customerLastName: 'Ben',
            phone: '0550123456',
            address: 'Cite Kaidi',
            wilaya: 'Alger',
            commune: 'Bordj El Kiffan',
            productName: 'Machine a cafe',
            codAmount: 2400,
            quantity: 1,
            deliveryType: 'pickup-point',
            stopDeskId: '163001',
          } as never,
          businessSettings: {
            senderWilaya: 'Batna',
            defaultParcelLength: 30,
            defaultParcelWidth: 20,
            defaultParcelHeight: 10,
            defaultParcelWeight: 6,
          },
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
        });
        assert.equal(r.ok, true);
        assert.equal(r.trackingNumber, 'yal-ABC123');
        assert.equal(r.labelUrl, 'https://guepex.app/label/yal-ABC123');
      },
    );
    assert.equal(capturedHeaders?.['X-API-ID'], 'API-ID-1');
    assert.equal(capturedHeaders?.['X-API-TOKEN'], 'API-TOKEN-1');
    assert.equal(Array.isArray(capturedBody), true);
    assert.equal(capturedBody?.[0]?.is_stopdesk, true);
    assert.equal(capturedBody?.[0]?.stopdesk_id, 163001);
  });

  it('Yalidine createShipment falls back sender wilaya from order', async () => {
    const a = new YalidineAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        const orderId = capturedBody?.[0]?.order_id || 'ORDER-2';
        return new Response(
          JSON.stringify({
            [orderId]: {
              success: true,
              order_id: orderId,
              tracking: 'yal-XYZ999',
              import_id: 84,
              label: 'https://guepex.app/label/yal-XYZ999',
              message: '',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.createShipment({
          order: {
            customerFirstName: 'Test',
            customerLastName: 'User',
            phone: '0550123456',
            address: 'Centre Ville',
            wilaya: 'Djelfa',
            commune: 'Djelfa',
            productName: 'Item',
            codAmount: 1500,
            quantity: 1,
            deliveryType: 'home',
          } as never,
          businessSettings: {},
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
        });
        assert.equal(r.ok, true);
      },
    );
    assert.equal(capturedBody?.[0]?.from_wilaya_name, 'Djelfa');
  });

  it('Yalidine bulk create surfaces quota text instead of generic 403', async () => {
    const a = new YalidineAdapter();
    await withMockFetch_(
      async () =>
        new Response('Quota API dépassé. Votre accès à l API est désactivé.', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' },
        }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
          parcels: [
            {
              order_id: 'ORDER-403',
              from_wilaya_name: 'Batna',
              firstname: 'Ali',
              familyname: 'Ben',
              contact_phone: '0550123456',
              address: 'Cite Kaidi',
              to_commune_name: 'Bordj El Kiffan',
              to_wilaya_name: 'Alger',
              product_list: 'Machine a cafe',
              price: 2400,
              do_insurance: false,
              declared_value: 2400,
              height: 10,
              width: 20,
              length: 30,
              weight: 6,
              freeshipping: false,
              is_stopdesk: false,
              has_exchange: false,
            },
          ],
        });
        assert.equal(r.successCount, 0);
        assert.equal(r.failureCount, 1);
        assert.ok(String(r.failures[0]?.errorMessage || '').includes('Quota API'));
      },
    );
  });

  it('Yalidine bulk create ignores [object Object] placeholders', async () => {
    const a = new YalidineAdapter();
    await withMockFetch_(
      async (_url: any, init?: any) => {
        const body = init?.body ? JSON.parse(String(init.body)) : [];
        const orderId = body?.[0]?.order_id || 'ORDER-PLACEHOLDER';
        return new Response(
          JSON.stringify({
            [orderId]: {
              success: false,
              order_id: orderId,
              message: '[object Object]',
              error: {
                detail: 'Commune not serviceable for this hub',
              },
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
          parcels: [
            {
              order_id: 'ORDER-PLACEHOLDER',
              from_wilaya_name: 'Batna',
              firstname: 'Ali',
              familyname: 'Ben',
              contact_phone: '0550123456',
              address: 'Cite Kaidi',
              to_commune_name: 'Bordj El Kiffan',
              to_wilaya_name: 'Alger',
              product_list: 'Machine a cafe',
              price: 2400,
              do_insurance: false,
              declared_value: 2400,
              height: 10,
              width: 20,
              length: 30,
              weight: 6,
              freeshipping: false,
              is_stopdesk: false,
              has_exchange: false,
            },
          ],
        });
        assert.equal(r.successCount, 0);
        assert.equal(r.failureCount, 1);
        const message = String(r.failures[0]?.errorMessage || '');
        assert.equal(message.includes('[object Object]'), false);
        assert.ok(message.includes('Commune not serviceable for this hub'));
      },
    );
  });

  it('Yalidine searchParcels batches multiple tracking numbers in one request', async () => {
    const a = new YalidineAdapter();
    let capturedUrl = '';
    await withMockFetch_(
      async (url: any) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            has_more: false,
            data: [
              { tracking: 'yal-1', last_status: 'Centre', date_last_status: '2026-04-06 10:00:00' },
              { tracking: 'yal-2', last_status: 'Livré', date_last_status: '2026-04-06 11:00:00' },
            ],
            links: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.searchParcels({
          body: { trackingNumbers: ['yal-1', 'yal-2'] },
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
        });
        assert.equal(r.httpStatus, 200);
        assert.equal(r.items.length, 2);
      },
    );
    assert.ok(capturedUrl.includes('tracking=yal-1%2Cyal-2'));
  });

  it('ZR rejects tracking without credentials', async () => {
    const a = new ZrAdapter();
    const r = await a.getTracking({
      externalShipmentId: '1',
      credentials: {},
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').includes('tenantId/secretKey'));
  });

  it('ZR bulk validation requires hubId for pickup-point', async () => {
    const a = new ZrAdapter();
    const r = await a.bulkCreateParcels({
      credentials: { tenantId: 'tenant', secretKey: 'secret' },
      parcels: [
        {
          customer: {
            customerId: 'c-1',
            name: 'Test Customer',
            phone: { number1: '+213550000000' },
          },
          deliveryType: 'pickup-point',
          description: 'desc',
          amount: 1200,
          externalId: 'ext-1',
          orderedProducts: [
            {
              productName: 'P1',
              unitPrice: 1200,
              quantity: 1,
              stockType: 'none',
            },
          ],
          // hubId intentionally missing
        },
      ],
    });
    assert.equal(r.successCount, 0);
    assert.equal(r.failureCount, 1);
    assert.ok(String(r.failures[0]?.errorMessage || '').includes('hubId'));
  });

  it('ZR bulk create flattens nested error objects', async () => {
    const a = new ZrAdapter();
    await withMockFetch_(
      async () =>
        new Response(
          JSON.stringify({
            successes: [],
            failures: [
              {
                index: 0,
                errorCode: 'VALIDATION_ERROR',
                errorMessage: {
                  message: 'Delivery address is invalid',
                },
              },
            ],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { tenantId: 'tenant', secretKey: 'secret' },
          parcels: [
            {
              customer: {
                customerId: 'c-2',
                name: 'Test Customer',
                phone: { number1: '+213550000000' },
              },
              deliveryType: 'pickup-point',
              hubId: 'HUB-1',
              description: 'desc',
              amount: 1200,
              externalId: 'ext-2',
              orderedProducts: [
                {
                  productName: 'P1',
                  unitPrice: 1200,
                  quantity: 1,
                  stockType: 'none',
                },
              ],
            },
          ],
        });
        assert.equal(r.successCount, 0);
        assert.equal(r.failureCount, 1);
        const message = String(r.failures[0]?.errorMessage || '');
        assert.ok(message.includes('Delivery address is invalid'));
        assert.equal(message.includes('[object Object]'), false);
      },
    );
  });

  it('ZR createShipment forwards stopDeskId as hubId', async () => {
    const a = new ZrAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            successes: [
              {
                index: 0,
                parcelId: 'PARCEL-1',
                trackingNumber: 'TRK-1',
                externalId: 'EXT-1',
              },
            ],
            failures: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.createShipment({
          order: {
            deliveryType: 'pickup-point',
            stopDeskId: 'HUB-99',
            customerFirstName: 'Ali',
            customerLastName: 'B',
            phone: '+213550000000',
            productName: 'Item',
            codAmount: 1500,
            quantity: 1,
            spreadsheetId: 'sheet-1',
            rowNumber: 2,
          } as never,
          credentials: { tenantId: 'tenant', secretKey: 'secret' },
        });
        assert.equal(r.ok, true);
      },
    );
    assert.equal(capturedBody?.parcels?.[0]?.deliveryType, 'pickup-point');
    assert.equal(capturedBody?.parcels?.[0]?.hubId, 'HUB-99');
  });

  it('ZR getTracking uses advancedSearch field/keyword shape', async () => {
    const a = new ZrAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            items: [
              {
                trackingNumber: 'TRK-200',
                state: { name: 'en_transit', color: '#1A73E8' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.getTracking({
          trackingNumber: 'TRK-200',
          credentials: { tenantId: 'tenant', secretKey: 'secret' },
        });
        assert.equal(r.ok, true);
      },
    );
    assert.deepEqual(capturedBody?.advancedSearch, {
      field: 'trackingNumber',
      keyword: 'TRK-200',
    });
    assert.equal(Array.isArray(capturedBody?.advancedSearch?.fields), false);
  });
});
