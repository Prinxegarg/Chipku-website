import type { APIRoute } from 'astro';
import { getCatalog, toClientCatalog } from '../../lib/catalog/index.ts';

/** Published catalogue used by the browser cart AND re-read by the checkout function. */
export const GET: APIRoute = async () => {
  const catalog = await getCatalog();
  return new Response(JSON.stringify(toClientCatalog(catalog)), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
