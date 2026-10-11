/**
 * CHIPKU offer engine. Pure functions, integer paise, no I/O.
 *
 * Used by the browser (product page, cart drawer, cart page) AND by the checkout
 * server function, so the amount the shopper sees is the amount that is charged.
 *
 * Rules (from the founder + product brief defaults, all driven by Offers data):
 *  - Buy/Get: "Buy P Get F" means P paid + F extra free, so P+F eligible units are needed.
 *    The highest qualifying tier applies once per eligible pool; extra units are paid.
 *    The lowest-priced eligible units are the free ones.
 *  - Spend %: basis = eligible merchandise after Buy/Get, before the %, excluding
 *    shipping/tax. "above ₹399" (gt) is strictly greater; gte means "or more".
 *    The percentage applies to that same basis and stacks with Buy/Get.
 */
import type { BuyGetTier, Eligibility, OfferConfig, OfferWindow, ProductType, SpendOffer } from './types.ts';

export interface PricedLine {
  key: string;
  productId: string;
  variantId: string;
  productType: ProductType;
  categoryIds: string[];
  /** Paise. */
  unitPrice: number;
  qty: number;
}

export interface BuyGetResult {
  eligibleUnits: number;
  tier: BuyGetTier | null;
  nextTier: BuyGetTier | null;
  /** Further eligible selections needed to reach nextTier. */
  remainingForNext: number;
  freeUnits: number;
  /** Eligible units that are paid for (tier.paid + any extras). */
  paidUnits: number;
  discount: number;
  freeByLine: Record<string, number>;
}

export interface SpendResult {
  offer: SpendOffer;
  basis: number;
  qualifies: boolean;
  /** Basis equals the threshold but the rule is strictly "above". */
  atThreshold: boolean;
  /** Basis needed to qualify. */
  required: number;
  remaining: number;
  /** 0..1 for the progress bar. */
  progress: number;
  discount: number;
}

export interface LineResult {
  key: string;
  subtotal: number;
  freeQty: number;
  buyGetDiscount: number;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  buyGet: BuyGetResult | null;
  spend: SpendResult | null;
  discountTotal: number;
  /** Merchandise total after discounts, before shipping. */
  total: number;
  lines: LineResult[];
}

export const tierNeed = (t: Pick<BuyGetTier, 'paid' | 'free'>) => t.paid + t.free;

export function isEligible(e: Eligibility, line: Pick<PricedLine, 'productType' | 'categoryIds' | 'variantId'>): boolean {
  if (e.productTypes.length > 0 && !e.productTypes.includes(line.productType)) return false;
  if (e.categoryIds.length > 0 && !line.categoryIds.some((c) => e.categoryIds.includes(c))) return false;
  if (e.variantIds.length > 0 && !e.variantIds.includes(line.variantId)) return false;
  return true;
}

function inWindow(w: OfferWindow, now: number): boolean {
  if (w.startsAt !== undefined && now < w.startsAt) return false;
  if (w.endsAt !== undefined && now > w.endsAt) return false;
  return true;
}

/** Drops offers outside their start/end dates. Evaluated at runtime, not build time. */
export function activeOffers(config: OfferConfig, now: number = Date.now()): OfferConfig {
  return {
    ...config,
    buyGet: config.buyGet.filter((t) => inWindow(t, now)).sort((a, b) => tierNeed(a) - tierNeed(b)),
    spend: config.spend && inWindow(config.spend, now) ? config.spend : null,
  };
}

export function hasAnyOffer(config: OfferConfig): boolean {
  return config.buyGet.length > 0 || config.spend !== null;
}

export function evaluateBuyGet(lines: PricedLine[], config: OfferConfig): BuyGetResult | null {
  const tiers = config.buyGet;
  if (tiers.length === 0) return null;
  const eligible = lines.filter((l) => l.qty > 0 && isEligible(config.buyGetEligibility, l));
  const units = eligible.reduce((n, l) => n + l.qty, 0);

  let tier: BuyGetTier | null = null;
  for (const t of tiers) if (tierNeed(t) <= units) tier = t;
  const nextTier = tiers.find((t) => tierNeed(t) > units) ?? null;

  const freeByLine: Record<string, number> = {};
  let discount = 0;
  if (tier) {
    // Lowest-priced eligible units are free; ties keep cart order (stable sort).
    const expanded = eligible
      .map((l, index) => ({ l, index }))
      .sort((a, b) => a.l.unitPrice - b.l.unitPrice || a.index - b.index);
    let toFree = tier.free;
    for (const { l } of expanded) {
      if (toFree === 0) break;
      const take = Math.min(l.qty, toFree);
      freeByLine[l.key] = (freeByLine[l.key] ?? 0) + take;
      discount += take * l.unitPrice;
      toFree -= take;
    }
  }
  return {
    eligibleUnits: units,
    tier,
    nextTier,
    remainingForNext: nextTier ? tierNeed(nextTier) - units : 0,
    freeUnits: tier ? tier.free : 0,
    paidUnits: units - (tier ? tier.free : 0),
    discount,
    freeByLine,
  };
}

export function spendRequired(offer: SpendOffer, increment: number): number {
  return offer.operator === 'gt' ? offer.threshold + increment : offer.threshold;
}

export function evaluateSpend(
  lines: PricedLine[],
  config: OfferConfig,
  freeByLine: Record<string, number>,
): SpendResult | null {
  const offer = config.spend;
  if (!offer) return null;
  let basis = 0;
  for (const l of lines) {
    if (l.qty <= 0 || !isEligible(offer.eligibility, l)) continue;
    const paidQty = l.qty - (freeByLine[l.key] ?? 0);
    basis += paidQty * l.unitPrice;
  }
  const qualifies = offer.operator === 'gt' ? basis > offer.threshold : basis >= offer.threshold;
  const required = spendRequired(offer, config.increment);
  const remaining = qualifies ? 0 : Math.max(0, required - basis);
  return {
    offer,
    basis,
    qualifies,
    atThreshold: offer.operator === 'gt' && basis === offer.threshold,
    required,
    remaining,
    progress: qualifies ? 1 : Math.min(1, Math.max(0, basis / required)),
    discount: qualifies ? Math.round((basis * offer.percent) / 100) : 0,
  };
}

export function evaluateCart(lines: PricedLine[], config: OfferConfig): CartTotals {
  const valid = lines.filter((l) => l.qty > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0);
  const subtotal = valid.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const buyGet = evaluateBuyGet(valid, config);
  const freeByLine = buyGet?.freeByLine ?? {};
  const spend = evaluateSpend(valid, config, freeByLine);
  const discountTotal = (buyGet?.discount ?? 0) + (spend?.discount ?? 0);
  return {
    itemCount: valid.reduce((n, l) => n + l.qty, 0),
    subtotal,
    buyGet,
    spend,
    discountTotal,
    total: subtotal - discountTotal,
    lines: valid.map((l) => ({
      key: l.key,
      subtotal: l.unitPrice * l.qty,
      freeQty: freeByLine[l.key] ?? 0,
      buyGetDiscount: (freeByLine[l.key] ?? 0) * l.unitPrice,
    })),
  };
}

/** Progress toward a shopper-selected offer goal (selected tile). */
export function goalStatus(eligibleUnits: number, tier: Pick<BuyGetTier, 'paid' | 'free'>) {
  const need = tierNeed(tier);
  return { need, remaining: Math.max(0, need - eligibleUnits), complete: eligibleUnits >= need };
}
