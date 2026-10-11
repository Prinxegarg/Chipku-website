import { closedReason, json, loadCatalog, type Context } from '../../_lib/checkout.ts';

/** GET /api/checkout/config — tells the checkout page whether payments are open. */
export const onRequestGet = async (ctx: Context) => {
  try {
    const catalog = await loadCatalog(ctx);
    const reason = closedReason(ctx.env, catalog);
    return json(reason ? { enabled: false, reason } : { enabled: true, keyId: ctx.env.RAZORPAY_KEY_ID });
  } catch {
    return json({ enabled: false, reason: "Online checkout isn't available right now." }, 503);
  }
};
