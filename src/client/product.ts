/** Product page: options, quantity, Add to cart, gallery + zoom, sticky buy bar, offer goals, reviews. */
import { formatMoney } from '../lib/money.ts';
import { esc, icons } from '../lib/render/html.ts';
import { priceCart } from '../lib/cart.ts';
import { goalStatus } from '../lib/offers.ts';
import { eligibleNoun } from './cart-render.ts';
import { addSelection } from './cart-ui.ts';
import { getCart, setCart, subscribe } from './cart-store.ts';
import { loadCatalog } from './catalog.ts';
import { announce, openDialog, overlayOpen } from './ui.ts';
import './reviews.ts';
import type { ClientProduct } from '../lib/types.ts';

interface PageData {
  product: ClientProduct;
  media: { id: string; variantId: string | null }[];
  maxQty: number;
  preview: boolean;
}

const data = JSON.parse(document.getElementById('pdp-data')?.textContent || 'null') as PageData | null;

if (data) {
  const p = data.product;
  const form = document.querySelector<HTMLFormElement>('[data-pdp-form]')!;
  const addBtn = form.querySelector<HTMLButtonElement>('[data-pdp-add]')!;
  const optError = form.querySelector<HTMLElement>('[data-opt-error]')!;
  const chosen = form.querySelector<HTMLElement>('[data-chosen]');
  const priceValue = document.querySelector<HTMLElement>('[data-price-value]');
  const priceFrom = document.querySelector<HTMLElement>('[data-pdp-price] .from');
  const qtyInput = form.querySelector<HTMLInputElement>('[data-qty]');
  const dec = form.querySelector<HTMLButtonElement>('[data-qty-dec]');
  const inc = form.querySelector<HTMLButtonElement>('[data-qty-inc]');
  const optionWord = (p.variants[0]?.optionName ?? 'size').toLowerCase();
  const single = p.variants.length === 1;

  const selectedVariant = () => {
    if (single) return p.variants[0].available && p.variants[0].price !== null ? p.variants[0] : undefined;
    const id = form.querySelector<HTMLInputElement>('input[name="variant"]:checked')?.value;
    return p.variants.find((v) => v.id === id);
  };
  const maxQty = () => {
    const v = selectedVariant();
    return Math.max(1, Math.min(data.maxQty, v?.stock ?? Number.POSITIVE_INFINITY));
  };
  const qty = () => Math.min(maxQty(), Math.max(1, Number.parseInt(qtyInput?.value ?? '1', 10) || 1));

  function renderButton() {
    const v = selectedVariant();
    const label = addBtn.querySelector<HTMLElement>('.btn__label')!;
    if (addBtn.dataset.busy) return;
    if (v && v.price !== null) {
      const total = v.price * qty();
      label.innerHTML = `Add to cart <span class="btn__sep">·</span> ${esc(formatMoney(total))}`;
    } else if (p.variants.some((x) => x.available && x.price !== null)) {
      label.textContent = `Choose a ${optionWord}`;
    }
    updateBuybar();
  }

  function onVariantChange() {
    const v = selectedVariant();
    if (!v) return;
    optError.textContent = '';
    if (chosen) chosen.textContent = `: ${v.label}`;
    if (priceValue && v.price !== null) priceValue.textContent = formatMoney(v.price);
    if (priceFrom) priceFrom.hidden = true;
    if (qtyInput && qty() > maxQty()) qtyInput.value = String(maxQty());
    syncQtyButtons();
    renderButton();
    // Variant-linked media: show the first image for this option if one exists.
    const idx = data!.media.findIndex((m) => m.variantId === v.id);
    if (idx >= 0) goTo(idx);
    announce(`${v.label} selected${v.price !== null ? `, ${formatMoney(v.price)}` : ''}.`);
  }

  function syncQtyButtons() {
    if (!qtyInput) return;
    const n = qty();
    qtyInput.value = String(n);
    if (dec) dec.disabled = n <= 1;
    if (inc) inc.disabled = n >= maxQty();
  }

  form.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('input[name="variant"]')) onVariantChange();
  });
  dec?.addEventListener('click', () => {
    qtyInput!.value = String(qty() - 1);
    syncQtyButtons();
    renderButton();
  });
  inc?.addEventListener('click', () => {
    qtyInput!.value = String(qty() + 1);
    syncQtyButtons();
    renderButton();
  });
  qtyInput?.addEventListener('change', () => {
    syncQtyButtons();
    renderButton();
  });

  function requireOption(): boolean {
    if (selectedVariant()) return true;
    optError.innerHTML = `${icons.alert}<span>Select a ${esc(optionWord)} to continue.</span>`;
    form.querySelector<HTMLInputElement>('input[name="variant"]:not(:disabled)')?.focus();
    form.querySelector('[data-options]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!requireOption()) return;
    const v = selectedVariant()!;
    void addSelection({ productId: p.id, variantId: v.id, qty: qty(), button: addBtn }).then((ok) => {
      if (ok) window.setTimeout(renderButton, 1700);
    });
  });

  syncQtyButtons();

  /* ---------------- gallery ---------------- */
  const gallery = document.querySelector<HTMLElement>('[data-gallery]')!;
  const track = gallery.querySelector<HTMLElement>('[data-gallery-track]')!;
  const slides = [...gallery.querySelectorAll<HTMLElement>('[data-gallery-slide]')];
  const thumbs = [...gallery.querySelectorAll<HTMLButtonElement>('[data-thumb]')];
  const counter = gallery.querySelector<HTMLElement>('[data-gallery-current]');
  const prev = gallery.querySelector<HTMLButtonElement>('[data-gallery-prev]');
  const next = gallery.querySelector<HTMLButtonElement>('[data-gallery-next]');
  let current = 0;

  function setCurrent(i: number) {
    current = i;
    if (counter) counter.textContent = String(i + 1);
    thumbs.forEach((t, n) => (n === i ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current')));
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === slides.length - 1;
  }

  function goTo(i: number) {
    const target = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: target * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setCurrent(target);
  }

  let scrollTimer = 0;
  track.addEventListener(
    'scroll',
    () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => setCurrent(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))), 60);
    },
    { passive: true },
  );
  prev?.addEventListener('click', () => goTo(current - 1));
  next?.addEventListener('click', () => goTo(current + 1));
  thumbs.forEach((t) => t.addEventListener('click', () => goTo(Number(t.dataset.thumb))));
  document.querySelector('[data-size-guide]')?.addEventListener('click', (e) => {
    goTo(Number((e.currentTarget as HTMLElement).dataset.sizeGuide));
    gallery.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  setCurrent(0);

  /* ---------------- zoom ---------------- */
  const zoom = document.getElementById('zoom-dialog') as HTMLDialogElement | null;
  const zoomData = JSON.parse(document.getElementById('pdp-zoom-data')?.textContent || '[]') as {
    src: string;
    srcset: string;
    alt: string;
    index: number;
  }[];
  let zi = 0;
  const showZoom = (i: number) => {
    if (!zoom || zoomData.length === 0) return;
    zi = (i + zoomData.length) % zoomData.length;
    const z = zoomData[zi];
    zoom.querySelector<HTMLElement>('[data-zoom-stage]')!.innerHTML = `<img src="${esc(z.src)}"${
      z.srcset ? ` srcset="${esc(z.srcset)}" sizes="100vw"` : ''
    } alt="${esc(z.alt)}" data-media>`;
    const c = zoom.querySelector('[data-zoom-current]');
    if (c) c.textContent = String(zi + 1);
    const single = zoomData.length < 2;
    zoom.querySelectorAll<HTMLElement>('[data-zoom-prev], [data-zoom-next]').forEach((b) => (b.hidden = single));
  };
  gallery.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
    if (!btn || !zoom) return;
    const idx = zoomData.findIndex((z) => z.index === Number(btn.dataset.zoom));
    showZoom(Math.max(0, idx));
    openDialog(zoom, btn);
  });
  zoom?.querySelector('[data-zoom-prev]')?.addEventListener('click', () => showZoom(zi - 1));
  zoom?.querySelector('[data-zoom-next]')?.addEventListener('click', () => showZoom(zi + 1));
  zoom?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') showZoom(zi + 1);
    if (e.key === 'ArrowLeft') showZoom(zi - 1);
  });
  zoom?.addEventListener('chipku:closed', () => goTo(zoomData[zi]?.index ?? current));

  /* ---------------- sticky buy bar (mobile) ---------------- */
  const bar = document.querySelector<HTMLElement>('[data-buybar]');
  const barPrice = bar?.querySelector<HTMLElement>('[data-buybar-price]');
  const barBtn = bar?.querySelector<HTMLButtonElement>('[data-buybar-btn]');
  let pastButton = false;
  const mobile = window.matchMedia('(max-width: 959px)');

  function updateBuybar() {
    if (!bar) return;
    const v = selectedVariant();
    if (barPrice && v?.price != null) barPrice.textContent = formatMoney(v.price * qty());
    const label = barBtn?.querySelector('.btn__label');
    if (label && !barBtn?.dataset.busy) label.textContent = v ? 'Add to cart' : 'Choose options';
    const show = pastButton && mobile.matches && !overlayOpen();
    if (bar.hidden === !show) return;
    bar.hidden = !show;
    document.documentElement.style.setProperty('--sticky-bar-h', show ? `${bar.offsetHeight}px` : '0px');
  }

  if (bar) {
    // Position check rather than IntersectionObserver: a fast jump past the button
    // (anchor link, fling) never crosses the viewport edge, so IO would miss it.
    let ticking = false;
    const measure = () => {
      ticking = false;
      // Only after the shopper has scrolled past the main button (it is above the viewport).
      const past = addBtn.getBoundingClientRect().bottom < 0;
      if (past !== pastButton) {
        pastButton = past;
        updateBuybar();
      }
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(measure);
        }
      },
      { passive: true },
    );
    measure();
    document.addEventListener('chipku:overlay', updateBuybar);
    mobile.addEventListener('change', updateBuybar);
    barBtn?.addEventListener('click', () => {
      if (!selectedVariant()) {
        form.scrollIntoView({ block: 'center', behavior: 'smooth' });
        requireOption();
        return;
      }
      void addSelection({ productId: p.id, variantId: selectedVariant()!.id, qty: qty(), button: barBtn });
    });
  }

  /* ---------------- offer goal tiles ---------------- */
  const offersBox = document.querySelector<HTMLElement>('[data-pdp-offers]');
  const status = offersBox?.querySelector<HTMLElement>('[data-goal-status]');
  const now = Date.now();
  offersBox?.querySelectorAll<HTMLElement>('[data-tile]').forEach((tile) => {
    const s = Number(tile.dataset.starts || Number.NaN);
    const en = Number(tile.dataset.ends || Number.NaN);
    if (s > now || en < now) tile.remove();
  });

  async function renderGoal() {
    if (!offersBox || !status) return;
    const goal = getCart().goal;
    offersBox.querySelectorAll<HTMLButtonElement>('[data-goal]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.goal === goal));
      b.closest('.offer-tile')?.classList.toggle('is-selected', b.dataset.goal === goal);
    });
    let catalog;
    try {
      catalog = await loadCatalog();
    } catch {
      return;
    }
    const priced = priceCart(getCart(), catalog);
    const units = priced.totals.buyGet?.eligibleUnits ?? 0;
    const tier = catalog.offers.buyGet.find((t) => t.id === goal);
    if (!tier) {
      status.textContent = units > 0 ? `You have ${units} ${eligibleNoun(catalog.offers.buyGetEligibility, units)} in your cart.` : '';
      return;
    }
    const g = goalStatus(units, tier);
    const bg = priced.totals.buyGet;
    status.textContent = g.complete && bg?.tier
      ? `Offer complete: ${bg.paidUnits} paid + ${bg.freeUnits} free.`
      : `Goal: ${tier.label}. Choose ${g.remaining} more ${eligibleNoun(catalog.offers.buyGetEligibility, g.remaining)} to complete this offer.`;
  }

  offersBox?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-goal]');
    if (!b) return;
    const state = getCart();
    const goal = state.goal === b.dataset.goal ? null : b.dataset.goal!;
    // Setting a goal never adds items — the shopper picks every design.
    setCart({ ...state, goal });
  });
  subscribe(() => void renderGoal());
  void renderGoal();

  /* ---------------- related: on load, prefer items not already in the cart ---------------- */
  const related = document.querySelector<HTMLElement>('[data-related]');
  function renderRelated() {
    if (!related) return;
    const inCart = new Set(getCart().lines.map((l) => l.productId));
    const cards = [...related.querySelectorAll<HTMLElement>('[data-card]')];
    const fresh = cards.filter((c) => !inCart.has(c.dataset.productId ?? ''));
    const pick = (fresh.length >= 4 ? fresh : [...fresh, ...cards.filter((c) => !fresh.includes(c))]).slice(0, 4);
    cards.forEach((c) => (c.hidden = !pick.includes(c)));
  }
  renderRelated();

  /* ---------------- product reviews: filter, read more, load more ---------------- */
  const revList = document.querySelector<HTMLElement>('[data-rev-list]');
  if (revList) {
    let filter = 'all';
    let limit = 6;
    const items = [...revList.querySelectorAll<HTMLElement>('.rev')];
    const moreBtn = document.querySelector<HTMLButtonElement>('[data-rev-more]');
    const apply = () => {
      const matching = items.filter((r) => filter === 'all' || r.dataset.hasPhoto === '1');
      items.forEach((r) => (r.hidden = !matching.slice(0, limit).includes(r)));
      if (moreBtn) moreBtn.hidden = matching.length <= limit;
    };
    document.querySelectorAll<HTMLButtonElement>('[data-rev-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        filter = b.dataset.revFilter ?? 'all';
        limit = 6;
        document.querySelectorAll('[data-rev-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        apply();
      }),
    );
    moreBtn?.addEventListener('click', () => {
      limit += 6;
      apply();
    });
    revList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-expand]');
      if (!b) return;
      const box = b.closest('[data-expandable]')!;
      const open = b.getAttribute('aria-expanded') !== 'true';
      box.querySelector<HTMLElement>('[data-full]')!.hidden = !open;
      box.querySelector<HTMLElement>('[data-short]')!.hidden = open;
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Show less' : 'Read more';
    });
  }

  renderButton();
}
