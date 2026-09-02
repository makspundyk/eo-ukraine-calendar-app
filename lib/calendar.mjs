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

/**
 * The calendar event id for one of our event ids. SERVER SIDE ONLY.
 *
 * It reads the sheet directly rather than searching the response of getCalendar(), because
 * that response has been through publicEvent() — which strips this very field. Deriving it
 * from the public payload is impossible by design, and trying to made every invitation fail
 * with "this event does not have a calendar invitation yet".
 */
export async function resolveCalendarEventId(env, publicId) {
  if (!publicId) return null;
  const { events } = await readSheet(readConfig(env));
  const ev = events.find((e) => e.id === publicId)
    ?? events.find((e) => e.id.startsWith(`${publicId}-`));
  return ev ? { calendarEventId: ev.calendar_event_id, title: ev.title } : null;
}

/**
 * The ONE gate every event passes through on its way to the browser, list or detail.
 *
 * It was two gates, and they disagreed: the list projected a safe subset while the detail
 * endpoint returned the record as it came off the sheet. That leaked `calendar_event_id` —
 * which must never reach the browser, or anyone could add guests to any event on the
 * chapter's calendar — and it left the detail record without `invitable`, so opening an event
 * replaced a record that knew it could be joined with one that did not, and the page fell
 * back to the copy buttons.
 *
 * `fields` narrows a list record further. Detail passes none and keeps everything except what
 * is stripped here.
 */
const publicEvent = (event, fields) => {
  const base = fields
    ? Object.fromEntries(fields.map((f) => [f, event[f]]).filter(([, v]) => v !== undefined))
    : { ...event };
  delete base.calendar_event_id;                   // server-side only, always
  return { ...stripInternal(base), invitable: Boolean(event.calendar_event_id) };
};

/**
 * The parsed sheet, briefly. Opening an event immediately after the feed loaded should not
 * cost a second round trip to Google, and neither should two visitors arriving together.
 *
 * Short on purpose: a chapter editing the sheet expects to see the change, and 60 seconds is
 * the difference between "instant" and "why is it not updating".
 */
const SHEET_TTL_MS = 60_000;
let sheetCache = null;      // { at, key, events, issues }

export async function readSheet(config) {
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
 * The bare tab name, deliberately: it returns the sheet's whole used range, so there is no
 * first row and no last column to outgrow.
 *
 * Both bounds have already bitten. `A3:…` would cut off the header row, and this project reads
 * BY HEADER NAME (docs/SHEET.md, rule 1) so there would be nothing to map columns by. And
 * `…:V9999` silently hid `Calendar Event ID` and `Calendar Link` the moment the Apps Script
 * appended them at W and X — the sheet grew a column and the site simply stopped seeing it.
 * A range with an end column is a bug waiting for somebody to add a column.
 */
const DEFAULT_RANGE = 'EventCalendar';

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
          ? { ok: true, source: 'sheet', event: publicEvent(event) }
          : { ok: false, source: 'mock', reason: 'not_in_sheet',
              message: 'That event is not in the calendar. It may have been renamed or taken '
                     + 'down — the full list is on the events page.' },
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
                message: 'The live calendar has no events in it, so these are samples.' },
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
        events: inThisScope.map((e) => publicEvent(e, LIST_FIELDS)),
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
          : 'The live calendar could not be read, so these are sample events.',
      },
      // The full message may name the service account and quote Google. Log only.
      logLine: `calendar: falling back to demo data [${reason}] ${err.message}`,
      issues: [],
    };
  }
}
