import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4100/';
const errors = [];
const browser = await chromium.launch();

const shoot = async (name, hash, { w = 1280, h = 1000, full = true, mobile = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h },
    deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.goto(`${BASE}?latency=0${hash}`);
  await page.waitForTimeout(400);
  // Images are lazy for real users; a full-page screenshot has to walk the page first or it
  // captures a column of empty boxes.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => i.complete ? null :
      new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full && !mobile });
  console.log('  ' + name + '.png');
  await ctx.close();
};

await shoot('feed', '#/');
await shoot('feed-learning', '#/?kind=learning');
await shoot('list', '#/list');
await shoot('event-global', '#/event/global-leadership-conference-2027');
await shoot('event-learning', '#/event/forbes-books-how-to-write-and-publish-a-book');
await shoot('feed-tablet', '#/', { w: 834, h: 1100 });
await shoot('feed-mobile', '#/', { w: 390, h: 900, mobile: true, full: false });
await shoot('list-mobile', '#/list', { w: 390, h: 900, mobile: true, full: false });
await shoot('event-mobile', '#/event/eo-unlimited-krakow-poland',
            { w: 390, h: 900, mobile: true, full: false });
await browser.close();
console.log(errors.length ? `\nERRORS:\n  ${errors.join('\n  ')}` : '\nno console errors');
process.exit(errors.length ? 1 : 0);
