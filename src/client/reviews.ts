/**
 * Reviews: the homepage strip (slow, seamless scroll toward the right — pauses on
 * hover, focus or the Pause button; static with reduced motion or too few reviews)
 * and the shared review / photo dialog.
 */
import { esc } from '../lib/render/html.ts';
import { openDialog, prefersReducedMotion } from './ui.ts';

const SPEED = 28; // px per second — slow enough to read

document.querySelectorAll<HTMLElement>('[data-reviews]').forEach((section) => {
  const viewport = section.querySelector<HTMLElement>('[data-marquee-viewport]')!;
  const track = section.querySelector<HTMLElement>('[data-marquee-track]')!;
  const toggle = section.querySelector<HTMLButtonElement>('[data-marquee-toggle]');
  const label = section.querySelector<HTMLElement>('[data-marquee-label]');
  const originals = [...track.children] as HTMLElement[];

  function teardown() {
    track.querySelectorAll('[data-clone]').forEach((n) => n.remove());
    section.removeAttribute('data-animated');
    track.style.removeProperty('--marquee-duration');
    if (toggle) toggle.hidden = true;
  }

  function setup() {
    teardown();
    if (prefersReducedMotion()) return;
    const setWidth = track.scrollWidth;
    // Too few reviews to loop seamlessly: keep a calm, static (scrollable) row.
    if (setWidth < viewport.clientWidth * 1.15) return;
    for (const node of originals) {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.dataset.clone = '';
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      track.append(clone);
    }
    track.style.setProperty('--marquee-duration', `${Math.round(setWidth / SPEED)}s`);
    section.dataset.animated = '';
    if (toggle) toggle.hidden = false;
  }

  toggle?.addEventListener('click', () => {
    const paused = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(paused));
    section.toggleAttribute('data-paused', paused);
    if (label) label.textContent = paused ? 'Play reviews' : 'Pause reviews';
  });

  let width = viewport.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(viewport.clientWidth - width) > 40) {
      width = viewport.clientWidth;
      setup();
    }
  }).observe(viewport);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', setup);
  if (document.fonts?.ready) void document.fonts.ready.then(setup);
  else setup();
});

/* ---------- full review / photo dialog (homepage + product page) ---------- */

interface ReviewData {
  id: string;
  name: string;
  body: string;
  title?: string;
  rating?: number;
  date?: string;
  product?: string;
  media: { url: string; alt: string }[];
}

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-review-open]');
  const dialog = document.getElementById('review-dialog') as HTMLDialogElement | null;
  if (!btn || !dialog) return;
  const scope = btn.closest('section');
  const data = JSON.parse(scope?.querySelector('[data-review-data]')?.textContent || '[]') as ReviewData[];
  const r = data.find((x) => x.id === btn.dataset.reviewOpen);
  if (!r) return;
  const body = dialog.querySelector<HTMLElement>('[data-review-dialog-body]')!;
  body.innerHTML = `${r.media
    .map((m) => `<img class="review-dialog__img" src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy" data-media>`)
    .join('')}${
    r.rating
      ? `<p class="review-card__stars"><span class="stars" style="--pct:${(r.rating / 5) * 100}%" aria-hidden="true"></span><span class="sr-only">Rated ${r.rating} out of 5</span></p>`
      : ''
  }${r.title ? `<p class="review-card__title">${esc(r.title)}</p>` : ''}<p class="review-dialog__text prewrap">${esc(r.body)}</p><p class="review-card__by"><strong>${esc(
    r.name,
  )}</strong></p><p class="review-card__meta">${[r.product, r.date]
    .filter(Boolean)
    .map((x) => esc(x))
    .join(' · ')}</p>`;
  const title = dialog.querySelector('#review-dialog-title');
  if (title) title.textContent = `Review from ${r.name}`;
  openDialog(dialog, btn);
});
