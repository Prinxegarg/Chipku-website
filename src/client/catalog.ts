/** Lazily loads /data/catalog.json — the same published data the checkout function prices against. */
import type { ClientCatalog, ClientProduct, ClientVariant } from '../lib/types.ts';

let promise: Promise<ClientCatalog> | null = null;
let current: ClientCatalog | null = null;
const products = new Map<string, ClientProduct>();

export function catalogVersion(): string {
  return document.documentElement.dataset.catalogVersion ?? '';
}

export function isPreview(): boolean {
  return document.documentElement.dataset.mode === 'preview';
}

export function loadCatalog(): Promise<ClientCatalog> {
  if (!promise) {
    promise = fetch(`/data/catalog.json?v=${encodeURIComponent(catalogVersion())}`, { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error(`Catalogue request failed (${res.status})`);
        return res.json() as Promise<ClientCatalog>;
      })
      .then((c) => {
        current = c;
        products.clear();
        for (const p of c.products) products.set(p.id, p);
        return c;
      })
      .catch((err) => {
        promise = null; // allow retry
        throw err;
      });
  }
  return promise;
}

export function getLoadedCatalog(): ClientCatalog | null {
  return current;
}

export function findProduct(id: string): ClientProduct | undefined {
  return products.get(id);
}

export function findVariant(productId: string, variantId: string): { product: ClientProduct; variant: ClientVariant } | null {
  const product = products.get(productId);
  const variant = product?.variants.find((v) => v.id === variantId);
  return product && variant ? { product, variant } : null;
}

export function categoryTitle(id?: string): string | undefined {
  if (!id || !current) return undefined;
  return current.categories.find((c) => c.id === id)?.title;
}
