/**
 * Accepts the column names and values used in the CHIPKU Content Manager workbook
 * (and close variations) and maps them onto the canonical schema in schema.ts.
 * Canonical columns always win when both are present.
 */
import type { SheetRow } from '../csv.ts';
import type { TabKey } from './schema.ts';

/** canonical column ← accepted alternative names, per tab */
const COLUMN_ALIASES: Partial<Record<TabKey, Record<string, string[]>>> = {
  variants: {
    option_value: ['size_label', 'size', 'option', 'format'],
  },
  custom_products: {
    custom_id: ['custom_product_id', 'product_id'],
    mockup_image_url: ['mockup_url', 'image_url'],
    cta_url: ['instagram_url', 'link'],
  },
  settings: {
    key: ['setting', 'name'],
  },
  media: {
    image_url: ['url'],
  },
};

const PLURAL_TYPES: Record<string, string> = {
  posters: 'poster',
  poster: 'poster',
  stickers: 'sticker',
  sticker: 'sticker',
  polaroids: 'polaroid',
  polaroid: 'polaroid',
  'photo prints': 'polaroid',
  'photo print': 'polaroid',
  'photo-prints': 'polaroid',
};

/** Legacy in-app hash routes ("#/shop/posters") → site paths. */
const LEGACY_ROUTES: Record<string, string> = {
  '#/shop/all': '/shop',
  '#/shop': '/shop',
  '#/shop/posters': '/posters',
  '#/shop/polaroids': '/photo-prints',
  '#/shop/photo-prints': '/photo-prints',
  '#/shop/stickers': '/stickers',
  '#/new': '/new-arrivals',
  '#/': '/',
};

const cm = (n: number) => `${Number(n.toFixed(2))}`;

function sizeFromCm(w: string, h: string): string {
  const a = Number(w);
  const b = Number(h);
  return a > 0 && b > 0 ? `${cm(a)} × ${cm(b)} cm` : '';
}

export function normaliseTab(key: TabKey, headers: string[], rows: SheetRow[]): { headers: string[]; rows: SheetRow[] } {
  const aliases = COLUMN_ALIASES[key] ?? {};
  const outHeaders = [...headers];
  for (const [canonical, alts] of Object.entries(aliases)) {
    if (outHeaders.includes(canonical)) continue;
    const found = alts.find((a) => headers.includes(a));
    if (!found) continue;
    outHeaders.push(canonical);
    for (const r of rows) r[canonical] = r[found];
  }

  const get = (r: SheetRow, k: string) => String(r[k] ?? '').trim();

  for (const r of rows) {
    switch (key) {
      case 'offers': {
        const type = get(r, 'type').toLowerCase().replace(/[\s-]+/g, '_');
        if (['percentage', 'percent', 'spend', 'spend_percentage', 'percent_off'].includes(type)) r.type = 'spend_percent';
        if (['buyget', 'buy_x_get_y', 'bxgy'].includes(type)) r.type = 'buy_get';
        const op = get(r, 'threshold_operator');
        if (op === '>') r.threshold_operator = 'gt';
        if (op === '>=' || op === '≥') r.threshold_operator = 'gte';
        const types = get(r, 'eligible_product_types');
        if (types) {
          r.eligible_product_types = types
            .split(/[,;|]/)
            .map((t) => PLURAL_TYPES[t.trim().toLowerCase()] ?? t.trim())
            .filter(Boolean)
            .join(',');
        }
        break;
      }
      case 'hero': {
        const url = get(r, 'cta_url');
        if (url in LEGACY_ROUTES) r.cta_url = LEGACY_ROUTES[url];
        break;
      }
      case 'variants': {
        if (!get(r, 'dimensions')) {
          const d = sizeFromCm(get(r, 'print_width_cm'), get(r, 'print_height_cm'));
          if (d) r.dimensions = d;
        }
        if (!get(r, 'option_name') && headers.includes('size_label')) r.option_name = 'Size';
        break;
      }
      case 'custom_products': {
        for (const dim of ['print_width', 'print_height', 'photo_width', 'photo_height']) {
          if (!get(r, `${dim}_mm`) && get(r, `${dim}_cm`)) r[`${dim}_mm`] = String(Number(get(r, `${dim}_cm`)) * 10);
        }
        if (!get(r, 'finished_size')) r.finished_size = sizeFromCm(get(r, 'print_width_cm'), get(r, 'print_height_cm'));
        if (!get(r, 'photo_area')) r.photo_area = sizeFromCm(get(r, 'photo_width_cm'), get(r, 'photo_height_cm'));
        break;
      }
      case 'media': {
        const role = get(r, 'role').toLowerCase();
        if (role === 'mockup' || role === 'room_mockup' || role === 'scene') r.role = 'room';
        if (role === 'front' || role === 'main' || role === 'primary') r.role = 'artwork';
        break;
      }
    }
  }
  // Columns derived above (e.g. sizes converted from cm) count as present.
  for (const r of rows) for (const k of Object.keys(r)) if (k !== '__row' && !outHeaders.includes(k)) outHeaders.push(k);
  return { headers: outHeaders, rows };
}

/** Product-type root categories ("posters", "polaroids", "stickers") are site sections, not collections. */
export function rootTypeOf(categoryId: string): 'poster' | 'sticker' | 'polaroid' | undefined {
  return PLURAL_TYPES[categoryId.toLowerCase().replace(/-/g, ' ')] as 'poster' | 'sticker' | 'polaroid' | undefined;
}
