/** Shared UI plumbing: modal dialogs, scroll lock, announcements, toasts. */

const openStack: HTMLDialogElement[] = [];
const openers = new WeakMap<HTMLDialogElement, Element | null>();

function lockScroll(): void {
  if (document.body.classList.contains('is-locked')) return;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  document.body.classList.add('is-locked');
}

function unlockScroll(): void {
  document.body.classList.remove('is-locked');
  document.body.style.paddingRight = '';
}

export function overlayOpen(): boolean {
  return openStack.length > 0;
}

function notifyOverlay(): void {
  document.documentElement.toggleAttribute('data-overlay', openStack.length > 0);
  document.dispatchEvent(new CustomEvent('chipku:overlay', { detail: { open: openStack.length > 0 } }));
}

/** Prepare a <dialog>: backdrop click + Escape close it, focus returns to the opener. */
export function wireDialog(dialog: HTMLDialogElement): void {
  if (dialog.dataset.wired) return;
  dialog.dataset.wired = '1';
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener('close', () => {
    const i = openStack.indexOf(dialog);
    if (i >= 0) openStack.splice(i, 1);
    if (openStack.length === 0) unlockScroll();
    notifyOverlay();
    const opener = openers.get(dialog);
    const replaced = dialog.dataset.replaced === '1';
    delete dialog.dataset.replaced;
    if (!replaced && opener instanceof HTMLElement && opener.isConnected) {
      opener.focus({ preventScroll: true });
    }
    dialog.dispatchEvent(new CustomEvent('chipku:closed'));
  });
  dialog.querySelectorAll<HTMLElement>('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => closeDialog(dialog)),
  );
}

export function openDialog(dialog: HTMLDialogElement, opener: Element | null = document.activeElement): void {
  wireDialog(dialog);
  if (dialog.open) return;
  // Only one overlay at a time (no stacked modals). When one replaces another,
  // focus later returns to the original trigger, not the replaced dialog's.
  let originalOpener = opener;
  for (const d of [...openStack]) {
    if (d === dialog) continue;
    if (d.contains(opener)) originalOpener = openers.get(d) ?? opener;
    d.dataset.replaced = '1';
    d.close();
  }
  openers.set(dialog, originalOpener);
  dialog.showModal();
  openStack.push(dialog);
  lockScroll();
  notifyOverlay();
  const autofocus = dialog.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
  (autofocus ?? dialog.querySelector<HTMLElement>('.drawer__title, .modal__title, h2'))?.focus?.({ preventScroll: true });
  dialog.dispatchEvent(new CustomEvent('chipku:opened'));
}

export function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close();
}

/* ---------- live announcements ---------- */

let politeTimer = 0;
export function announce(message: string): void {
  const region = document.getElementById('sr-status');
  if (!region) return;
  region.textContent = '';
  window.clearTimeout(politeTimer);
  politeTimer = window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

/* ---------- toast ---------- */

export function toast(message: string, action?: { label: string; onClick: () => void }): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.onClick();
      el.remove();
    });
    el.append(b);
  }
  host.append(el);
  window.setTimeout(() => el.remove(), 4200);
}

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}
