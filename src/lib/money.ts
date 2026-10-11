/** Money helpers. All amounts are integer paise. */

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₹69, ₹1,299, ₹69.50 — whole rupees drop the decimals. */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  if (Number.isInteger(rupees)) {
    return formatter.format(rupees).replace(/\.00$/, '');
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Parse a sheet price cell ("69", "69.5", "₹1,299.00") into paise.
 * Returns null for blank, non-numeric, negative or >2-decimal values.
 */
export function parsePriceToPaise(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[₹,\s]|INR|Rs\.?/gi, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}
