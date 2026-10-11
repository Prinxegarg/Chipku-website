import { describe, expect, it } from 'vitest';
import { activeOffers, evaluateCart, goalStatus, type PricedLine } from '../src/lib/offers.ts';
import type { OfferConfig } from '../src/lib/types.ts';

const config: OfferConfig = {
  buyGet: [
    { id: 'B1G1', label: 'Buy 1 Get 1', paid: 1, free: 1 },
    { id: 'B2G3', label: 'Buy 2 Get 3', paid: 2, free: 3 },
    { id: 'B3G4', label: 'Buy 3 Get 4', paid: 3, free: 4 },
    { id: 'B4G6', label: 'Buy 4 Get 6', paid: 4, free: 6 },
  ],
  buyGetEligibility: { productTypes: ['poster'], categoryIds: [], variantIds: [] },
  spend: {
    id: 'SPEND399',
    label: '10% off orders above ₹399',
    threshold: 39900,
    operator: 'gt',
    percent: 10,
    eligibility: { productTypes: [], categoryIds: [], variantIds: [] },
  },
  increment: 100,
  freeItemRule: 'lowest_price',
  repeatPolicy: 'once',
};

let n = 0;
const poster = (qty: number, unitPrice = 6900, extra: Partial<PricedLine> = {}): PricedLine => ({
  key: `l${++n}`,
  productId: `P${n}`,
  variantId: `V${n}`,
  productType: 'poster',
  categoryIds: ['sports'],
  unitPrice,
  qty,
  ...extra,
});

describe('Buy/Get ladder', () => {
  it.each([
    [1, 0, 'B1G1'],
    [2, 1, 'B2G3'],
    [4, 1, 'B2G3'],
    [5, 3, 'B3G4'],
    [6, 3, 'B3G4'],
    [7, 4, 'B4G6'],
    [9, 4, 'B4G6'],
    [10, 6, null],
    [13, 6, null],
  ])('%i equally priced posters → %i free (next tier %s)', (qty, free, next) => {
    const t = evaluateCart([poster(qty)], config);
    expect(t.buyGet!.freeUnits).toBe(free);
    expect(t.buyGet!.discount).toBe(free * 6900);
    expect(t.buyGet!.nextTier?.id ?? null).toBe(next);
  });

  it('applies the highest tier once and charges the extras', () => {
    const t = evaluateCart([poster(6)], config);
    expect(t.buyGet!.tier!.id).toBe('B2G3');
    expect(t.buyGet!.paidUnits).toBe(3);
    expect(t.buyGet!.remainingForNext).toBe(1);
  });

  it('frees the lowest-priced eligible units first', () => {
    const cheap = poster(1, 4900);
    const dear = poster(1, 9900);
    const t = evaluateCart([dear, cheap], config);
    expect(t.buyGet!.freeByLine).toEqual({ [cheap.key]: 1 });
    expect(t.total).toBe(9900);
  });

  it('recalculates when a line is removed (tier downgrades)', () => {
    const a = poster(3);
    const b = poster(2);
    expect(evaluateCart([a, b], config).buyGet!.tier!.id).toBe('B2G3');
    expect(evaluateCart([a], config).buyGet!.tier!.id).toBe('B1G1');
    expect(evaluateCart([], config).buyGet!.tier).toBeNull();
  });

  it('does not count excluded product types', () => {
    const sticker = poster(5, 6900, { productType: 'sticker' });
    const t = evaluateCart([sticker, poster(1)], config);
    expect(t.buyGet!.eligibleUnits).toBe(1);
    expect(t.buyGet!.freeUnits).toBe(0);
  });
});

describe('Spend discount (10% above ₹399, stacks with Buy/Get)', () => {
  it('does not qualify at exactly ₹399 with a strict threshold', () => {
    const t = evaluateCart([poster(1, 39900, { productType: 'sticker' })], config);
    expect(t.spend!.qualifies).toBe(false);
    expect(t.spend!.atThreshold).toBe(true);
    expect(t.spend!.remaining).toBe(100);
    expect(t.spend!.discount).toBe(0);
  });

  it('qualifies just above the threshold', () => {
    const t = evaluateCart([poster(1, 40000, { productType: 'sticker' })], config);
    expect(t.spend!.qualifies).toBe(true);
    expect(t.spend!.discount).toBe(4000);
    expect(t.total).toBe(36000);
  });

  it('qualifies at the threshold when the operator is gte', () => {
    const gte: OfferConfig = { ...config, spend: { ...config.spend!, operator: 'gte' } };
    const t = evaluateCart([poster(1, 39900, { productType: 'sticker' })], gte);
    expect(t.spend!.qualifies).toBe(true);
  });

  it('uses the subtotal after Buy/Get as the basis, then stacks', () => {
    // 10 posters at ₹69 = ₹690; B4G6 frees 6 → ₹276 paid. Not above ₹399.
    const t = evaluateCart([poster(10)], config);
    expect(t.buyGet!.discount).toBe(6 * 6900);
    expect(t.spend!.basis).toBe(4 * 6900);
    expect(t.spend!.qualifies).toBe(false);
    expect(t.spend!.remaining).toBe(39900 + 100 - 4 * 6900);

    // Add stickers worth ₹150: basis ₹426 → 10% = ₹42.60
    const t2 = evaluateCart([poster(10), poster(1, 15000, { productType: 'sticker' })], config);
    expect(t2.spend!.basis).toBe(42600);
    expect(t2.spend!.discount).toBe(4260);
    expect(t2.total).toBe(69000 + 15000 - 41400 - 4260);
  });

  it('removes the percentage when the cart drops below the threshold', () => {
    const big = poster(1, 50000, { productType: 'sticker' });
    expect(evaluateCart([big], config).spend!.discount).toBe(5000);
    const t = evaluateCart([poster(1, 30000, { productType: 'sticker' })], config);
    expect(t.spend!.discount).toBe(0);
    expect(t.spend!.remaining).toBe(10000);
    expect(t.spend!.progress).toBeCloseTo(30000 / 40000);
  });
});

describe('offer windows and goals', () => {
  it('drops offers outside their dates', () => {
    const dated: OfferConfig = {
      ...config,
      buyGet: [{ ...config.buyGet[0], endsAt: 1000 }, config.buyGet[1]],
      spend: { ...config.spend!, startsAt: 5000 },
    };
    const active = activeOffers(dated, 2000);
    expect(active.buyGet.map((t) => t.id)).toEqual(['B2G3']);
    expect(active.spend).toBeNull();
  });

  it('reports remaining selections for a chosen goal', () => {
    expect(goalStatus(3, { paid: 2, free: 3 })).toEqual({ need: 5, remaining: 2, complete: false });
    expect(goalStatus(5, { paid: 2, free: 3 })).toEqual({ need: 5, remaining: 0, complete: true });
  });
});
