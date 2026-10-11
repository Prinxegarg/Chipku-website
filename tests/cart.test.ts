import { describe, expect, it } from 'vitest';
import { addToCart, emptyCart, priceCart, removeLine, sanitizeCart, setLineQty } from '../src/lib/cart.ts';
import type { ClientCatalog } from '../src/lib/types.ts';

const catalog: ClientCatalog = {
  mode: 'preview',
  version: 't',
  categories: [],
  imageTransformOrigins: [],
  settings: { maxQtyPerItem: 10, shippingFee: null, instagramUrl: '', instagramHandle: 'chipku_shop' },
  offers: {
    buyGet: [{ id: 'B1G1', label: 'Buy 1 Get 1', paid: 1, free: 1 }],
    buyGetEligibility: { productTypes: ['poster'], categoryIds: [], variantIds: [] },
    spend: null,
    increment: 100,
    freeItemRule: 'lowest_price',
    repeatPolicy: 'once',
  },
  products: [
    {
      id: 'P1', slug: 'p1', title: 'One', type: 'poster', categoryIds: [], trending: false, bestseller: false, isNew: false,
      sortOrder: 1, tags: [], images: [],
      variants: [
        { id: 'P1-A', optionName: 'Size', label: 'A', price: 6900, available: true },
        { id: 'P1-B', optionName: 'Size', label: 'B', price: 9900, available: false },
        { id: 'P1-C', optionName: 'Size', label: 'C', price: 9900, available: true, stock: 2 },
      ],
    },
  ],
};

describe('cart state', () => {
  it('merges identical product/variant lines and keeps different variants separate', () => {
    let s = emptyCart();
    s = addToCart(s, { productId: 'P1', variantId: 'P1-A', qty: 1, unitPrice: 6900, maxQty: 10 }).state;
    s = addToCart(s, { productId: 'P1', variantId: 'P1-A', qty: 2, unitPrice: 6900, maxQty: 10 }).state;
    s = addToCart(s, { productId: 'P1', variantId: 'P1-C', qty: 1, unitPrice: 9900, maxQty: 2 }).state;
    expect(s.lines.map((l) => [l.variantId, l.qty])).toEqual([
      ['P1-A', 3],
      ['P1-C', 1],
    ]);
  });

  it('caps quantity at the limit and reports it', () => {
    const r = addToCart(emptyCart(), { productId: 'P1', variantId: 'P1-C', qty: 5, unitPrice: 9900, maxQty: 2 });
    expect(r.line.qty).toBe(2);
    expect(r.capped).toBe(true);
  });

  it('removes a line when quantity is set to zero', () => {
    let s = addToCart(emptyCart(), { productId: 'P1', variantId: 'P1-A', qty: 1, unitPrice: 6900, maxQty: 10 }).state;
    s = setLineQty(s, 'P1::P1-A', 0, 10);
    expect(s.lines).toHaveLength(0);
    s = addToCart(s, { productId: 'P1', variantId: 'P1-A', qty: 1, unitPrice: 6900, maxQty: 10 }).state;
    expect(removeLine(s, 'P1::P1-A').lines).toHaveLength(0);
  });

  it('rejects malformed stored data', () => {
    expect(sanitizeCart('nope').lines).toEqual([]);
    expect(sanitizeCart({ v: 1, lines: [{ productId: 'P1', variantId: 'x', qty: -2 }, { productId: 'P1', variantId: 'y', qty: 2 }] }).lines).toHaveLength(1);
  });
});

describe('pricing against the catalogue', () => {
  it('uses current prices, flags changes and unavailable lines, and applies offers', () => {
    const state = {
      ...emptyCart(),
      lines: [
        { key: 'P1::P1-A', productId: 'P1', variantId: 'P1-A', qty: 2, addedAt: 1, priceAtAdd: 5900 },
        { key: 'P1::P1-B', productId: 'P1', variantId: 'P1-B', qty: 1, addedAt: 2, priceAtAdd: 9900 },
        { key: 'GONE::x', productId: 'GONE', variantId: 'x', qty: 1, addedAt: 3, priceAtAdd: 100 },
      ],
    };
    const priced = priceCart(state, catalog);
    expect(priced.lines.map((l) => l.status)).toEqual(['ok', 'unavailable', 'missing']);
    expect(priced.lines[0].priceChanged).toBe(true);
    expect(priced.totals.subtotal).toBe(13800);
    expect(priced.totals.buyGet?.freeUnits).toBe(1);
    expect(priced.totals.total).toBe(6900);
    expect(priced.blocking).toBe(true);
  });
});
