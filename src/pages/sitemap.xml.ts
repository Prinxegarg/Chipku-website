import type { APIRoute } from 'astro';
import { getCatalog, categoryUrl, productUrl } from '../lib/catalog/index.ts';

export const GET: APIRoute = async ({ site }) => {
  const catalog = await getCatalog();
  if (!site || catalog.mode === 'preview') {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
      headers: { 'content-type': 'application/xml' },
    });
  }
  const paths = ['/', '/shop', '/posters', '/photo-prints', '/stickers', '/new-arrivals', ...catalog.categories.map(categoryUrl), ...catalog.products.map(productUrl)];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
    .map((p) => `<url><loc>${new URL(p, site).toString()}</loc></url>`)
    .join('')}</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
