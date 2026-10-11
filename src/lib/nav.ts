/** Primary navigation — the same labels on every page (homepage, product page, menu). */
export const PRIMARY_NAV = [
  { label: 'Posters', href: '/posters' },
  { label: 'Photo prints', href: '/photo-prints' },
  { label: 'Stickers', href: '/stickers' },
  { label: 'New arrivals', href: '/new-arrivals' },
] as const;

export function isCurrent(href: string, path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/';
  return clean === href || clean.startsWith(`${href}/`);
}
