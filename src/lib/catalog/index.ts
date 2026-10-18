/**
 * Catalogue access for pages. A production build loads it once. During `npm run dev`
 * it is re-read from the sheet at most every 20 seconds, so sheet edits appear on the
 * next page refresh; if a refresh fails, the last good catalogue keeps being used.
 */
import { buildCatalog, ContentError } from './build.ts';
import { createTabSource } from './source.ts';
import { imageTransformOrigins } from '../images.ts';
import type { Catalog, Category, ClientCatalog, ClientProduct, Product, ProductType } from '../types.ts';

const DEV_REFRESH_MS = 20_000;
let cached: Promise<Catalog> | null = null;
let loadedAt = 0;
let lastGood: Catalog | null = null;

async function load(): Promise<Catalog> {
  const source = await createTabSource();
  try {
    const catalog = await buildCatalog(source);
    const tag = catalog.mode === 'preview' ? 'PREVIEW catalogue' : 'LIVE catalogue';
    console.log(
      `[chipku] ${tag} from ${source.describe()}: ${catalog.products.length} products, version ${catalog.version}` +
        (catalog.warnings.length ? `, ${catalog.warnings.length} warning(s)` : ''),
    );
    for (const w of catalog.warnings) console.warn(`[chipku] warning: ${w}`);
    lastGood = catalog;
    return catalog;
  } catch (err) {
    if (err instanceof ContentError) {
      for (const w of err.warnings) console.warn(`[chipku] warning: ${w}`);
    }
    throw err;
  }
}

export function getCatalog(): Promise<Catalog> {
  const dev = Boolean(import.meta.env?.DEV);
  if (cached && dev && Date.now() - loadedAt > DEV_REFRESH_MS) {
    const previous = lastGood;
    loadedAt = Date.now();
    cached = load().catch((err) => {
      if (!previous) throw err;
      console.error(`[chipku] sheet refresh failed — keeping the last good catalogue.\n${(err as Error).message}`);
      return previous;
    });
  }
  if (!cached) {
    loadedAt = Date.now();
    cached = load();
  }
  return cached;
}

/* ---------------- routing ---------------- */

export const TYPE_ROUTES: Record<ProductType, { path: string; title: string; singular: string; intro: string }> = {
  poster: {
    path: '/posters',
    title: 'Posters',
    singular: 'Poster',
    intro: 'Make room for your taste.',
  },
  polaroid: {
    path: '/photo-prints',
    title: 'Photo prints',
    singular: 'Photo print',
    intro: 'From camera roll to keepsake.',
  },
  sticker: {
    path: '/stickers',
    title: 'Stickers',
    singular: 'Sticker',
    intro: 'Small stickers. Big personality.',
  },
};

export const productUrl = (p: { slug: string }) => `/products/${p.slug}`;
export const categoryUrl = (c: { slug: string }) => `/collections/${c.slug}`;

/* ---------------- queries ---------------- */

export function isPurchasable(p: Product): boolean {
  return p.variants.some((v) => v.available && v.price !== null);
}

export function byType(c: Catalog, type: ProductType): Product[] {
  return c.products.filter((p) => p.type === type);
}

export function inCategory(c: Catalog, categoryId: string): Product[] {
  return c.products.filter((p) => p.categoryIds.includes(categoryId));
}

export function categoryById(c: Catalog, id?: string): Category | undefined {
  return id ? c.categories.find((x) => x.id === id) : undefined;
}

/** Same-category recommendations, following the product brief's selection logic. */
export function relatedFor(c: Catalog, product: Product, limit = 8): { label: 'same' | 'broad'; items: Product[] } {
  const pool = c.products.filter((p) => p.id !== product.id && isPurchasable(p));
  const ordered: Product[] = [];
  const push = (p?: Product) => {
    if (p && !ordered.some((x) => x.id === p.id)) ordered.push(p);
  };
  for (const id of c.recommendations[product.id] ?? []) push(pool.find((p) => p.id === id));
  if (product.primaryCategoryId) {
    pool.filter((p) => p.primaryCategoryId === product.primaryCategoryId).forEach(push);
    pool.filter((p) => p.categoryIds.includes(product.primaryCategoryId!)).forEach(push);
  }
  if (ordered.length > 0) return { label: 'same', items: ordered.slice(0, limit) };
  // Broader relevance: shared secondary categories, then the same product type.
  pool.filter((p) => p.categoryIds.some((id) => product.categoryIds.includes(id))).forEach(push);
  pool.filter((p) => p.type === product.type).forEach(push);
  return { label: 'broad', items: ordered.slice(0, limit) };
}

/* ---------------- client payload ---------------- */

export function toClientProduct(p: Product): ClientProduct {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    type: p.type,
    primaryCategoryId: p.primaryCategoryId,
    categoryIds: p.categoryIds,
    badge: p.badge,
    trending: p.trending,
    bestseller: p.bestseller,
    curated: p.curated,
    isNew: p.isNew,
    sortOrder: p.sortOrder,
    tags: p.tags,
    // Card images: product-wide photos first; if every photo is tied to an option, use those.
    images: (p.media.some((m) => !m.variantId) ? p.media.filter((m) => !m.variantId) : p.media)
      .slice(0, 2)
      .map((m) => ({ url: m.url, alt: m.alt, fit: m.fit, focal: m.focal, role: m.role })),
    variants: p.variants.map((v) => ({
      id: v.id,
      optionName: v.optionName,
      label: v.label,
      dimensions: v.dimensions,
      price: v.price,
      available: v.available,
      stock: v.stock,
    })),
    rating: p.rating,
  };
}

export function toClientCatalog(c: Catalog): ClientCatalog {
  return {
    mode: c.mode,
    version: c.version,
    products: c.products.map(toClientProduct),
    categories: c.categories.map(({ id, title, slug, parentId, productType }) => ({ id, title, slug, parentId, productType })),
    offers: c.offers,
    settings: {
      maxQtyPerItem: c.settings.maxQtyPerItem,
      shippingFee: c.settings.shippingFee,
      shippingNote: c.settings.shippingNote,
      taxNote: c.settings.taxNote,
      instagramUrl: c.settings.instagramUrl,
      instagramHandle: c.settings.instagramHandle,
    },
    imageTransformOrigins: imageTransformOrigins(),
  };
}
