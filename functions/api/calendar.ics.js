/**
 * GET /api/calendar.ics — the subscription feed.
 *
 * The `.ics` in the filename is deliberate: several calendar clients sniff the extension
 * before they trust the content type, and a subscription URL that ends in .ics is also the
 * one a person recognises when they paste it.
 */
import { getFeed } from '../../lib/ics-feed.mjs';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const feed = await getFeed(context.env, { origin: url.origin });
  console.log(feed.logLine);

  if (!feed.ok) return new Response('', { status: feed.status });

  return new Response(feed.text, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="eo-ukraine-events.ics"',
      // Calendars poll on their own schedule; an hour at the edge is plenty and keeps the
      // sheet from being read once per subscriber.
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
