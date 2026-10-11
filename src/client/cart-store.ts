/**
 * Browser cart persistence. Survives navigation and reloads (localStorage), syncs
 * across tabs, and falls back to memory when storage is blocked.
 */
import { emptyCart, sanitizeCart, type CartState } from '../lib/cart.ts';

const KEY = 'chipku.cart.v1';
type Listener = (state: CartState) => void;

let memoryOnly = false;
let state: CartState = read();
const listeners = new Set<Listener>();

function read(): CartState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeCart(JSON.parse(raw)) : emptyCart();
  } catch {
    memoryOnly = true;
    return emptyCart();
  }
}

function write(next: CartState): void {
  if (memoryOnly) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    memoryOnly = true; // quota or privacy mode: keep working for this page view
  }
}

export function getCart(): CartState {
  return state;
}

export function setCart(next: CartState): void {
  state = next;
  write(next);
  for (const fn of listeners) fn(state);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cartCount(s: CartState = state): number {
  return s.lines.reduce((n, l) => n + l.qty, 0);
}

export function isPersistent(): boolean {
  return !memoryOnly;
}

window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = read();
  for (const fn of listeners) fn(state);
});
