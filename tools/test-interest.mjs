/**
 * /api/interest with Google stubbed.
 *
 * The assertions that matter are about what this must NOT do: it must not send an invitation,
 * must not touch the calendar, must not overwrite the addresses already in the cell, and must
 * not write anywhere except the one column it owns — the row it writes to is derived from the
 * sheet, never from anything the browser sent.
 */
import { registerInterest, COLUMN } from '../lib/interest.mjs';

let failed = 0;
const check = (n, c, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  <- ${d}`}`); if (!c) failed++;
};

const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@p.iam.gserviceaccount.com',
              GOOGLE_PRIVATE_KEY: 'stub', GOOGLE_SPREADSHEET_ID: 's',
              GOOGLE_IMPERSONATE_USER: 'admin@eoukraine.com' };

crypto.subtle.importKey = async () => ({});
crypto.subtle.sign = async () => new Uint8Array(8);

// A title row above the header, because the real sheet has one and a hard-coded row 1 would
// write an address into somebody's event title.
let sheet = [
  ['EO Ukraine — calendar', '', '', '', ''],
  ['Status', 'Type', 'Title', 'Start Date', COLUMN],
  ['Published', 'Learning Event', 'Team Night', '2026-12-01', 'first@example.com'],
  ['Published', 'Learning Event', 'Later On', '2026-12-08', ''],
];
let writes = [];
let calendarCalls = 0;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('oauth2')) {
    return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
  }
  if (u.includes('calendar/v3')) { calendarCalls++; return new Response('{}'); }
  if (init.method === 'PUT') {
    writes.push({ url: decodeURIComponent(u), body: JSON.parse(init.body) });
    return new Response('{}');
  }
  return new Response(JSON.stringify({ values: sheet }));
};

const ID = 'team-night-2026-12-01';

console.log('\nrecording interest');
let r = await registerInterest(env, { event: ID, email: '  Someone@Example.COM ' });
check('reports success', r.body.ok === true, JSON.stringify(r.body));
check('one write, and only one', writes.length === 1, JSON.stringify(writes));
check('into the Interested Emails column of THAT row, E3',
  writes[0].url.includes('EventCalendar!E3'), writes[0]?.url);
check('the address already in the cell is kept',
  writes[0].body.values[0][0] === 'first@example.com, someone@example.com',
  JSON.stringify(writes[0]?.body));
check('the address is lower-cased and trimmed',
  writes[0].body.values[0][0].endsWith('someone@example.com'));
check('the calendar is never touched — this is not an invitation', calendarCalls === 0);

console.log('\nthe row comes from the sheet, never from the request');
writes = [];
r = await registerInterest(env, { event: 'later-on-2026-12-08', email: 'a@b.co' });
check('a different event writes to a different row', writes[0].url.includes('!E4'), writes[0]?.url);
writes = [];
r = await registerInterest(env, { event: '../../Sheet1!A1', email: 'a@b.co' });
check('an id that is not an event is refused', r.body.reason === 'no_event', JSON.stringify(r.body));
check('and nothing is written', writes.length === 0);

console.log('\nsaying no');
r = await registerInterest(env, { event: ID, email: 'first@example.com' });
check('an address already in the cell is not added twice', r.body.already === true);
r = await registerInterest(env, { event: ID, email: 'not-an-email' });
check('a malformed address is refused', r.body.reason === 'bad_email');
r = await registerInterest({ ...env, GOOGLE_IMPERSONATE_USER: '' }, { event: ID, email: 'a@b.co' });
check('without the write identity it says so rather than half-working',
  r.body.reason === 'not_enabled');

// A second spreadsheet id, because the parsed sheet is cached for a minute per id — which is
// the point of the cache, and would otherwise hand this fixture the previous one.
const env2 = { ...env, GOOGLE_SPREADSHEET_ID: 's2' };
console.log('\na sheet that has never had the column');
sheet = [
  ['Status', 'Type', 'Title', 'Start Date'],
  ['Published', 'Learning Event', 'No Column', '2026-12-15'],
];
writes = [];
r = await registerInterest(env2, { event: 'no-column-2026-12-15', email: 'a@b.co' });
check('the column is added rather than the button dying', writes.length === 2, JSON.stringify(writes.map((w) => w.url)));
check('the header goes in the header row, at the first free column',
  writes[0].url.includes('!E1') && writes[0].body.values[0][0] === COLUMN, writes[0]?.url);
check('and the address goes in that column, on the event row',
  writes[1].url.includes('!E2'), writes[1]?.url);

console.log('\nnothing sensitive leaves the server');
const said = JSON.stringify([r, await registerInterest(env2, { event: 'no-column-2026-12-15', email: 'x@y.co' })]);
check('no service account address in any response', !said.includes('gserviceaccount'));
check('no impersonated user in any response', !said.includes('admin@eoukraine.com'));
check('no other address in any response', !said.includes('a@b.co'));

console.log('\nrate limiting');
let limited = false;
for (let i = 0; i < 40; i++) {
  const out = await registerInterest(env, { event: 'burst', email: `p${i}@example.com` });
  if (out.body.reason === 'rate_limited') limited = true;
}
check('a burst on one event is stopped', limited);

console.log(failed ? `\n${failed} failed\n` : '\nall good\n');
process.exit(failed ? 1 : 0);
