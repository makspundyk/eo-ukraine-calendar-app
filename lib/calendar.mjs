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

export async function getCalendar(env) {
  const config = readConfig(env);

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
    const values = await fetchSheetValues(config);
    const { events, issues } = normalizeRows(values);

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

    return {
      body: {
        ok: true,
        source: 'sheet',
        fetched_at: new Date().toISOString(),
        count: events.length,
        events: events.map(stripInternal),
      },
      // `issues` names cells and row numbers, so it is logged rather than published.
      logLine: `calendar: ${events.length} events from the sheet`
             + (issues.length ? `, ${issues.length} parsing issues` : ''),
      issues,
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
