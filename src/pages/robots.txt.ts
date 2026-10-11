import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog/index.ts';

export const GET: APIRoute = async ({ site }) => {
  const catalog = await getCatalog();
  // The preview catalogue must never be indexed.
  const body =
    catalog.mode === 'preview'
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /data/\n${site ? `Sitemap: ${new URL('/sitemap.xml', site)}\n` : ''}`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
