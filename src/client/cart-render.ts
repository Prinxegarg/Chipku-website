/** HTML for cart lines, offer progress and the order summary (drawer, cart page, checkout). */
import { esc, icons } from '../lib/render/html.ts';
import { formatMoney } from '../lib/money.ts';
import { cardAction, mediaHTML, priceLabel } from '../lib/render/card.ts';
import { goalStatus, tierNeed } from '../lib/offers.ts';
import type { PricedCart, ViewLine } from '../lib/cart.ts';
import type { ClientCatalog, ClientProduct, Eligibility } from '../lib/types.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function eligibleNoun(e: Eligibility, count: number): string {
  const types = e.productTypes;
  if (types.length === 1) {
    const base = types[0] === 'poster' ? 'poster' : types[0] === 'sticker' ? 'sticker' : 'photo print';
    return `eligible ${count === 1 ? base : `${base}s`}`;
  }
  return `eligible ${count === 1 ? 'item' : 'items'}`;
}

export function offerProgressHTML(priced: PricedCart, goalId: string | null, opts: { compact?: boolean } = {}): string {
  const { totals, offers } = priced;
  const parts: string[] = [];
  const bg = totals.buyGet;
  if (bg && offers.buyGet.length > 0) {
    const goal = goalId ? offers.buyGet.find((t) => t.id === goalId) : undefined;
    let headline = '';
    let detail = '';
    if (goal) {
      const g = goalStatus(bg.eligibleUnits, goal);
      if (g.complete && bg.tier) {
        headline = `Offer complete: ${bg.paidUnits} paid + ${bg.freeUnits} free`;
        detail = bg.tier.id === goal.id ? `${esc(goal.label)} is applied.` : `${esc(bg.tier.label)} is applied.`;
      } else {
        headline = `Your goal: ${goal.label}`;
        detail = `Choose ${g.remaining} more ${eligibleNoun(offers.buyGetEligibility, g.remaining)} to complete this offer.`;
      }
    } else if (bg.tier) {
      headline = `Offer complete: ${bg.paidUnits} paid + ${bg.freeUnits} free`;
      detail = bg.nextTier
        ? `Choose ${bg.remainingForNext} more ${eligibleNoun(offers.buyGetEligibility, bg.remainingForNext)} for ${esc(bg.nextTier.label)}.`
        : `${esc(bg.tier.label)} is applied — the top tier.`;
    } else if (bg.nextTier) {
      headline = esc(bg.nextTier.label);
      detail = `Choose ${bg.remainingForNext} more ${eligibleNoun(offers.buyGetEligibility, bg.remainingForNext)} to complete this offer.`;
    }
    const steps = offers.buyGet
      .map((t) => {
        const reached = bg.eligibleUnits >= tierNeed(t);
        const applied = bg.tier?.id === t.id;
        return `<li class="ladder__step${reached ? ' is-reached' : ''}${applied ? ' is-applied' : ''}${goal?.id === t.id ? ' is-goal' : ''}"><span class="ladder__n">${tierNeed(t)}</span><span class="ladder__label">${esc(t.label)}</span></li>`;
      })
      .join('');
    parts.push(`<div class="progress-block">
  <p class="progress-block__title">${icons.tag}<span>${esc(headline)}</span></p>
  <p class="progress-block__text">${detail}</p>
  ${opts.compact ? '' : `<ol class="ladder" role="list" aria-label="Buy/Get tiers by number of eligible items">${steps}</ol>`}
</div>`);
  }
  const sp = totals.spend;
  if (sp) {
    const pct = Math.round(sp.progress * 100);
    const label = esc(sp.offer.label);
    let text: string;
    if (sp.qualifies) {
      text = `<strong>${sp.offer.percent}% off unlocked.</strong> You save ${formatMoney(sp.discount)}.`;
    } else if (sp.atThreshold) {
      text = `Your eligible total is exactly ${formatMoney(sp.offer.threshold)}. The offer applies <em>above</em> that — add ${formatMoney(sp.remaining)} more to unlock ${sp.offer.percent}% off.`;
    } else {
      text = `Add ${formatMoney(sp.remaining)} more to unlock ${sp.offer.percent}% off.`;
    }
    parts.push(`<div class="progress-block">
  <p class="progress-block__title">${icons.sparkle}<span>${label}</span><span class="progress-block__meta">Combines with Buy/Get</span></p>
  <div class="progress" role="progressbar" aria-label="Progress to ${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${sp.qualifies ? 'Unlocked' : `${formatMoney(sp.remaining)} to go`}"><div class="progress__fill" style="width:${pct}%"></div><span class="progress__marker" aria-hidden="true"></span></div>
  <p class="progress-block__text">${text}</p>
</div>`);
  }
  return parts.length ? `<section class="offer-progress" aria-label="Offer progress">${parts.join('')}</section>` : '';
}

export function lineHTML(v: ViewLine, ctx: { origins: string[]; preview: boolean; fresh?: string | null }): string {
  const p = v.product;
  const title = p ? esc(p.title) : 'Item no longer available';
  const href = p ? `/products/${encodeURIComponent(p.slug)}` : '#';
  const option = v.variant && p && p.variants.length > 1 ? `${esc(v.variant.optionName)}: ${esc(v.variant.label)}` : v.variant?.dimensions ? esc(v.variant.dimensions) : '';
  const key = esc(v.line.key);
  const img = p ? mediaHTML(p.images[0], p.type, { origins: ctx.origins, preview: ctx.preview, sizes: '72px' }) : '';
  const notes: string[] = [];
  if (v.status === 'missing') notes.push(`<p class="line__note line__note--error">${icons.alert}This product is no longer available. Remove it to continue.</p>`);
  if (v.status === 'unavailable') notes.push(`<p class="line__note line__note--error">${icons.alert}This option is currently unavailable. Remove it to continue.</p>`);
  if (v.priceChanged && v.unitPrice !== null) notes.push(`<p class="line__note">${icons.info}Price updated to ${formatMoney(v.unitPrice)} since you added it.</p>`);
  if (v.status === 'ok' && v.line.qty > v.maxQty) notes.push(`<p class="line__note line__note--error">${icons.alert}Only ${v.maxQty} can be ordered. Lower the quantity to continue.</p>`);
  const free = v.freeQty > 0 ? `<span class="line__free">${v.freeQty} free</span>` : '';
  const amount =
    v.status === 'ok'
      ? `<span class="line__amount">${formatMoney(v.subtotal)}</span>${free}`
      : '<span class="line__amount muted">—</span>';
  const qty =
    v.status === 'ok'
      ? `<div class="qty qty--sm" role="group" aria-label="Quantity for ${title}">
  <button type="button" data-line-dec="${key}" data-focus-key="dec:${key}" aria-label="Decrease quantity of ${title}" ${v.line.qty <= 1 ? 'disabled' : ''}>${icons.minus}</button>
  <input type="text" inputmode="numeric" pattern="[0-9]*" value="${v.line.qty}" data-line-qty="${key}" data-focus-key="qty:${key}" aria-label="Quantity of ${title}">
  <button type="button" data-line-inc="${key}" data-focus-key="inc:${key}" aria-label="Increase quantity of ${title}" ${v.line.qty >= v.maxQty ? 'disabled' : ''}>${icons.plus}</button>
</div>`
      : '';
  return `<li class="line${ctx.fresh === v.line.key ? ' is-new' : ''}" data-line="${key}">
  <a class="line__img" href="${href}" tabindex="-1" aria-hidden="true">${img}</a>
  <div class="line__main">
    <div class="line__top"><a class="line__title" href="${href}">${title}</a><div class="line__price">${amount}</div></div>
    ${option ? `<p class="line__opt">${option}</p>` : ''}
    ${v.unitPrice !== null && v.status === 'ok' ? `<p class="line__unit">${formatMoney(v.unitPrice)} each</p>` : ''}
    ${notes.join('')}
    <div class="line__actions">${qty}<button type="button" class="line__remove" data-line-remove="${key}" data-focus-key="rm:${key}">Remove<span class="sr-only"> ${title}</span></button></div>
  </div>
</li>`;
}

export function linesHTML(priced: PricedCart, ctx: { origins: string[]; preview: boolean; fresh?: string | null }): string {
  return `<ul class="lines" role="list">${priced.lines.map((v) => lineHTML(v, ctx)).join('')}</ul>`;
}

export function summaryHTML(
  priced: PricedCart,
  catalog: ClientCatalog,
  opts: { shipping?: boolean; checkout?: boolean; continueBtn?: boolean } = {},
): string {
  const t = priced.totals;
  const rows: string[] = [`<div class="sum__row"><dt>Subtotal <span class="muted">(${plural(t.itemCount, 'item')})</span></dt><dd>${formatMoney(t.subtotal)}</dd></div>`];
  if (t.buyGet && t.buyGet.discount > 0 && t.buyGet.tier) {
    rows.push(`<div class="sum__row sum__row--save"><dt>${esc(t.buyGet.tier.label)} <span class="muted">(${t.buyGet.freeUnits} free)</span></dt><dd>−${formatMoney(t.buyGet.discount)}</dd></div>`);
  }
  if (t.spend && t.spend.discount > 0) {
    rows.push(`<div class="sum__row sum__row--save"><dt>${t.spend.offer.percent}% off</dt><dd>−${formatMoney(t.spend.discount)}</dd></div>`);
  }
  const s = catalog.settings;
  let shipNote = '';
  if (opts.shipping && s.shippingFee !== null) {
    rows.push(`<div class="sum__row"><dt>Shipping</dt><dd>${s.shippingFee === 0 ? 'Free' : formatMoney(s.shippingFee)}</dd></div>`);
  } else {
    shipNote = s.shippingNote ?? 'Shipping and taxes are confirmed at checkout before you pay.';
  }
  const grand = t.total + (opts.shipping && s.shippingFee ? s.shippingFee : 0);
  rows.push(`<div class="sum__row sum__row--total"><dt>${opts.shipping && s.shippingFee !== null ? 'Total' : 'Merchandise total'}</dt><dd>${formatMoney(grand)}</dd></div>`);
  const notes = [shipNote, s.taxNote].filter(Boolean).map((n) => `<p class="sum__note">${esc(n)}</p>`).join('');
  const blocking = priced.blocking ? `<p class="notice notice--error" role="status">${icons.alert}<span>Review the highlighted item${priced.lines.filter((l) => l.status !== 'ok').length === 1 ? '' : 's'} before checking out.</span></p>` : '';
  const actions = opts.checkout
    ? `<div class="sum__actions">${blocking}<a class="btn btn--block btn--lg" href="/checkout" ${priced.blocking || t.itemCount === 0 ? 'aria-disabled="true" data-disabled-link' : ''}>Checkout</a>${
        opts.continueBtn ? '<button type="button" class="btn-quiet" data-close>Continue shopping</button>' : ''
      }</div>`
    : '';
  return `<dl class="sum">${rows.join('')}</dl>${notes}${actions}`;
}

export function emptyHTML(): string {
  return `<div class="cart-empty">
  <p class="cart-empty__title">Your next favourite is waiting</p>
  <p class="muted">Your cart is empty.</p>
  <a class="btn" href="/shop">Explore CHIPKU</a>
</div>`;
}

/* ---------- suggestions ("More from [category]") ---------- */

export function pickSuggestions(priced: PricedCart, catalog: ClientCatalog, limit = 3): { title: string; items: ClientProduct[] } | null {
  const inCart = new Set(priced.lines.map((l) => l.line.productId));
  const purchasable = (p: ClientProduct) => p.variants.some((v) => v.available && v.price !== null);
  const posters = [...priced.lines]
    .filter((l) => l.product?.type === 'poster')
    .sort((a, b) => b.line.addedAt - a.line.addedAt);
  const context = posters[0]?.product;
  const cat = context?.primaryCategoryId;
  const pool = catalog.products.filter((p) => purchasable(p) && !inCart.has(p.id));
  if (cat) {
    const same = pool.filter((p) => p.categoryIds.includes(cat));
    if (same.length > 0) {
      const title = catalog.categories.find((c) => c.id === cat)?.title ?? 'this collection';
      return { title: `More from ${title}`, items: same.slice(0, limit) };
    }
  }
  const fallback = pool.filter((p) => p.type === 'poster').sort((a, b) => Number(b.trending) - Number(a.trending) || a.sortOrder - b.sortOrder);
  return fallback.length ? { title: 'You may also like', items: fallback.slice(0, limit) } : null;
}

export function suggestionHTML(p: ClientProduct, ctx: { origins: string[]; preview: boolean }): string {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const price = priceLabel(p);
  const action = cardAction(p);
  const btn =
    action.kind === 'add'
      ? `<button type="button" class="btn btn--sm btn--block" data-add-to-cart data-product-id="${esc(p.id)}" data-variant-id="${esc(action.variantId)}" data-focus-key="sugg:${esc(p.id)}" aria-label="Add ${esc(p.title)} to cart"><span class="btn__label">Add</span></button>`
      : `<button type="button" class="btn btn--sm btn--secondary btn--block" data-inline-choose="${esc(p.id)}" data-focus-key="sugg:${esc(p.id)}" aria-expanded="false" aria-label="${esc(action.label)} for ${esc(p.title)}"><span class="btn__label">${esc(action.label)}</span></button>`;
  return `<li class="sugg" data-sugg="${esc(p.id)}">
  <a class="sugg__img" href="${href}" tabindex="-1" aria-hidden="true">${mediaHTML(p.images[0], p.type, { ...ctx, sizes: '120px' })}</a>
  <a class="sugg__title" href="${href}">${esc(p.title)}</a>
  <p class="sugg__price">${price ? `${price.from ? 'From ' : ''}${esc(price.text)}` : 'Currently unavailable'}</p>
  ${btn}
</li>`;
}

export function inlineChooseHTML(p: ClientProduct): string {
  const name = esc(p.variants[0]?.optionName ?? 'Option');
  const chips = p.variants
    .map((v) => {
      const disabled = !v.available || v.price === null;
      return `<label class="chip"><input type="radio" name="inline-${esc(p.id)}" value="${esc(v.id)}" ${disabled ? 'disabled' : ''}><span><span class="chip__name">${esc(v.label)}</span>${
        v.price !== null ? `<small>${formatMoney(v.price)}</small>` : ''
      }${disabled ? '<small>Unavailable</small>' : ''}</span></label>`;
    })
    .join('');
  return `<div class="inline-choose" data-inline-panel="${esc(p.id)}" role="group" aria-label="Choose ${name.toLowerCase()} for ${esc(p.title)}">
  <p class="inline-choose__title">${esc(p.title)}</p>
  <fieldset class="chip-group"><legend class="sr-only">${name}</legend>${chips}</fieldset>
  <p class="field__error" data-inline-error></p>
  <div class="inline-choose__actions">
    <button type="button" class="btn btn--sm" data-inline-add="${esc(p.id)}"><span class="btn__label">Add to cart</span></button>
    <button type="button" class="btn-quiet" data-inline-cancel>Cancel</button>
  </div>
</div>`;
}
