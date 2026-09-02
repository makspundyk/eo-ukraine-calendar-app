/**
 * POST /api/interest — "I want to come to this one", recorded against the event.
 * ===========================================================================
 * The lighter half of /api/attend, and deliberately a different thing.
 *
 *   /api/attend     puts the member ON the organiser's calendar event. Google emails them the
 *                   invitation, the event appears in their calendar, and every later change
 *                   the organiser makes reaches them.
 *   /api/interest   writes their address into ONE cell of the event's own row and does
 *                   nothing else. No calendar entry, no email, no guest list. It is a note to
 *                   the organiser that somebody is interested.
 *
 * Why the split exists: an event with no registration page and no date yet cannot be joined —
 * there is no calendar event to be a guest of — and until now those rows offered a member
 * nothing at all to press. And for the rest, wanting to be counted is not the same as wanting
 * a diary entry.
 *
 * ONE COLUMN, `Interested Emails`, on the calendar tab beside the row it belongs to. The
 * organiser reads it where they read everything else. It is never published: normalize.mjs
 * lists it as internal, so it is stripped on the way to the browser exactly as the guest list
 * is — the whole point is that this list is the chapter's, not the internet's.
 *
 * NOT written by the Apps Script. The script owns the columns it fills FROM the calendar
 * (`Attendees Emails`, `Attendees`); nothing in the calendar corresponds to this one, so
 * nothing in the script will ever overwrite it. Both merely agree on the name, so
 * `ensureColumns_` creates it and this module finds it.
 */
import { getAccessToken, SCOPES, SheetError } from './google-sheets.mjs';
import { readConfig, readSheet } from './calendar.mjs';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const COLUMN = 'Interested Emails';

/** Same rule as everywhere else: reject what is certainly not an address, and nothing more. */
export const looksLikeEmail = (v) =>
  typeof v === 'string' && v.trim().length <= 254
  && /^[^\s@,;]+@[^\s@,;.]+\.[^\s@,;]{2,}$/.test(v.trim());

/** A courtesy limit per event. Google's quota is the real backstop; this stops a stuck script. */
const RATE = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const withinRate = (key) => {
  const now = Date.now();
  const seen = (RATE.get(key) || []).filter((t) => now - t < WINDOW_MS);
  seen.push(now);
  RATE.set(key, seen);
  return seen.length <= MAX_PER_WINDOW;
};

const config = (env) => ({ ...readConfig(env), impersonate: env.GOOGLE_IMPERSONATE_USER });
const ready = (cfg) => Boolean(cfg.email && cfg.privateKey && cfg.spreadsheetId && cfg.impersonate);

const OFF = 'Registering interest is not switched on yet. Use the calendar buttons instead.';
const LATER = 'That did not work just now. Try again in a moment.';

const A1 = (n) => {                       // 0-based column index -> A, B, ... Z, AA
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
};

/**
 * The header row, found by NAME rather than assumed to be row 1 — the calendar tab opens with
 * a title row in the real sheet, and hard-coding a row number is how that becomes a silent
 * off-by-one that writes an address into somebody's event title.
 */
function findHeader(values) {
  for (let i = 0; i < Math.min(values.length, 15); i++) {
    const cells = (values[i] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (cells.includes('title') || cells.includes('start date')) return { index: i, cells };
  }
  return null;
}

const split = (cell) => String(cell ?? '')
  .split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.includes('@'));

/**
 * @param {{event:string, email:string}} input
 * @returns {{body:object, status:number, logLine:string}}
 */
export async function registerInterest(env, input) {
  const cfg = config(env);
  const email = String(input.email ?? '').trim().toLowerCase();

  if (!ready(cfg)) {
    return { status: 200, body: { ok: false, reason: 'not_enabled', message: OFF },
             logLine: 'interest: the service account or GOOGLE_IMPERSONATE_USER is not set' };
  }
  if (!looksLikeEmail(email)) {
    return { status: 200,
             body: { ok: false, reason: 'bad_email',
                     message: 'That does not look like an email address — check it and try again.' },
             logLine: 'interest: rejected a malformed address' };
  }
  if (!withinRate(String(input.event ?? ''))) {
    return { status: 200,
             body: { ok: false, reason: 'rate_limited',
                     message: 'That is a lot of interest at once. Try again in a minute.' },
             logLine: `interest: rate limit hit for ${input.event}` };
  }

  try {
    // Which row. From the parsed sheet, so the id means the same thing it does everywhere
    // else — the browser's id is never a row number and must never be turned into one here.
    const { events } = await readSheet(readConfig(env));
    const ev = events.find((e) => e.id === input.event)
      ?? events.find((e) => e.id.startsWith(`${input.event}-`));
    if (!ev?.source_row) {
      return { status: 200,
               body: { ok: false, reason: 'no_event',
                       message: 'That event is not in the calendar any more.' },
               logLine: `interest: no row for "${input.event}"` };
    }

    const t = await getAccessToken({ email: cfg.email, privateKey: cfg.privateKey,
                                    scope: SCOPES.sheetsWrite, subject: cfg.impersonate });
    const auth = { authorization: `Bearer ${t}` };
    const tab = (cfg.range || 'EventCalendar').split('!')[0];

    const res = await fetch(
      `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/${encodeURIComponent(tab)}`,
      { headers: auth });
    if (!res.ok) {
      throw new SheetError('read_failed', `Could not read ${tab} (${res.status}).`,
        { publicMessage: LATER });
    }
    const { values = [] } = await res.json();
    const head = findHeader(values);
    if (!head) throw new SheetError('no_header', 'No header row on the calendar tab.',
      { publicMessage: LATER });

    // Self-healing, as the subscriber tab is: a chapter that has not run the Apps Script yet
    // would otherwise get a dead button and no way to know why. The script's ensureColumns_
    // matches on the same name, so it finds this one rather than adding a second.
    let column = head.cells.indexOf(COLUMN.toLowerCase());
    if (column < 0) {
      column = Math.max(head.cells.length, ...values.map((r) => r.length));
      const wrote = await fetch(
        `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/`
        + `${encodeURIComponent(`${tab}!${A1(column)}${head.index + 1}`)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ values: [[COLUMN]] }) });
      if (!wrote.ok) {
        throw new SheetError('write_failed', `Could not add the ${COLUMN} column.`,
          { publicMessage: LATER });
      }
    }

    const cell = `${tab}!${A1(column)}${ev.source_row}`;
    const held = split((values[ev.source_row - 1] || [])[column]);
    if (held.some((x) => x.toLowerCase() === email)) {
      return { status: 200,
               body: { ok: true, already: true,
                       message: 'You are already on the list for this event.' },
               logLine: `interest: already recorded for ${ev.id}` };
    }

    // Read-modify-write on one cell. Two people pressing in the same second could cost one of
    // them their place in the cell; at a chapter's traffic that is a theoretical loss, and the
    // alternative — a lock, or a row per person — is a database this project deliberately
    // does not have.
    const put = await fetch(
      `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/`
      + `${encodeURIComponent(cell)}?valueInputOption=RAW`,
      { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ values: [[[...held, email].join(', ')]] }) });

    if (!put.ok) {
      const detail = await put.text().catch(() => '');
      throw new SheetError('write_failed',
        `Could not record the interest (${put.status}). ${detail.slice(0, 200)}`,
        { publicMessage: LATER });
    }

    return { status: 200,
             body: { ok: true,
                     message: 'Noted — the organiser knows you are interested. '
                            + 'We will be in touch about this event.' },
             logLine: `interest: recorded one address for ${ev.id}` };
  } catch (err) {
    return { status: 200,
             body: { ok: false, reason: err.reason || 'failed',
                     message: err instanceof SheetError ? err.publicMessage : LATER },
             // The address and Google's own words stay here, out of the response.
             logLine: `interest: [${err.reason || 'failed'}] ${err.message}` };
  }
}
