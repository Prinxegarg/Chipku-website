/**
 * POST /api/checkout/order
 * Re-prices the cart from the published catalogue, then creates a Razorpay order
 * for exactly that amount. Body: { lines: [{productId, variantId, qty}], customer, expectedTotal }
 */
import {
  closedReason,
  json,
  loadCatalog,
  packNotes,
  parseCustomer,
  parseLines,
  quote,
  razorpay,
  type Context,
} from '../../_lib/checkout.ts';

export const onRequestPost = async (ctx: Context) => {
  if (!(ctx.request.headers.get('content-type') ?? '').includes('application/json')) {
    return json({ error: 'Unsupported request.' }, 415);
  }
  if (Number(ctx.request.headers.get('content-length') ?? 0) > 32_000) return json({ error: 'Request too large.' }, 413);

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  let catalog;
  try {
    catalog = await loadCatalog(ctx);
  } catch {
    return json({ error: "Checkout isn't available right now." }, 503);
  }
  const closed = closedReason(ctx.env, catalog);
  if (closed) return json({ error: closed }, 503);

  const { customer, error: customerError } = parseCustomer(body.customer);
  if (!customer) return json({ error: customerError }, 422);
  const { state, error: linesError } = parseLines(body.lines);
  if (!state) return json({ error: linesError }, 422);

  const q = quote(state, catalog);
  if (q.problems.length > 0) {
    return json({ error: 'Some items in your cart are no longer available or exceed the allowed quantity. Please review your cart.' }, 409);
  }
  if (typeof body.expectedTotal === 'number' && body.expectedTotal !== q.amount) {
    return json({ error: 'Prices or offers have changed since this page loaded. Please review your cart and try again.', amount: q.amount }, 409);
  }
  if (q.amount < 100) return json({ error: 'The order total is too low to pay online.' }, 422);

  const notes = packNotes(customer, q, catalog);
  if (!notes) return json({ error: 'This order has too many different items for one checkout. Please split it into two orders.' }, 413);

  try {
    const order = await razorpay<{ id: string; amount: number; currency: string }>(ctx.env, '/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: q.amount,
        currency: 'INR',
        receipt: `chipku_${Date.now().toString(36)}`,
        notes,
      }),
    });
    return json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: ctx.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('razorpay order failed', (err as Error).message);
    return json({ error: "We couldn't start the payment. Please try again in a moment." }, 502);
  }
};
