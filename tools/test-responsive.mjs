/**
 * Every page, at every width that matters.
 *
 * Checks the faults that make a page feel broken rather than merely plain: content wider than
 * the viewport, anything overflowing its own container, tap targets too small for a thumb, and
 * text too small to read. Run: npm run responsive
 */
import { chromium } from 'playwright';

const SIZES = [
  { name: 'phone, small', w: 320, h: 700, mobile: true },
  { name: 'phone',        w: 390, h: 844, mobile: true },
  { name: 'phone, large', w: 430, h: 932, mobile: true },
  { name: 'tablet',       w: 768, h: 1024, mobile: true },
  { name: 'tablet, wide', w: 1024, h: 768, mobile: false },
  { name: 'laptop',       w: 1280, h: 800, mobile: false },
  { name: 'desktop',      w: 1680, h: 1050, mobile: false },
];

const b = await chromium.launch();
let failed = 0;

// One future, invitable event, so the richest version of the event page is the one measured.
const probe = await b.newPage({ viewport: { width: 1280, height: 800 } });
await probe.goto('http://localhost:4100/#/');
await probe.waitForTimeout(1200);
const today = new Date().toISOString().slice(0, 10);
const eventId = await probe.evaluate(async (t) => {
  const { listEvents } = await import('/src/api/http.js');
  const ev = (await listEvents('all')).events;
  return (ev.find((e) => e.invitable && e.start >= t) || ev[0]).id;
}, today);
await probe.close();

const PAGES = [
  ['feed', '#/'],
  ['list', '#/list'],
  ['event', `#/event/${eventId}`],
  ['past', '#/?when=past'],
  ['unsubscribe', '#/unsubscribe'],
];

for (const size of SIZES) {
  const ctx = await b.newContext({ viewport: { width: size.w, height: size.h },
    isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`script error: ${String(e).slice(0, 60)}`));

  for (const [name, hash] of PAGES) {
    await page.goto(`http://localhost:4100/${hash}`);
    await page.waitForTimeout(900);
    const found = await page.evaluate((vw) => {
      const out = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > vw + 1) out.push(`page scrolls sideways (${doc.scrollWidth} > ${vw})`);

      for (const el of document.querySelectorAll('body *')) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;

        // Sticking out of the viewport on either side.
        if (r.right > vw + 1 && s.overflowX !== 'auto' && s.overflowX !== 'scroll') {
          const scrollable = el.closest('[style*="overflow"], .tblwrap, .tbl-scroll');
          if (!scrollable) out.push(`${el.className || el.tagName} overflows right by ${Math.round(r.right - vw)}px`);
        }
        if (r.left < -1) out.push(`${el.className || el.tagName} starts off-screen at ${Math.round(r.left)}px`);

        // Anything a finger has to hit — but only STANDALONE controls. A link inside a
        // sentence is as tall as the line it sits on, and demanding 24px of it would mean
        // never linking a word in running text, which is worse than the thing being checked.
        const inProse = el.matches('p a, span a, li a, .addcal-note a, .subscribe-note a, .unsub-note a, .micro a');
        // A checkbox's target is its label, which wraps it; measure that instead.
        const target = el.matches('input[type=checkbox]') ? (el.closest('label') || el) : el;
        const tappable = el.matches('a[href], button, input, [role=button]') && !inProse;
        if (tappable) {
          const t = target.getBoundingClientRect();
          if (Math.min(t.width, t.height) < 24) {
            out.push(`${el.className || el.tagName} target is ${Math.round(t.width)}x${Math.round(t.height)}`);
          }
        }
        // Text nobody can read.
        const px = parseFloat(s.fontSize);
        if (px && px < 10.5 && el.textContent.trim() && el.children.length === 0) {
          out.push(`${el.className || el.tagName} text is ${px}px`);
        }
      }
      return [...new Set(out)];
    }, size.w);
    found.forEach((f) => problems.push(`${name}: ${f}`));
  }

  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${size.name.padEnd(14)} ${size.w}px`);
  problems.slice(0, 6).forEach((p) => console.log(`      ${p}`));
  if (problems.length > 6) console.log(`      … and ${problems.length - 6} more`);
  await ctx.close();
}

await b.close();
console.log(failed ? `\n${failed} width(s) with problems\n` : '\nevery width is clean\n');
process.exit(failed ? 1 : 0);
