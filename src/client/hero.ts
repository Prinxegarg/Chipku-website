/**
 * Five-slide hero carousel.
 *  - autoplay every 7s with a visible Pause/Play control
 *  - pauses while hovered or focused (resumes when the pointer/focus leaves)
 *  - stops after manual navigation or swipe until Play is pressed
 *  - no autoplay and no sliding motion when reduced motion is requested
 *  - swipe on touch without blocking vertical scrolling
 *  - inactive slides are inert; only user-initiated changes are announced
 */
import { prefersReducedMotion } from './ui.ts';

const root = document.querySelector<HTMLElement>('[data-hero]');

if (root) {
  const track = root.querySelector<HTMLElement>('[data-hero-track]')!;
  const slides = [...root.querySelectorAll<HTMLElement>('[data-hero-slide]')];
  const dots = [...root.querySelectorAll<HTMLButtonElement>('[data-hero-dot]')];
  const current = root.querySelector<HTMLElement>('[data-hero-current]');
  const live = root.querySelector<HTMLElement>('[data-hero-live]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-hero-toggle]');
  const interval = Number(root.dataset.interval) || 7000;
  const total = slides.length;

  let index = 0;
  let timer = 0;
  let startedAt = 0;
  let remaining = interval;
  let playing = total > 1 && !prefersReducedMotion();
  let hovered = false;
  let focused = false;
  let visible = true;

  const pad = (n: number) => String(n).padStart(2, '0');

  function preload(i: number) {
    const img = slides[i]?.querySelector<HTMLImageElement>('img[loading="lazy"]');
    if (img) img.loading = 'eager';
  }

  function go(next: number, opts: { user?: boolean } = {}) {
    index = (next + total) % total;
    root!.dataset.motion = prefersReducedMotion() ? 'none' : 'slide';
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((s, i) => {
      const active = i === index;
      s.toggleAttribute('inert', !active);
      if (active) s.removeAttribute('aria-hidden');
      else s.setAttribute('aria-hidden', 'true');
    });
    dots.forEach((d, i) => {
      if (i === index) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
      d.classList.remove('is-timing');
    });
    if (current) current.textContent = pad(index + 1);
    if (opts.user && live) live.textContent = `Slide ${index + 1} of ${total}: ${slides[index].querySelector('h2')?.textContent ?? ''}`;
    preload((index + 1) % total);
    remaining = interval;
    schedule();
  }

  function stopTimer() {
    window.clearTimeout(timer);
    timer = 0;
    dots[index]?.classList.remove('is-timing');
  }

  function canRun() {
    return playing && !hovered && !focused && visible && !document.hidden;
  }

  function schedule() {
    stopTimer();
    if (!canRun()) return;
    startedAt = performance.now();
    const dot = dots[index];
    if (dot) {
      dot.style.setProperty('--hero-ms', `${remaining}ms`);
      dot.style.setProperty('--hero-from', `${1 - remaining / interval}`);
      void dot.offsetWidth;
      dot.classList.add('is-timing');
    }
    timer = window.setTimeout(() => go(index + 1), remaining);
  }

  function pauseTemporarily() {
    if (timer) remaining = Math.max(400, remaining - (performance.now() - startedAt));
    stopTimer();
  }

  function setPlaying(next: boolean) {
    playing = next;
    if (toggle) {
      toggle.dataset.state = next ? 'playing' : 'paused';
      toggle.setAttribute('aria-label', next ? 'Pause slideshow' : 'Play slideshow');
    }
    if (next) {
      remaining = interval;
      schedule();
    } else stopTimer();
  }

  /* manual navigation stops autoplay until Play is pressed */
  function userGo(next: number) {
    setPlaying(false);
    go(next, { user: true });
  }

  root.querySelector('[data-hero-prev]')?.addEventListener('click', () => userGo(index - 1));
  root.querySelector('[data-hero-next]')?.addEventListener('click', () => userGo(index + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => userGo(i)));
  toggle?.addEventListener('click', () => setPlaying(!playing));

  root.addEventListener('keydown', (e) => {
    if (!(e.target as HTMLElement).closest('.hero__controls')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      userGo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      userGo(index - 1);
    }
  });

  root.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') {
      hovered = true;
      pauseTemporarily();
    }
  });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      hovered = false;
      schedule();
    }
  });
  root.addEventListener('focusin', () => {
    focused = true;
    pauseTemporarily();
  });
  root.addEventListener('focusout', (e) => {
    if (!root.contains(e.relatedTarget as Node)) {
      focused = false;
      schedule();
    }
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? pauseTemporarily() : schedule()));
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else pauseTemporarily();
    },
    { threshold: 0.35 },
  ).observe(root);

  /* swipe: horizontal only; vertical scrolling stays native (touch-action: pan-y) */
  let sx = 0;
  let sy = 0;
  let tracking = false;
  const viewport = root.querySelector<HTMLElement>('.hero__viewport')!;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    tracking = true;
    sx = e.clientX;
    sy = e.clientY;
  });
  viewport.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) userGo(index + (dx < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => (tracking = false));

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (e.matches) setPlaying(false);
  });

  if (toggle && total > 1) {
    toggle.hidden = prefersReducedMotion();
    toggle.dataset.state = playing ? 'playing' : 'paused';
  }
  root.dataset.ready = '';
  go(0);
}
