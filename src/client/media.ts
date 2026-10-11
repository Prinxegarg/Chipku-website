/** Image resilience + touch card dots. */

/** Replace any image that fails to load with the neutral placeholder (never a broken icon). */
function fallback(img: HTMLImageElement): void {
  if (img.dataset.failed) return;
  img.dataset.failed = '1';
  const card = img.closest<HTMLElement>('[data-card]');
  const slide = img.closest<HTMLElement>('.card__slide');
  // A failed second image: collapse to the primary image (no empty transition).
  if (card && slide && slide.previousElementSibling) {
    slide.remove();
    card.dataset.media = '1';
    card.querySelector('.card__dots')?.remove();
    return;
  }
  const ph = document.createElement('div');
  ph.className = 'ph ph--unavailable';
  ph.setAttribute('role', 'img');
  ph.setAttribute('aria-label', img.alt ? `${img.alt} (image unavailable)` : 'Image unavailable');
  ph.innerHTML = '<span class="ph__sheet"></span><span class="ph__label" aria-hidden="true">Image unavailable</span>';
  img.replaceWith(ph);
}

document.addEventListener(
  'error',
  (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.hasAttribute('data-media')) fallback(t);
  },
  true,
);

export function checkImages(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>('img[data-media]').forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) fallback(img);
  });
}

/** Touch: update the two dots as the shopper swipes between card images. */
function wireDots(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-card][data-media="2"] .card__track:not([data-dots])').forEach((track) => {
    track.dataset.dots = '1';
    const dots = track.parentElement?.querySelectorAll('.card__dots i');
    if (!dots || dots.length < 2) return;
    track.addEventListener(
      'scroll',
      () => {
        const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        dots.forEach((d, n) => d.classList.toggle('is-on', n === i));
      },
      { passive: true },
    );
  });
}

export function enhanceCards(root: ParentNode = document): void {
  checkImages(root);
  wireDots(root);
}

enhanceCards();
