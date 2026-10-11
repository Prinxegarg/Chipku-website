/**
 * Product card + media markup. Used by Astro pages (via set:html) and by the
 * browser (search results, cart suggestions) so every card is identical.
 */
import { esc, icons } from './html.ts';
import { formatMoney } from '../money.ts';
import { CARD_WIDTHS, responsive } from '../images.ts';
import type { ClientImage, ClientProduct, ClientVariant, MediaRole, ProductType } from '../types.ts';

export interface RenderCtx {
  origins: string[];
  preview: boolean;
  categoryTitle?: (id?: string) => string | undefined;
  /** Load the first image eagerly (above-the-fold). */
  eager?: boolean;
  sizes?: string;
  headingTag?: 'h2' | 'h3' | 'h4';
  /** Show format chips (photo prints). */
  showFormats?: boolean;
}

const TYPE_LABEL: Record<ProductType, string> = { poster: 'Poster', sticker: 'Sticker', polaroid: 'Photo print' };

export function placeholderLabel(type: ProductType, role: MediaRole | undefined, preview: boolean): string {
  if (!preview) return 'Image unavailable';
  switch (role) {
    case 'room':
      return 'Room mockup';
    case 'detail':
      return 'Detail photo';
    case 'size_guide':
      return 'Size guide';
    case 'lifestyle':
      return type === 'sticker' ? 'Scale photo' : type === 'polaroid' ? 'Print set photo' : 'Lifestyle photo';
    default:
      return `${TYPE_LABEL[type]} image`;
  }
}

/** Neutral placeholder that keeps the layout and reads as intentional. */
export function placeholderHTML(type: ProductType, role: MediaRole | undefined, preview: boolean): string {
  const label = esc(placeholderLabel(type, role, preview));
  let art = '';
  let mod = '';
  if (type === 'sticker') {
    mod = 'ph--sticker';
    art = '<span class="ph__sticker"></span>';
  } else if (type === 'polaroid') {
    mod = role === 'lifestyle' ? 'ph--polaroid ph--set' : 'ph--polaroid';
    art = role === 'lifestyle' ? '<span class="ph__polaroid"></span><span class="ph__polaroid"></span>' : '<span class="ph__polaroid"></span>';
  } else {
    mod = role === 'room' ? 'ph--room' : role === 'detail' ? 'ph--detail' : role === 'size_guide' ? 'ph--size' : '';
    art = '<span class="ph__sheet"></span>';
  }
  if (!preview) mod += ' ph--unavailable';
  return `<div class="ph ${mod}" role="img" aria-label="${label}">${art}<span class="ph__label" aria-hidden="true">${label}</span></div>`;
}

export function imgHTML(
  image: ClientImage,
  opts: { origins: string[]; widths?: number[]; sizes?: string; eager?: boolean; className?: string; width?: number; height?: number },
): string {
  const { src, srcset } = responsive(image.url, opts.widths ?? CARD_WIDTHS, opts.origins);
  const fit = image.fit === 'cover' ? 'media-img--cover' : 'media-img--contain';
  const style = image.fit === 'cover' && image.focal ? ` style="object-position:${esc(image.focal)}"` : '';
  return `<img class="media-img ${fit} ${opts.className ?? ''}" src="${esc(src)}"${
    srcset ? ` srcset="${esc(srcset)}" sizes="${esc(opts.sizes ?? '(min-width: 1024px) 25vw, 50vw')}"` : ''
  } alt="${esc(image.alt)}" width="${opts.width ?? 800}" height="${opts.height ?? 1000}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async"${
    opts.eager ? ' fetchpriority="high"' : ''
  } data-media${style}>`;
}

export function mediaHTML(
  image: ClientImage | undefined,
  type: ProductType,
  ctx: { origins: string[]; preview: boolean; eager?: boolean; sizes?: string; widths?: number[] },
): string {
  if (!image || !image.url) return placeholderHTML(type, image?.role, ctx.preview);
  return imgHTML(image, ctx);
}

/* ---------------- pricing helpers ---------------- */

export function purchasableVariants(p: Pick<ClientProduct, 'variants'>): ClientVariant[] {
  return p.variants.filter((v) => v.available && v.price !== null);
}

/** "₹69", "From ₹49" (only when prices genuinely differ) or null when unavailable. */
export function priceLabel(p: Pick<ClientProduct, 'variants'>): { text: string; from: boolean } | null {
  const live = purchasableVariants(p);
  if (live.length === 0) return null;
  const prices = live.map((v) => v.price as number);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { text: formatMoney(min), from: min !== max };
}

export type CardAction =
  | { kind: 'add'; variantId: string; label: string }
  | { kind: 'choose'; label: string }
  | { kind: 'unavailable'; label: string };

export function cardAction(p: ClientProduct): CardAction {
  const live = purchasableVariants(p);
  if (live.length === 0) return { kind: 'unavailable', label: 'Currently unavailable' };
  if (p.variants.length === 1) return { kind: 'add', variantId: live[0].id, label: 'Add to cart' };
  const option = (p.variants[0]?.optionName || 'option').toLowerCase();
  return { kind: 'choose', label: option === 'size' || option === 'format' ? `Choose ${option}` : 'Choose options' };
}

export function ratingHTML(r: { average: number; count: number } | undefined, compact = true): string {
  if (!r || r.count === 0) return '';
  const pct = Math.round((r.average / 5) * 100);
  const label = `Rated ${r.average.toFixed(1)} out of 5 from ${r.count} review${r.count === 1 ? '' : 's'}`;
  return `<p class="card__rating"><span class="stars" style="--pct:${pct}%" aria-hidden="true"></span><span class="sr-only">${esc(label)}</span><span aria-hidden="true">${r.average.toFixed(1)}${compact ? ` (${r.count})` : ''}</span></p>`;
}

/* ---------------- card ---------------- */

export function cardHTML(p: ClientProduct, ctx: RenderCtx): string {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const h = ctx.headingTag ?? 'h3';
  const images = p.images.length > 0 ? p.images.slice(0, 2) : [undefined];
  // Only slide when a genuine second image exists (or a reserved preview slot).
  const hasSecond = images.length === 2 && (images[1]?.url || ctx.preview);
  const slides = (hasSecond ? images : images.slice(0, 1))
    .map(
      (img, i) =>
        `<div class="card__slide">${mediaHTML(img, p.type, {
          origins: ctx.origins,
          preview: ctx.preview,
          eager: ctx.eager && i === 0,
          sizes: ctx.sizes,
        })}</div>`,
    )
    .join('');

  const cat = ctx.categoryTitle?.(p.primaryCategoryId);
  const meta = [p.type === 'polaroid' ? 'Photo print' : TYPE_LABEL[p.type], cat].filter(Boolean).join(' · ');
  const price = priceLabel(p);
  const action = cardAction(p);
  const formats =
    ctx.showFormats && p.variants.length > 0
      ? `<p class="card__formats" aria-label="Available formats">${p.variants
          .map((v) => `<span>${esc(v.label)}${v.dimensions ? ` · ${esc(v.dimensions)}` : ''}</span>`)
          .join('')}</p>`
      : '';

  let button: string;
  if (action.kind === 'add') {
    button = `<button type="button" class="btn btn--block card__cta" data-add-to-cart data-product-id="${esc(p.id)}" data-variant-id="${esc(action.variantId)}" aria-label="Add ${esc(p.title)} to cart"><span class="btn__label">${action.label}</span></button>`;
  } else if (action.kind === 'choose') {
    button = `<button type="button" class="btn btn--secondary btn--block card__cta" data-quick-add data-product-id="${esc(p.id)}" aria-haspopup="dialog" aria-label="${esc(action.label)} for ${esc(p.title)}"><span class="btn__label">${action.label}</span></button>`;
  } else {
    button = `<button type="button" class="btn btn--block card__cta" disabled><span class="btn__label">${action.label}</span></button>`;
  }

  return `<article class="card" data-card data-product-id="${esc(p.id)}" data-media="${hasSecond ? 2 : 1}">
<a class="card__media" href="${href}" tabindex="-1" aria-hidden="true"><div class="card__track">${slides}</div>${
    hasSecond ? '<span class="card__dots" aria-hidden="true"><i class="is-on"></i><i></i></span>' : ''
  }</a>${p.badge ? `<span class="card__badge badge">${esc(p.badge)}</span>` : ''}
<div class="card__body"><${h} class="card__title"><a href="${href}">${esc(p.title)}</a></${h}>
<p class="card__meta">${esc(meta)}</p>${formats}${ratingHTML(p.rating)}${
    price
      ? `<p class="card__price">${price.from ? '<span class="from">From </span>' : ''}${esc(price.text)}</p>`
      : '<p class="card__unavailable">Currently unavailable</p>'
  }</div>${button}</article>`;
}
