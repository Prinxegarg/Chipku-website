/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM).
 * Google Sheets "Publish to web → CSV" output is RFC 4180 compliant.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Normalise a header cell: "Product ID " → "product_id". */
export function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface SheetRow {
  /** 1-based row number in the sheet (header = row 1), for error messages. */
  __row: number;
  [column: string]: string | number;
}

/** Parse CSV into objects keyed by normalised header. Fully blank rows are skipped. */
export function csvToRows(input: string): { headers: string[]; rows: SheetRow[] } {
  const table = parseCsv(input);
  if (table.length === 0) return { headers: [], rows: [] };
  const headers = table[0].map(normaliseHeader);
  const rows: SheetRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.every((c) => c.trim() === '')) continue;
    const obj: SheetRow = { __row: r + 1 };
    headers.forEach((h, idx) => {
      if (h) obj[h] = (cells[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}
