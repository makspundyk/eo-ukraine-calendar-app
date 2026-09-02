/**
 * The subscription feed.
 * ===========================================================================
 * A member subscribes to this URL once and their calendar re-fetches it forever. That is the
 * difference that matters: an "add to calendar" button makes a COPY, so a later change by the
 * organiser never reaches it, whereas a subscribed feed carries every edit — a moved date, a
 * changed room, a cancellation — on the next refresh.
 *
 * Reuses the same lib/ as /api/calendar, so the feed cannot show something the site does not.
 */
import { getCalendar } from './calendar.mjs';
import { calendar } from '../public/src/ics.js';

export async function getFeed(env, { origin = '', scope = 'all' } = {}) {
  const { body, logLine } = await getCalendar(env, { scope });

  if (!body.ok) {
    // A feed that 500s gets retried; one that returns an empty-but-valid calendar would tell
    // every subscriber the season was cancelled. Neither is acceptable, so say nothing at all
    // and let the client keep what it has until the next refresh.
    return { ok: false, status: 503, text: '', logLine: `ics: ${logLine}` };
  }

  return {
    ok: true,
    status: 200,
    text: calendar(body.events, { origin, name: 'EO Ukraine events' }),
    logLine: `ics: ${body.events.length} events served as a feed`,
  };
}
