#!/usr/bin/env node
/**
 * End-to-end checks against a built site (npm run build && npm run preview).
 *   BASE_URL=http://127.0.0.1:4321 CHROMIUM_PATH=/path/to/chrome npm run test:e2e
 * Uses playwright-core with an existing Chromium (no browser download).
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('/api/checkout') && p.errors.push(m.text()));
  return p;
}

const cartCount = (p) => p.locator('[data-cart-count]').first().textContent();

try {
  /* ---------- homepage: hero ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    check('homepage has exactly one h1', (await p.locator('h1').count()) === 1);
    check('hero has 5 slides', (await p.locator('[data-hero-slide]').count()) === 5);
    check('inactive hero slides are inert', (await p.locator('[data-hero-slide][inert]').count()) === 4);
    await p.mouse.move(5, 890);
    await p.waitForTimeout(7600);
    check('hero autoplays after ~7s', (await p.locator('[data-hero-current]').textContent()) === '02');
    await p.click('[data-hero-toggle]');
    check('pause control switches to Play', (await p.getAttribute('[data-hero-toggle]', 'aria-label')) === 'Play slideshow');
    await p.click('[data-hero-next]');
    check('next arrow advances', (await p.locator('[data-hero-current]').textContent()) === '03');
    await p.click('[data-hero-dot="4"]');
    check('dot selects slide 5', (await p.locator('[data-hero-current]').textContent()) === '05');
    check('no JS errors on homepage', p.errors.length === 0, p.errors.join(' | '));
    await p.context().close();
  }

  /* ---------- reduced motion ---------- */
  {
    const p = await page({ reducedMotion: 'reduce' });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.mouse.move(5, 890);
    await p.waitForTimeout(7600);
    check('reduced motion: hero does not autoplay', (await p.locator('[data-hero-current]').textContent()) === '01');
    check('reduced motion: review strip is static', !(await p.locator('[data-reviews][data-animated]').count()));
    await p.context().close();
  }

  /* ---------- header minimise / delayed reveal ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.mouse.wheel(0, 900);
    await p.waitForTimeout(400);
    check('header compacts on scroll down', (await p.getAttribute('[data-header]', 'data-state')) === 'compact');
    check('hidden desktop nav is inert', (await p.locator('[data-hdr-nav][inert]').count()) === 1);
    await p.mouse.wheel(0, -120);
    await p.waitForTimeout(60);
    const early = await p.getAttribute('[data-header]', 'data-state');
    await p.waitForTimeout(400);
    const late = await p.getAttribute('[data-header]', 'data-state');
    check('header reveals only after the upward-scroll delay', early === 'compact' && late === 'expanded', `${early} → ${late}`);
    await p.context().close();
  }

  /* ---------- add to cart from a card, drawer, offers ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/posters', { waitUntil: 'networkidle' });
    const direct = p.locator('.listing-grid [data-add-to-cart]').first();
    await direct.click();
    await p.waitForSelector('#cart-drawer[open]');
    check('Add to cart opens the cart drawer', true);
    check('cart count updates to 1', (await cartCount(p)) === '1');
    check('drawer shows the added line', (await p.locator('#cart-drawer .line').count()) === 1);
    check('drawer shows Buy/Get progress', (await p.locator('#cart-drawer .progress-block').count()) >= 1);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(350);
    check('Escape closes the drawer', !(await p.locator('#cart-drawer[open]').count()));
    check('focus returns to the trigger', await direct.evaluate((el) => el === document.activeElement));

    // choose-size flow
    await p.locator('.listing-grid [data-quick-add]').first().click();
    await p.waitForSelector('#quick-add[open] [data-qa-submit]');
    await p.click('#quick-add [data-qa-submit]');
    check('quick add requires an option first', ((await p.textContent('#quick-add [data-qa-error]')) ?? '').includes('Select'));
    await p.locator('#quick-add input[name="qa-variant"]:not([disabled])').first().check({ force: true });
    await p.click('#quick-add [data-qa-submit]');
    await p.waitForSelector('#cart-drawer[open]');
    check('quick add adds the chosen option', (await cartCount(p)) === '2');

    // quantity up to 5 eligible posters → Buy 2 Get 3
    const inc = p.locator('#cart-drawer [data-line-inc]').first();
    for (let i = 0; i < 3; i++) {
      await inc.click();
      await p.waitForTimeout(120);
    }
    const summary = await p.textContent('#cart-drawer [data-cart-foot]');
    check('5 eligible posters apply Buy 2 Get 3 (3 free)', /Buy 2 Get 3/.test(summary) && /3 free/.test(summary), summary.replace(/\s+/g, ' ').slice(0, 160));
    check('focus stays on the + button after re-render', await p.evaluate(() => document.activeElement?.hasAttribute('data-line-inc')));

    // persistence across reload
    await p.keyboard.press('Escape');
    await p.reload({ waitUntil: 'networkidle' });
    check('cart persists across reload', (await cartCount(p)) === '5');
    check('no JS errors on listing', p.errors.length === 0, p.errors.join(' | '));
    await p.context().close();
  }

  /* ---------- double click guard ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/stickers', { waitUntil: 'networkidle' });
    await p.locator('.listing-grid [data-add-to-cart]').first().dblclick();
    await p.waitForSelector('#cart-drawer[open]');
    await p.waitForTimeout(400);
    check('double-click adds a single item', (await cartCount(p)) === '1');
    await p.context().close();
  }

  /* ---------- product page ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/products/sports-poster-02', { waitUntil: 'networkidle' });
    const add = p.locator('[data-pdp-add]');
    check('PDP button asks for a size first', ((await add.textContent()) ?? '').includes('Choose a size'));
    await add.click();
    check('PDP shows a size error instead of adding', ((await p.textContent('[data-opt-error]')) ?? '').includes('Select a size'));
    check('nothing added without a size', (await cartCount(p)) === '0');
    await p.locator('input[name="variant"]:not([disabled])').first().check({ force: true });
    await p.click('[data-qty-inc]');
    check('button shows price × quantity', ((await add.textContent()) ?? '').includes('₹138'));
    await add.click();
    await p.waitForSelector('#cart-drawer[open]');
    check('PDP adds 2 of the selected size', (await cartCount(p)) === '2');
    await p.keyboard.press('Escape');

    await p.goto(BASE + '/products/sports-poster-04', { waitUntil: 'networkidle' });
    check('unavailable option is disabled', (await p.locator('input[name="variant"][disabled]').count()) === 1);
    await p.goto(BASE + '/products/movies-poster-05', { waitUntil: 'networkidle' });
    check('product with no available option shows Currently unavailable', await p.locator('[data-pdp-add][disabled]').count() === 1);
    check('no JS errors on PDP', p.errors.length === 0, p.errors.join(' | '));
    await p.context().close();
  }

  /* ---------- mobile: sticky bar, menu, no horizontal scroll ---------- */
  {
    const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.goto(BASE + '/products/sports-poster-01', { waitUntil: 'networkidle' });
    check('sticky bar hidden before passing the main button', await p.locator('[data-buybar]').isHidden());
    await p.evaluate(() => {
      const bottom = document.querySelector('[data-pdp-add]').getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo({ top: bottom + 300, behavior: 'instant' });
    });
    await p.waitForTimeout(400);
    check('sticky bar appears after the main button scrolls away', await p.locator('[data-buybar]').isVisible());
    for (const path of ['/', '/posters', '/products/sports-poster-01', '/cart', '/checkout']) {
      await p.goto(BASE + path, { waitUntil: 'networkidle' });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`no horizontal scroll at 390px: ${path}`, overflow <= 0, `overflow ${overflow}px`);
    }
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.click('[data-open-menu]');
    await p.waitForSelector('#menu-drawer[open]');
    check('mobile menu opens', true);
    await p.context().close();
  }
  {
    const p = await page({ viewport: { width: 320, height: 640 } });
    for (const path of ['/', '/products/sports-poster-02', '/photo-prints']) {
      await p.goto(BASE + path, { waitUntil: 'networkidle' });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`no horizontal scroll at 320px: ${path}`, overflow <= 0, `overflow ${overflow}px`);
    }
    await p.context().close();
  }

  /* ---------- listing filters + search ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/posters?cat=music', { waitUntil: 'networkidle' });
    const visible = await p.locator('.listing-grid [data-card]:visible').count();
    check('collection filter from URL narrows the grid', visible === 4, `${visible} visible`);
    await p.click('[data-clear]');
    check('Clear all restores every poster', (await p.locator('.listing-grid [data-card]:visible').count()) > 4);
    await p.goto(BASE + '/search?q=music', { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-search-page-results] [data-card]');
    check('search finds products by collection', (await p.locator('[data-search-page-results] [data-card]').count()) >= 4);
    await p.context().close();
  }

  /* ---------- checkout gate ---------- */
  {
    const p = await page();
    await p.goto(BASE + '/stickers', { waitUntil: 'networkidle' });
    await p.locator('.listing-grid [data-add-to-cart]').first().click();
    await p.waitForSelector('#cart-drawer[open]');
    await p.goto(BASE + '/checkout', { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    check('checkout stays closed until payments are configured', await p.locator('[data-pay][disabled]').count() === 1);
    await p.context().close();
  }
} catch (err) {
  check('test run completed', false, String(err));
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
