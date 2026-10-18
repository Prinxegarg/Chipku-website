/**
 * Shared domain types for the CHIPKU storefront.
 *
 * Money is always stored as integer minor units (paise). Sheet prices are
 * entered in rupees and converted once, during import.
 */

export type ProductType = 'poster' | 'sticker' | 'polaroid';
export type CatalogMode = 'preview' | 'live';
export type MediaRole = 'artwork' | 'room' | 'detail' | 'size_guide' | 'lifestyle';
export type MediaFit = 'contain' | 'cover';

export interface MediaItem {
  id: string;
  url: string;
  mobileUrl?: string;
  alt: string;
  role: MediaRole;
  variantId?: string;
  /** CSS object-position, e.g. "50% 30%". Only used with cover fit. */
  focal?: string;
  fit: MediaFit;
}

export interface Variant {
  id: string;
  productId: string;
  /** Group label shown above the options, e.g. "Size", "Format", "Pack". */
  optionName: string;
  /** Visible option label, e.g. "A3" or "Big polaroid". */
  label: string;
  dimensions?: string;
  finish?: string;
  packCount?: number;
  /** Paise. null means the price is missing or invalid: purchase is disabled. */
  price: number | null;
  available: boolean;
  stock?: number;
  sortOrder: number;
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  primaryCategoryId?: string;
  categoryIds: string[];
  description?: string;
  details?: string;
  badge?: string;
  trending: boolean;
  bestseller: boolean;
  /** Merchant-picked for "Find your next favourite". */
  curated: boolean;
  isNew: boolean;
  sortOrder: number;
  tags: string[];
  media: MediaItem[];
  variants: Variant[];
  rating?: RatingSummary;
}

export interface Category {
  id: string;
  title: string;
  slug: string;
  parentId?: string;
  productType?: ProductType;
  description?: string;
  image?: MediaItem;
  featured: boolean;
  sortOrder: number;
}

export interface HeroSlide {
  order: number;
  eyebrow: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  desktopImage?: string;
  mobileImage?: string;
  alt: string;
  /** Placeholder composition used until artwork is supplied. */
  layout: 'brand' | 'posters' | 'prints' | 'stickers' | 'mix';
}

export interface Eligibility {
  /** Empty list = no restriction on that dimension. All non-empty lists must match. */
  productTypes: ProductType[];
  categoryIds: string[];
  variantIds: string[];
}

export interface OfferWindow {
  /** Epoch ms (inclusive). Evaluated at runtime so offers start/stop without a rebuild. */
  startsAt?: number;
  endsAt?: number;
}

export interface BuyGetTier extends OfferWindow {
  id: string;
  label: string;
  paid: number;
  free: number;
  terms?: string;
}

export interface SpendOffer extends OfferWindow {
  id: string;
  label: string;
  /** Paise. */
  threshold: number;
  operator: 'gt' | 'gte';
  percent: number;
  eligibility: Eligibility;
  terms?: string;
}

export interface OfferConfig {
  buyGet: BuyGetTier[];
  buyGetEligibility: Eligibility;
  buyGetTerms?: string;
  spend: SpendOffer | null;
  /** Smallest currency step used for "add ₹X more" copy (paise). */
  increment: number;
  freeItemRule: 'lowest_price';
  repeatPolicy: 'once';
}

export interface ReviewMedia {
  url: string;
  alt: string;
}

export interface Review {
  id: string;
  scope: 'product' | 'store';
  productId?: string;
  displayName: string;
  rating?: number;
  title?: string;
  body: string;
  date?: string;
  verified: boolean;
  media: ReviewMedia[];
}

export interface CustomProduct {
  id: string;
  title: string;
  finishedSize: string;
  photoArea?: string;
  description?: string;
  mockup?: MediaItem;
  ctaLabel: string;
  ctaUrl: string;
  /** Finished print size in mm, used to draw a true-to-ratio mockup slot. */
  printMm: { w: number; h: number };
  /** Photo window in mm (polaroids). Absent = full-bleed. */
  photoMm?: { w: number; h: number };
  sortOrder: number;
}

export interface TextItem {
  id: string;
  title: string;
  body: string;
}

export interface SiteSettings {
  instagramHandle: string;
  instagramUrl: string;
  /** Paise. null = shipping rules not configured; checkout stays closed. */
  shippingFee: number | null;
  shippingNote?: string;
  taxNote?: string;
  deliveryInfo?: string;
  returnsInfo?: string;
  contactEmail?: string;
  maxQtyPerItem: number;
  announcement?: string;
  /** Images for the Posters / Photo prints / Stickers tiles (4:3). */
  tileImages: Partial<Record<ProductType, { url: string; alt: string }>>;
}

export interface Catalog {
  mode: CatalogMode;
  version: string;
  generatedAt: string;
  products: Product[];
  categories: Category[];
  hero: HeroSlide[];
  offers: OfferConfig;
  reviews: Review[];
  custom: CustomProduct[];
  faq: TextItem[];
  details: TextItem[];
  settings: SiteSettings;
  /** Merchant-ordered "More from …" lists, keyed by source product ID. */
  recommendations: Record<string, string[]>;
  warnings: string[];
}

/* ---------- Compact shapes shipped to the browser (/data/catalog.json) ---------- */

export interface ClientImage {
  /** Empty string = reserved placeholder slot (preview only). */
  url: string;
  alt: string;
  fit: MediaFit;
  focal?: string;
  role?: MediaRole;
}

export interface ClientVariant {
  id: string;
  optionName: string;
  label: string;
  dimensions?: string;
  price: number | null;
  available: boolean;
  stock?: number;
}

export interface ClientProduct {
  id: string;
  slug: string;
  title: string;
  type: ProductType;
  primaryCategoryId?: string;
  categoryIds: string[];
  badge?: string;
  trending: boolean;
  bestseller: boolean;
  curated?: boolean;
  isNew: boolean;
  sortOrder: number;
  tags: string[];
  images: ClientImage[];
  variants: ClientVariant[];
  rating?: RatingSummary;
}

export interface ClientCatalog {
  mode: CatalogMode;
  version: string;
  products: ClientProduct[];
  categories: Pick<Category, 'id' | 'title' | 'slug' | 'parentId' | 'productType'>[];
  offers: OfferConfig;
  settings: Pick<SiteSettings, 'maxQtyPerItem' | 'shippingFee' | 'shippingNote' | 'taxNote' | 'instagramUrl' | 'instagramHandle'>;
  imageTransformOrigins: string[];
}
