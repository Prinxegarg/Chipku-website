import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCatalog } from '../src/lib/catalog/build.ts';
import { createTabSource } from '../src/lib/catalog/source.ts';
import { toClientCatalog } from '../src/lib/catalog/index.ts';
import { onRequestPost as createOrder } from '../functions/api/checkout/order.ts';
import { onRequestGet as getConfig } from '../functions/api/checkout/config.ts';
import type { ClientCatalog } from '../src/lib/types.ts';

let live: ClientCatalog;
const customer = { name: 'Asha Rao', phone: '98765 43210', email: 'asha@example.com', line1: '12 MG Road', line2: '', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
const env = { CHECKOUT_ENABLED: 'true', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'secret' };

beforeAll(async () => {
  const preview = toClientCatalog(await buildCatalog(await createTabSource()));
  // Simulate a published live catalogue with a configured flat shipping fee.
  live = { ...preview, mode: 'live', settings: { ...preview.settings, shippingFee: 4900 } };
});

function ctx(body: unknown, catalog = live, extraEnv = {}) {
  return {
    request: new Request('https://chipku.test/api/checkout/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { ...env, ...extraEnv, ASSETS: { fetch: async () => new Response(JSON.stringify(catalog)) } },
    waitUntil: () => undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/checkout/order', () => {
  it('charges the server-computed amount (Buy 2 Get 3 + shipping)', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: 'order_test1', amount: 18700, currency: 'INR' }));
    });
    const res = await createOrder(ctx({ lines: [{ productId: 'PST-0001', variantId: 'PST-0001-default', qty: 5 }], customer, expectedTotal: 2 * 6900 + 4900 }) as never);
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('https://api.razorpay.com/v1/orders');
    expect(calls[0].body.amount).toBe(2 * 6900 + 4900);
    const notes = calls[0].body.notes as Record<string, string>;
    expect(Object.keys(notes).length).toBeLessThanOrEqual(15);
    for (const v of Object.values(notes)) expect(v.length).toBeLessThanOrEqual(256);
    expect(notes.phone).toBe('9876543210');
    expect(notes.items_1).toContain('3 free');
  });

  it('rejects a stale browser total', async () => {
    const res = await createOrder(ctx({ lines: [{ productId: 'PST-0001', variantId: 'PST-0001-default', qty: 1 }], customer, expectedTotal: 100 }) as never);
    expect(res.status).toBe(409);
  });

  it('rejects unavailable options', async () => {
    const res = await createOrder(ctx({ lines: [{ productId: 'PST-0004', variantId: 'PST-0004-B', qty: 1 }], customer }) as never);
    expect(res.status).toBe(409);
  });

  it('validates the delivery details', async () => {
    const res = await createOrder(ctx({ lines: [{ productId: 'PST-0001', variantId: 'PST-0001-default', qty: 1 }], customer: { ...customer, pincode: '12' } }) as never);
    expect(res.status).toBe(422);
  });

  it('stays closed for the preview catalogue or without the switch', async () => {
    const preview = { ...live, mode: 'preview' as const };
    expect((await createOrder(ctx({ lines: [], customer }, preview) as never)).status).toBe(503);
    const cfg = await getConfig(ctx({}, live, { CHECKOUT_ENABLED: 'false' }) as never);
    expect(await cfg.json()).toMatchObject({ enabled: false });
  });
});
