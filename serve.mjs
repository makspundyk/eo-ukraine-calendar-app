/**
 * Local development server.
 * ===========================================================================
 * Serves `public/` exactly as Cloudflare Pages will, and implements /api/calendar with the
 * same lib/ that functions/api/calendar.js uses. The only difference between here and
 * production is where the secrets come from: this reads `.env`, Cloudflare reads the Pages
 * environment. That is the whole point — the code path you debug locally is the one that runs.
 *
 *   CLOUDFLARE_ON=0   .env, this file          (npm run dev)
 *   CLOUDFLARE_ON=1   Pages env, the Function  (deployed)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { getCalendar, readConfig, resolveCalendarEventId } from './lib/calendar.mjs';
import { addAttendee } from './lib/attend.mjs';
import { getFeed } from './lib/ics-feed.mjs';

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, 'public');
const PORT = Number(process.env.PORT ?? 4100);

const T = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

/**
 * A .env reader rather than a dependency. It handles the two things that actually come up:
 * quoted values, and a private key pasted as one line with literal \n in it.
 */
async function loadEnv() {
  let text;
  try { text = await readFile(join(HERE, '.env'), 'utf8'); }
  catch { return {}; }

  const out = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[t.slice(0, eq).trim()] = value;
  }
  return out;
}

/**
 * Convenience the deployed side does not have and must never have: point
 * GOOGLE_APPLICATION_CREDENTIALS at the downloaded service-account JSON — kept OUTSIDE this
 * repository — and the email and key are read from it, so the private key never has to be
 * duplicated into a second file. GOOGLE_PRIVATE_KEY set explicitly always wins.
 */
async function withCredentialsFile(env) {
  const path = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path || (env.GOOGLE_PRIVATE_KEY && env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) return env;
  try {
    const json = JSON.parse(await readFile(resolve(HERE, path), 'utf8'));
    return {
      ...env,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || json.client_email,
      GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY || json.private_key,
    };
  } catch (err) {
    console.warn(`  ! GOOGLE_APPLICATION_CREDENTIALS (${path}): ${err.message}`);
    return env;
  }
}

/**
 * Apply `public/_headers` locally too. Parsing it rather than restating the rules keeps dev
 * and production honest: a CSP that breaks the fonts breaks them on localhost first. Only the
 * global `/*` block is applied — per-path caching does not matter in development.
 */
async function globalHeaders() {
  try {
    const text = await readFile(join(ROOT, '_headers'), 'utf8');
    const block = text.split(/^\/\*$/m)[1] ?? '';
    return Object.fromEntries(block.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes(':') && !l.startsWith('/'))
      .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()])
      .filter(([, v]) => v));
  } catch { return {}; }
}

const FILE_ENV = await withCredentialsFile(await loadEnv());
const ENV = { ...FILE_ENV, ...process.env };     // a shell variable beats the file
const HEADERS = await globalHeaders();

createServer(async (req, res) => {
  let p = new URL(req.url, 'http://x').pathname;

  if (p === '/api/attend' && req.method === 'POST') {
    const raw = await new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; });
      req.on('end', () => r(d)); });
    let input = {};
    try { input = JSON.parse(raw); } catch { /* handled by the validator */ }
    const match = await resolveCalendarEventId(ENV, String(input.event ?? '')).catch(() => null);
    const out = await addAttendee(ENV, { calendarEventId: match?.calendarEventId,
                                        email: input.email });
    console.log(`  ${out.logLine}`);
    res.writeHead(out.status, { ...HEADERS, 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store' });
    return res.end(JSON.stringify(out.body, null, 2));
  }

  if (p === '/api/calendar.ics') {
    const feed = await getFeed(ENV, { origin: `http://localhost:${PORT}` });
    console.log(`  ${feed.logLine}`);
    if (!feed.ok) return res.writeHead(feed.status).end('');
    res.writeHead(200, { ...HEADERS, 'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="eo-ukraine-events.ics"',
      'cache-control': 'no-store' });
    return res.end(feed.text);
  }

  if (p === '/api/calendar') {
    const q = new URL(req.url, 'http://x').searchParams;
    const { body, logLine, issues } = await getCalendar(ENV,
      { scope: q.get('scope'), eventId: q.get('event') });
    console.log(`  ${logLine}`);
    for (const i of issues.slice(0, 20)) console.log(`    row ${i.row} ${i.kind} — ${i.detail}`);
    res.writeHead(200, { ...HEADERS,
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(body, null, 2));
  }

  if (p === '/' || p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { ...HEADERS,
                         'content-type': T[extname(p)] ?? 'application/octet-stream',
                         'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('404'); }
}).listen(PORT, () => {
  const c = readConfig(ENV);
  const ready = c.email && c.privateKey && c.spreadsheetId;
  console.log(`\n  EO events  ->  http://localhost:${PORT}`);
  console.log(`  DEMO=${c.demo ? 1 : 0}  CLOUDFLARE_ON=${c.cloudflare ? 1 : 0}  ·  ${
    c.demo ? 'demo calendar, Google not contacted'
           : ready ? `live sheet: ${c.range}`
                   : 'live sheet not configured — the demo data will be used'}\n`);
});
