/**
 * POST /api/checkout/verify
 * Confirms a Razorpay payment by checking its signature:
 *   HMAC_SHA256(order_id + "|" + payment_id, key_secret) === razorpay_signature
 * Then (optionally) forwards the verified order to ORDERS_WEBHOOK_URL.
 */
import { hmacHex, json, razorpay, safeEqual, type Context } from '../../_lib/checkout.ts';

export const onRequestPost = async (ctx: Context) => {
  const secret = ctx.env.RAZORPAY_KEY_SECRET;
  if (!secret) return json({ ok: false, error: 'Checkout is not configured.' }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400);
  }
  const orderId = String(body.razorpay_order_id ?? '');
  const paymentId = String(body.razorpay_payment_id ?? '');
  const signature = String(body.razorpay_signature ?? '');
  if (!/^order_\w+$/.test(orderId) || !/^pay_\w+$/.test(paymentId) || !/^[a-f0-9]{64}$/.test(signature)) {
    return json({ ok: false, error: 'Invalid payment details.' }, 400);
  }

  const expected = await hmacHex(secret, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) {
    return json({ ok: false, error: 'Payment could not be verified.' }, 400);
  }

  const forward = async () => {
    if (!ctx.env.ORDERS_WEBHOOK_URL) return;
    try {
      const order = await razorpay<{ id: string; amount: number; currency: string; receipt: string; notes: Record<string, string> }>(
        ctx.env,
        `/orders/${orderId}`,
      );
      await fetch(ctx.env.ORDERS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          secret: ctx.env.ORDERS_WEBHOOK_SECRET ?? '',
          event: 'order.paid',
          order_id: order.id,
          payment_id: paymentId,
          receipt: order.receipt,
          amount_paise: order.amount,
          currency: order.currency,
          notes: order.notes,
          verified_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      // The payment is already verified and recorded in Razorpay; log for follow-up.
      console.error('order forward failed', orderId, (err as Error).message);
    }
  };
  ctx.waitUntil(forward());

  return json({ ok: true, orderId, paymentId });
};
