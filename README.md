# CHIPKU — storefront

Posters, photo prints and stickers. **Your walls need us.**

A fast, static storefront (Astro) for Cloudflare Pages. Product content comes from Google Sheets, images from Cloudflare R2, and checkout runs through Razorpay via small Pages Functions that re-price every order on the server.

> **Status: connected to the CHIPKU-Content-Manager Google Sheet** (`content/sheets.json`). `npm run dev` shows the products in the sheet, and edits appear on the next page refresh. `npm run dev:demo` shows the demo catalogue instead: placeholder images and ₹69 example prices, marked "Preview" and `noindex`. Checkout stays closed until Razorpay and shipping are configured. See [docs/SETUP.md](docs/SETUP.md).

## What's included

| Area | Highlights |
| --- | --- |
| Header | Minimises on scroll down; after a 160 ms pause on scroll up, the extra navigation slides back in from the top. Stays expanded while it has keyboard focus. Mobile category rail. Yellow Buy/Get offer bar: one offer at a time with arrows on phones, plus an Offer details dialog. |
| Homepage | 5-slide hero: 7 s autoplay, pause/play, swipe, arrows, dots, no autoplay with reduced motion. Category tiles. Shop by collection (Sports, Music, Aesthetics, Movies) with "Trending in…" tabs. Trending/Bestsellers tabs driven by sheet flags. Photo prints with a format filter. Custom prints that send people to Instagram @chipku_shop. Stickers. A slow review strip scrolling to the right. Details and FAQ slots. |
| Product cards | 4:5 stage. Desktop hover slides to the second image; touch screens swipe between images. One factual badge. Real ratings only. Single-option products add directly; others open Choose size/format. |
| Product page | Gallery with thumbnails, swipe, counter and a zoom dialog. Option chips with unavailable states. Quantity stepper. Add to cart button showing the price, with Adding…/Added/error states. Offer goal tiles, accordions, sticky mobile buy bar, "More from [category]", photo prints, product reviews (filters, read more, load more, photo dialog). |
| Cart | Persistent cart that syncs across tabs. Drawer with Buy/Get + 10%-above-₹399 progress, line editing, same-category suggestions (with inline option choice), and savings. Full cart page and checkout page. |
| Offers | One engine shared by the browser, tests and the server. Buy 1 Get 1 / 2+3 / 3+4 / 4+6 means extra free items. Only the highest tier applies, and the cheapest eligible items are the free ones. 10% off strictly above ₹399, worked out after Buy/Get. All amounts are calculated in paise. |
| Content | 15-tab Google Sheets contract with validation. A broken sheet never replaces the live site. Image links are checked during each publish. `/data/content-report.json` lists warnings. |
| Checkout | `/api/checkout/config`, `/order` (server re-pricing → Razorpay order) and `/verify` (HMAC signature), plus an optional private order log in Google Sheets. |

## Commands

```bash
npm install
npm run dev             # local dev server, live from the Google Sheet
npm run dev:demo        # local dev server with the demo catalogue
npm run build           # static build → dist/
npm run preview         # serve dist/ on :4321
npm test                # unit tests: offers, cart, catalogue validation, checkout API
npm run test:e2e        # browser checks against a demo build (CHIPKU_SHEETS_CONFIG='{}' npm run build && npm run preview)
npm run typecheck
npm run check:content   # validate sheet content without building
npm run docs:sheets     # regenerate docs/GOOGLE-SHEETS.md from the schema
npm run functions:dev   # run checkout functions locally with wrangler
```

## Project map

```
content/demo/*.csv          preview catalogue = Google Sheets templates (one CSV per tab)
content/sheets.json         sheet connection (or env CHIPKU_SHEETS_CONFIG)
src/lib/catalog/            schema, sheet fetch, validation, queries
src/lib/offers.ts           offer engine (shared with the server)
src/lib/cart.ts             cart state + pricing
src/lib/render/             card/media HTML shared by build and browser
src/client/                 browser modules (header, hero, cart, product, listing, checkout…)
src/components, src/pages   Astro components and routes
functions/api/checkout/     Cloudflare Pages Functions (Razorpay)
integrations/google-apps-script/Code.gs   CHIPKU menu: Publish, config helper, order log
docs/                       SETUP.md (go-live steps), GOOGLE-SHEETS.md (all columns)
brand-source/               original logo files as supplied
```

## Environment variables (Cloudflare Pages)

| Variable | Purpose |
| --- | --- |
| `CHIPKU_SHEETS_CONFIG` | JSON `{ publishedUrl, tabs }` from **CHIPKU → Show website sheet config** |
| `CHIPKU_REQUIRE_LIVE` | `1` in production: fail the build rather than publish the preview catalogue |
| `CHIPKU_IMAGE_TRANSFORMS` | e.g. `https://img.chipku.in` to enable resized WebP/AVIF via Image Transformations |
| `CHIPKU_SKIP_IMAGE_CHECK` | `1` to skip checking image links during the build |
| `SITE_URL` | Public origin for canonical links and the sitemap |
| `CHECKOUT_ENABLED` | `true` to open checkout |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay API keys (secret as an encrypted variable) |
| `ORDERS_WEBHOOK_URL` / `ORDERS_WEBHOOK_SECRET` | Optional: forward verified orders to the Apps Script order log |

## Still needed from CHIPKU before launch

- Real catalogue in Google Sheets: product names, prices, sizes/formats, dimensions, finishes, and which items are trending or bestsellers.
- Images on R2: product artwork and mockups, 5 desktop and 5 mobile hero compositions, category tile images, custom-print mockups.
- Approved customer reviews and photos with permission to publish. The site shows none until they are supplied.
- Settings: shipping fee and note, tax note, delivery and returns text, contact email, plus Details and FAQ content.
- Confirmation of the proposed offer rules shown to shoppers: Buy/Get counts posters only, the cheapest items are free, only one tier applies, 10% is worked out after Buy/Get, and "above ₹399" is strict.
- Accounts and credentials: Cloudflare Pages project and deploy hook, an R2 bucket and custom domain, and Razorpay keys (test first).
