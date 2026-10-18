/** The CHIPKU Content Manager workbook format (snapshot in tests/fixtures/content-manager). */
// No network in tests: skip the live image-link check.
process.env.CHIPKU_SKIP_IMAGE_CHECK = '1';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/lib/catalog/build.ts';
import { toClientProduct } from '../src/lib/catalog/index.ts';
import type { TabSource } from '../src/lib/catalog/source.ts';
import { resolveTabUrl } from '../src/lib/catalog/source.ts';

const dir = join(import.meta.dirname, 'fixtures/content-manager');
const tabs = Object.fromEntries(readdirSync(dir).map((f) => [f.replace('.csv', ''), readFileSync(join(dir, f), 'utf8')]));
const source = (overrides: Record<string, string> = {}): TabSource => ({
  mode: 'live',
  describe: () => 'fixture',
  read: async (t) => overrides[t] ?? tabs[t] ?? null,
});

describe('Content Manager workbook', () => {
  it('imports the product, option, photos and collections', async () => {
    const c = await buildCatalog(source());
    expect(c.products).toHaveLength(1);
    const p = c.products[0];
    expect(p).toMatchObject({ id: 'Sports-001-virat', slug: 'sports-001-virat-trust', type: 'poster', primaryCategoryId: 'sports', curated: true });
    expect(p.variants).toEqual([expect.objectContaining({ id: 'Sports-001-virat-a4', label: 'A4', optionName: 'Size', price: 6900, stock: 10 })]);
    expect(p.media.map((m) => [m.role, m.fit])).toEqual([
      ['room', 'contain'],
      ['room', 'cover'],
    ]);
    // both photos are tied to the A4 option, so cards still get them
    expect(toClientProduct(p).images).toHaveLength(2);
    expect(c.categories.map((x) => [x.id, x.productType, x.featured])).toEqual([
      ['sports', 'poster', true],
      ['music', 'poster', true],
      ['aesthetics', 'poster', true],
      ['movies', 'poster', true],
    ]);
  });

  it('respects disabled hero slides and offers, and converts custom sizes from cm', async () => {
    const c = await buildCatalog(source());
    expect(c.hero).toHaveLength(0);
    expect(c.offers.buyGet).toHaveLength(0);
    expect(c.offers.spend).toBeNull();
    expect(c.custom.map((x) => [x.title, x.finishedSize, x.photoArea, x.printMm.w])).toEqual([
      ['Custom poster', '21 × 29.7 cm', undefined, 210],
      ['Big polaroid', '8.9 × 10.7 cm', '7.9 × 7.9 cm', 89],
      ['Phone-case polaroid', '6.4 × 7.6 cm', '5.7 × 6.1 cm', 64],
    ]);
  });

  it('maps its offer and hero formats once they are switched on', async () => {
    const c = await buildCatalog(
      source({
        offers: tabs.offers.replace(/,FALSE,/g, ',TRUE,'),
        hero: tabs.hero.replace(/,FALSE/g, ',TRUE'),
      }),
    );
    expect(c.offers.buyGet.map((t) => t.label)).toEqual(['Buy 1 Get 1', 'Buy 2 Get 3', 'Buy 3 Get 4', 'Buy 4 Get 6']);
    expect(c.offers.buyGetEligibility.productTypes).toEqual(['poster']);
    expect(c.offers.spend).toMatchObject({ threshold: 39900, operator: 'gt', percent: 10 });
    expect(c.hero.map((h) => h.ctaUrl)).toEqual(['/shop', '/posters', '/photo-prints', '/stickers', '/shop']);
  });

  it('reads a link-shared sheet through the CSV export', () => {
    const cfg = { spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/184K5rKtYQ8NdIgBJhMv5akMgkv-uiH6LcUD3bywiCiQ/edit?usp=sharing' };
    expect(resolveTabUrl(cfg, '1369126925')).toBe(
      'https://docs.google.com/spreadsheets/d/184K5rKtYQ8NdIgBJhMv5akMgkv-uiH6LcUD3bywiCiQ/export?format=csv&gid=1369126925',
    );
  });
});
