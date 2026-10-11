/**
 * Cart controller: header count, cart drawer, quick-add dialog and the single
 * Add to cart flow used by every button on the site.
 */
import { addToCart, maxQtyFor, priceCart, removeLine, setLineQty, type PricedCart } from '../lib/cart.ts';
import { esc, icons } from '../lib/render/html.ts';
import { formatMoney } from '../lib/money.ts';
import { mediaHTML, priceLabel } from '../lib/render/card.ts';
import { cartCount, getCart, setCart, subscribe } from './cart-store.ts';
import { findVariant, isPreview, loadCatalog } from './catalog.ts';
import {
  emptyHTML,
  inlineChooseHTML,
  linesHTML,
  offerProgressHTML,
  pickSuggestions,
  suggestionHTML,
  summaryHTML,
} from './cart-render.ts';
import { announce, closeDialog, openDialog, wait, wireDialog } from './ui.ts';
import type { ClientCatalog, ClientProduct } from '../lib/types.ts';

const drawer = document.getElementById('cart-drawer') as HTMLDialogElement | null;
const quick = document.getElementById('quick-add') as HTMLDialogElement | null;
let freshKey: string | null = null;

/* ---------------- header count ---------------- */

function renderCount(): void {
  const n = cartCount();
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
    const changed = el.textContent !== String(n);
    el.textContent = String(n);
    el.dataset.count = String(n);
    if (changed && n > 0) {
      el.classList.remove('is-bumped');
      void el.offsetWidth;
      el.classList.add('is-bumped');
    }
  });
  document.querySelectorAll<HTMLElement>('[data-open-cart]').forEach((b) => {
    b.setAttribute('aria-label', `Cart, ${n} item${n === 1 ? '' : 's'}`);
  });
}

/* ---------------- drawer ---------------- */

function focusKeyOf(el: Element | null): string | null {
  return el instanceof HTMLElement ? el.dataset.focusKey ?? null : null;
}

function restoreFocus(root: HTMLElement, key: string | null): void {
  if (!key) return;
  const target = root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
  if (target && !(target as HTMLButtonElement).disabled) target.focus({ preventScroll: true });
  else if (key.startsWith('rm:') || key.startsWith('dec:')) root.querySelector<HTMLElement>('.drawer__title, [data-cart-title]')?.focus({ preventScroll: true });
}

export function renderCartInto(
  root: { body: HTMLElement; foot?: HTMLElement | null; heading?: HTMLElement | null },
  catalog: ClientCatalog,
  opts: { suggestions?: boolean; continueBtn?: boolean } = {},
): PricedCart {
  const state = getCart();
  const priced = priceCart(state, catalog);
  const ctx = { origins: catalog.imageTransformOrigins, preview: catalog.mode === 'preview', fresh: freshKey };
  const focusKey = root.body.contains(document.activeElement) || root.foot?.contains(document.activeElement) ? focusKeyOf(document.activeElement) : null;
  const scroll = root.body.scrollTop;
  if (root.heading) root.heading.textContent = state.lines.length ? `(${priced.lines.reduce((n, l) => n + l.line.qty, 0)})` : '';

  if (state.lines.length === 0) {
    root.body.innerHTML = emptyHTML();
    if (root.foot) {
      root.foot.hidden = true;
      root.foot.innerHTML = '';
    }
  } else {
    let suggestions = '';
    if (opts.suggestions) {
      const s = pickSuggestions(priced, catalog);
      if (s) {
        suggestions = `<section class="suggestions" aria-labelledby="sugg-title"><h3 class="suggestions__title" id="sugg-title">${esc(s.title)}</h3><ul class="suggestions__list" role="list">${s.items
          .map((p) => suggestionHTML(p, ctx))
          .join('')}</ul><div data-inline-host></div></section>`;
      }
    }
    root.body.innerHTML = `${offerProgressHTML(priced, state.goal)}${linesHTML(priced, ctx)}${suggestions}`;
    if (root.foot) {
      root.foot.hidden = false;
      root.foot.innerHTML = summaryHTML(priced, catalog, { checkout: true, continueBtn: opts.continueBtn });
      root.foot.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
        b.addEventListener('click', () => drawer && closeDialog(drawer)),
      );
    }
  }
  root.body.scrollTop = scroll;
  restoreFocus(root.body.parentElement ?? root.body, focusKey);
  // Keep the item that was just added in view.
  const fresh = freshKey ? root.body.querySelector<HTMLElement>(`[data-line="${CSS.escape(freshKey)}"]`) : null;
  if (fresh) {
    const b = root.body.getBoundingClientRect();
    const r = fresh.getBoundingClientRect();
    if (r.bottom > b.bottom || r.top < b.top) root.body.scrollTop += r.top - b.top - 12;
  }
  return priced;
}

async function renderDrawer(): Promise<void> {
  if (!drawer) return;
  const body = drawer.querySelector<HTMLElement>('[data-cart-body]')!;
  const foot = drawer.querySelector<HTMLElement>('[data-cart-foot]');
  const heading = drawer.querySelector<HTMLElement>('[data-cart-heading-count]');
  try {
    const catalog = await loadCatalog();
    renderCartInto({ body, foot, heading }, catalog, { suggestions: true, continueBtn: true });
  } catch {
    body.innerHTML = `<div class="notice notice--error" role="alert">${icons.alert}<div><p>We couldn't load your cart details.</p><button type="button" class="btn btn--sm btn--secondary" data-cart-retry>Try again</button></div></div>`;
  }
}

export function openCart(opener?: Element | null): void {
  if (!drawer) return;
  void renderDrawer();
  openDialog(drawer, opener ?? document.activeElement);
}

/* ---------------- add flow ---------------- */

function setBusy(btn: HTMLButtonElement | null, busy: boolean, label?: string, success = false): void {
  if (!btn) return;
  const labelEl = btn.querySelector<HTMLElement>('.btn__label') ?? btn;
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = labelEl.innerHTML;
    btn.style.minWidth = `${btn.offsetWidth}px`;
    btn.setAttribute('aria-busy', 'true');
    btn.dataset.busy = '1';
  } else {
    btn.removeAttribute('aria-busy');
    delete btn.dataset.busy;
  }
  if (label !== undefined) labelEl.innerHTML = label;
  btn.classList.toggle('is-success', success);
}

function restoreButton(btn: HTMLButtonElement | null): void {
  if (!btn) return;
  const labelEl = btn.querySelector<HTMLElement>('.btn__label') ?? btn;
  if (btn.dataset.label) labelEl.innerHTML = btn.dataset.label;
  delete btn.dataset.label;
  btn.classList.remove('is-success');
  btn.style.minWidth = '';
}

function errorSlot(btn: HTMLElement | null): HTMLElement | null {
  if (!btn) return null;
  const scope = btn.closest<HTMLElement>('[data-add-scope], .card, .sugg, .inline-choose, .quick-add__form');
  let slot = scope?.querySelector<HTMLElement>('[data-add-error]') ?? null;
  if (!slot && scope) {
    slot = document.createElement('p');
    slot.className = 'field__error add-error';
    slot.dataset.addError = '';
    slot.setAttribute('role', 'alert');
    btn.insertAdjacentElement('afterend', slot);
  }
  return slot;
}

export interface AddRequest {
  productId: string;
  variantId: string;
  qty?: number;
  button?: HTMLButtonElement | null;
  /** Open the drawer after success (default true unless it is already open). */
  openDrawer?: boolean;
}

/** The one Add to cart path. Validates against the current catalogue before adding. */
export async function addSelection(req: AddRequest): Promise<boolean> {
  const btn = req.button ?? null;
  if (btn?.dataset.busy) return false; // ignore double clicks while adding
  const slot = errorSlot(btn);
  if (slot) slot.textContent = '';
  const started = performance.now();
  setBusy(btn, true, 'Adding…');
  if (btn) btn.disabled = true;

  const fail = async (message: string) => {
    await wait(Math.max(0, 250 - (performance.now() - started)));
    setBusy(btn, false);
    restoreButton(btn);
    if (btn) btn.disabled = false;
    if (slot) slot.innerHTML = `${icons.alert}<span>${esc(message)}</span>`;
    announce(message);
    return false;
  };

  let catalog: ClientCatalog;
  try {
    catalog = await loadCatalog();
  } catch {
    return fail("Couldn't add to cart — the shop didn't respond. Check your connection and try again.");
  }
  const found = findVariant(req.productId, req.variantId);
  if (!found) return fail('This item is no longer available.');
  const { product, variant } = found;
  if (!variant.available || variant.price === null) return fail('This option is currently unavailable.');
  const max = maxQtyFor(variant, catalog.settings.maxQtyPerItem);
  const existing = getCart().lines.find((l) => l.productId === product.id && l.variantId === variant.id)?.qty ?? 0;
  if (existing >= max) return fail(`You already have the maximum (${max}) of this item in your cart.`);

  const qty = Math.max(1, Math.floor(req.qty ?? 1));
  const result = addToCart(getCart(), { productId: product.id, variantId: variant.id, qty, unitPrice: variant.price, maxQty: max });
  await wait(Math.max(0, 320 - (performance.now() - started)));
  freshKey = result.line.key;
  setCart(result.state);

  setBusy(btn, false, `${icons.check}<span>Added to cart</span>`, true);
  if (btn) btn.disabled = false;
  window.setTimeout(() => restoreButton(btn), 1600);
  window.setTimeout(() => {
    freshKey = null;
  }, 1800);

  const optionText = product.variants.length > 1 ? ` (${variant.label})` : '';
  const capped = result.capped ? ` Quantity limited to ${max}.` : '';
  announce(`Added ${result.added} × ${product.title}${optionText} to your cart. Cart has ${cartCount()} items.${capped}`);

  const drawerOpen = drawer?.open ?? false;
  if (drawerOpen) {
    void renderDrawer();
  } else if (req.openDrawer !== false) {
    if (quick?.open) closeDialog(quick);
    openCart(btn);
  }
  document.dispatchEvent(new CustomEvent('chipku:added', { detail: { productId: product.id, variantId: variant.id } }));
  return true;
}

/* ---------------- quick add (Choose options) ---------------- */

async function openQuickAdd(productId: string, opener: HTMLElement): Promise<void> {
  if (!quick) return;
  const body = quick.querySelector<HTMLElement>('[data-quick-body]')!;
  body.innerHTML = '<div class="quick-add__loading"><span class="spinner" aria-hidden="true"></span><span>Loading options…</span></div>';
  openDialog(quick, opener);
  let catalog: ClientCatalog;
  try {
    catalog = await loadCatalog();
  } catch {
    body.innerHTML = `<p class="notice notice--error" role="alert">${icons.alert}<span>Options couldn't load. Close this and try again.</span></p>`;
    return;
  }
  const p = catalog.products.find((x) => x.id === productId);
  if (!p) {
    body.innerHTML = `<p class="notice notice--error" role="alert">${icons.alert}<span>This product is no longer available.</span></p>`;
    return;
  }
  body.innerHTML = quickAddHTML(p, catalog);
  const title = quick.querySelector<HTMLElement>('#quick-add-title');
  if (title) title.textContent = p.title;
  wireQuickAdd(body, p, catalog);
}

function quickAddHTML(p: ClientProduct, catalog: ClientCatalog): string {
  const ctx = { origins: catalog.imageTransformOrigins, preview: catalog.mode === 'preview', sizes: '160px' };
  const name = esc(p.variants[0]?.optionName ?? 'Option');
  const price = priceLabel(p);
  const chips = p.variants
    .map((v) => {
      const disabled = !v.available || v.price === null;
      return `<label class="chip"><input type="radio" name="qa-variant" value="${esc(v.id)}" ${disabled ? 'disabled' : ''}><span><span class="chip__name">${esc(v.label)}</span>${
        v.dimensions ? `<small>${esc(v.dimensions)}</small>` : ''
      }${disabled ? '<small>Unavailable</small>' : ''}</span></label>`;
    })
    .join('');
  return `<form class="quick-add__form" data-add-scope novalidate>
  <div class="quick-add__product">
    <div class="quick-add__img">${mediaHTML(p.images[0], p.type, ctx)}</div>
    <div>
      <p class="quick-add__price" data-qa-price aria-live="polite">${price ? `${price.from ? 'From ' : ''}${esc(price.text)}` : ''}</p>
      <a class="text-link" href="/products/${encodeURIComponent(p.slug)}">View full details</a>
    </div>
  </div>
  <fieldset class="chip-group option-group" data-qa-options aria-describedby="qa-error">
    <legend class="option-group__legend">${name}<span class="option-group__chosen" data-qa-chosen></span></legend>
    ${chips}
  </fieldset>
  <p class="field__error" id="qa-error" data-qa-error role="alert"></p>
  <button type="submit" class="btn btn--block btn--lg" data-qa-submit><span class="btn__label">Choose a ${name.toLowerCase()}</span></button>
  <p class="field__error" data-add-error role="alert"></p>
</form>`;
}

function wireQuickAdd(root: HTMLElement, p: ClientProduct, catalog: ClientCatalog): void {
  const form = root.querySelector<HTMLFormElement>('form')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-qa-submit]')!;
  const err = form.querySelector<HTMLElement>('[data-qa-error]')!;
  const priceEl = form.querySelector<HTMLElement>('[data-qa-price]')!;
  const chosen = form.querySelector<HTMLElement>('[data-qa-chosen]')!;
  const optName = (p.variants[0]?.optionName ?? 'option').toLowerCase();
  const update = () => {
    const sel = form.querySelector<HTMLInputElement>('input[name="qa-variant"]:checked');
    const v = p.variants.find((x) => x.id === sel?.value);
    if (v && v.price !== null) {
      priceEl.textContent = formatMoney(v.price);
      chosen.textContent = `: ${v.label}`;
      submit.querySelector('.btn__label')!.innerHTML = `Add to cart <span class="btn__sep">·</span> ${formatMoney(v.price)}`;
      err.textContent = '';
    }
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const sel = form.querySelector<HTMLInputElement>('input[name="qa-variant"]:checked');
    if (!sel) {
      err.innerHTML = `${icons.alert}<span>Select a ${esc(optName)} to continue.</span>`;
      form.querySelector<HTMLInputElement>('input[name="qa-variant"]:not(:disabled)')?.focus();
      return;
    }
    void addSelection({ productId: p.id, variantId: sel.value, button: submit });
  });
  void catalog;
}

/* ---------------- inline choose inside the drawer ---------------- */

async function openInlineChoose(btn: HTMLButtonElement): Promise<void> {
  const host = btn.closest('.suggestions')?.querySelector<HTMLElement>('[data-inline-host]');
  if (!host) return;
  const catalog = await loadCatalog();
  const p = catalog.products.find((x) => x.id === btn.dataset.inlineChoose);
  if (!p) return;
  const list = btn.closest('.suggestions')!.querySelector<HTMLElement>('.suggestions__list')!;
  list.hidden = true;
  host.innerHTML = inlineChooseHTML(p);
  host.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
  const cancel = () => {
    host.innerHTML = '';
    list.hidden = false;
    list.querySelector<HTMLElement>(`[data-focus-key="sugg:${CSS.escape(p.id)}"]`)?.focus();
  };
  host.querySelector('[data-inline-cancel]')!.addEventListener('click', cancel);
  host.querySelector<HTMLButtonElement>('[data-inline-add]')!.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const sel = host.querySelector<HTMLInputElement>('input:checked');
    const er = host.querySelector<HTMLElement>('[data-inline-error]')!;
    if (!sel) {
      er.innerHTML = `${icons.alert}<span>Select an option to add it.</span>`;
      host.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
      return;
    }
    await addSelection({ productId: p.id, variantId: sel.value, button: b });
  });
}

/* ---------------- events ---------------- */

function lineMax(key: string, catalog: ClientCatalog): number {
  const line = getCart().lines.find((l) => l.key === key);
  if (!line) return 0;
  const v = findVariant(line.productId, line.variantId)?.variant;
  return maxQtyFor(v, catalog.settings.maxQtyPerItem);
}

function changeQty(key: string, delta: number | null, absolute?: number): void {
  void loadCatalog().then((catalog) => {
    const line = getCart().lines.find((l) => l.key === key);
    if (!line) return;
    const next = absolute ?? line.qty + (delta ?? 0);
    const max = lineMax(key, catalog);
    const title = findVariant(line.productId, line.variantId)?.product.title ?? 'Item';
    if (next <= 0) {
      setCart(removeLine(getCart(), key));
      announce(`${title} removed from your cart.`);
      return;
    }
    setCart(setLineQty(getCart(), key, next, Math.max(max, 1)));
    const after = getCart().lines.find((l) => l.key === key)?.qty ?? 0;
    announce(`${title} quantity ${after}.${next > max ? ` Maximum is ${max}.` : ''}`);
  });
}

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const addBtn = t.closest<HTMLButtonElement>('[data-add-to-cart]');
  if (addBtn) {
    e.preventDefault();
    void addSelection({ productId: addBtn.dataset.productId!, variantId: addBtn.dataset.variantId!, button: addBtn });
    return;
  }
  const quickBtn = t.closest<HTMLButtonElement>('[data-quick-add]');
  if (quickBtn) {
    e.preventDefault();
    void openQuickAdd(quickBtn.dataset.productId!, quickBtn);
    return;
  }
  const inline = t.closest<HTMLButtonElement>('[data-inline-choose]');
  if (inline) {
    void openInlineChoose(inline);
    return;
  }
  const open = t.closest<HTMLElement>('[data-open-cart]');
  if (open) {
    e.preventDefault();
    openCart(open);
    return;
  }
  const dec = t.closest<HTMLElement>('[data-line-dec]');
  if (dec) return changeQty(dec.dataset.lineDec!, -1);
  const inc = t.closest<HTMLElement>('[data-line-inc]');
  if (inc) return changeQty(inc.dataset.lineInc!, 1);
  const rm = t.closest<HTMLElement>('[data-line-remove]');
  if (rm) return changeQty(rm.dataset.lineRemove!, null, 0);
  if (t.closest('[data-cart-retry]')) void renderDrawer();
  const disabledLink = t.closest<HTMLElement>('[data-disabled-link]');
  if (disabledLink) e.preventDefault();
});

document.addEventListener('change', (e) => {
  const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-line-qty]');
  if (!input) return;
  const n = Number.parseInt(input.value, 10);
  if (Number.isFinite(n)) changeQty(input.dataset.lineQty!, null, n);
  else input.value = String(getCart().lines.find((l) => l.key === input.dataset.lineQty)?.qty ?? 1);
});

subscribe(() => {
  renderCount();
  if (drawer?.open) void renderDrawer();
  document.dispatchEvent(new CustomEvent('chipku:cart'));
});

if (drawer) wireDialog(drawer);
if (quick) wireDialog(quick);
renderCount();

// Warm the catalogue when the browser is idle so the first add feels instant.
const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
(idle ?? ((cb: () => void) => window.setTimeout(cb, 1500)))(() => {
  void loadCatalog().catch(() => undefined);
});

export { isPreview };
