/** Header search dialog with instant results; Enter goes to /search?q=… */
import { esc } from '../lib/render/html.ts';
import { mediaHTML, priceLabel } from '../lib/render/card.ts';
import { searchProducts } from '../lib/search.ts';
import { loadCatalog } from './catalog.ts';
import { openDialog } from './ui.ts';

const dialog = document.getElementById('search-dialog') as HTMLDialogElement | null;

if (dialog) {
  const input = dialog.querySelector<HTMLInputElement>('[data-search-input]')!;
  const results = dialog.querySelector<HTMLElement>('[data-search-results]')!;
  const initial = results.innerHTML;
  let timer = 0;

  const run = async () => {
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = initial;
      return;
    }
    let catalog;
    try {
      catalog = await loadCatalog();
    } catch {
      results.innerHTML = '<p class="notice notice--error">Search is unavailable right now. Please try again.</p>';
      return;
    }
    if (input.value.trim() !== q) return;
    const hits = searchProducts(catalog, q, 8);
    const typeLabel: Record<string, string> = { poster: 'Poster', sticker: 'Sticker', polaroid: 'Photo print' };
    if (hits.length === 0) {
      results.innerHTML = `<p class="search-empty"><strong>No results for “${esc(q)}”.</strong> Try a shorter word or browse a category.</p>${initial}`;
      return;
    }
    const ctx = { origins: catalog.imageTransformOrigins, preview: catalog.mode === 'preview', sizes: '56px' };
    results.innerHTML = `<p class="label muted">${hits.length === 8 ? 'Top results' : `${hits.length} result${hits.length === 1 ? '' : 's'}`}</p>
<ul class="search-results__list" role="list">${hits
      .map((p) => {
        const price = priceLabel(p);
        return `<li><a class="search-hit" href="/products/${encodeURIComponent(p.slug)}"><span class="search-hit__img">${mediaHTML(p.images[0], p.type, ctx)}</span><span><span class="search-hit__title">${esc(p.title)}</span><br><span class="search-hit__meta">${typeLabel[p.type]}</span></span><span class="search-hit__price">${price ? esc(`${price.from ? 'From ' : ''}${price.text}`) : ''}</span></a></li>`;
      })
      .join('')}</ul>
<a class="text-link" href="/search?q=${encodeURIComponent(q)}">See all results for “${esc(q)}”</a>`;
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 120);
  });

  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-open-search]');
    if (!btn) return;
    openDialog(dialog, btn);
    void loadCatalog().catch(() => undefined);
    input.focus();
    input.select();
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === '/' && !dialog.open && !t.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      openDialog(dialog, document.activeElement);
      input.focus();
    }
  });
}
