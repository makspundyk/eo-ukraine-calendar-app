/**
 * The subscriber list, kept in the sheet.
 * ===========================================================================
 * A second tab, `EventCalendarSubscriptions`, so the chapter owns its list in the same place
 * it owns everything else — no database, no third-party mailing tool, and it can be sorted,
 * filtered and exported like any other sheet.
 *
 *   Email | Date Subscribed | Full Name | Unsubscribed | Token
 *
 * `Unsubscribed` is a checkbox. Anyone whose box is NOT ticked gets invited; ticking it by
 * hand in the sheet works exactly as well as clicking the link in an invitation, which is what
 * a chapter secretary will actually do when somebody asks them in person.
 *
 * `Token` is the only column nobody types. It is what makes an unsubscribe link safe: a random
 * string per subscriber, so the link cannot be guessed and nobody can remove anybody else by
 * editing an address in a URL — and that link travels inside a calendar invitation, which gets
 * forwarded.
 *
 * WRITING NEEDS A SECOND SCOPE. Reading the calendar sheet uses spreadsheets.readonly;
 * appending a subscriber needs `https://www.googleapis.com/auth/spreadsheets`, authorised for
 * the same client id in the Workspace admin console. Until it is, subscribing answers
 * `not_enabled` and the site falls back to offering the .ics feed, which needs nothing.
 */
import { getAccessToken, SCOPES, SheetError } from './google-sheets.mjs';
import { readConfig } from './calendar.mjs';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const TAB = 'EventCalendarSubscriptions';
export const COLUMNS = ['Email', 'Date Subscribed', 'Full Name', 'Unsubscribed', 'Token'];

/** Same rule as the invitation form: reject what is certainly not an address, nothing more. */
export const looksLikeEmail = (v) =>
  typeof v === 'string' && v.length <= 254
  && /^[^\s@,;]+@[^\s@,;.]+\.[^\s@,;]{2,}$/.test(v.trim());

/** 160 bits of randomness. Long enough that guessing is not a strategy. */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28);
}

function config(env) {
  const base = readConfig(env);
  return { ...base, impersonate: env.GOOGLE_IMPERSONATE_USER };
}

async function token(cfg, scope) {
  try {
    return await getAccessToken({ email: cfg.email, privateKey: cfg.privateKey,
                                  scope, subject: cfg.impersonate });
  } catch (err) {
    // Almost always one thing: the write scope has not been authorised in the admin console.
    // Saying "the calendar service could not authenticate" here points at the wrong surface.
    throw new SheetError(err.reason || 'auth_failed',
      `${err.message} (scope: ${scope})`,
      { publicMessage: 'Subscriptions are not switched on yet.' });
  }
}

const ready = (cfg) => Boolean(cfg.email && cfg.privateKey && cfg.spreadsheetId && cfg.impersonate);

/* --------------------------------------------------------------------- read */

/** Every row, as objects. The header is row 1 of this tab — it is ours, so it is fixed. */
export async function readSubscribers(env) {
  const cfg = config(env);
  if (!ready(cfg)) throw new SheetError('not_enabled', 'Subscriptions are not configured.',
    { publicMessage: 'Subscriptions are not switched on yet.' });

  const t = await token(cfg, SCOPES.sheets);
  const res = await fetch(
    `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/${encodeURIComponent(TAB)}`,
    { headers: { authorization: `Bearer ${t}` } });

  if (res.status === 400 || res.status === 404) return { rows: [], missingTab: true };
  if (!res.ok) {
    throw new SheetError('read_failed', `Could not read ${TAB} (${res.status}).`,
      { publicMessage: 'The subscriber list could not be read.' });
  }
  const { values = [] } = await res.json();
  if (!values.length) return { rows: [], missingTab: false };

  const head = values[0].map((h) => String(h || '').trim().toLowerCase());
  const at = (name) => head.indexOf(name.toLowerCase());
  // A Sheets checkbox reads back as the boolean true; typed by hand it is a string.
  const ticked = (v) => v === true || ['true', 'yes', 'y', '1', '✓', 'x'].includes(
    String(v ?? '').trim().toLowerCase());

  const rows = values.slice(1).map((r, i) => ({
    rowNumber: i + 2,                                  // 1-based, header is row 1
    email: String(r[at('Email')] ?? '').trim().toLowerCase(),
    name: String(r[at('Full Name')] ?? '').trim(),
    unsubscribed: ticked(r[at('Unsubscribed')]),
    token: String(r[at('Token')] ?? '').trim(),
  })).filter((r) => r.email);

  return { rows, missingTab: false };
}

/** Everyone whose Unsubscribed box is not ticked. The only list that is ever invited. */
export const activeSubscribers = (rows) => rows.filter((r) => !r.unsubscribed);

/* -------------------------------------------------------------------- write */

/**
 * Adds a subscriber, or reactivates one who had left.
 *
 * Returns the same shape whether the address was new or already there, and never says which.
 * "That address is already subscribed" turns the form into a way of testing whether somebody
 * is a member of this chapter.
 */
export async function subscribe(env, { email, name = '' }) {
  const cfg = config(env);
  if (!ready(cfg)) {
    return { ok: false, reason: 'not_enabled',
             message: 'Subscriptions are not switched on yet.' };
  }
  const address = String(email ?? '').trim().toLowerCase();
  if (!looksLikeEmail(address)) {
    return { ok: false, reason: 'bad_email', message: 'That does not look like an email address.' };
  }

  const { rows, missingTab } = await readSubscribers(env);
  if (missingTab) {
    return { ok: false, reason: 'no_tab',
             message: 'Subscriptions are not switched on yet.',
             log: `the ${TAB} tab does not exist — run EO Calendar → Set up subscriptions` };
  }

  const t = await token(cfg, SCOPES.sheetsWrite);
  const auth = { authorization: `Bearer ${t}`, 'content-type': 'application/json' };
  const existing = rows.find((r) => r.email === address);
  const now = new Date().toISOString();

  if (existing) {
    if (!existing.unsubscribed) {
      return { ok: true, already: true, token: existing.token,
               message: 'You are on the list.' };
    }
    // Coming back: untick the box in place rather than leaving two rows for one person.
    const fresh = existing.token || newToken();
    const res = await fetch(
      `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/`
      + `${encodeURIComponent(`${TAB}!B${existing.rowNumber}:E${existing.rowNumber}`)}`
      + '?valueInputOption=RAW',
      { method: 'PUT', headers: auth,
        body: JSON.stringify({ values: [[now, name || existing.name, false, fresh]] }) });
    if (!res.ok) {
      throw new SheetError('write_failed', `Could not resubscribe (${res.status}).`,
        { publicMessage: 'That did not work. Try again in a moment.' });
    }
    return { ok: true, token: fresh, message: 'You are on the list.' };
  }

  const fresh = newToken();
  const res = await fetch(
    `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/`
    + `${encodeURIComponent(`${TAB}!A:E`)}:append`
    + '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    { method: 'POST', headers: auth,
      body: JSON.stringify({ values: [[address, now, name, false, fresh]] }) });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new SheetError('write_failed',
      `Could not add the subscriber (${res.status}). ${detail.slice(0, 200)}`,
      { publicMessage: 'That did not work. Try again in a moment.' });
  }
  return { ok: true, token: fresh, message: 'You are on the list.' };
}

/**
 * Marks a subscriber as gone. Identified by their token only.
 *
 * Never by address: a link carrying an address would let anyone remove anyone by editing the
 * URL, and this link travels in a calendar invitation that gets forwarded.
 */
export async function unsubscribe(env, tokenValue) {
  const cfg = config(env);
  const value = String(tokenValue ?? '').trim();
  if (!ready(cfg) || !value) {
    return { ok: false, reason: 'bad_token', message: 'That unsubscribe link is not valid.' };
  }

  const { rows } = await readSubscribers(env);
  const found = rows.find((r) => r.token && r.token === value);
  // The same answer either way: a wrong token must not reveal that a right one exists.
  if (!found) return { ok: false, reason: 'bad_token', message: 'That unsubscribe link is not valid.' };
  if (found.unsubscribed) {
    return { ok: true, already: true, email: found.email,
             message: 'You were already unsubscribed.' };
  }

  const t = await token(cfg, SCOPES.sheetsWrite);
  const res = await fetch(
    `${SHEETS_API}/${encodeURIComponent(cfg.spreadsheetId)}/values/`
    + `${encodeURIComponent(`${TAB}!D${found.rowNumber}`)}?valueInputOption=RAW`,
    { method: 'PUT',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: [[true]] }) });

  if (!res.ok) {
    throw new SheetError('write_failed', `Could not unsubscribe (${res.status}).`,
      { publicMessage: 'That did not work. Try again in a moment.' });
  }
  return { ok: true, email: found.email, message: 'You will not be invited again.' };
}
