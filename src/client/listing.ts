/** Listing filters + sort. Client-side over pre-rendered cards; state mirrors the URL. */
import { esc, icons } from '../lib/render/html.ts';

interface Meta {
  t: string;
  c: string[];
  o: string[];
  p: number | null;
  a: boolean;
  n: number;
  i: number;
}

const root = document.querySelector<HTMLElement>('[data-listing]');
const metaEl = root?.querySelector('[data-listing-meta]');

if (root && metaEl) {
  const meta = JSON.parse(metaEl.textContent || '{}') as Record<string, Meta>;
  const labels = JSON.parse(root.querySelector('[data-listing-labels]')?.textContent || '{}') as {
    cat: Record<string, string>;
    type: Record<string, string>;
  };
  const grid = root.querySelector<HTMLElement>('.listing-grid')!;
  const cards = [...grid.querySelectorAll<HTMLElement>('[data-card]')];
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const active = root.querySelector<HTMLElement>('[data-active]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const sortSel = root.querySelector<HTMLSelectElement>('[data-sort]');
  const inputs = () => [...root.querySelectorAll<HTMLInputElement>('input[name]')];

  // Restore from URL
  const params = new URLSearchParams(location.search);
  for (const input of inputs()) {
    const values = params.getAll(input.name);
    if (input.type === 'checkbox') input.checked = values.includes(input.value);
    else if (values[0]) input.value = values[0];
  }
  if (sortSel) sortSel.value = params.get('sort') ?? root.dataset.defaultSort ?? 'featured';

  function state() {
    const checked = (name: string) => inputs().filter((i) => i.name === name && i.checked).map((i) => i.value);
    const num = (name: string) => {
      const v = inputs().find((i) => i.name === name)?.value;
      return v ? Number(v) * 100 : null;
    };
    return {
      type: checked('type'),
      cat: checked('cat'),
      opt: checked('opt'),
      avail: checked('avail').length > 0,
      min: num('min'),
      max: num('max'),
      sort: sortSel?.value ?? 'featured',
    };
  }

  function apply() {
    const s = state();
    let shown = 0;
    for (const card of cards) {
      const m = meta[card.dataset.productId ?? ''];
      if (!m) continue;
      const ok =
        (s.type.length === 0 || s.type.includes(m.t)) &&
        (s.cat.length === 0 || m.c.some((c) => s.cat.includes(c))) &&
        (s.opt.length === 0 || m.o.some((o) => s.opt.includes(o))) &&
        (!s.avail || m.a) &&
        (s.min === null || (m.p !== null && m.p >= s.min)) &&
        (s.max === null || (m.p !== null && m.p <= s.max));
      card.hidden = !ok;
      if (ok) shown++;
    }
    const sorted = [...cards].sort((a, b) => {
      const ma = meta[a.dataset.productId!];
      const mb = meta[b.dataset.productId!];
      if (s.sort === 'newest') return mb.n - ma.n || ma.i - mb.i;
      if (s.sort === 'price-asc') return (ma.p ?? Infinity) - (mb.p ?? Infinity) || ma.i - mb.i;
      if (s.sort === 'price-desc') return (mb.p ?? -1) - (ma.p ?? -1) || ma.i - mb.i;
      return ma.i - mb.i;
    });
    sorted.forEach((c) => grid.append(c));
    count.textContent = `${shown} product${shown === 1 ? '' : 's'}`;
    empty.hidden = shown > 0;
    grid.hidden = shown === 0;

    // Active filter chips
    const chips: string[] = [];
    const chip = (name: string, value: string, label: string) =>
      chips.push(
        `<button type="button" class="active-chip" data-remove="${esc(name)}" data-value="${esc(value)}" aria-label="Remove filter ${esc(label)}">${esc(label)}${icons.close}</button>`,
      );
    s.type.forEach((v) => chip('type', v, labels.type[v] ?? v));
    s.cat.forEach((v) => chip('cat', v, labels.cat[v] ?? v));
    s.opt.forEach((v) => chip('opt', v, v));
    if (s.avail) chip('avail', '1', 'In stock only');
    if (s.min !== null) chip('min', '', `From ₹${s.min / 100}`);
    if (s.max !== null) chip('max', '', `Up to ₹${s.max / 100}`);
    active.innerHTML = chips.length ? `${chips.join('')}<button type="button" class="clear-all" data-clear>Clear all</button>` : '';

    // URL
    const q = new URLSearchParams();
    s.type.forEach((v) => q.append('type', v));
    s.cat.forEach((v) => q.append('cat', v));
    s.opt.forEach((v) => q.append('opt', v));
    if (s.avail) q.set('avail', '1');
    if (s.min !== null) q.set('min', String(s.min / 100));
    if (s.max !== null) q.set('max', String(s.max / 100));
    if (s.sort !== (root!.dataset.defaultSort ?? 'featured')) q.set('sort', s.sort);
    const qs = q.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  root.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('input[name], select[name]')) apply();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rm = t.closest<HTMLElement>('[data-remove]');
    if (rm) {
      for (const i of inputs()) {
        if (i.name !== rm.dataset.remove) continue;
        if (i.type === 'checkbox' && i.value === rm.dataset.value) i.checked = false;
        if (i.type !== 'checkbox') i.value = '';
      }
      apply();
      count.focus?.();
      return;
    }
    if (t.closest('[data-clear]')) {
      for (const i of inputs()) {
        if (i.type === 'checkbox') i.checked = false;
        else i.value = '';
      }
      apply();
    }
  });
  if ([...params.keys()].length > 0) apply();
}
