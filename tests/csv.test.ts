import { describe, expect, it } from 'vitest';
import { csvToRows, parseCsv } from '../src/lib/csv.ts';
import { formatMoney, parsePriceToPaise } from '../src/lib/money.ts';

describe('csv', () => {
  it('parses quotes, escaped quotes, CRLF and a BOM', () => {
    const text = '﻿a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,\n';
    expect(parseCsv(text)).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], [''], ['1', '']]);
  });
  it('normalises headers and skips blank rows', () => {
    const { headers, rows } = csvToRows('Product ID, Title \nP1,One\n,\nP2,"Two\nlines"');
    expect(headers).toEqual(['product_id', 'title']);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ product_id: 'P2', title: 'Two\nlines', __row: 4 });
  });
});

describe('money', () => {
  it('parses sheet prices into paise', () => {
    expect(parsePriceToPaise('69')).toBe(6900);
    expect(parsePriceToPaise('₹1,299.5')).toBe(129950);
    expect(parsePriceToPaise('')).toBeNull();
    expect(parsePriceToPaise('abc')).toBeNull();
    expect(parsePriceToPaise('0')).toBeNull();
    expect(parsePriceToPaise('1.234')).toBeNull();
  });
  it('formats INR', () => {
    expect(formatMoney(6900)).toBe('₹69');
    expect(formatMoney(129900)).toBe('₹1,299');
    expect(formatMoney(4260)).toBe('₹42.60');
  });
});
