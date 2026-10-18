import { describe, expect, it } from 'vitest';
import { esc, jsonForScript } from '../src/lib/render/html.ts';
import { cardHTML } from '../src/lib/render/card.ts';

describe('html safety', () => {
  it('escapes sheet text', () => {
    expect(esc('<img src=x onerror=alert(1)> & "q"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
  });

  it('embeds JSON without allowing a </script> breakout', () => {
    const value = { body: '</script><script>alert(1)</script>', ls: 'a b' };
    const out = jsonForScript(value);
    expect(out).not.toContain('</script>');
    expect(out).not.toContain(' ');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('renders product cards with escaped titles and safe links', () => {
    const html = cardHTML(
      {
        id: 'P"1', slug: 'x-y', title: '<b>Bold</b>', type: 'poster', categoryIds: [], trending: false, bestseller: false,
        isNew: false, sortOrder: 1, tags: [], images: [], variants: [{ id: 'V1', optionName: 'Size', label: 'A4', price: 6900, available: true }],
      },
      { origins: [], preview: true },
    );
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('data-product-id="P&quot;1"');
    expect(html).toContain('href="/products/x-y"');
  });
});

import { responsive, transformUrl } from '../src/lib/images.ts';

describe('image urls', () => {
  it('resizes Cloudinary delivery URLs and leaves others alone', () => {
    const u = 'https://res.cloudinary.com/fckqbe5q/image/upload/f_auto,q_auto/1';
    expect(transformUrl(u, 480, [])).toBe('https://res.cloudinary.com/fckqbe5q/image/upload/c_limit,w_480/f_auto,q_auto/1');
    expect(responsive(u, [320, 640], []).srcset).toContain('w_640/f_auto,q_auto/1 640w');
    expect(transformUrl('https://img.example.com/a.jpg', 480, [])).toBe('https://img.example.com/a.jpg');
  });
});
