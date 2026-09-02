import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
// Serve exactly what Cloudflare Pages serves — the output directory, nothing above it.
const ROOT = new URL('./public/', import.meta.url).pathname;

/**
 * Apply `public/_headers` locally too. Parsing it here rather than restating the rules keeps
 * dev and production honest: a CSP that breaks the fonts breaks them on localhost first.
 * Only the global `/*` block is applied — per-path caching rules do not matter in dev.
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
const HEADERS = await globalHeaders();
const PORT = Number(process.env.PORT ?? 4100);
const T = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { ...HEADERS,
                         'content-type': T[extname(p)] ?? 'application/octet-stream',
                         'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('404'); }
}).listen(PORT, () => console.log(`\n  EO events  ->  http://localhost:${PORT}\n`));
