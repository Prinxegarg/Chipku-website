/**
 * Turns raw tab CSVs into a validated Catalog.
 *
 * Errors stop the build (so a broken sheet never replaces the live site).
 * Warnings are logged and written to /data/content-report.json.
 */
import { createHash } from 'node:crypto';
import { csvToRows, type SheetRow } from '../csv.ts';
import { parsePriceToPaise } from '../money.ts';
import { TABS, type TabKey } from './schema.ts';
import { normaliseTab, rootTypeOf } from './aliases.ts';
import type { TabSource } from './source.ts';
import type {
  BuyGetTier,
  Catalog,
  CatalogMode,
  Category,
  CustomProduct,
  Eligibility,
  HeroSlide,
  MediaItem,
  MediaRole,
  OfferConfig,
  Product,
  ProductType,
  Review,
  SiteSettings,
  SpendOffer,
  TextItem,
  Variant,
} from '../types.ts';

export class ContentError extends Error {
  errors: string[];
  warnings: string[];
  constructor(message: string, errors: string[], warnings: string[]) {
    super(message);
    this.errors = errors;
    this.warnings = warnings;
  }
}

class Issues {
  errors: string[] = [];
  warnings: string[] = [];
  error(tab: string, row: number | null, msg: string) {
    this.errors.push(`${tab}${row ? ` row ${row}` : ''}: ${msg}`);
  }
  warn(tab: string, row: number | null, msg: string) {
    this.warnings.push(`${tab}${row ? ` row ${row}` : ''}: ${msg}`);
  }
}

/* ---------------- cell helpers ---------------- */

const s = (row: SheetRow, key: string): string => String(row[key] ?? '').trim();

function bool(raw: string, fallback: boolean): boolean {
  const v = raw.trim().toLowerCase();
  if (v === '') return fallback;
  if (['true', 'yes', 'y', '1', '✓', 'x'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return fallback;
}

function int(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function num(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function list(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const idList = (raw: string) => list(raw).map((x) => x.toLowerCase());

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const BLOCKED_IMAGE_HOSTS = ['docs.google.com', 'drive.google.com', 'photos.google.com', 'photos.app.goo.gl', 'www.dropbox.com'];

/** Validates an image URL. Returns the URL or null (and records why). */
function imageUrl(raw: string, issues: Issues, tab: string, row: number | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    issues.warn(tab, row, `image URL "${raw}" is not a valid link — showing a placeholder instead.`);
    return null;
  }
  if (url.protocol !== 'https:') {
    issues.warn(tab, row, `image URL must start with https:// ("${raw}") — showing a placeholder instead.`);
    return null;
  }
  if (BLOCKED_IMAGE_HOSTS.includes(url.hostname)) {
    issues.warn(
      tab,
      row,
      `"${raw}" is a viewer page, not an image file. Upload the image to Cloudflare R2 and paste its direct URL.`,
    );
    return null;
  }
  return url.toString();
}

/** Link targets: site paths ("/posters") or https URLs. Anything else is rejected. */
function linkUrl(raw: string): string | null {
  const v = raw.trim();
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function istDate(raw: string, endOfDay: boolean): number | undefined {
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Number.NaN;
  return Date.parse(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
}

const PRODUCT_TABS: { tab: TabKey; type: ProductType }[] = [
  { tab: 'posters', type: 'poster' },
  { tab: 'stickers', type: 'sticker' },
  { tab: 'polaroids', type: 'polaroid' },
];
const PRODUCT_TYPES: ProductType[] = ['poster', 'sticker', 'polaroid'];
const MEDIA_ROLES: MediaRole[] = ['artwork', 'room', 'detail', 'size_guide', 'lifestyle'];
const LAYOUTS: HeroSlide['layout'][] = ['brand', 'posters', 'prints', 'stickers', 'mix'];

function fitFor(role: MediaRole): MediaItem['fit'] {
  return role === 'artwork' || role === 'size_guide' ? 'contain' : 'cover';
}

/* ---------------- main ---------------- */

export async function buildCatalog(source: TabSource): Promise<Catalog> {
  const issues = new Issues();
  const mode: CatalogMode = source.mode;
  const preview = mode === 'preview';

  const raw = new Map<TabKey, SheetRow[]>();
  const headersOf = new Map<TabKey, string[]>();
  const texts = await Promise.all(TABS.map(async (t) => [t.key, await source.read(t.key)] as const));
  for (const [key, text] of texts) {
    const spec = TABS.find((t) => t.key === key)!;
    if (text == null) {
      if (!preview && spec.requiredLive) issues.error(spec.title, null, 'tab is required but not configured.');
      raw.set(key, []);
      continue;
    }
    const parsed = csvToRows(text);
    const { headers, rows } = normaliseTab(key, parsed.headers, parsed.rows);
    headersOf.set(key, headers);
    if (rows.length > 0) {
      for (const col of spec.columns.filter((c) => c.required)) {
        if (!headers.includes(col.name)) issues.error(spec.title, null, `missing required column "${col.name}".`);
      }
    }
    raw.set(key, rows);
  }
  const rows = (k: TabKey) => raw.get(k) ?? [];

  /* ---- settings ---- */
  const kv = new Map<string, string>();
  for (const r of rows('settings')) {
    const key = s(r, 'key').toLowerCase();
    if (key) kv.set(key, s(r, 'value'));
  }
  const handle = (kv.get('instagram_handle') || 'chipku_shop').replace(/^@/, '');
  const igUrl = linkUrl(kv.get('instagram_url') ?? '') ?? `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const shippingRaw = kv.get('shipping_fee') ?? '';
  let shippingFee: number | null = null;
  if (shippingRaw !== '') {
    if (/^0+(\.0+)?$/.test(shippingRaw)) shippingFee = 0;
    else {
      shippingFee = parsePriceToPaise(shippingRaw);
      if (shippingFee === null) issues.error('Settings', null, `shipping_fee "${shippingRaw}" is not a valid amount.`);
    }
  }
  const maxQty = int(kv.get('max_qty_per_item') ?? '') ?? 10;
  const incrementRupees = num(kv.get('currency_increment') ?? '') ?? 1;
  const settings: SiteSettings = {
    instagramHandle: handle,
    instagramUrl: igUrl,
    shippingFee,
    shippingNote: kv.get('shipping_note') || undefined,
    taxNote: kv.get('tax_note') || undefined,
    deliveryInfo: kv.get('delivery_info') || undefined,
    returnsInfo: kv.get('returns_info') || undefined,
    contactEmail: kv.get('contact_email') || undefined,
    maxQtyPerItem: Math.min(Math.max(maxQty, 1), 99),
    announcement: kv.get('announcement') || undefined,
    tileImages: {},
  };
  for (const [type, key] of [
    ['poster', 'tile_image_posters'],
    ['polaroid', 'tile_image_photo_prints'],
    ['sticker', 'tile_image_stickers'],
  ] as const) {
    const url = imageUrl(kv.get(key) ?? '', issues, 'Settings', null);
    if (url) settings.tileImages[type] = { url, alt: kv.get(`${key}_alt`) ?? '' };
  }

  /* ---- categories ---- */
  const categories: Category[] = [];
  const catIds = new Set<string>();
  const catSlugs = new Set<string>();
  // "posters" / "polaroids" / "stickers" rows describe site sections, which already exist.
  const rootCats = new Map<string, ProductType>();
  const hasShowOnHome = (headersOf.get('categories') ?? []).includes('show_on_home');
  for (const r of rows('categories')) {
    const id = s(r, 'category_id').toLowerCase();
    if (!id) continue;
    if (!bool(s(r, 'active'), true)) continue;
    const root = rootTypeOf(id);
    if (root && !s(r, 'parent_id')) {
      rootCats.set(id, root);
      continue;
    }
    if (catIds.has(id)) {
      issues.error('Categories', r.__row, `duplicate category_id "${id}".`);
      continue;
    }
    const title = s(r, 'title');
    if (!title) {
      issues.error('Categories', r.__row, 'title is required.');
      continue;
    }
    const slug = slugify(s(r, 'slug') || title);
    if (catSlugs.has(slug)) issues.error('Categories', r.__row, `duplicate slug "${slug}".`);
    const parentRaw = s(r, 'parent_id').toLowerCase();
    const pt = (rootTypeOf(s(r, 'product_type')) ?? s(r, 'product_type').toLowerCase()) || rootCats.get(parentRaw) || rootTypeOf(parentRaw) || '';
    if (pt && !PRODUCT_TYPES.includes(pt as ProductType)) {
      issues.warn('Categories', r.__row, `unknown product_type "${pt}".`);
    }
    const img = imageUrl(s(r, 'image_url'), issues, 'Categories', r.__row);
    catIds.add(id);
    catSlugs.add(slug);
    categories.push({
      id,
      title,
      slug,
      parentId: parentRaw && !rootTypeOf(parentRaw) ? parentRaw : undefined,
      productType: PRODUCT_TYPES.includes(pt as ProductType) ? (pt as ProductType) : undefined,
      description: s(r, 'description') || undefined,
      image: img
        ? { id: `cat-${id}`, url: img, alt: s(r, 'alt_text'), role: 'lifestyle', fit: 'cover' }
        : undefined,
      // Without a show_on_home column, collections inside a product type are featured.
      featured: hasShowOnHome ? bool(s(r, 'show_on_home'), false) : Boolean(pt && parentRaw),
      sortOrder: int(s(r, 'sort_order')) ?? 1000,
    });
  }
  for (const c of categories) {
    if (c.parentId && !catIds.has(c.parentId)) {
      issues.warn('Categories', null, `"${c.id}" has unknown parent_id "${c.parentId}".`);
      c.parentId = undefined;
    }
  }
  categories.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  /* ---- products ---- */
  const products: Product[] = [];
  const byId = new Map<string, Product | null>();
  const slugs = new Set<string>();
  const productRowPrice = new Map<string, { price: string; label: string; dims: string; row: number; tab: string }>();
  for (const { tab, type } of PRODUCT_TABS) {
    const title = TABS.find((t) => t.key === tab)!.title;
    for (const r of rows(tab)) {
      const id = s(r, 'product_id');
      if (!id) {
        if (s(r, 'title')) issues.error(title, r.__row, 'product_id is required.');
        continue;
      }
      const status = (s(r, 'status') || 'active').toLowerCase();
      if (!['active', 'draft', 'archived'].includes(status)) {
        issues.warn(title, r.__row, `unknown status "${status}" — treated as draft.`);
      }
      if (byId.has(id)) {
        issues.error(title, r.__row, `duplicate product_id "${id}".`);
        continue;
      }
      if (status !== 'active') {
        byId.set(id, null); // reserve the ID; drafts are not published
        continue;
      }
      const name = s(r, 'title');
      if (!name) {
        issues.error(title, r.__row, `${id}: title is required.`);
        continue;
      }
      let slug = slugify(s(r, 'slug') || name);
      if (!slug) slug = slugify(id);
      if (slugs.has(slug)) {
        issues.error(title, r.__row, `${id}: slug "${slug}" is already used by another product.`);
        continue;
      }
      slugs.add(slug);

      const primary = s(r, 'primary_category_id').toLowerCase();
      const extra = idList(s(r, 'category_ids'));
      const cats = [...new Set([primary, ...extra].filter(Boolean))].filter((c) => {
        if (catIds.has(c)) return true;
        if (rootCats.has(c) || rootTypeOf(c)) return false;
        issues.warn(title, r.__row, `${id}: unknown category "${c}" ignored.`);
        return false;
      });

      const media: MediaItem[] = [];
      const mainUrl = imageUrl(s(r, 'image_url'), issues, title, r.__row);
      if (mainUrl || (preview && s(r, 'image_url') === '')) {
        media.push({
          id: `${id}-main`,
          url: mainUrl ?? '',
          alt: s(r, 'alt_text') || name,
          role: 'artwork',
          fit: 'contain',
        });
      }

      const badge = s(r, 'badge');
      if (badge.length > 24) issues.warn(title, r.__row, `${id}: badge is long; keep it to one or two words.`);

      const product: Product = {
        id,
        slug,
        title: name,
        type,
        primaryCategoryId: cats.includes(primary) ? primary : cats[0],
        categoryIds: cats,
        description: s(r, 'description') || undefined,
        details: s(r, 'details') || undefined,
        badge: badge || undefined,
        trending: bool(s(r, 'trending'), false),
        bestseller: bool(s(r, 'bestseller'), false),
        curated: bool(s(r, 'curated'), false),
        isNew: bool(s(r, 'new_arrival'), false),
        sortOrder: int(s(r, 'sort_order')) ?? 1000,
        tags: list(s(r, 'tags')),
        media,
        variants: [],
      };
      products.push(product);
      byId.set(id, product);
      productRowPrice.set(id, {
        price: s(r, 'price'),
        label: s(r, 'option_label'),
        dims: s(r, 'dimensions'),
        row: r.__row,
        tab: title,
      });
    }
  }

  /* ---- product ↔ category mapping rows ---- */
  for (const r of rows('product_categories')) {
    const pid = s(r, 'product_id');
    const cid = s(r, 'category_id').toLowerCase();
    if (!pid || !cid) continue;
    if (!byId.has(pid)) {
      issues.warn('Product categories', r.__row, `product_id "${pid}" does not exist.`);
      continue;
    }
    const product = byId.get(pid);
    if (!product || rootCats.has(cid) || rootTypeOf(cid)) continue;
    if (!catIds.has(cid)) {
      issues.warn('Product categories', r.__row, `unknown category "${cid}" ignored.`);
      continue;
    }
    if (!product.categoryIds.includes(cid)) product.categoryIds.push(cid);
    product.primaryCategoryId ??= cid;
  }

  /* ---- variants ---- */
  const variantIds = new Set<string>();
  for (const r of rows('variants')) {
    const vid = s(r, 'variant_id');
    const pid = s(r, 'product_id');
    if (!vid && !pid) continue;
    if (!vid || !pid) {
      issues.error('Variants', r.__row, 'variant_id and product_id are required.');
      continue;
    }
    if (variantIds.has(vid)) {
      issues.error('Variants', r.__row, `duplicate variant_id "${vid}".`);
      continue;
    }
    variantIds.add(vid);
    if (!byId.has(pid)) {
      issues.error('Variants', r.__row, `${vid}: product_id "${pid}" does not exist.`);
      continue;
    }
    const product = byId.get(pid);
    if (!product) continue; // draft/archived product
    const label = s(r, 'option_value');
    if (!label) {
      issues.error('Variants', r.__row, `${vid}: option_value is required.`);
      continue;
    }
    const priceRaw = s(r, 'price');
    const price = parsePriceToPaise(priceRaw);
    if (price === null) {
      issues.warn('Variants', r.__row, `${vid}: price "${priceRaw}" is missing or invalid — shown as “Currently unavailable”.`);
    }
    const stock = int(s(r, 'stock_quantity'));
    product.variants.push({
      id: vid,
      productId: pid,
      optionName: s(r, 'option_name') || 'Size',
      label,
      dimensions: s(r, 'dimensions') || undefined,
      finish: s(r, 'finish') || undefined,
      packCount: int(s(r, 'pack_count')),
      price,
      available: bool(s(r, 'available'), true) && (stock === undefined || stock > 0),
      stock: stock !== undefined && stock >= 0 ? stock : undefined,
      sortOrder: int(s(r, 'sort_order')) ?? 1000,
    });
  }
  for (const product of products) {
    const rowPrice = productRowPrice.get(product.id)!;
    if (product.variants.length > 0) {
      if (rowPrice.price) {
        issues.warn(
          rowPrice.tab,
          rowPrice.row,
          `${product.id}: has rows in Variants, so the price column on the product row is ignored.`,
        );
      }
      product.variants.sort((a, b) => a.sortOrder - b.sortOrder);
      continue;
    }
    const price = parsePriceToPaise(rowPrice.price);
    if (price === null) {
      issues.warn(
        rowPrice.tab,
        rowPrice.row,
        `${product.id}: price "${rowPrice.price}" is missing or invalid — shown as “Currently unavailable”.`,
      );
    }
    product.variants.push({
      id: `${product.id}-default`,
      productId: product.id,
      optionName: 'Size',
      label: rowPrice.label || 'Standard',
      dimensions: rowPrice.dims || undefined,
      price,
      available: true,
      sortOrder: 0,
    });
  }

  /* ---- media ---- */
  const mediaRows = [...rows('media')].sort(
    (a, b) => (int(s(a, 'sort_order')) ?? 1000) - (int(s(b, 'sort_order')) ?? 1000),
  );
  const mediaIds = new Set<string>();
  for (const r of mediaRows) {
    const pid = s(r, 'product_id');
    if (!pid) continue;
    if (!byId.has(pid)) {
      issues.error('Media', r.__row, `product_id "${pid}" does not exist.`);
      continue;
    }
    const product = byId.get(pid);
    if (!product) continue;
    const mid = s(r, 'media_id') || `${pid}-m${r.__row}`;
    if (mediaIds.has(mid)) {
      issues.error('Media', r.__row, `duplicate media_id "${mid}".`);
      continue;
    }
    mediaIds.add(mid);
    const rawUrl = s(r, 'image_url');
    const url = imageUrl(rawUrl, issues, 'Media', r.__row);
    if (!url && !(preview && rawUrl === '')) continue;
    if (url && product.media.some((m) => m.url === url)) continue; // already the product-row image
    const roleRaw = (s(r, 'role') || 'artwork').toLowerCase() as MediaRole;
    const role = MEDIA_ROLES.includes(roleRaw) ? roleRaw : 'artwork';
    if (role !== roleRaw) issues.warn('Media', r.__row, `unknown role "${roleRaw}" — treated as artwork.`);
    const vid = s(r, 'variant_id');
    if (vid && !product.variants.some((v) => v.id === vid)) {
      issues.warn('Media', r.__row, `variant_id "${vid}" does not belong to ${pid}; image shown for all options.`);
    }
    const focal = s(r, 'focal_point');
    const fitRaw = s(r, 'fit').toLowerCase();
    product.media.push({
      id: mid,
      url: url ?? '',
      mobileUrl: imageUrl(s(r, 'mobile_image_url'), issues, 'Media', r.__row) ?? undefined,
      alt: s(r, 'alt_text') || product.title,
      role,
      variantId: vid && product.variants.some((v) => v.id === vid) ? vid : undefined,
      focal: /^\d{1,3}% \d{1,3}%$/.test(focal) ? focal : undefined,
      fit: fitRaw === 'cover' || fitRaw === 'contain' ? fitRaw : fitFor(role),
    });
  }

  /* ---- reviews ---- */
  const reviews: Review[] = [];
  const reviewById = new Map<string, Review>();
  for (const r of rows('reviews')) {
    const id = s(r, 'review_id');
    if (!id) continue;
    if (reviewById.has(id)) {
      issues.error('Reviews', r.__row, `duplicate review_id "${id}".`);
      continue;
    }
    if (!bool(s(r, 'approved'), false) || !bool(s(r, 'publish_permission'), false)) continue;
    const body = s(r, 'body');
    const name = s(r, 'display_name');
    if (!body || !name) {
      issues.error('Reviews', r.__row, `${id}: display_name and body are required for published reviews.`);
      continue;
    }
    const pid = s(r, 'product_id');
    let scope = (s(r, 'scope') || (pid ? 'product' : 'store')).toLowerCase() as Review['scope'];
    if (scope !== 'product' && scope !== 'store') scope = pid ? 'product' : 'store';
    if (scope === 'product') {
      if (!pid || !byId.get(pid)) {
        issues.warn('Reviews', r.__row, `${id}: product "${pid}" is not published — review kept as store feedback.`);
        scope = 'store';
      }
    }
    const ratingRaw = s(r, 'rating');
    let rating: number | undefined;
    if (ratingRaw) {
      const n = Number(ratingRaw);
      if (Number.isInteger(n) && n >= 1 && n <= 5) rating = n;
      else issues.warn('Reviews', r.__row, `${id}: rating "${ratingRaw}" must be a whole number 1–5; hidden.`);
    }
    const date = s(r, 'review_date');
    const review: Review = {
      id,
      scope,
      productId: pid && byId.get(pid) ? pid : undefined,
      displayName: name,
      rating,
      title: s(r, 'title') || undefined,
      body,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
      verified: s(r, 'verified_purchase_status').toLowerCase() === 'verified',
      media: [],
    };
    const img = imageUrl(s(r, 'image_url'), issues, 'Reviews', r.__row);
    if (img) review.media.push({ url: img, alt: s(r, 'alt_text') || `Photo from ${name}` });
    reviews.push(review);
    reviewById.set(id, review);
  }
  const reviewMedia = [...rows('review_media')].sort(
    (a, b) => (int(s(a, 'sort_order')) ?? 1000) - (int(s(b, 'sort_order')) ?? 1000),
  );
  for (const r of reviewMedia) {
    const review = reviewById.get(s(r, 'review_id'));
    if (!review) continue;
    if (!bool(s(r, 'publish_permission'), true)) continue;
    const img = imageUrl(s(r, 'image_url'), issues, 'Review media', r.__row);
    if (img && !review.media.some((m) => m.url === img)) {
      review.media.push({ url: img, alt: s(r, 'alt_text') || `Photo from ${review.displayName}` });
    }
  }
  reviews.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  for (const product of products) {
    const rated = reviews.filter((rv) => rv.scope === 'product' && rv.productId === product.id && rv.rating);
    if (rated.length > 0) {
      const avg = rated.reduce((sum, rv) => sum + (rv.rating ?? 0), 0) / rated.length;
      product.rating = { average: Math.round(avg * 10) / 10, count: rated.length };
    }
  }

  /* ---- offers ---- */
  const buyGet: BuyGetTier[] = [];
  let buyGetEligibility: Eligibility | null = null;
  let spend: SpendOffer | null = null;
  const offerIds = new Set<string>();
  const eligibilityOf = (r: SheetRow): Eligibility => ({
    productTypes: idList(s(r, 'eligible_product_types')).filter((t): t is ProductType => {
      const ok = PRODUCT_TYPES.includes(t as ProductType);
      if (!ok) issues.warn('Offers', r.__row, `unknown product type "${t}" in eligible_product_types.`);
      return ok;
    }),
    categoryIds: idList(s(r, 'eligible_category_ids')),
    variantIds: list(s(r, 'eligible_variant_ids')),
  });
  const sameEligibility = (a: Eligibility, b: Eligibility) =>
    JSON.stringify([...a.productTypes].sort()) === JSON.stringify([...b.productTypes].sort()) &&
    JSON.stringify([...a.categoryIds].sort()) === JSON.stringify([...b.categoryIds].sort()) &&
    JSON.stringify([...a.variantIds].sort()) === JSON.stringify([...b.variantIds].sort());

  for (const r of rows('offers')) {
    const id = s(r, 'offer_id');
    if (!id) continue;
    if (offerIds.has(id)) {
      issues.error('Offers', r.__row, `duplicate offer_id "${id}".`);
      continue;
    }
    offerIds.add(id);
    if (!bool(s(r, 'active'), true)) continue;
    const startsAt = istDate(s(r, 'starts_at'), false);
    const endsAt = istDate(s(r, 'ends_at'), true);
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
      issues.error('Offers', r.__row, `${id}: dates must be YYYY-MM-DD.`);
      continue;
    }
    const type = s(r, 'type').toLowerCase();
    const terms = s(r, 'terms') || undefined;
    if (type === 'buy_get') {
      const paid = int(s(r, 'paid_qty'));
      const free = int(s(r, 'free_qty'));
      if (!paid || !free || paid < 1 || free < 1) {
        issues.error('Offers', r.__row, `${id}: paid_qty and free_qty must be whole numbers of at least 1.`);
        continue;
      }
      const elig = eligibilityOf(r);
      if (buyGetEligibility && !sameEligibility(buyGetEligibility, elig)) {
        issues.error('Offers', r.__row, `${id}: all buy_get offers must share the same eligibility columns.`);
        continue;
      }
      buyGetEligibility = elig;
      if (buyGet.some((t) => t.paid + t.free === paid + free)) {
        issues.error('Offers', r.__row, `${id}: another buy_get tier already needs ${paid + free} items.`);
        continue;
      }
      buyGet.push({ id, label: s(r, 'label') || `Buy ${paid} Get ${free}`, paid, free, terms, startsAt, endsAt });
    } else if (type === 'spend_percent') {
      if (spend) {
        issues.error('Offers', r.__row, `${id}: only one spend_percent offer can be active.`);
        continue;
      }
      const threshold = parsePriceToPaise(s(r, 'threshold'));
      const percent = num(s(r, 'percent_off'));
      const op = (s(r, 'threshold_operator') || 'gt').toLowerCase();
      if (threshold === null || percent === undefined || percent <= 0 || percent >= 100 || !['gt', 'gte'].includes(op)) {
        issues.error('Offers', r.__row, `${id}: needs a threshold, percent_off between 0 and 100, and threshold_operator gt or gte.`);
        continue;
      }
      const rupees = threshold / 100;
      spend = {
        id,
        label:
          s(r, 'label') ||
          `${percent}% off orders ${op === 'gt' ? 'above' : 'of'} ₹${rupees.toLocaleString('en-IN')}${op === 'gte' ? ' or more' : ''}`,
        threshold,
        operator: op as 'gt' | 'gte',
        percent,
        eligibility: eligibilityOf(r),
        terms,
        startsAt,
        endsAt,
      };
    } else {
      issues.error('Offers', r.__row, `${id}: type must be buy_get or spend_percent.`);
    }
  }
  buyGet.sort((a, b) => a.paid + a.free - (b.paid + b.free));
  const offers: OfferConfig = {
    buyGet,
    buyGetEligibility: buyGetEligibility ?? { productTypes: [], categoryIds: [], variantIds: [] },
    buyGetTerms: kv.get('buy_get_terms') || undefined,
    spend,
    increment: Math.max(1, Math.round(incrementRupees * 100)),
    freeItemRule: 'lowest_price',
    repeatPolicy: 'once',
  };

  /* ---- hero ---- */
  const hero: HeroSlide[] = [];
  for (const r of rows('hero')) {
    if (!bool(s(r, 'active'), true)) continue;
    const order = int(s(r, 'slide_order'));
    const headline = s(r, 'headline');
    if (!order && !headline) continue;
    const cta = linkUrl(s(r, 'cta_url'));
    if (!order || !headline || !s(r, 'cta_label') || !cta) {
      issues.error('Hero Banner', r.__row, 'slide_order, headline, cta_label and a valid cta_url (/path or https://) are required.');
      continue;
    }
    hero.push({
      order,
      eyebrow: s(r, 'eyebrow'),
      headline,
      body: s(r, 'body'),
      ctaLabel: s(r, 'cta_label'),
      ctaUrl: cta,
      desktopImage: imageUrl(s(r, 'desktop_image_url'), issues, 'Hero Banner', r.__row) ?? undefined,
      mobileImage: imageUrl(s(r, 'mobile_image_url'), issues, 'Hero Banner', r.__row) ?? undefined,
      alt: s(r, 'alt_text'),
      layout: LAYOUTS[(order - 1) % LAYOUTS.length],
    });
  }
  hero.sort((a, b) => a.order - b.order);
  if (hero.length !== 5) {
    issues.warn('Hero Banner', null, `the homepage design expects exactly 5 active slides; found ${hero.length}.`);
  }
  if (hero.length > 5) hero.length = 5;

  /* ---- custom products ---- */
  const custom: CustomProduct[] = [];
  for (const r of rows('custom_products')) {
    const id = s(r, 'custom_id');
    if (!id || !bool(s(r, 'active'), true)) continue;
    const pw = num(s(r, 'print_width_mm'));
    const ph = num(s(r, 'print_height_mm'));
    if (!s(r, 'title') || !s(r, 'finished_size') || !pw || !ph) {
      issues.error('Custom products', r.__row, `${id}: title, finished_size, print_width_mm and print_height_mm are required.`);
      continue;
    }
    const fw = num(s(r, 'photo_width_mm'));
    const fh = num(s(r, 'photo_height_mm'));
    const ctaRaw = s(r, 'cta_url');
    const cta = ctaRaw ? linkUrl(ctaRaw) : settings.instagramUrl;
    if (!cta) issues.warn('Custom products', r.__row, `${id}: cta_url is not a valid link; using Instagram.`);
    const mock = imageUrl(s(r, 'mockup_image_url'), issues, 'Custom products', r.__row);
    custom.push({
      id,
      title: s(r, 'title'),
      finishedSize: s(r, 'finished_size'),
      photoArea: s(r, 'photo_area') || undefined,
      description: s(r, 'description') || undefined,
      mockup: mock ? { id: `custom-${id}`, url: mock, alt: s(r, 'alt_text') || s(r, 'title'), role: 'lifestyle', fit: 'cover' } : undefined,
      ctaLabel: s(r, 'cta_label') || 'Order on Instagram',
      ctaUrl: cta ?? settings.instagramUrl,
      printMm: { w: pw, h: ph },
      photoMm: fw && fh ? { w: fw, h: fh } : undefined,
      sortOrder: int(s(r, 'sort_order')) ?? 1000,
    });
  }
  custom.sort((a, b) => a.sortOrder - b.sortOrder);

  /* ---- recommendations ---- */
  const recs = new Map<string, { id: string; order: number }[]>();
  for (const r of rows('recommendations')) {
    if (!bool(s(r, 'active'), true)) continue;
    const src = s(r, 'source_product_id');
    const rec = s(r, 'recommended_product_id');
    if (!src || !rec) continue;
    if (!byId.get(src) || !byId.get(rec)) {
      issues.warn('Recommendations', r.__row, `"${src}" → "${rec}" refers to a product that is not published; skipped.`);
      continue;
    }
    if (src === rec) continue;
    const listFor = recs.get(src) ?? [];
    listFor.push({ id: rec, order: int(s(r, 'sort_order')) ?? 1000 });
    recs.set(src, listFor);
  }

  /* ---- faq + details ---- */
  const textItems = (tab: TabKey, idCol: string, titleCol: string, bodyCol: string, label: string): TextItem[] =>
    rows(tab)
      .filter((r) => s(r, idCol) && bool(s(r, 'active'), true))
      .filter((r) => {
        if (s(r, titleCol) && s(r, bodyCol)) return true;
        issues.warn(label, r.__row, `${titleCol} and ${bodyCol} are both required; row skipped.`);
        return false;
      })
      .sort((a, b) => (int(s(a, 'sort_order')) ?? 1000) - (int(s(b, 'sort_order')) ?? 1000))
      .map((r) => ({ id: s(r, idCol), title: s(r, titleCol), body: s(r, bodyCol) }));
  const faq = textItems('faq', 'faq_id', 'question', 'answer', 'FAQ');
  const details = textItems('details', 'detail_id', 'title', 'body', 'Details');

  /* ---- live image checks ---- */
  if (!preview && process.env.CHIPKU_SKIP_IMAGE_CHECK !== '1') {
    await checkImages(products, issues);
  }

  products.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  if (!preview && products.length === 0) {
    issues.error('Products', null, 'no active products found in Posters, Stickers or Polaroids.');
  }

  if (issues.errors.length > 0) {
    throw new ContentError(
      `Content check failed with ${issues.errors.length} error(s):\n  - ${issues.errors.join('\n  - ')}`,
      issues.errors,
      issues.warnings,
    );
  }

  const payload = { products, categories, hero, offers, reviews, custom, faq, details, settings, recs: [...recs] };
  const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12);

  const recommendations: Record<string, string[]> = {};
  for (const [src, items] of recs) {
    recommendations[src] = items.sort((a, b) => a.order - b.order).map((x) => x.id);
  }

  const catalog: Catalog = {
    mode,
    version,
    generatedAt: new Date().toISOString(),
    products,
    categories,
    hero,
    offers,
    reviews,
    custom,
    faq,
    details,
    settings,
    recommendations,
    warnings: issues.warnings,
  };
  return catalog;
}

async function checkImages(products: Product[], issues: Issues) {
  const all = products.flatMap((p) => p.media.filter((m) => m.url).map((m) => ({ p, m })));
  const unique = [...new Set(all.map((x) => x.m.url))];
  const failed = new Set<string>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const url = unique[cursor++];
      try {
        let res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        if (res.status === 405) res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || (type && !type.startsWith('image/'))) failed.add(url);
      } catch {
        failed.add(url);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, unique.length) }, worker));
  for (const { p, m } of all) {
    if (failed.has(m.url)) {
      issues.warn('Images', null, `${p.id}: ${m.url} did not load as an image — placeholder shown instead.`);
    }
  }
  for (const p of products) p.media = p.media.filter((m) => !failed.has(m.url));
}
