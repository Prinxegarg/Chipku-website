/**
 * Cart state + pricing. Pure functions (no DOM, no storage) so the same logic is
 * unit-tested and reused by the checkout page.
 *
 * The cart stores only IDs and quantities. Prices always come from the current
 * published catalogue, so a price change in Google Sheets is reflected (and
 * flagged) the next time the cart is shown.
 */
import { activeOffers, evaluateCart, type CartTotals, type PricedLine } from './offers.ts';
import type { ClientCatalog, ClientProduct, ClientVariant, OfferConfig } from './types.ts';

export interface CartLine {
  key: string;
  productId: string;
  variantId: string;
  qty: number;
  addedAt: number;
  /** Paise at the time of adding, used to flag later price changes. */
  priceAtAdd: number | null;
}

export interface CartState {
  v: 1;
  lines: CartLine[];
  /** Buy/Get tier the shopper chose as a browsing goal (tile on the product page). */
  goal: string | null;
  updatedAt: number;
}

export const lineKey = (productId: string, variantId: string) => `${productId}::${variantId}`;

export function emptyCart(): CartState {
  return { v: 1, lines: [], goal: null, updatedAt: Date.now() };
}

/** Parses untrusted stored data. Anything malformed is dropped rather than trusted. */
export function sanitizeCart(raw: unknown): CartState {
  const state = emptyCart();
  if (!raw || typeof raw !== 'object') return state;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !Array.isArray(r.lines)) return state;
  const seen = new Set<string>();
  for (const item of r.lines.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Record<string, unknown>;
    if (typeof l.productId !== 'string' || typeof l.variantId !== 'string') continue;
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1) continue;
    const key = lineKey(l.productId, l.variantId);
    if (seen.has(key)) continue;
    seen.add(key);
    state.lines.push({
      key,
      productId: l.productId,
      variantId: l.variantId,
      qty: Math.min(qty, 99),
      addedAt: Number(l.addedAt) || Date.now(),
      priceAtAdd: Number.isInteger(l.priceAtAdd) ? (l.priceAtAdd as number) : null,
    });
  }
  state.goal = typeof r.goal === 'string' ? r.goal : null;
  state.updatedAt = Number(r.updatedAt) || Date.now();
  return state;
}

export function maxQtyFor(variant: Pick<ClientVariant, 'stock'> | undefined, perItemMax: number): number {
  const stock = variant?.stock;
  return Math.max(0, Math.min(perItemMax, stock === undefined ? Number.POSITIVE_INFINITY : stock));
}

export interface AddResult {
  state: CartState;
  line: CartLine;
  added: number;
  capped: boolean;
}

/** Adds a selection, merging with an identical product/variant line. */
export function addToCart(
  state: CartState,
  input: { productId: string; variantId: string; qty: number; unitPrice: number | null; maxQty: number },
): AddResult {
  const key = lineKey(input.productId, input.variantId);
  const lines = state.lines.map((l) => ({ ...l }));
  let line = lines.find((l) => l.key === key);
  const before = line?.qty ?? 0;
  const target = Math.min(before + Math.max(1, Math.floor(input.qty)), input.maxQty);
  if (!line) {
    line = {
      key,
      productId: input.productId,
      variantId: input.variantId,
      qty: target,
      addedAt: Date.now(),
      priceAtAdd: input.unitPrice,
    };
    lines.push(line);
  } else {
    line.qty = target;
    line.addedAt = Date.now();
  }
  return {
    state: { ...state, lines, updatedAt: Date.now() },
    line,
    added: target - before,
    capped: before + input.qty > input.maxQty,
  };
}

export function setLineQty(state: CartState, key: string, qty: number, maxQty: number): CartState {
  const q = Math.max(0, Math.min(Math.floor(qty), maxQty));
  const lines = state.lines
    .map((l) => (l.key === key ? { ...l, qty: q } : l))
    .filter((l) => l.qty > 0);
  return { ...state, lines, updatedAt: Date.now() };
}

export function removeLine(state: CartState, key: string): CartState {
  return { ...state, lines: state.lines.filter((l) => l.key !== key), updatedAt: Date.now() };
}

export interface ViewLine {
  line: CartLine;
  product?: ClientProduct;
  variant?: ClientVariant;
  unitPrice: number | null;
  status: 'ok' | 'unavailable' | 'missing';
  priceChanged: boolean;
  maxQty: number;
  freeQty: number;
  subtotal: number;
}

export interface PricedCart {
  lines: ViewLine[];
  totals: CartTotals;
  offers: OfferConfig;
  /** True when a line must be removed or reviewed before checkout. */
  blocking: boolean;
  itemCount: number;
}

export function priceCart(state: CartState, catalog: ClientCatalog, now: number = Date.now()): PricedCart {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const offers = activeOffers(catalog.offers, now);
  const priced: PricedLine[] = [];
  const views: ViewLine[] = state.lines.map((line) => {
    const product = byId.get(line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) {
      return { line, product, variant, unitPrice: null, status: 'missing', priceChanged: false, maxQty: 0, freeQty: 0, subtotal: 0 };
    }
    const ok = variant.available && variant.price !== null;
    const maxQty = maxQtyFor(variant, catalog.settings.maxQtyPerItem);
    if (ok) {
      priced.push({
        key: line.key,
        productId: product.id,
        variantId: variant.id,
        productType: product.type,
        categoryIds: product.categoryIds,
        unitPrice: variant.price as number,
        qty: Math.min(line.qty, maxQty),
      });
    }
    return {
      line,
      product,
      variant,
      unitPrice: variant.price,
      status: ok ? 'ok' : 'unavailable',
      priceChanged: ok && line.priceAtAdd !== null && line.priceAtAdd !== variant.price,
      maxQty,
      freeQty: 0,
      subtotal: 0,
    };
  });
  const totals = evaluateCart(priced, offers);
  for (const v of views) {
    const lr = totals.lines.find((x) => x.key === v.line.key);
    if (lr) {
      v.freeQty = lr.freeQty;
      v.subtotal = lr.subtotal;
    }
  }
  return {
    lines: views,
    totals,
    offers,
    blocking: views.some((v) => v.status !== 'ok' || v.line.qty > v.maxQty),
    itemCount: totals.itemCount,
  };
}

/** Marks current prices as acknowledged (after the shopper has seen the change). */
export function acknowledgePrices(state: CartState, catalog: ClientCatalog): CartState {
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  return {
    ...state,
    lines: state.lines.map((l) => {
      const v = byId.get(l.productId)?.variants.find((x) => x.id === l.variantId);
      return v && v.price !== null ? { ...l, priceAtAdd: v.price } : l;
    }),
  };
}
