import type { APIRoute } from 'astro';
import { getCatalog } from '../../lib/catalog/index.ts';

/** Admin-facing summary of the last published content check (no private data). */
export const GET: APIRoute = async () => {
  const c = await getCatalog();
  const body = {
    mode: c.mode,
    version: c.version,
    generatedAt: c.generatedAt,
    counts: {
      products: c.products.length,
      categories: c.categories.length,
      heroSlides: c.hero.length,
      reviews: c.reviews.length,
      offers: c.offers.buyGet.length + (c.offers.spend ? 1 : 0),
    },
    warnings: c.warnings,
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
