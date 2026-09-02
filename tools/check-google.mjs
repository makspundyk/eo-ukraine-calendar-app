/**
 * `npm run check` — does the Google side actually work?
 *
 * Every step is separate, so a failure names which one and what to change. It only READS;
 * nothing here creates, edits or invites.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { getAccessToken, SCOPES, fetchSheetValues } from '../lib/google-sheets.mjs';
import { normalizeRows } from '../lib/normalize.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const env = Object.fromEntries((await readFile(join(ROOT, '.env'), 'utf8').catch(() => ''))
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); let v = l.slice(i + 1).trim();
    if (/^(".*"|'.*')$/s.test(v)) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));
for (const k of Object.keys(env)) if (process.env[k]) env[k] = process.env[k];

if (env.GOOGLE_APPLICATION_CREDENTIALS && !env.GOOGLE_PRIVATE_KEY) {
  const j = JSON.parse(await readFile(resolve(ROOT, env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8'));
  env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||= j.client_email;
  env.GOOGLE_PRIVATE_KEY = j.private_key;
}

let bad = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const no = (m, fix) => { bad++; console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  if (fix) console.log(`      → ${fix}`); };
const skip = (m) => console.log(`  \x1b[90m–\x1b[0m ${m}`);

const creds = { email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, privateKey: env.GOOGLE_PRIVATE_KEY };

console.log('\n1. the service account');
if (!creds.email || !creds.privateKey) no('no credentials found', 'check GOOGLE_APPLICATION_CREDENTIALS in .env');
else ok(`key loaded for ${creds.email}`);

console.log('\n2. the spreadsheet');
if (!env.GOOGLE_SPREADSHEET_ID) skip('GOOGLE_SPREADSHEET_ID is not set — skipping');
else {
  try {
    const values = await fetchSheetValues({ ...creds, spreadsheetId: env.GOOGLE_SPREADSHEET_ID,
      range: env.GOOGLE_SHEET_RANGE || 'EventCalendar' });
    const { events, issues } = normalizeRows(values);
    ok(`read ${values.length} rows → ${events.length} publishable events`);
    if (issues.length) console.log(`      ${issues.length} data issues; first: ${issues[0].kind} row ${issues[0].row}`);
    const withEvent = events.filter((e) => e.calendar_event_id).length;
    console.log(`      ${withEvent} of ${events.length} rows have a Calendar Event ID`);
  } catch (e) {
    no(`could not read the sheet [${e.reason}]`, e.message.slice(0, 160));
  }
}

console.log('\n3. domain-wide delegation (the calendar scope, acting as a person)');
if (!env.GOOGLE_IMPERSONATE_USER) no('GOOGLE_IMPERSONATE_USER is not set',
  'set it to a user in the SAME domain whose admin console granted the delegation');
else {
  try {
    const token = await getAccessToken({ ...creds, scope: SCOPES.calendar,
      subject: env.GOOGLE_IMPERSONATE_USER });
    ok(`Google issued a token acting as ${env.GOOGLE_IMPERSONATE_USER}`);

    console.log('\n4. the calendar');
    // events.list, NOT calendars.get. The granted scope is calendar.EVENTS, which permits
    // reading and writing events and deliberately not reading calendar metadata — so a
    // metadata call 403s even when everything is configured correctly. Check what the
    // application actually does.
    const id = env.GOOGLE_CALENDAR_ID || 'primary';
    const auth = { authorization: `Bearer ${token}` };
    const list = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
      + '?maxResults=5&orderBy=startTime&singleEvents=true&timeMin='
      + new Date().toISOString(), { headers: auth });

    if (list.status === 404) {
      no('the calendar id is not visible to that user',
        'check GOOGLE_CALENDAR_ID, and that the calendar is shared with '
        + `${env.GOOGLE_IMPERSONATE_USER} as "Make changes to events"`);
    } else if (list.status === 403) {
      const body = await list.text();
      no('the scope or the sharing is not enough',
        /insufficient/i.test(body)
          ? 'the admin console must authorise exactly '
            + 'https://www.googleapis.com/auth/calendar.events for this client id'
          : body.slice(0, 160));
    } else if (!list.ok) {
      no(`reading events failed (${list.status})`, (await list.text()).slice(0, 160));
    } else {
      const { items = [], summary } = await list.json();
      ok(`can read events on "${summary || id.slice(0, 12) + '…'}" — ${items.length} upcoming`);
      items.forEach((e) => console.log(
        `      ${(e.start?.date || e.start?.dateTime || '').slice(0, 16)}  ${e.summary}`));
      if (!items.length) {
        console.log('      (none yet — run EO Calendar → Sync now in the sheet)');
      }
    }
  } catch (e) {
    no(`delegation failed [${e.reason}]`, e.message.slice(0, 240));
  }
}

console.log(bad ? `\n${bad} step(s) need attention\n` : '\nGoogle side is ready\n');
process.exit(bad ? 1 : 0);
