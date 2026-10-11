/**
 * Shared server-side checkout helpers for Cloudflare Pages Functions.
 *
 * The server never trusts amounts from the browser: it re-reads the published
 * catalogue (the same /data/catalog.json the site was built with) and prices the
 * cart with the same offer engine the shopper saw.
 */
import { priceCart, emptyCart, type CartState } from '../../src/lib/cart.ts';
import type { ClientCatalog } from '../../src/lib/types.ts';

export interface Env {
  /** Static assets binding provided by Cloudflare Pages. */
  ASSETS: { fetch(input: Request | string | URL): Promise<Response> };
  /** "true" to open checkout. Keep unset until shipping, keys and policies are ready. */
  CHECKOUT_ENABLED?: string;
  RAZORPAY_KEY_ID?: string;
  /** Secret — set with `wrangler pages secret put RAZORPAY_KEY_SECRET` or in the dashboard. */
  RAZORPAY_KEY_SECRET?: string;
  /** Optional: where verified orders are forwarded (e.g. the Google Apps Script web app). */
  ORDERS_WEBHOOK_URL?: string;
  ORDERS_WEBHOOK_SECRET?: string;
}

export interface Context {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function loadCatalog(ctx: Context): Promise<ClientCatalog> {
  const res = await ctx.env.ASSETS.fetch(new URL('/data/catalog.json', ctx.request.url));
  if (!res.ok) throw new Error(`catalogue unavailable (${res.status})`);
  return (await res.json()) as ClientCatalog;
}

/** Why checkout is closed, or null when it can take payments. */
export function closedReason(env: Env, catalog: ClientCatalog): string | null {
  if (catalog.mode !== 'live') return 'Checkout is disabled for the preview catalogue.';
  if (env.CHECKOUT_ENABLED !== 'true') return "Online checkout isn't open yet.";
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return "Online checkout isn't configured yet.";
  if (catalog.settings.shippingFee === null) return 'Shipping charges are not configured yet.';
  return null;
}

/* ---------------- validation ---------------- */

export interface Customer {
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);

export function parseCustomer(raw: unknown): { customer?: Customer; error?: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c: Customer = {
    name: clean(r.name, 80),
    phone: clean(r.phone, 14).replace(/[\s-]/g, ''),
    email: clean(r.email, 120),
    line1: clean(r.line1, 120),
    line2: clean(r.line2, 120),
    city: clean(r.city, 60),
    state: clean(r.state, 60),
    pincode: clean(r.pincode, 6),
  };
  if (c.name.length < 2) return { error: 'Enter your full name.' };
  if (!/^(\+?91)?[6-9]\d{9}$/.test(c.phone)) return { error: 'Enter a valid 10-digit mobile number.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return { error: 'Enter a valid email address.' };
  if (c.line1.length < 4 || c.city.length < 2 || !c.state) return { error: 'Enter your full delivery address.' };
  if (!/^[1-9]\d{5}$/.test(c.pincode)) return { error: 'Enter a valid 6-digit PIN code.' };
  c.phone = c.phone.slice(-10);
  return { customer: c };
}

export function parseLines(raw: unknown): { state?: CartState; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Your cart is empty.' };
  if (raw.length > 50) return { error: 'Too many different items in one order.' };
  const state = emptyCart();
  for (const item of raw) {
    const l = item as Record<string, unknown>;
    const qty = Number(l?.qty);
    if (typeof l?.productId !== 'string' || typeof l?.variantId !== 'string' || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return { error: 'Your cart contains an invalid item. Please review it.' };
    }
    const key = `${l.productId}::${l.variantId}`;
    if (state.lines.some((x) => x.key === key)) continue;
    state.lines.push({ key, productId: l.productId, variantId: l.variantId, qty, addedAt: 0, priceAtAdd: null });
  }
  return { state };
}

/** Prices a cart against the published catalogue. */
export function quote(state: CartState, catalog: ClientCatalog) {
  const priced = priceCart(state, catalog, Date.now());
  const problems = priced.lines.filter((l) => l.status !== 'ok' || l.line.qty > l.maxQty);
  const shipping = catalog.settings.shippingFee ?? 0;
  return { priced, problems, shipping, amount: priced.totals.total + shipping };
}

/* ---------------- Razorpay ---------------- */

const basicAuth = (env: Env) => `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;

export async function razorpay<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { authorization: basicAuth(env), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(body.error?.description ?? `Razorpay request failed (${res.status})`);
  return body;
}

/**
 * Razorpay order notes: at most 15 keys of 256 characters. The order record in
 * Razorpay then carries everything needed to fulfil it.
 */
export function packNotes(customer: Customer, q: ReturnType<typeof quote>, catalog: ClientCatalog): Record<string, string> | null {
  const t = q.priced.totals;
  const items = q.priced.lines
    .map((l) => `${l.line.qty}x ${l.product?.title ?? l.line.productId} [${l.line.variantId}]${l.freeQty ? ` (${l.freeQty} free)` : ''}`)
    .join('; ');
  const chunks = items.match(/.{1,250}/gs) ?? [];
  if (chunks.length > 4) return null;
  const notes: Record<string, string> = {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: `${customer.line1}${customer.line2 ? `, ${customer.line2}` : ''}`.slice(0, 250),
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
    totals: `subtotal=${t.subtotal};buy_get=${t.buyGet?.discount ?? 0};percent=${t.spend?.discount ?? 0};shipping=${q.shipping};total=${q.amount} (paise)`,
    catalog: catalog.version,
  };
  chunks.forEach((c, i) => (notes[`items_${i + 1}`] = c));
  return notes;
}

/* ---------------- signatures ---------------- */

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
