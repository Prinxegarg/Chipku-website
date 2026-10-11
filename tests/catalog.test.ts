import { describe, expect, it } from 'vitest';
import { buildCatalog, ContentError } from '../src/lib/catalog/build.ts';
import { createTabSource, resolveTabUrl } from '../src/lib/catalog/source.ts';
import type { TabSource } from '../src/lib/catalog/source.ts';
import type { TabKey } from '../src/lib/catalog/schema.ts';

function fakeSource(tabs: Partial<Record<TabKey, string>>, mode: 'preview' | 'live' = 'live'): TabSource {
  return { mode, describe: () => 'test', read: async (t) => tabs[t] ?? null };
}

const HERO = 'slide_order,headline,cta_label,cta_url\n1,Your walls need us,Explore CHIPKU,/shop\n';

describe('demo catalogue', () => {
  it('builds the preview catalogue without errors', async () => {
    const c = await buildCatalog(await createTabSource());
    expect(c.mode).toBe('preview');
    expect(c.hero).toHaveLength(5);
    expect(c.hero[0].headline).toBe('Your walls need us');
    expect(c.products.filter((p) => p.type === 'poster').length).toBeGreaterThan(8);
    expect(c.offers.buyGet.map((t) => t.label)).toEqual(['Buy 1 Get 1', 'Buy 2 Get 3', 'Buy 3 Get 4', 'Buy 4 Get 6']);
    expect(c.offers.spend?.threshold).toBe(39900);
    expect(c.reviews).toHaveLength(0);
    expect(c.custom.map((x) => x.finishedSize)).toEqual(['21 × 29.7 cm', '8.9 × 10.7 cm', '6.4 × 7.6 cm']);
    // every demo price is the ₹69 design-preview price
    for (const p of c.products) for (const v of p.variants) expect(v.price).toBe(6900);
  });
});

describe('validation', () => {
  it('rejects duplicate product IDs and bad references', async () => {
    const posters = 'product_id,title,price\nP1,One,69\nP1,Dup,69\n';
    const variants = 'variant_id,product_id,option_value,price\nV1,NOPE,A4,99\n';
    await expect(buildCatalog(fakeSource({ hero: HERO, posters, variants }))).rejects.toBeInstanceOf(ContentError);
  });

  it('keeps a product with a missing price but marks it unavailable', async () => {
    const posters = 'product_id,title,price\nP1,One,\nP2,Two,149\n';
    const c = await buildCatalog(fakeSource({ hero: HERO, posters }));
    expect(c.products.find((p) => p.id === 'P1')!.variants[0].price).toBeNull();
    expect(c.products.find((p) => p.id === 'P2')!.variants[0].price).toBe(14900);
    expect(c.warnings.some((w) => w.includes('P1'))).toBe(true);
  });

  it('treats the Variants tab as the only price source', async () => {
    const posters = 'product_id,title,price\nP1,One,69\n';
    const variants = 'variant_id,product_id,option_value,price,available\nV1,P1,A4,99,TRUE\nV2,P1,A3,149,FALSE\n';
    const c = await buildCatalog(fakeSource({ hero: HERO, posters, variants }));
    const p = c.products[0];
    expect(p.variants.map((v) => [v.id, v.price, v.available])).toEqual([
      ['V1', 9900, true],
      ['V2', 14900, false],
    ]);
  });

  it('drops viewer links and unsafe CTA links', async () => {
    const posters =
      'product_id,title,price,image_url\nP1,One,69,https://drive.google.com/file/d/abc/view\n';
    const hero = 'slide_order,headline,cta_label,cta_url\n1,Hi,Go,javascript:alert(1)\n';
    await expect(buildCatalog(fakeSource({ hero, posters }))).rejects.toThrow(/cta_url/);
    const ok = await buildCatalog(fakeSource({ hero: HERO, posters }));
    expect(ok.products[0].media).toHaveLength(0);
  });

  it('publishes only approved reviews with permission and scopes ratings', async () => {
    const posters = 'product_id,title,price\nP1,One,69\n';
    const reviews = [
      'review_id,scope,product_id,display_name,rating,body,approved,publish_permission',
      'R1,product,P1,Asha,5,Love it,TRUE,TRUE',
      'R2,product,P1,Ravi,3,Okay,TRUE,FALSE',
      'R3,store,,Neel,4,Fast reply,TRUE,TRUE',
    ].join('\n');
    const c = await buildCatalog(fakeSource({ hero: HERO, posters, reviews }));
    expect(c.reviews.map((r) => r.id).sort()).toEqual(['R1', 'R3']);
    expect(c.products[0].rating).toEqual({ average: 5, count: 1 });
  });

  it('requires the hero tab for live builds', async () => {
    await expect(buildCatalog(fakeSource({ posters: 'product_id,title,price\nP1,One,69\n' }))).rejects.toThrow(/Hero/);
  });
});

describe('sheet URLs', () => {
  it('builds CSV links from gids and normalises full links', () => {
    const cfg = { publishedUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml' };
    expect(resolveTabUrl(cfg, 123)).toBe(
      'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=123&single=true&output=csv',
    );
    expect(resolveTabUrl(cfg, 'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?gid=7&output=tsv')).toBe(
      'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?gid=7&output=csv&single=true',
    );
  });
});
