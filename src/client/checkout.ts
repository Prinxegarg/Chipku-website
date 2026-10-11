/**
 * Checkout: contact/delivery form → server re-prices the cart (/api/checkout/order)
 * → Razorpay Checkout → server verifies the payment signature (/api/checkout/verify).
 * The browser total is never trusted; the server recalculates from the published catalogue.
 */
import { priceCart } from '../lib/cart.ts';
import { formatMoney } from '../lib/money.ts';
import { esc, icons } from '../lib/render/html.ts';
import { emptyCart } from '../lib/cart.ts';
import { linesHTML, summaryHTML } from './cart-render.ts';
import { getCart, setCart, subscribe } from './cart-store.ts';
import { isPreview, loadCatalog } from './catalog.ts';
import { announce } from './ui.ts';
import type { ClientCatalog } from '../lib/types.ts';

interface CheckoutConfig {
  enabled: boolean;
  keyId?: string;
  reason?: string;
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(evt: string, cb: (r: { error?: { description?: string } }) => void): void };
  }
}

const root = document.querySelector<HTMLElement>('[data-checkout]');
if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-checkout-form]')!;
  const pay = root.querySelector<HTMLButtonElement>('[data-pay]')!;
  const status = root.querySelector<HTMLElement>('[data-checkout-status]')!;
  const linesEl = root.querySelector<HTMLElement>('[data-checkout-lines]')!;
  const sumEl = root.querySelector<HTMLElement>('[data-checkout-summary]')!;
  let config: CheckoutConfig = { enabled: false };
  let catalog: ClientCatalog | null = null;
  let busy = false;

  const setStatus = (kind: 'error' | 'info' | 'success' | 'wash', html: string) => {
    status.innerHTML = html ? `<div class="notice notice--${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${kind === 'error' ? icons.alert : icons.info}<div>${html}</div></div>` : '';
  };
  const label = (text: string) => {
    pay.querySelector('.btn__label')!.textContent = text;
  };

  function render() {
    if (!catalog) return;
    const state = getCart();
    const priced = priceCart(state, catalog);
    if (state.lines.length === 0) {
      root!.querySelector<HTMLElement>('[data-checkout-main]')!.innerHTML =
        '<div class="cart-empty"><p class="cart-empty__title">Your next favourite is waiting</p><p class="muted">Your cart is empty.</p><a class="btn" href="/shop">Explore CHIPKU</a></div>';
      return;
    }
    linesEl.innerHTML = linesHTML(priced, { origins: catalog.imageTransformOrigins, preview: catalog.mode === 'preview' });
    sumEl.innerHTML = summaryHTML(priced, catalog, { shipping: true });
    const ready = config.enabled && !priced.blocking && catalog.settings.shippingFee !== null;
    pay.disabled = !ready || busy;
    if (!busy) {
      const ship = catalog.settings.shippingFee ?? 0;
      label(ready ? `Pay ${formatMoney(priced.totals.total + ship)}` : 'Checkout unavailable');
    }
    if (priced.blocking) {
      setStatus('error', 'Some items in your cart need attention. <a href="/cart">Review your cart</a> before paying.');
    } else if (!config.enabled) {
      const reason = isPreview()
        ? 'This is the design preview: online payment opens once Razorpay keys and the live catalogue are connected.'
        : config.reason ?? "Online checkout isn't available right now. Please try again later.";
      setStatus('wash', esc(reason));
    } else if (catalog.settings.shippingFee === null) {
      setStatus('wash', 'Checkout opens once shipping charges are set up.');
    } else if (!status.querySelector('.notice--error')) {
      setStatus('info', '');
    }
  }

  /* ---------- validation ---------- */
  const rules: Record<string, (v: string) => string | null> = {
    name: (v) => (v.trim().length >= 2 ? null : 'Enter your full name.'),
    phone: (v) => (/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(v.replace(/\s/g, '')) ? null : 'Enter a valid 10-digit mobile number.'),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'Enter a valid email address.'),
    line1: (v) => (v.trim().length >= 4 ? null : 'Enter your house/flat and street.'),
    city: (v) => (v.trim().length >= 2 ? null : 'Enter your city.'),
    pincode: (v) => (/^[1-9]\d{5}$/.test(v.trim()) ? null : 'Enter a valid 6-digit PIN code.'),
    state: (v) => (v ? null : 'Select your state or union territory.'),
  };

  function validate(): Record<string, string> | null {
    const fd = new FormData(form);
    let firstInvalid: HTMLElement | null = null;
    for (const [name, rule] of Object.entries(rules)) {
      const field = form.elements.namedItem(name) as HTMLInputElement | null;
      const msg = rule(String(fd.get(name) ?? ''));
      const err = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
      if (err) err.textContent = msg ?? '';
      field?.setAttribute('aria-invalid', String(Boolean(msg)));
      if (msg && !firstInvalid) firstInvalid = field;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return null;
    }
    return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
  }

  form.addEventListener('blur', (e) => {
    const t = e.target as HTMLInputElement;
    const rule = rules[t.name];
    if (!rule || !t.value) return;
    const msg = rule(t.value);
    const err = form.querySelector<HTMLElement>(`[data-error-for="${t.name}"]`);
    if (err) err.textContent = msg ?? '';
    t.setAttribute('aria-invalid', String(Boolean(msg)));
  }, true);

  function loadRazorpay(): Promise<void> {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Razorpay could not load'));
      document.head.append(s);
    });
  }

  const finish = (fn: () => void) => {
    busy = false;
    fn();
    render();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !catalog || !config.enabled) return;
    const customer = validate();
    if (!customer) return;
    busy = true;
    pay.disabled = true;
    pay.setAttribute('aria-busy', 'true');
    label('Preparing payment…');
    setStatus('info', '');
    const lines = getCart().lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty }));
    const priced = priceCart(getCart(), catalog);
    let order: { orderId: string; amount: number; currency: string; keyId: string; name?: string };
    try {
      const res = await fetch('/api/checkout/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines, customer, expectedTotal: priced.totals.total + (catalog.settings.shippingFee ?? 0), catalogVersion: catalog.version }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Checkout failed (${res.status}).`);
      order = body;
      await loadRazorpay();
    } catch (err) {
      pay.removeAttribute('aria-busy');
      return finish(() => setStatus('error', `${esc((err as Error).message)} Your cart is saved — please try again.`));
    }

    const rzp = new window.Razorpay!({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'CHIPKU',
      description: 'Posters, photo prints and stickers',
      order_id: order.orderId,
      prefill: { name: customer.name, email: customer.email, contact: customer.phone },
      notes: { pincode: customer.pincode },
      theme: { color: '#111111' },
      modal: {
        ondismiss: () => {
          pay.removeAttribute('aria-busy');
          finish(() => setStatus('wash', 'Payment was cancelled. Your cart is saved — you can try again whenever you are ready.'));
        },
      },
      handler: async (r: RazorpayResponse) => {
        label('Confirming payment…');
        try {
          const res = await fetch('/api/checkout/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(r),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) throw new Error(body.error || 'We could not confirm the payment.');
          setCart({ ...emptyCart() });
          root!.querySelector<HTMLElement>('[data-checkout-main]')!.hidden = true;
          const done = root!.querySelector<HTMLElement>('[data-order-done]')!;
          done.hidden = false;
          done.querySelector('[data-order-ref]')!.textContent = `Order reference: ${r.razorpay_order_id}`;
          done.focus();
          announce('Payment successful. Thank you for your order.');
        } catch (err) {
          pay.removeAttribute('aria-busy');
          finish(() =>
            setStatus(
              'error',
              `${esc((err as Error).message)} If money was deducted, keep this reference and contact us: <strong>${esc(r.razorpay_payment_id)}</strong>.`,
            ),
          );
        }
      },
    });
    rzp.on('payment.failed', (resp) => {
      setStatus('error', `${esc(resp.error?.description ?? 'Payment failed.')} You can try again or use another method.`);
    });
    rzp.open();
  });

  async function init() {
    try {
      catalog = await loadCatalog();
    } catch {
      setStatus('error', "We couldn't load your cart. Check your connection and refresh.");
      return;
    }
    try {
      const res = await fetch('/api/checkout/config', { headers: { accept: 'application/json' } });
      config = res.ok ? ((await res.json()) as CheckoutConfig) : { enabled: false };
    } catch {
      config = { enabled: false };
    }
    render();
  }
  subscribe(render);
  void init();
}
