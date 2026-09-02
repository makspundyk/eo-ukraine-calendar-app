/**
 * THE ONE SEAM. Every screen reads through here and nowhere else.
 *
 * The calendar comes from /api/calendar, which is answered by a Cloudflare Pages Function in
 * production and by serve.mjs locally. Both run the same lib/, so this file cannot tell the
 * two apart — and neither can a reader of the page, which is the point: the spreadsheet id and
 * the service account key stay on the server.
 *
 * If the sheet is unreachable, empty, or unreadable, the endpoint says so and this falls back
 * to the demo data in /data/events.json. The same fallback covers the case where there is no
 * endpoint at all — a plain static host with no Functions — so the site is never blank.
 */
const LATENCY = Number(new URLSearchParams(location.search).get('latency') ?? 120);
const API = new URL('../../api/calendar', import.meta.url).pathname;   // -> /api/calendar
const MOCK = new URL('../../data/events.json', import.meta.url).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cache = null;

/** What the UI got, and why — read by main.js to show the demo-data notice. */
export const source = { kind: null, reason: null, message: null };

async function fromSheet() {
  const res = await fetch(API, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;                       // no Function deployed, or it fell over
  const body = await res.json();
  if (!body?.ok || !Array.isArray(body.events) || body.events.length === 0) {
    source.reason = body?.reason ?? 'unavailable';
    source.message = body?.message ?? null;
    return null;
  }
  source.kind = 'sheet';
  return { generated_at: body.fetched_at, data: body.events, data_issues: [] };
}

async function fromMock() {
  const res = await fetch(MOCK);
  if (!res.ok) throw new Error('Could not load the calendar');
  source.kind = 'mock';
  return res.json();
}

export async function fetchEvents() {
  await sleep(LATENCY);
  if (!cache) {
    let live = null;
    try {
      live = await fromSheet();
    } catch (err) {
      // A network failure here is not fatal and must not be silent either.
      source.reason = source.reason ?? 'unreachable';
      source.message = source.message ?? err.message;
    }
    cache = live ?? await fromMock();
  }
  return structuredClone(cache);
}
