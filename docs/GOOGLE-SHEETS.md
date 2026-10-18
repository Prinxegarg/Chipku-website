# Google Sheets content guide

_Generated from `src/lib/catalog/schema.ts` — run `npm run docs:sheets` after changing the schema._

Every tab in `content/demo/` is a ready-made template: in Google Sheets use **File → Import → Upload**, choose the CSV, and pick **Insert new sheet(s)**. Name each tab as in the table titles below (the CHIPKU menu matches them).

## Rules that apply to every tab

- Row 1 holds the column names. Column order does not matter, and extra columns are ignored, so you can keep your own notes columns.
- IDs (`product_id`, `variant_id`, …) are permanent. Links between tabs always use IDs, never row numbers or titles, so you can sort and reorder rows freely.
- Prices are plain numbers in rupees (`149`, not `₹149`). Currency is INR.
- `TRUE`/`FALSE` columns also accept yes/no and 1/0. A blank `active` or `status` means active.
- Images must be **direct image links** from Cloudflare R2 (e.g. `https://img.chipku.in/posters/pst-0001.jpg`). Google Drive/Photos viewer links are rejected. One image per row (use the Media tab for more).
- Text is shown as plain text. HTML or formulas are never executed on the site.
- Only reviews with **approved = TRUE** and **publish_permission = TRUE** are shown on the site.
- **Anything in a published sheet can be read by anyone who has the link.** Keep customer emails, phone numbers, order IDs, verification evidence and not-yet-approved reviews out of the published spreadsheet.

## What blocks publishing vs. what only warns

| Errors — the site is **not** updated, the last good version stays live | Warnings — published, problem row handled safely |
| --- | --- |
| Missing required column, duplicate ID, link to an ID that does not exist, broken offer rule, unsafe button link, Hero tab missing | Missing/invalid price (item shows “Currently unavailable”), image link that does not load (neutral placeholder shown), unknown category on a product, hero slide count other than 5 |

The latest warnings are listed at `/data/content-report.json` on the site after each publish.

## Hero Banner (required)

Exactly five homepage slides. Text and buttons are real page elements, not part of the image.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `slide_order` | Yes | 1 to 5. | `1` |
| `eyebrow` |  | Small line above the headline. | `POSTERS · PHOTO PRINTS · STICKERS` |
| `headline` | Yes | Large slide headline. | `Your walls need us` |
| `body` |  | One supporting sentence. |  |
| `cta_label` | Yes | Button label. | `Explore CHIPKU` |
| `cta_url` | Yes | Button destination: a site path (/posters) or a full https:// link. | `/shop` |
| `desktop_image_url` |  | Desktop art panel, about 1600 × 1200 px. |  |
| `mobile_image_url` |  | Separately composed mobile art, about 900 × 800 px. |  |
| `alt_text` |  | Image description. Leave blank if the image only decorates the slide text. |  |
| `active` |  | FALSE hides the slide. Blank = TRUE. |  |

## Posters

One row per poster design.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `product_id` | Yes | Permanent unique ID. Never reuse or change it once live. | `PST-0001` |
| `title` | Yes | Product name shown on cards and the product page. | `Midnight Court` |
| `slug` |  | URL name. Leave blank to generate from the title. | `midnight-court` |
| `status` |  | active, draft or archived. Only active rows are published. Blank = active. | `active` |
| `primary_category_id` |  | Main category ID from the Categories tab (used for breadcrumbs and “More from …”). | `sports` |
| `category_ids` |  | Extra category IDs, separated by commas. | `sports, aesthetics` |
| `description` |  | Short description under the price. |  |
| `details` |  | Longer product details for the “Product details” section. Line breaks are kept. |  |
| `price` |  | Price in rupees (numbers only) for products WITHOUT rows in the Variants tab. | `69` |
| `option_label` |  | Optional visible label for that single option, e.g. a size. | `A4` |
| `dimensions` |  | Real dimensions for that single option. | `21 × 29.7 cm` |
| `image_url` |  | Main image (Cloudflare R2 URL). More images go in the Media tab. | `https://img.chipku.in/posters/pst-0001-front.jpg` |
| `alt_text` |  | Describes the main image for screen readers. |  |
| `badge` |  | One short factual label, e.g. New or Customisable. Leave blank for none. | `New` |
| `trending` |  | TRUE to show in Trending. | `TRUE` |
| `bestseller` |  | TRUE to show in Bestsellers — only when your sales data supports it. | `FALSE` |
| `curated` |  | TRUE to show in “Our picks” under Find your next favourite. | `TRUE` |
| `new_arrival` |  | TRUE to list under New arrivals. | `TRUE` |
| `tags` |  | Search keywords, separated by commas. | `football, black and white` |
| `sort_order` |  | Lower numbers appear first. | `10` |

## Stickers

One row per sticker product.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `product_id` | Yes | Permanent unique ID. Never reuse or change it once live. | `PST-0001` |
| `title` | Yes | Product name shown on cards and the product page. | `Midnight Court` |
| `slug` |  | URL name. Leave blank to generate from the title. | `midnight-court` |
| `status` |  | active, draft or archived. Only active rows are published. Blank = active. | `active` |
| `primary_category_id` |  | Main category ID from the Categories tab (used for breadcrumbs and “More from …”). | `sports` |
| `category_ids` |  | Extra category IDs, separated by commas. | `sports, aesthetics` |
| `description` |  | Short description under the price. |  |
| `details` |  | Longer product details for the “Product details” section. Line breaks are kept. |  |
| `price` |  | Price in rupees (numbers only) for products WITHOUT rows in the Variants tab. | `69` |
| `option_label` |  | Optional visible label for that single option, e.g. a size. | `A4` |
| `dimensions` |  | Real dimensions for that single option. | `21 × 29.7 cm` |
| `image_url` |  | Main image (Cloudflare R2 URL). More images go in the Media tab. | `https://img.chipku.in/posters/pst-0001-front.jpg` |
| `alt_text` |  | Describes the main image for screen readers. |  |
| `badge` |  | One short factual label, e.g. New or Customisable. Leave blank for none. | `New` |
| `trending` |  | TRUE to show in Trending. | `TRUE` |
| `bestseller` |  | TRUE to show in Bestsellers — only when your sales data supports it. | `FALSE` |
| `curated` |  | TRUE to show in “Our picks” under Find your next favourite. | `TRUE` |
| `new_arrival` |  | TRUE to list under New arrivals. | `TRUE` |
| `tags` |  | Search keywords, separated by commas. | `football, black and white` |
| `sort_order` |  | Lower numbers appear first. | `10` |

## Polaroids

Ready-made photo prints (shown as “Photo prints” on the site).

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `product_id` | Yes | Permanent unique ID. Never reuse or change it once live. | `PST-0001` |
| `title` | Yes | Product name shown on cards and the product page. | `Midnight Court` |
| `slug` |  | URL name. Leave blank to generate from the title. | `midnight-court` |
| `status` |  | active, draft or archived. Only active rows are published. Blank = active. | `active` |
| `primary_category_id` |  | Main category ID from the Categories tab (used for breadcrumbs and “More from …”). | `sports` |
| `category_ids` |  | Extra category IDs, separated by commas. | `sports, aesthetics` |
| `description` |  | Short description under the price. |  |
| `details` |  | Longer product details for the “Product details” section. Line breaks are kept. |  |
| `price` |  | Price in rupees (numbers only) for products WITHOUT rows in the Variants tab. | `69` |
| `option_label` |  | Optional visible label for that single option, e.g. a size. | `A4` |
| `dimensions` |  | Real dimensions for that single option. | `21 × 29.7 cm` |
| `image_url` |  | Main image (Cloudflare R2 URL). More images go in the Media tab. | `https://img.chipku.in/posters/pst-0001-front.jpg` |
| `alt_text` |  | Describes the main image for screen readers. |  |
| `badge` |  | One short factual label, e.g. New or Customisable. Leave blank for none. | `New` |
| `trending` |  | TRUE to show in Trending. | `TRUE` |
| `bestseller` |  | TRUE to show in Bestsellers — only when your sales data supports it. | `FALSE` |
| `curated` |  | TRUE to show in “Our picks” under Find your next favourite. | `TRUE` |
| `new_arrival` |  | TRUE to list under New arrivals. | `TRUE` |
| `tags` |  | Search keywords, separated by commas. | `football, black and white` |
| `sort_order` |  | Lower numbers appear first. | `10` |

## Variants

One row per purchasable option (size, format or pack). When a product has variant rows, this tab is its only price source.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `variant_id` | Yes | Permanent unique ID. | `PST-0001-A3` |
| `product_id` | Yes | The product this option belongs to. | `PST-0001` |
| `option_name` |  | Group label shown to shoppers. Blank = Size. | `Size` |
| `option_value` | Yes | Option label. | `A3` |
| `dimensions` |  | Real dimensions of this option. | `29.7 × 42 cm` |
| `finish` |  | Paper or finish, only if verified. |  |
| `pack_count` |  | Number of items in a pack. |  |
| `price` | Yes | Price in rupees, numbers only. | `149` |
| `available` |  | FALSE shows the option as unavailable. Blank = TRUE. |  |
| `stock_quantity` |  | Optional. Limits the quantity a shopper can choose. |  |
| `sort_order` |  | Lower numbers appear first. |  |

## Media

Extra product images, one row per image. Order controls the gallery and the hover image (second image).

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `media_id` |  | Unique ID (optional but recommended). |  |
| `product_id` | Yes | Product the image belongs to. |  |
| `variant_id` |  | Show this image when that option is selected. |  |
| `role` |  | artwork, room, detail, size_guide or lifestyle. Artwork is shown uncropped. | `room` |
| `image_url` | Yes | Cloudflare R2 image URL. |  |
| `mobile_image_url` |  | Optional mobile crop. |  |
| `alt_text` |  | Image description. |  |
| `sort_order` |  | Lower numbers appear first. The product-row image is always first. |  |
| `fit` |  | contain (show the whole image) or cover (fill and crop). Blank = based on role. | `contain` |
| `focal_point` |  | For cropped photos: horizontal% vertical%. | `50% 35%` |

## Categories

Collections such as Sports, Music, Aesthetics and Movies.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `category_id` | Yes | Permanent ID used by products. | `sports` |
| `title` | Yes | Visible name. | `Sports` |
| `slug` |  | URL name. Blank = generated from the title. |  |
| `product_type` |  | poster, sticker or polaroid. | `poster` |
| `parent_id` |  | Parent category ID, if nested. |  |
| `description` |  | One-sentence introduction for the collection page. |  |
| `image_url` |  | Collection tile image (4:3). |  |
| `alt_text` |  | Image description. |  |
| `show_on_home` |  | TRUE to show in “Shop by collection”. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `active` |  | FALSE hides it. Blank = TRUE. |  |

## Product categories

Optional extra product ↔ category links, one row per pair (in addition to primary_category_id).

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `product_id` | Yes | Product ID. |  |
| `category_id` | Yes | Category ID from the Categories tab. |  |
| `sort_order` |  | Not used yet. |  |

## Offers

One row per offer. The same rows drive the offer bar, product tiles, cart and the checkout price check.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `offer_id` | Yes | Permanent unique ID. | `B2G3` |
| `type` | Yes | buy_get or spend_percent. | `buy_get` |
| `label` |  | Text for the offer bar. Blank = generated. | `Buy 2 Get 3` |
| `paid_qty` |  | buy_get: items paid for. | `2` |
| `free_qty` |  | buy_get: extra free items. | `3` |
| `threshold` |  | spend_percent: amount in rupees. | `399` |
| `threshold_operator` |  | gt = above the amount; gte = the amount or more. | `gt` |
| `percent_off` |  | spend_percent: percentage. | `10` |
| `eligible_product_types` |  | Comma-separated: poster, sticker, polaroid. Blank = all. | `poster` |
| `eligible_category_ids` |  | Comma-separated category IDs. Blank = all. |  |
| `eligible_variant_ids` |  | Comma-separated variant IDs. Blank = all. |  |
| `active` |  | FALSE switches it off. Blank = TRUE. |  |
| `starts_at` |  | Optional start date (YYYY-MM-DD). |  |
| `ends_at` |  | Optional end date (YYYY-MM-DD), inclusive. |  |
| `terms` |  | Customer-facing terms shown in Offer details. |  |

## Settings

Key / value pairs for store-wide text and rules. Unknown keys are ignored.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `key` | Yes | Setting name (see the list in docs). |  |
| `value` |  | Setting value. |  |
| `notes` |  | Your own notes. Not published. |  |

### Settings keys

| Key | What it does | Example |
| --- | --- | --- |
| `instagram_handle` | Instagram handle without @. Used for custom orders and the footer. | `chipku_shop` |
| `instagram_url` | Full Instagram link. Blank = built from the handle. |  |
| `shipping_fee` | Flat shipping fee in rupees. 0 = free shipping. Blank = checkout stays closed until shipping is set. | `49` |
| `shipping_note` | Short shipping explanation shown in the cart and at checkout. |  |
| `tax_note` | How taxes are handled, e.g. “Prices include GST.” Only if true. |  |
| `delivery_info` | “Delivery” section on product pages. |  |
| `returns_info` | “Returns” section on product pages. |  |
| `contact_email` | Support email shown in the footer. |  |
| `max_qty_per_item` | Largest quantity per cart line. Blank = 10. | `10` |
| `announcement` | Neutral text strip shown only when no offers are active. | `Posters. Prints. Stickers. All you.` |
| `currency_increment` | Smallest rupee step for “Add ₹X more” messages. Blank = 1. | `1` |
| `buy_get_terms` | Extra customer-facing terms for the Buy/Get ladder. |  |
| `tile_image_posters` | Image for the Posters tile on the homepage (4:3). |  |
| `tile_image_photo_prints` | Image for the Photo prints tile (4:3). |  |
| `tile_image_stickers` | Image for the Stickers tile (4:3). |  |

## Reviews

Only approved reviews with publication permission are published.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `review_id` | Yes | Permanent unique ID. |  |
| `scope` |  | product (about one product) or store (general feedback). Blank = product if product_id is set. |  |
| `product_id` |  | Reviewed product. |  |
| `display_name` | Yes | Name the reviewer agreed to show, e.g. “Aanya S.”. |  |
| `rating` |  | Whole number 1–5, only if the customer gave one. |  |
| `title` |  | Optional short title. |  |
| `body` | Yes | Review text exactly as approved. |  |
| `review_date` |  | YYYY-MM-DD. |  |
| `image_url` |  | First customer photo. More go in Review media. |  |
| `alt_text` |  | Photo description. |  |
| `approved` | Yes | TRUE to publish. |  |
| `publish_permission` | Yes | TRUE when the customer agreed to publication. |  |
| `verified_purchase_status` |  | verified only when matched to a real order. |  |

## Review media

Additional customer photos, one row per photo.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `review_id` | Yes | Review the photo belongs to. |  |
| `image_url` | Yes | Photo URL. |  |
| `alt_text` |  | Photo description. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `publish_permission` |  | FALSE hides the photo. Blank = follows the review. |  |

## Custom products

The three custom print formats. Orders are taken on Instagram.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `custom_id` | Yes | Permanent unique ID. | `custom-poster` |
| `title` | Yes | Visible name. | `Custom poster` |
| `finished_size` | Yes | Finished print size as shown to shoppers. | `21 × 29.7 cm` |
| `photo_area` |  | Photo window, if different from the print size. | `7.9 × 7.9 cm` |
| `print_width_mm` | Yes | Finished width in mm (draws the mockup slot to scale). | `210` |
| `print_height_mm` | Yes | Finished height in mm. | `297` |
| `photo_width_mm` |  | Photo window width in mm (polaroids). | `79` |
| `photo_height_mm` |  | Photo window height in mm (polaroids). | `79` |
| `description` |  | One short line. |  |
| `mockup_image_url` |  | Mockup image for the card. |  |
| `alt_text` |  | Mockup description. |  |
| `cta_label` |  | Button label. Blank = “Order on Instagram”. |  |
| `cta_url` |  | Button link. Blank = your Instagram profile. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `active` |  | FALSE hides it. Blank = TRUE. |  |

## Recommendations

Optional hand-picked “More from …” order for a product.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `source_product_id` | Yes | Product page the list belongs to. |  |
| `recommended_product_id` | Yes | Product to suggest. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `active` |  | FALSE skips the row. Blank = TRUE. |  |

## FAQ

Short homepage FAQ. Only publish answers that match your real policies.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `faq_id` | Yes | Unique ID. |  |
| `question` | Yes | Question. |  |
| `answer` | Yes | Answer. Line breaks are kept. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `active` |  | FALSE hides it. Blank = TRUE. |  |

## Details

“The details that matter” — verified paper, finish, sizing and application facts.

| Column | Required | What it does | Example |
| --- | --- | --- | --- |
| `detail_id` | Yes | Unique ID. |  |
| `title` | Yes | Short heading, e.g. “Paper”. |  |
| `body` | Yes | One or two verified sentences. |  |
| `sort_order` |  | Lower numbers appear first. |  |
| `active` |  | FALSE hides it. Blank = TRUE. |  |

