/**
 * GET /api/calendar — the Cloudflare Pages half.
 * ===========================================================================
 * LOCATION MATTERS. This file is in `functions/` at the REPOSITORY root, not beside
 * index.html. index.html lives in `public/`, which is the build output directory: anything
 * placed there is published as a static file, so a Function put next to it would be served as
 * readable source and would never execute. Cloudflare compiles `functions/` separately and
 * maps this path to /api/calendar.
 *   https://developers.cloudflare.com/pages/functions/routing/
 *
 * Secrets arrive as `context.env` — Pages → Settings → Variables and secrets — never
 * `process.env`, which does not exist in the Workers runtime.
 *
 * All the work is in lib/, shared with serve.mjs, so local and production cannot diverge.
 * lib/ uses only WebCrypto and fetch, so there is no Node compatibility flag to set.
 */
import { getCalendar } from '../../lib/calendar.mjs';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const { body, logLine, issues } = await getCalendar(context.env, {
    scope: url.searchParams.get('scope'),
    eventId: url.searchParams.get('event'),
  });

  // Server-side only. Never the key, the token, the Authorization header, or the environment.
  console.log(logLine);
  for (const issue of issues.slice(0, 20)) {
    console.log(`calendar: row ${issue.row} ${issue.kind} — ${issue.detail}`);
  }

  // A chapter calendar does not change between two page loads, and every miss costs a JWT
  // signature plus two Google round trips. A failure is never cached, so the next request
  // retries the moment the sheet is fixed.
  const cacheControl = body.ok
    ? 'public, max-age=0, s-maxage=120, stale-while-revalidate=600'
    : 'no-store';

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });
}
