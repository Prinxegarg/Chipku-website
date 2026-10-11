/** Offer bar: date windows, one-at-a-time on mobile (manual only, no auto-rotation), details dialog. */
import { openDialog } from './ui.ts';

const bar = document.querySelector<HTMLElement>('[data-offerbar]');
if (bar) {
  const now = Date.now();
  const items = [...bar.querySelectorAll<HTMLElement>('[data-offer-item]')].filter((li) => {
    const starts = Number(li.dataset.starts || Number.NaN);
    const ends = Number(li.dataset.ends || Number.NaN);
    const live = !(starts > now) && !(ends < now);
    if (!live) li.remove();
    return live;
  });
  if (items.length === 0) {
    bar.remove();
  } else {
    let index = 0;
    const pos = bar.querySelector<HTMLElement>('[data-offer-pos]');
    const prev = bar.querySelector<HTMLButtonElement>('[data-offer-prev]');
    const next = bar.querySelector<HTMLButtonElement>('[data-offer-next]');
    const show = (i: number) => {
      index = (i + items.length) % items.length;
      items.forEach((li, n) => li.classList.toggle('is-active', n === index));
      if (pos) pos.textContent = `${index + 1}/${items.length}`;
    };
    if (items.length < 2) {
      prev?.setAttribute('hidden', '');
      next?.setAttribute('hidden', '');
      pos?.setAttribute('hidden', '');
    }
    prev?.addEventListener('click', () => show(index - 1));
    next?.addEventListener('click', () => show(index + 1));
    bar.dataset.enhanced = '';
    show(0);
  }
}

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-open-offers]');
  const dialog = document.getElementById('offers-dialog') as HTMLDialogElement | null;
  if (btn && dialog) openDialog(dialog, btn);
});
