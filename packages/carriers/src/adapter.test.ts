import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoestAdapter } from './noest/adapter.js';
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

/** NOEST bulk send pre-fetches communes and verifies returned trackings; mock the default happy path. */
function noestWrapFetchForBulk_(impl: (url: string, init?: any) => Promise<Response>) {
  return async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes('/api/public/get/communes/')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('/api/public/get/trackings/info')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const trackings = Array.isArray(body.trackings) ? body.trackings : [];
      const rows: Record<string, unknown> = {};
      for (const tracking of trackings) {
        rows[String(tracking)] = {
          OrderInfo: { tracking: String(tracking) },
          activity: [{ event_key: 'customer_validation', event: 'Validated' }],
        };
      }
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return impl(u, init);
  };
}

describe('carrier adapters', () => {
  it('NOEST rejects send without token/guid', async () => {
    const a = new NoestAdapter();
    const r = await a.createShipment({
      order: {} as never,
      credentials: {},
    });
    assert.equal(r.ok, false);
    assert.ok(String(r.errorMessage || '').toLowerCase().includes('credentials'));
  });

  it('NOEST strips Bearer prefix from api_token before Authorization header', async () => {
    const a = new NoestAdapter();
    let capturedHeaders: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedHeaders = init?.headers || {};
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T1' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'Bearer abc-token-value', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF00001',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(String(capturedHeaders?.Authorization || ''), 'Bearer abc-token-value');
  });

  it('NOEST bulk create sends expected payload + bearer auth', async () => {
    const a = new NoestAdapter();
    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (url: any, init?: any) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers || {};
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            success: true,
            passed: {
              0: { success: true, tracking: 'NOEST-TRK-1' },
            },
            failed: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-00001',
              customer: { name: 'Ahmed', phone: { number1: '+213550000000' } },
              address: 'Rue 1',
              amount: 3500,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
        assert.equal(r.successes[0]?.trackingNumber, 'NOEST-TRK-1');
        assert.ok(String(r.successes[0]?.labelUrl || '').includes('/api/public/get/order/label'));
      },
    );
    assert.ok(capturedUrl.includes('/api/public/create/orders'));
    assert.equal(String(capturedHeaders?.Authorization || ''), 'Bearer TOK-1');
    assert.equal(capturedBody?.user_guid, 'GUID-1');
    assert.equal(Array.isArray(capturedBody?.orders), true);
    assert.equal(capturedBody?.orders?.[0]?.wilaya_id, 16);
    assert.equal(capturedBody?.orders?.[0]?.stop_desk, 0);
    // phone normalized to 0xxxxxxxxx
    assert.equal(String(capturedBody?.orders?.[0]?.phone || '').startsWith('0'), true);
  });

  it('NOEST bulk create accepts array-shaped passed/failed (HTTP 200)', async () => {
    const a = new NoestAdapter();
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        return new Response(
          JSON.stringify({
            success: true,
            passed: [{ success: true, tracking: 'NOEST-ARR-1' }],
            failed: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-ARR-1',
              customer: { name: 'Ahmed', phone: { number1: '+213550000000' } },
              address: 'Rue 1',
              amount: 3500,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
        assert.equal(r.successes[0]?.trackingNumber, 'NOEST-ARR-1');
      },
    );
  });

  it('NOEST bulk create unwraps data.passed when nested', async () => {
    const a = new NoestAdapter();
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        return new Response(
          JSON.stringify({
            data: {
              success: true,
              passed: { 0: { success: true, tracking: 'NOEST-NEST-1' } },
              failed: {},
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-NEST',
              customer: { name: 'Ahmed', phone: { number1: '+213550000000' } },
              address: 'Rue 1',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.successes[0]?.trackingNumber, 'NOEST-NEST-1');
      },
    );
  });

  it('NOEST maps Arabic wilaya-capital commune to French label for wilaya 19', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T-SF' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'ORD-5491',
              customer: { name: 'Mohamed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 2200,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 19,
              commune: 'سطيف',
            },
          ],
        });
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.commune, 'Sétif');
  });

  it('NOEST maps Arabic Jijel commune to the canonical wilaya 18 label', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T-JIJEL' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'ORD-5354',
              customer: { name: 'Houcine', phone: { number1: '0771787477' } },
              address: 'Jijel',
              amount: 3100,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'Mini termo' }],
              wilayaId: 18,
              commune: '\u062c\u064a\u062c\u0644',
            },
          ],
        });
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.commune, 'Jijel');
  });

  it('NOEST fetchAllHubs maps desks to pickup station codes by wilaya', async () => {
    const a = new NoestAdapter();
    let capturedUrl = '';
    const hubs = await (async () => {
      let result: any[] = [];
      await withMockFetch_(
        async (url: any) => {
          capturedUrl = String(url);
          return new Response(
            JSON.stringify({
              '16A': {
                code: '16A',
                name: 'Alger',
                address: 'Bureau Alger',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        },
        async () => {
          result = await a.fetchAllHubs!({ apiToken: 'TOK-1', userGuid: 'GUID-1' });
        },
      );
      return result;
    })();
    assert.ok(capturedUrl.includes('/api/public/desks'));
    assert.equal(hubs[0]?.id, '16A');
    assert.equal(hubs[0]?.isPickupPoint, true);
    assert.equal(hubs[0]?.cityTerritoryId, '16');
  });

  it('NOEST stop desk create sends station_code and does not require commune', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    let communeLookupCalled = false;
    await withMockFetch_(
      async (url: any, init?: any) => {
        if (String(url).includes('/api/public/get/communes/')) {
          communeLookupCalled = true;
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).includes('/api/public/get/trackings/info')) {
          return new Response(
            JSON.stringify({ 'T-SD': { OrderInfo: { tracking: 'T-SD' }, activity: [] } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T-SD' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-SD1',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 1500,
              deliveryType: 'pickup-point',
              stopDeskId: '16A',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
      },
    );
    assert.equal(communeLookupCalled, false);
    assert.equal(capturedBody?.orders?.[0]?.stop_desk, 1);
    assert.equal(capturedBody?.orders?.[0]?.station_code, '16A');
    assert.equal(capturedBody?.orders?.[0]?.wilaya_id, 16);
    assert.equal(capturedBody?.orders?.[0]?.commune, undefined);
  });

  it('NOEST stop desk create omits Arabic commune even when the sheet provides one', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/public/desks')) {
          return new Response(
            JSON.stringify({
              '02A': { code: '02A', name: 'Chlef' },
              '28A': { code: '28A', name: 'M Sila' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('/api/public/create/orders')) {
          capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
          return new Response(
            JSON.stringify({
              success: true,
              passed: { 0: { success: true, tracking: 'T-CHLEF' } },
              failed: {},
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('/api/public/get/trackings/info')) {
          return new Response(JSON.stringify({ T_CHLEF: { OrderInfo: { tracking: 'T-CHLEF' } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected URL ${u}`);
      },
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'ORD-5437',
              customer: { name: 'Mohamed Ali', phone: { number1: '0775254576' } },
              address: 'Chlef',
              amount: 1350,
              deliveryType: 'pickup-point',
              orderedProducts: [{ productName: 'Mini termo' }],
              wilayaId: 2,
              commune: '\u0627\u0644\u0634\u0644\u0641',
              stopDeskId: '02A',
            },
          ],
        });
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.stop_desk, 1);
    assert.equal(capturedBody?.orders?.[0]?.station_code, '02A');
    assert.equal(capturedBody?.orders?.[0]?.wilaya_id, 2);
    assert.equal(capturedBody?.orders?.[0]?.commune, undefined);
    assert.equal(capturedBody?.orders?.[0]?.zip_code, undefined);
  });

  it('NOEST bulk create validates created tracking numbers by default', async () => {
    const a = new NoestAdapter();
    const urls: string[] = [];
    const bodies: any[] = [];
    await withMockFetch_(
      noestWrapFetchForBulk_(async (url: any, init?: any) => {
        urls.push(String(url));
        bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        if (String(url).includes('/api/public/valid/orders')) {
          return new Response(
            JSON.stringify({ success: true, passed: { 'NOEST-TRK-1': true }, failed: {} }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            passed: { 0: { success: true, tracking: 'NOEST-TRK-1' } },
            failed: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          parcels: [
            {
              externalId: 'REF-00001',
              customer: { name: 'Ahmed', phone: { number1: '0550000000' } },
              address: 'Rue 1',
              amount: 3500,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
      },
    );
    assert.ok(urls.some((u) => u.includes('/api/public/create/orders')));
    assert.ok(urls.some((u) => u.includes('/api/public/valid/orders')));
    assert.deepEqual(bodies[bodies.length - 1], {
      user_guid: 'GUID-1',
      trackings: ['NOEST-TRK-1'],
    });
  });

  it('NOEST does not mark auto-validated creates as sent until validation is visible in tracking info', async () => {
    const a = new NoestAdapter();
    let r: Awaited<ReturnType<NoestAdapter['bulkCreateParcels']>>;
    await withMockFetch_(
      async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/public/get/communes/')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/api/public/valid/orders')) {
          return new Response(
            JSON.stringify({ success: true, passed: { 'NOEST-PENDING-VALIDATION': true }, failed: {} }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('/api/public/get/trackings/info')) {
          return new Response(
            JSON.stringify({
              'NOEST-PENDING-VALIDATION': {
                OrderInfo: { tracking: 'NOEST-PENDING-VALIDATION' },
                activity: [{ event_key: 'upload', event: 'Uploaded to system' }],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            passed: { 0: { success: true, tracking: 'NOEST-PENDING-VALIDATION' } },
            failed: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          parcels: [
            {
              externalId: 'REF-PENDING',
              customer: { name: 'Ahmed', phone: { number1: '0550000000' } },
              address: 'Rue 1',
              amount: 3500,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(r!.successCount, 0);
    assert.equal(r!.failureCount, 1);
    assert.equal(r!.failures[0]?.errorCode, 'VALIDATION_NOT_CONFIRMED');
    assert.equal(r!.failures[0]?.trackingNumber, 'NOEST-PENDING-VALIDATION');
  });

  it('NOEST searchParcels calls get/trackings/info with trackings array', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            'TRK-1': {
              OrderInfo: { montant: '3500.00', stop_desk: 0, created_at: '2026-04-06T10:00:00.000000Z' },
              activity: [{ event_key: 'livre', date: '2026-04-07 11:00:00' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.searchParcels({
          body: { trackings: ['TRK-1'] },
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
        });
        assert.equal(r.httpStatus, 200);
        assert.equal(r.items.length, 1);
        assert.equal(r.items[0]?.stateName, 'livre');
      },
    );
    assert.deepEqual(capturedBody, { trackings: ['TRK-1'] });
  });

  it('NOEST maps type_id 2 when hasExchange and montant 0 for type_id 3', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T1' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF00001',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 5000,
              deliveryType: 'home',
              hasExchange: true,
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.type_id, 2);
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T2' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF00002',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 9999,
              deliveryType: 'home',
              noestTypeId: 3,
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.type_id, 3);
    assert.equal(capturedBody?.orders?.[0]?.montant, 0);
  });

  it('NOEST auto-prefixes short references instead of failing', async () => {
    const a = new NoestAdapter();
    let capturedBody: any = null;
    await withMockFetch_(
      noestWrapFetchForBulk_(async (_url: any, init?: any) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T-REF' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: '5470',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 5000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
      },
    );
    assert.equal(capturedBody?.orders?.[0]?.reference, 'ORD-5470');
  });

  it('NOEST pre-validation reports original sheet row number', async () => {
    const a = new NoestAdapter();
    const r = await a.bulkCreateParcels({
      credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
      businessSettings: { autoValidateNoest: false, noestResolveCommunesFromApi: false },
      parcels: [
        {
          rowIndex: 125,
          externalId: '5470',
          customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
          address: '',
          amount: 5000,
          deliveryType: 'home',
          orderedProducts: [{ productName: 'P1' }],
          wilayaId: 16,
          commune: 'Bab Ezzouar',
        },
      ],
    });
    assert.equal(r.successCount, 0);
    assert.equal(r.failureCount, 1);
    assert.ok(String(r.failures[0]?.errorMessage || '').includes('row 125'));
  });

  it('NOEST sends zip_code from communes API when sheet commune matches official nom', async () => {
    const a = new NoestAdapter();
    let capturedCreate: any = null;
    await withMockFetch_(
      async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/public/get/communes/5')) {
          return new Response(
            JSON.stringify([
              { nom: 'Batna', wilaya_id: 5, code_postal: '05001', is_active: 1 },
              { nom: 'Merouana', wilaya_id: 5, code_postal: '05004', is_active: 1 },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('/api/public/get/communes/')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/api/public/get/trackings/info')) {
          return new Response(
            JSON.stringify({ 'T-ZIP': { OrderInfo: { tracking: 'T-ZIP' }, activity: [] } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        capturedCreate = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'T-ZIP' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-ZIP',
              customer: { name: 'Ahmed', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P1' }],
              wilayaId: 5,
              commune: 'batna',
            },
          ],
        });
      },
    );
    assert.equal(capturedCreate?.orders?.[0]?.zip_code, '05001');
    assert.equal(capturedCreate?.orders?.[0]?.wilaya_id, undefined);
    assert.equal(capturedCreate?.orders?.[0]?.commune, undefined);
  });

  it('NOEST bulk surfaces Laravel-style failed row with field labels', async () => {
    const a = new NoestAdapter();
    let r: Awaited<ReturnType<NoestAdapter['bulkCreateParcels']>>;
    await withMockFetch_(
      noestWrapFetchForBulk_(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            passed: {
              0: { success: true, tracking: 'TRK-OK' },
            },
            failed: {
              1: {
                reference: 'REF-BAD',
                phone: ['The phone field is required.'],
                commune: ['The selected commune is invalid.'],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
      async () => {
        r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'A1',
              customer: { name: 'A', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
            {
              externalId: 'A2',
              customer: { name: 'B', phone: { number1: '0550123457' } },
              address: 'Rue 2',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(r!.successCount, 1);
    assert.equal(r!.failureCount, 1);
    assert.equal(r!.successes[0]?.trackingNumber, 'TRK-OK');
    const msg = String(r!.failures.find((f) => f.index === 1)?.errorMessage || '');
    assert.ok(msg.includes('commune:'), msg);
    assert.ok(msg.includes('phone:'), msg);
  });

  it('NOEST marks returned tracking as failed when tracking info cannot find it', async () => {
    const a = new NoestAdapter();
    let r: Awaited<ReturnType<NoestAdapter['bulkCreateParcels']>>;
    await withMockFetch_(
      async (url: any) => {
        const u = String(url);
        if (u.includes('/api/public/get/communes/')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/api/public/get/trackings/info')) {
          return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(
          JSON.stringify({ success: true, passed: { 0: { success: true, tracking: 'TRK-MISSING' } }, failed: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        r = await a.bulkCreateParcels({
          credentials: { apiToken: 'TOK-1', userGuid: 'GUID-1' },
          businessSettings: { autoValidateNoest: false },
          parcels: [
            {
              externalId: 'REF-MISSING',
              customer: { name: 'A', phone: { number1: '0550123456' } },
              address: 'Rue 1',
              amount: 1000,
              deliveryType: 'home',
              orderedProducts: [{ productName: 'P' }],
              wilayaId: 16,
              commune: 'Bab Ezzouar',
            },
          ],
        });
      },
    );
    assert.equal(r!.successCount, 0);
    assert.equal(r!.failureCount, 1);
    assert.equal(r!.failures[0]?.errorCode, 'TRACKING_NOT_FOUND');
    assert.equal(r!.failures[0]?.trackingNumber, 'TRK-MISSING');
  });

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

  it('Yalidine bulk create accepts array-shaped success response (aligned with request order)', async () => {
    const a = new YalidineAdapter();
    await withMockFetch_(
      async (_url: any, init?: any) => {
        const body = init?.body ? JSON.parse(String(init.body)) : [];
        const orderId = body?.[0]?.order_id || 'ORDER-ARRAY-1';
        return new Response(
          JSON.stringify([
            {
              success: true,
              order_id: orderId,
              tracking: 'yal-ARRAY-OK',
              import_id: 99,
              label: 'https://guepex.app/label/yal-ARRAY-OK',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      async () => {
        const r = await a.bulkCreateParcels({
          credentials: { apiId: 'API-ID-1', apiToken: 'API-TOKEN-1' },
          parcels: [
            {
              order_id: 'ORDER-ARRAY-1',
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
        assert.equal(r.successCount, 1);
        assert.equal(r.failureCount, 0);
        assert.equal(r.successes[0]?.trackingNumber, 'yal-ARRAY-OK');
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
