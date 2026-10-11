/**
 * Google Sheets content contract.
 *
 * One entry per tab. Column names are matched case-insensitively and spaces
 * become underscores, so "Product ID" and "product_id" are the same column.
 * This file is the single source for validation and for docs/GOOGLE-SHEETS.md.
 */

export interface ColumnSpec {
  name: string;
  required?: boolean;
  description: string;
  example?: string;
}

export interface TabSpec {
  key: TabKey;
  title: string;
  /** Required for a live (non-preview) build. */
  requiredLive: boolean;
  purpose: string;
  columns: ColumnSpec[];
}

export type TabKey =
  | 'hero'
  | 'posters'
  | 'stickers'
  | 'polaroids'
  | 'variants'
  | 'media'
  | 'categories'
  | 'offers'
  | 'settings'
  | 'reviews'
  | 'review_media'
  | 'custom_products'
  | 'recommendations'
  | 'faq'
  | 'details';

const productColumns: ColumnSpec[] = [
  { name: 'product_id', required: true, description: 'Permanent unique ID. Never reuse or change it once live.', example: 'PST-0001' },
  { name: 'title', required: true, description: 'Product name shown on cards and the product page.', example: 'Midnight Court' },
  { name: 'slug', description: 'URL name. Leave blank to generate from the title.', example: 'midnight-court' },
  { name: 'status', description: 'active, draft or archived. Only active rows are published. Blank = active.', example: 'active' },
  { name: 'primary_category_id', description: 'Main category ID from the Categories tab (used for breadcrumbs and “More from …”).', example: 'sports' },
  { name: 'category_ids', description: 'Extra category IDs, separated by commas.', example: 'sports, aesthetics' },
  { name: 'description', description: 'Short description under the price.' },
  { name: 'details', description: 'Longer product details for the “Product details” section. Line breaks are kept.' },
  { name: 'price', description: 'Price in rupees (numbers only) for products WITHOUT rows in the Variants tab.', example: '69' },
  { name: 'option_label', description: 'Optional visible label for that single option, e.g. a size.', example: 'A4' },
  { name: 'dimensions', description: 'Real dimensions for that single option.', example: '21 × 29.7 cm' },
  { name: 'image_url', description: 'Main image (Cloudflare R2 URL). More images go in the Media tab.', example: 'https://img.chipku.in/posters/pst-0001-front.jpg' },
  { name: 'alt_text', description: 'Describes the main image for screen readers.' },
  { name: 'badge', description: 'One short factual label, e.g. New or Customisable. Leave blank for none.', example: 'New' },
  { name: 'trending', description: 'TRUE to show in Trending.', example: 'TRUE' },
  { name: 'bestseller', description: 'TRUE to show in Bestsellers — only when your sales data supports it.', example: 'FALSE' },
  { name: 'new_arrival', description: 'TRUE to list under New arrivals.', example: 'TRUE' },
  { name: 'tags', description: 'Search keywords, separated by commas.', example: 'football, black and white' },
  { name: 'sort_order', description: 'Lower numbers appear first.', example: '10' },
];

export const TABS: TabSpec[] = [
  {
    key: 'hero',
    title: 'Hero Banner',
    requiredLive: true,
    purpose: 'Exactly five homepage slides. Text and buttons are real page elements, not part of the image.',
    columns: [
      { name: 'slide_order', required: true, description: '1 to 5.', example: '1' },
      { name: 'eyebrow', description: 'Small line above the headline.', example: 'POSTERS · PHOTO PRINTS · STICKERS' },
      { name: 'headline', required: true, description: 'Large slide headline.', example: 'Your walls need us' },
      { name: 'body', description: 'One supporting sentence.' },
      { name: 'cta_label', required: true, description: 'Button label.', example: 'Explore CHIPKU' },
      { name: 'cta_url', required: true, description: 'Button destination: a site path (/posters) or a full https:// link.', example: '/shop' },
      { name: 'desktop_image_url', description: 'Desktop art panel, about 1600 × 1200 px.' },
      { name: 'mobile_image_url', description: 'Separately composed mobile art, about 900 × 800 px.' },
      { name: 'alt_text', description: 'Image description. Leave blank if the image only decorates the slide text.' },
      { name: 'active', description: 'FALSE hides the slide. Blank = TRUE.' },
    ],
  },
  { key: 'posters', title: 'Posters', requiredLive: false, purpose: 'One row per poster design.', columns: productColumns },
  { key: 'stickers', title: 'Stickers', requiredLive: false, purpose: 'One row per sticker product.', columns: productColumns },
  { key: 'polaroids', title: 'Polaroids', requiredLive: false, purpose: 'Ready-made photo prints (shown as “Photo prints” on the site).', columns: productColumns },
  {
    key: 'variants',
    title: 'Variants',
    requiredLive: false,
    purpose: 'One row per purchasable option (size, format or pack). When a product has variant rows, this tab is its only price source.',
    columns: [
      { name: 'variant_id', required: true, description: 'Permanent unique ID.', example: 'PST-0001-A3' },
      { name: 'product_id', required: true, description: 'The product this option belongs to.', example: 'PST-0001' },
      { name: 'option_name', description: 'Group label shown to shoppers. Blank = Size.', example: 'Size' },
      { name: 'option_value', required: true, description: 'Option label.', example: 'A3' },
      { name: 'dimensions', description: 'Real dimensions of this option.', example: '29.7 × 42 cm' },
      { name: 'finish', description: 'Paper or finish, only if verified.' },
      { name: 'pack_count', description: 'Number of items in a pack.' },
      { name: 'price', required: true, description: 'Price in rupees, numbers only.', example: '149' },
      { name: 'available', description: 'FALSE shows the option as unavailable. Blank = TRUE.' },
      { name: 'stock_quantity', description: 'Optional. Limits the quantity a shopper can choose.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
    ],
  },
  {
    key: 'media',
    title: 'Media',
    requiredLive: false,
    purpose: 'Extra product images, one row per image. Order controls the gallery and the hover image (second image).',
    columns: [
      { name: 'media_id', description: 'Unique ID (optional but recommended).' },
      { name: 'product_id', required: true, description: 'Product the image belongs to.' },
      { name: 'variant_id', description: 'Show this image when that option is selected.' },
      { name: 'role', description: 'artwork, room, detail, size_guide or lifestyle. Artwork is shown uncropped.', example: 'room' },
      { name: 'image_url', required: true, description: 'Cloudflare R2 image URL.' },
      { name: 'mobile_image_url', description: 'Optional mobile crop.' },
      { name: 'alt_text', description: 'Image description.' },
      { name: 'sort_order', description: 'Lower numbers appear first. The product-row image is always first.' },
      { name: 'focal_point', description: 'For cropped photos: horizontal% vertical%.', example: '50% 35%' },
    ],
  },
  {
    key: 'categories',
    title: 'Categories',
    requiredLive: false,
    purpose: 'Collections such as Sports, Music, Aesthetics and Movies.',
    columns: [
      { name: 'category_id', required: true, description: 'Permanent ID used by products.', example: 'sports' },
      { name: 'title', required: true, description: 'Visible name.', example: 'Sports' },
      { name: 'slug', description: 'URL name. Blank = generated from the title.' },
      { name: 'product_type', description: 'poster, sticker or polaroid.', example: 'poster' },
      { name: 'parent_id', description: 'Parent category ID, if nested.' },
      { name: 'description', description: 'One-sentence introduction for the collection page.' },
      { name: 'image_url', description: 'Collection tile image (4:3).' },
      { name: 'alt_text', description: 'Image description.' },
      { name: 'show_on_home', description: 'TRUE to show in “Shop by collection”.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'active', description: 'FALSE hides it. Blank = TRUE.' },
    ],
  },
  {
    key: 'offers',
    title: 'Offers',
    requiredLive: false,
    purpose: 'One row per offer. The same rows drive the offer bar, product tiles, cart and the checkout price check.',
    columns: [
      { name: 'offer_id', required: true, description: 'Permanent unique ID.', example: 'B2G3' },
      { name: 'type', required: true, description: 'buy_get or spend_percent.', example: 'buy_get' },
      { name: 'label', description: 'Text for the offer bar. Blank = generated.', example: 'Buy 2 Get 3' },
      { name: 'paid_qty', description: 'buy_get: items paid for.', example: '2' },
      { name: 'free_qty', description: 'buy_get: extra free items.', example: '3' },
      { name: 'threshold', description: 'spend_percent: amount in rupees.', example: '399' },
      { name: 'threshold_operator', description: 'gt = above the amount; gte = the amount or more.', example: 'gt' },
      { name: 'percent_off', description: 'spend_percent: percentage.', example: '10' },
      { name: 'eligible_product_types', description: 'Comma-separated: poster, sticker, polaroid. Blank = all.', example: 'poster' },
      { name: 'eligible_category_ids', description: 'Comma-separated category IDs. Blank = all.' },
      { name: 'eligible_variant_ids', description: 'Comma-separated variant IDs. Blank = all.' },
      { name: 'active', description: 'FALSE switches it off. Blank = TRUE.' },
      { name: 'starts_at', description: 'Optional start date (YYYY-MM-DD).' },
      { name: 'ends_at', description: 'Optional end date (YYYY-MM-DD), inclusive.' },
      { name: 'terms', description: 'Customer-facing terms shown in Offer details.' },
    ],
  },
  {
    key: 'settings',
    title: 'Settings',
    requiredLive: false,
    purpose: 'Key / value pairs for store-wide text and rules. Unknown keys are ignored.',
    columns: [
      { name: 'key', required: true, description: 'Setting name (see the list in docs).' },
      { name: 'value', description: 'Setting value.' },
      { name: 'notes', description: 'Your own notes. Not published.' },
    ],
  },
  {
    key: 'reviews',
    title: 'Reviews',
    requiredLive: false,
    purpose: 'Only approved reviews with publication permission are published.',
    columns: [
      { name: 'review_id', required: true, description: 'Permanent unique ID.' },
      { name: 'scope', description: 'product (about one product) or store (general feedback). Blank = product if product_id is set.' },
      { name: 'product_id', description: 'Reviewed product.' },
      { name: 'display_name', required: true, description: 'Name the reviewer agreed to show, e.g. “Aanya S.”.' },
      { name: 'rating', description: 'Whole number 1–5, only if the customer gave one.' },
      { name: 'title', description: 'Optional short title.' },
      { name: 'body', required: true, description: 'Review text exactly as approved.' },
      { name: 'review_date', description: 'YYYY-MM-DD.' },
      { name: 'image_url', description: 'First customer photo. More go in Review media.' },
      { name: 'alt_text', description: 'Photo description.' },
      { name: 'approved', required: true, description: 'TRUE to publish.' },
      { name: 'publish_permission', required: true, description: 'TRUE when the customer agreed to publication.' },
      { name: 'verified_purchase_status', description: 'verified only when matched to a real order.' },
    ],
  },
  {
    key: 'review_media',
    title: 'Review media',
    requiredLive: false,
    purpose: 'Additional customer photos, one row per photo.',
    columns: [
      { name: 'review_id', required: true, description: 'Review the photo belongs to.' },
      { name: 'image_url', required: true, description: 'Photo URL.' },
      { name: 'alt_text', description: 'Photo description.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'publish_permission', description: 'FALSE hides the photo. Blank = follows the review.' },
    ],
  },
  {
    key: 'custom_products',
    title: 'Custom products',
    requiredLive: false,
    purpose: 'The three custom print formats. Orders are taken on Instagram.',
    columns: [
      { name: 'custom_id', required: true, description: 'Permanent unique ID.', example: 'custom-poster' },
      { name: 'title', required: true, description: 'Visible name.', example: 'Custom poster' },
      { name: 'finished_size', required: true, description: 'Finished print size as shown to shoppers.', example: '21 × 29.7 cm' },
      { name: 'photo_area', description: 'Photo window, if different from the print size.', example: '7.9 × 7.9 cm' },
      { name: 'print_width_mm', required: true, description: 'Finished width in mm (draws the mockup slot to scale).', example: '210' },
      { name: 'print_height_mm', required: true, description: 'Finished height in mm.', example: '297' },
      { name: 'photo_width_mm', description: 'Photo window width in mm (polaroids).', example: '79' },
      { name: 'photo_height_mm', description: 'Photo window height in mm (polaroids).', example: '79' },
      { name: 'description', description: 'One short line.' },
      { name: 'mockup_image_url', description: 'Mockup image for the card.' },
      { name: 'alt_text', description: 'Mockup description.' },
      { name: 'cta_label', description: 'Button label. Blank = “Order on Instagram”.' },
      { name: 'cta_url', description: 'Button link. Blank = your Instagram profile.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'active', description: 'FALSE hides it. Blank = TRUE.' },
    ],
  },
  {
    key: 'recommendations',
    title: 'Recommendations',
    requiredLive: false,
    purpose: 'Optional hand-picked “More from …” order for a product.',
    columns: [
      { name: 'source_product_id', required: true, description: 'Product page the list belongs to.' },
      { name: 'recommended_product_id', required: true, description: 'Product to suggest.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'active', description: 'FALSE skips the row. Blank = TRUE.' },
    ],
  },
  {
    key: 'faq',
    title: 'FAQ',
    requiredLive: false,
    purpose: 'Short homepage FAQ. Only publish answers that match your real policies.',
    columns: [
      { name: 'faq_id', required: true, description: 'Unique ID.' },
      { name: 'question', required: true, description: 'Question.' },
      { name: 'answer', required: true, description: 'Answer. Line breaks are kept.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'active', description: 'FALSE hides it. Blank = TRUE.' },
    ],
  },
  {
    key: 'details',
    title: 'Details',
    requiredLive: false,
    purpose: '“The details that matter” — verified paper, finish, sizing and application facts.',
    columns: [
      { name: 'detail_id', required: true, description: 'Unique ID.' },
      { name: 'title', required: true, description: 'Short heading, e.g. “Paper”.' },
      { name: 'body', required: true, description: 'One or two verified sentences.' },
      { name: 'sort_order', description: 'Lower numbers appear first.' },
      { name: 'active', description: 'FALSE hides it. Blank = TRUE.' },
    ],
  },
];

export const SETTINGS_KEYS: { key: string; description: string; example?: string }[] = [
  { key: 'instagram_handle', description: 'Instagram handle without @. Used for custom orders and the footer.', example: 'chipku_shop' },
  { key: 'instagram_url', description: 'Full Instagram link. Blank = built from the handle.' },
  { key: 'shipping_fee', description: 'Flat shipping fee in rupees. 0 = free shipping. Blank = checkout stays closed until shipping is set.', example: '49' },
  { key: 'shipping_note', description: 'Short shipping explanation shown in the cart and at checkout.' },
  { key: 'tax_note', description: 'How taxes are handled, e.g. “Prices include GST.” Only if true.' },
  { key: 'delivery_info', description: '“Delivery” section on product pages.' },
  { key: 'returns_info', description: '“Returns” section on product pages.' },
  { key: 'contact_email', description: 'Support email shown in the footer.' },
  { key: 'max_qty_per_item', description: 'Largest quantity per cart line. Blank = 10.', example: '10' },
  { key: 'announcement', description: 'Neutral text strip shown only when no offers are active.', example: 'Posters. Prints. Stickers. All you.' },
  { key: 'currency_increment', description: 'Smallest rupee step for “Add ₹X more” messages. Blank = 1.', example: '1' },
  { key: 'buy_get_terms', description: 'Extra customer-facing terms for the Buy/Get ladder.' },
  { key: 'tile_image_posters', description: 'Image for the Posters tile on the homepage (4:3).' },
  { key: 'tile_image_photo_prints', description: 'Image for the Photo prints tile (4:3).' },
  { key: 'tile_image_stickers', description: 'Image for the Stickers tile (4:3).' },
];

export function tabSpec(key: TabKey): TabSpec {
  const spec = TABS.find((t) => t.key === key);
  if (!spec) throw new Error(`Unknown tab ${key}`);
  return spec;
}
