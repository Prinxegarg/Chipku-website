# Going live: Cloudflare, Google Sheets, R2 images and Razorpay

This is the step-by-step path from the design preview to a live shop. Nothing here is connected yet — each step needs your accounts or credentials.

```
Google Sheets ──(Publish to web, CSV)──► Cloudflare Pages build ──► static site + /data/catalog.json
      ▲                                     │  checks every row; a failed check keeps the last good site live
      │ CHIPKU ▸ Publish website now ───────┘
Cloudflare R2 (img.chipku.in) ──► image URLs pasted into the sheet
Browser cart ──► /api/checkout/order (re-prices from catalog.json) ──► Razorpay ──► /api/checkout/verify ──► (optional) Orders tab
```

## 1. Deploy the site on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choose this repository.
2. Build settings: framework preset **Astro**, build command `npm run build`, output directory `dist`. Node 22.12 or newer (`NODE_VERSION=22` variable if needed).
3. The `functions/` folder is picked up automatically (checkout API).
4. Add your custom domain (e.g. `chipku.in`) under **Custom domains**, and set `SITE_URL=https://chipku.in` in the environment variables (used for canonical links and the sitemap).

Without any sheet configured the build publishes the **preview catalogue** (demo products, ₹69 example prices, `noindex`). To make sure that can never reach production, set `CHIPKU_REQUIRE_LIVE=1` on the **Production** environment — the build then fails instead of publishing demo data.

## 2. Connect Google Sheets

The site is already connected to the **CHIPKU-Content-Manager** sheet (`content/sheets.json`). It reads each tab through Google's CSV export, so the sheet must stay shared as **Anyone with the link → Viewer**. Anyone who has the link can read every tab, so keep orders, customer contact details and unapproved reviews somewhere else.

- Column reference: [GOOGLE-SHEETS.md](GOOGLE-SHEETS.md). The importer also accepts the Content Manager's own names (`size_label`, `fit`, `mockup_url`, sizes in cm, `percentage` offers, `>` operators, plural product types, the "Hero slides", "Offer settings" and "Product categories" tabs).
- Adding or renaming tabs: **Extensions → Apps Script**, paste `integrations/google-apps-script/Code.gs`, save and reload the sheet. **CHIPKU → Show website sheet config** prints the `spreadsheetUrl` + tab-gid JSON for `content/sheets.json` or the Cloudflare variable **`CHIPKU_SHEETS_CONFIG`**.
- Alternative: **File → Share → Publish to web** (CSV) and use `publishedUrl` instead of `spreadsheetUrl`.
- Check the sheet without building: `npm run check:content`. View the demo catalogue instead of the sheet: `npm run dev:demo`.

### How changes appear on the site

- Edit the sheet → **CHIPKU → Publish website now** (or the optional daily schedule). This calls a Cloudflare **deploy hook** (Pages → Settings → Builds → Deploy hooks → create one, then **CHIPKU → Set Cloudflare deploy hook**).
- The build downloads every tab, validates it, and publishes everything together (prices, cards, suggestions, offers and the checkout price list all change at once). Typical time: a few minutes.
- If a check fails, the build stops and **the previous site stays live**. The error is shown in Cloudflare Pages → Deployments (enable deployment-failure email notifications there). Warnings are listed at `/data/content-report.json`.
- With `npm run dev` on your computer, sheet edits show up on the next page refresh (re-read at most every 20 seconds).
- With a "Publish to web" link instead of link sharing, Google can take up to ~5 minutes to refresh the data after an edit.

## 3. Images on Cloudflare R2

1. R2 → **Create bucket** (e.g. `chipku-images`) → Settings → **Custom domains** → connect `img.chipku.in`.
2. Upload images (recommended: product artwork 1600 px on the long side, JPG/PNG/WebP; hero art 1600 × 1200 desktop and 900 × 800 mobile). Use stable, versioned file names (`pst-0001-front-v2.jpg`) — when you replace an image, upload a new name and update the sheet so browsers don't keep the old cached file.
3. Paste the public URLs into the sheet (`image_url`, Media tab, Hero tab, etc.).
4. Optional, recommended: enable **Images → Transformations** for the `chipku.in` zone and set `CHIPKU_IMAGE_TRANSFORMS=https://img.chipku.in` in Pages. The site then requests right-sized WebP/AVIF automatically (`/cdn-cgi/image/width=…`). Without it, images are served exactly as uploaded.

During live builds every product image URL is checked; a link that doesn't load is replaced with a neutral "Image unavailable" state and listed as a warning.

## 4. Razorpay checkout

1. Create a Razorpay account, complete KYC, and copy **Key ID** and **Key Secret** (start with test-mode keys).
2. In Cloudflare Pages → Settings → Variables and secrets (Production):
   - `RAZORPAY_KEY_ID` = `rzp_live_…` (or `rzp_test_…`)
   - `RAZORPAY_KEY_SECRET` = secret (type **Secret**)
   - `CHECKOUT_ENABLED` = `true` — only once everything below is confirmed
3. Set `shipping_fee` in the Settings tab (0 for free shipping). Checkout stays closed while it is blank. Add `shipping_note` / `tax_note` if they apply.
4. How payment works: the browser sends only product IDs and quantities. `/api/checkout/order` re-prices them from the published catalogue with the same offer engine (Buy/Get + 10% above ₹399), adds shipping, and creates a Razorpay order for that exact amount. After payment, `/api/checkout/verify` checks Razorpay's signature. Customer name, phone, email, address and the item list are stored in the Razorpay order **notes**, visible in the Razorpay dashboard.
5. Optional order log: create a **separate, private** spreadsheet for orders (never publish it) and copy its ID from the URL. In the content sheet's Apps Script → Project settings → Script properties, add `ORDERS_SPREADSHEET_ID` (that ID) and `ORDERS_WEBHOOK_SECRET` (a long random string). Deploy the script as a **Web app** (Execute as: Me, Access: Anyone), then set `ORDERS_WEBHOOK_URL` (the web app URL) and the same `ORDERS_WEBHOOK_SECRET` in Cloudflare. Each verified payment appends a row to the private Orders sheet.
6. Recommended before launch: add a Razorpay **webhook** for `payment.captured` (so an order is recorded even if the shopper closes the tab before confirmation), and turn on auto-capture in Razorpay settings. Test with Razorpay test cards/UPI first.

Payment methods shown (UPI, cards, netbanking, wallets) are whatever you enable in the Razorpay dashboard. Cash on delivery is not part of this integration.

## 5. Local development

```bash
npm install
npm run dev            # http://localhost:4321 — preview catalogue
npm test               # unit tests (offers, cart, catalogue rules, checkout API)
npm run build && npm run preview
npm run test:e2e       # browser checks against the preview server (needs Chromium)
cp .dev.vars.example .dev.vars && npm run functions:dev   # run the checkout API locally
```
