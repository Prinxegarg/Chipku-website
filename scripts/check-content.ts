/**
 * Validate the content sources without building the site:
 *   npm run check:content
 * Uses the same rules as the build. Set CHIPKU_SHEETS_CONFIG (or content/sheets.json)
 * to check the live Google Sheets; otherwise the preview catalogue is checked.
 */
import { buildCatalog, ContentError } from '../src/lib/catalog/build.ts';
import { createTabSource } from '../src/lib/catalog/source.ts';

let source;
try {
  source = await createTabSource();
} catch (err) {
  console.error(`✘ ${(err as Error).message}`);
  process.exit(1);
}
console.log(`Checking ${source.describe()}…`);
try {
  const c = await buildCatalog(source);
  console.log(`✔ ${c.products.length} products, ${c.categories.length} categories, ${c.hero.length} hero slides, ${c.reviews.length} published reviews.`);
  console.log(`  Offers: ${[...c.offers.buyGet.map((t) => t.label), c.offers.spend?.label].filter(Boolean).join(' · ') || 'none'}`);
  console.log(`  Shipping fee: ${c.settings.shippingFee === null ? 'not set (checkout stays closed)' : `₹${c.settings.shippingFee / 100}`}`);
  if (c.warnings.length) {
    console.log(`\n${c.warnings.length} warning(s):`);
    for (const w of c.warnings) console.log(`  ! ${w}`);
  }
} catch (err) {
  if (err instanceof ContentError) {
    console.error(`\n✘ ${err.errors.length} error(s) — the site would NOT be published:`);
    for (const e of err.errors) console.error(`  - ${e}`);
    if (err.warnings.length) {
      console.error(`\n${err.warnings.length} warning(s):`);
      for (const w of err.warnings) console.error(`  ! ${w}`);
    }
  } else {
    console.error(`✘ ${(err as Error).message}`);
  }
  process.exit(1);
}
