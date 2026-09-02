/**
 * What /api/calendar answers, on either host.
 * ===========================================================================
 * functions/api/calendar.js (Cloudflare Pages Function) and serve.mjs (this machine) both
 * call this and do nothing else, so the two environments cannot drift apart in behaviour —
 * only in where the secrets come from.
 *
 * EVERYTHING RETURNED HERE IS PUBLIC. Anyone can open /api/calendar. So the response carries
 * the event objects the UI renders and nothing else: no spreadsheet id, no range, no service
 * account address, no Google payload, no environment, no raw rows.
 *
 * The contract the client depends on:
 *
 *   { ok: true,  source: 'sheet', count, fetched_at, events: [...] }
 *   { ok: false, source: 'mock',  reason: 'not_shared', message: '<generic>' }
 *
 * `ok: false` is a normal answer, not a crash: the sheet being unreachable, empty or
 * unparsable is an operational fact, and the calendar's job at that moment is to fall back to
 * the demo data rather than show an error page. The HTTP status stays 200 throughout — a 500
 * would put a red line in the console for something the site handled correctly, and teach
 * whoever is on call to ignore red lines.
 *
 * Detail for a human goes to the server log via `logLine`, which the caller prints. That is
 * the only place the service account or Google's own message is allowed to appear.
 */
import { fetchSheetValues, SheetError } from './google-sheets.mjs';
import { normalizeRows, stripInternal } from './normalize.mjs';

/**
 * What a LIST needs, and nothing more. The feed and the table draw a card from these; the
 * description, the highlights, the speaker's biography and the venue are only ever read on
 * one event's own page, and shipping them with the list is most of the payload for something
 * nobody scrolls past. Opening an event fetches the rest.
 */
const LIST_FIELDS = ['id', 'title', 'kind', 'type_label', 'start', 'end', 'date_tbc',
  'date_note', 'time_start', 'time_end', 'timezone', 'place', 'is_online', 'summary',
  'speaker_name', 'speaker_title', 'guests_welcome', 'registration_url', 'image_url',
  'calendar_url'];

/** Server-side only: the id is how /api/attend finds the event, and the browser never needs it. */
export const findCalendarEventId = (events, id) => {
  const ev = events.find((e) => e.id === id)
    ?? events.find((e) => e.id.startsWith(`${id}-`));
  return ev ? { calendarEventId: ev.calendar_event_id, title: ev.title } : null;
};

const project = (event, fields) => ({
  ...Object.fromEntries(fields.map((f) => [f, event[f]]).filter(([, v]) => v !== undefined)),
  // A boolean, never the id. The browser needs to know an invitation EXISTS; handing it the
  // calendar event id would let anyone add guests to any event on the chapter's calendar.
  invitable: Boolean(event.calendar_event_id),
});

/**
 * The parsed sheet, briefly. Opening an event immediately after the feed loaded should not
 * cost a second round trip to Google, and neither should two visitors arriving together.
 *
 * Short on purpose: a chapter editing the sheet expects to see the change, and 60 seconds is
 * the difference between "instant" and "why is it not updating".
 */
const SHEET_TTL_MS = 60_000;
let sheetCache = null;      // { at, key, events, issues }

async function readSheet(config) {
  const key = `${config.spreadsheetId}:${config.range}`;
  if (sheetCache && sheetCache.key === key && Date.now() - sheetCache.at < SHEET_TTL_MS) {
    return { ...sheetCache, cached: true };
  }
  const values = await fetchSheetValues(config);
  const { events, issues } = normalizeRows(values);
  sheetCache = { at: Date.now(), key, events, issues };
  return { ...sheetCache, cached: false };
}

/** Upcoming / past is decided here so "upcoming" cannot mean two things on two screens. */
function inScope(event, scope, todayIso) {
  if (scope === 'all') return true;
  if (event.date_tbc || !event.start) return scope !== 'past';   // undated is never past
  return scope === 'past'
    ? (event.end || event.start) < todayIso
    : (event.end || event.start) >= todayIso;
}

/**
 * Row 1, not row 3. The sheet is read BY HEADER NAME (docs/SHEET.md, rule 1), so the header
 * row must be inside the range; `A3:V9999` would cut it off and there would be nothing to map
 * columns by. Starting at row 1 is a superset of A3 and costs two rows of transfer.
 * `normalizeRows` finds the header wherever it actually sits, so a title row above it is fine.
 */
const DEFAULT_RANGE = 'EventCalendar!A1:V9999';

/**
 * Reads configuration from whatever the host calls its environment: Cloudflare hands a
 * Function `context.env`, Node has `process.env`. Both look identical from here.
 *
 * CLOUDFLARE_ON is read for logging only. It is configuration, never a security boundary —
 * the secrets are server-side in both environments regardless of its value, and no browser
 * code reads it. Nothing breaks if it is unset.
 */
export function readConfig(env = {}) {
  return {
    // DEMO=1 pins the site to the demo calendar and short-circuits Google entirely: no key is
    // read, no token is requested, no request leaves the server. That is what makes it usable
    // on a machine with no credentials at all, and safe to switch on in production during a
    // rehearsal or a sheet migration.
    demo: String(env.DEMO ?? '0').trim() === '1',
    cloudflare: String(env.CLOUDFLARE_ON ?? '').trim() === '1',
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY,
    spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
    range: env.GOOGLE_SHEET_RANGE || DEFAULT_RANGE,
  };
}

/**
 * @param {object} env
 * @param {{scope?:'upcoming'|'past'|'all', eventId?:string}} query
 *
 * Three shapes, one endpoint:
 *   scope=upcoming (default)  the light list a member lands on
 *   scope=past                only fetched when somebody asks for it
 *   event=<id>                one event, in full
 */
export async function getCalendar(env, query = {}) {
  const config = readConfig(env);
  const scope = ['upcoming', 'past', 'all'].includes(query.scope) ? query.scope : 'upcoming';

  // Checked before anything else, deliberately. Demo mode is a decision, not a failure, so it
  // must not depend on credentials being present or on Google being reachable.
  if (config.demo) {
    return {
      body: { ok: false, source: 'mock', reason: 'demo',
              message: 'Showing the demo calendar.' },
      logLine: 'calendar: DEMO=1 — serving the demo calendar, Google not contacted',
      issues: [],
    };
  }

  try {
    const { events, issues, cached } = await readSheet(config);
    const today = new Date().toISOString().slice(0, 10);

    // One event, in full. Asked for when a member opens it, never before.
    if (query.eventId) {
      const event = events.find((e) => e.id === query.eventId)
        ?? (events.filter((e) => e.id.startsWith(`${query.eventId}-`)).length === 1
            ? events.find((e) => e.id.startsWith(`${query.eventId}-`)) : null);
      return {
        body: event
          ? { ok: true, source: 'sheet', event: stripInternal(event) }
          : { ok: false, source: 'mock', reason: 'not_in_sheet',
              message: 'That event is not in the calendar.' },
        logLine: `calendar: event ${query.eventId} ${event ? 'served' : 'not found'}`
               + `${cached ? ' (cached sheet)' : ''}`,
        issues: [],
      };
    }

    // An empty sheet is a misconfiguration far more often than a chapter with no events, and
    // rendering an empty calendar hides that. The demo data is the louder, more useful answer.
    if (events.length === 0) {
      return {
        body: { ok: false, source: 'mock', reason: 'empty',
                message: 'The calendar is empty.' },
        logLine: `calendar: sheet read but produced no publishable events`
               + ` (${issues.length} parsing issues)`,
        issues,
      };
    }

    const inThisScope = events.filter((e) => inScope(e, scope, today));
    return {
      body: {
        ok: true,
        source: 'sheet',
        scope,
        fetched_at: new Date().toISOString(),
        count: inThisScope.length,
        // Counts for the whole sheet, so the UI can label the Past tab without fetching it.
        totals: {
          upcoming: events.filter((e) => inScope(e, 'upcoming', today)).length,
          past: events.filter((e) => inScope(e, 'past', today)).length,
        },
        events: inThisScope.map((e) => project(stripInternal(e), LIST_FIELDS)),
      },
      // `issues` names cells and row numbers, so it is logged rather than published.
      logLine: `calendar: ${inThisScope.length}/${events.length} events, scope=${scope}`
             + `${cached ? ', cached sheet' : ''}`
             + (issues.length ? `, ${issues.length} parsing issues` : ''),
      issues: cached ? [] : issues,
    };
  } catch (err) {
    const reason = err.reason || 'failed';
    return {
      body: {
        ok: false,
        source: 'mock',
        reason,
        message: err instanceof SheetError
          ? err.publicMessage
          : 'The calendar could not be read from the sheet.',
      },
      // The full message may name the service account and quote Google. Log only.
      logLine: `calendar: falling back to demo data [${reason}] ${err.message}`,
      issues: [],
    };
  }
}
