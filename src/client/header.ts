/**
 * Header states (CHIPKU-PRODUCT-PAGE-DESIGN §4):
 *  - expanded at the top; minimise after >120px from the top + 24px of downward travel
 *  - reveal after 24px of upward travel, but only after a 160ms pause (cancelled if
 *    the visitor scrolls down again); within 48px of the top, expand immediately
 *  - stay expanded while focus is inside the header; freeze while an overlay is open
 *  - short viewports / high zoom: stay compact so the header never covers the page
 */
import { overlayOpen } from './ui.ts';

const header = document.querySelector<HTMLElement>('[data-header]');

if (header) {
  const nav = header.querySelector<HTMLElement>('[data-hdr-nav]');
  const rail = header.querySelector<HTMLElement>('[data-hdr-rail]');
  const root = document.documentElement;
  const desktop = window.matchMedia('(min-width: 960px)');

  let state: 'expanded' | 'compact' = 'expanded';
  let lastY = window.scrollY;
  let down = 0;
  let up = 0;
  let revealTimer = 0;
  let forced = false;
  let ticking = false;

  const offerbar = () => header.querySelector<HTMLElement>('[data-offerbar], .announce');

  function heights() {
    const extra = offerbar()?.offsetHeight ?? 0;
    const expandedBar = desktop.matches ? 80 : 64;
    const railH = desktop.matches ? 0 : 44;
    return { expanded: expandedBar + railH + extra, compact: 52 + extra };
  }

  function sync() {
    const h = heights();
    // Short landscape screens or large text: prioritise content space.
    forced = window.innerHeight < 500 || h.expanded > window.innerHeight * 0.32;
    root.style.setProperty('--header-expanded', `${forced ? h.compact : h.expanded}px`);
    root.style.setProperty('--header-visible', `${state === 'expanded' && !forced ? h.expanded : h.compact}px`);
    if (forced && state === 'expanded') apply('compact');
  }

  function apply(next: 'expanded' | 'compact') {
    if (forced) next = 'compact';
    if (next === state) return;
    state = next;
    header!.dataset.state = next;
    const compact = next === 'compact';
    // Hidden navigation must never receive focus.
    nav?.toggleAttribute('inert', compact && desktop.matches);
    rail?.toggleAttribute('inert', compact);
    const h = heights();
    root.style.setProperty('--header-visible', `${compact ? h.compact : h.expanded}px`);
  }

  function cancelReveal() {
    window.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function onScroll() {
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (y < 0 || y > max + 1) return; // inertial bounce
    if (overlayOpen()) {
      lastY = y;
      return;
    }
    const dy = y - lastY;
    lastY = y;
    if (y <= 48) {
      cancelReveal();
      down = up = 0;
      apply('expanded');
      return;
    }
    if (Math.abs(dy) < 1) return;
    if (dy > 0) {
      down += dy;
      up = 0;
      cancelReveal();
      if (state === 'expanded' && y > 120 && down >= 24 && !header!.contains(document.activeElement)) {
        apply('compact');
      }
    } else {
      up += -dy;
      down = 0;
      if (state === 'compact' && up >= 24 && !revealTimer) {
        revealTimer = window.setTimeout(() => {
          revealTimer = 0;
          if (!overlayOpen()) apply('expanded');
        }, 160);
      }
    }
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );

  header.addEventListener('focusin', () => {
    cancelReveal();
    apply('expanded');
  });

  // Desktop compact "Categories" popover: keep aria-expanded in sync.
  const catsBtn = header.querySelector<HTMLButtonElement>('[data-cats-toggle]');
  const catsPop = document.getElementById('cats-pop');
  catsPop?.addEventListener('toggle', (e) => {
    const open = (e as ToggleEvent).newState === 'open';
    catsBtn?.setAttribute('aria-expanded', String(open));
  });

  const ro = new ResizeObserver(() => sync());
  const bar = offerbar();
  if (bar) ro.observe(bar);
  window.addEventListener('resize', sync, { passive: true });
  desktop.addEventListener('change', () => {
    nav?.toggleAttribute('inert', state === 'compact' && desktop.matches);
    sync();
  });
  sync();
  if (window.scrollY > 120) apply('compact');
}
