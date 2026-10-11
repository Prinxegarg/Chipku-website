/**
 * Responsive image URLs.
 *
 * Images live in Cloudflare R2 behind a custom domain (e.g. https://img.chipku.in).
 * When that domain is listed in CHIPKU_IMAGE_TRANSFORMS and Cloudflare Image
 * Transformations is enabled on the zone, we request right-sized WebP/AVIF through
 * /cdn-cgi/image/. Any other URL is used exactly as supplied.
 */

/** Server side: read allowed transform origins from the environment. */
export function imageTransformOrigins(): string[] {
  const raw = typeof process !== 'undefined' ? process.env?.CHIPKU_IMAGE_TRANSFORMS ?? '' : '';
  return raw
    .split(',')
    .map((x) => x.trim().replace(/\/+$/, ''))
    .filter((x) => /^https:\/\/[^/]+$/.test(x));
}

export const CARD_WIDTHS = [320, 480, 640, 960];
export const GALLERY_WIDTHS = [480, 720, 960, 1280, 1600];
export const HERO_WIDTHS = [640, 960, 1280, 1600, 2000];

export function transformUrl(url: string, width: number, origins: string[], quality = 82): string {
  if (!url || origins.length === 0) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!origins.includes(parsed.origin) || parsed.pathname.startsWith('/cdn-cgi/')) return url;
  const opts = `width=${width},quality=${quality},format=auto,fit=scale-down`;
  return `${parsed.origin}/cdn-cgi/image/${opts}${parsed.pathname}${parsed.search}`;
}

/** Returns { src, srcset } — srcset is empty when the URL cannot be transformed. */
export function responsive(url: string, widths: number[], origins: string[]): { src: string; srcset: string } {
  if (!url) return { src: '', srcset: '' };
  const canTransform = transformUrl(url, widths[0], origins) !== url;
  if (!canTransform) return { src: url, srcset: '' };
  return {
    src: transformUrl(url, widths[Math.min(2, widths.length - 1)], origins),
    srcset: widths.map((w) => `${transformUrl(url, w, origins)} ${w}w`).join(', '),
  };
}
