/** Build-time render context and grid markup for cards. */
import { imageTransformOrigins } from '../images.ts';
import { toClientProduct } from '../catalog/index.ts';
import { cardHTML, type RenderCtx } from './card.ts';
import type { Catalog, Product } from '../types.ts';

export const GRID_SIZES = '(min-width: 1024px) 23vw, (min-width: 768px) 31vw, 46vw';

export function renderCtx(catalog: Catalog, extra: Partial<RenderCtx> = {}): RenderCtx {
  const titles = new Map(catalog.categories.map((c) => [c.id, c.title]));
  return {
    origins: imageTransformOrigins(),
    preview: catalog.mode === 'preview',
    categoryTitle: (id) => (id ? titles.get(id) : undefined),
    ...extra,
  };
}

export function gridHTML(catalog: Catalog, products: Product[], extra: Partial<RenderCtx> = {}, cls = 'grid grid--4'): string {
  const ctx = renderCtx(catalog, { sizes: GRID_SIZES, ...extra });
  return `<div class="${cls}">${products.map((p) => cardHTML(toClientProduct(p), ctx)).join('')}</div>`;
}
