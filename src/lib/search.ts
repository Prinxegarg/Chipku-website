/** Small client-side product search (names, categories, product type, tags). */
import type { ClientCatalog, ClientProduct } from './types.ts';

const TYPE_WORDS: Record<string, string> = {
  poster: 'poster posters',
  sticker: 'sticker stickers',
  polaroid: 'photo print prints polaroid polaroids',
};

export const normalise = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function searchProducts(catalog: ClientCatalog, query: string, limit = 60): ClientProduct[] {
  const q = normalise(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const cats = new Map(catalog.categories.map((c) => [c.id, normalise(c.title)]));
  const scored: { p: ClientProduct; score: number }[] = [];
  for (const p of catalog.products) {
    const title = normalise(p.title);
    const rest = [TYPE_WORDS[p.type], ...p.categoryIds.map((id) => cats.get(id) ?? id), ...p.tags.map(normalise)].join(' ');
    let score = 0;
    let all = true;
    for (const t of tokens) {
      if (title.split(' ').some((w) => w.startsWith(t))) score += 20;
      else if (title.includes(t)) score += 10;
      else if (rest.split(' ').some((w) => w.startsWith(t))) score += 8;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    if (title.startsWith(q)) score += 100;
    else if (title.includes(q)) score += 50;
    if (!p.variants.some((v) => v.available && v.price !== null)) score -= 30;
    scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.p.sortOrder - b.p.sortOrder).slice(0, limit).map((x) => x.p);
}
