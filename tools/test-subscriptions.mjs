/** The subscriber list, with Sheets stubbed. The assertions are mostly about what must NOT happen. */
import { subscribe, unsubscribe, readSubscribers, activeSubscribers, newToken }
  from '../lib/subscriptions.mjs';

let failed = 0;
const check = (n, c, d='') => { console.log(`  ${c?'✓':'✗'} ${n}${c?'':`  <- ${d}`}`); if(!c) failed++; };
crypto.subtle.importKey = async () => ({}); crypto.subtle.sign = async () => new Uint8Array(8);

const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@p.iam.gserviceaccount.com',
              GOOGLE_PRIVATE_KEY: 'stub', GOOGLE_SPREADSHEET_ID: 's',
              GOOGLE_IMPERSONATE_USER: 'me@example.com' };

let sheet, wrote;
const reset = (rows) => {
  wrote = [];
  sheet = [['Email', 'Date Subscribed', 'Full Name', 'Unsubscribed', 'Token'], ...rows];
};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('oauth2')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
  if (init.method === 'POST' || init.method === 'PUT') {
    wrote.push({ url: decodeURIComponent(u), body: JSON.parse(init.body) });
    return new Response('{}');
  }
  if (u.includes('fields=sheets.properties')) {
    return new Response(JSON.stringify({
      sheets: [{ properties: { title: 'EventCalendarSubscriptions', sheetId: 42 } }] }));
  }
  return new Response(JSON.stringify({ values: sheet }));
};

console.log('\nonly people who have not unsubscribed are invited');
reset([['a@x.com', '2026-01-01', 'A', false, 'tok-a'],
       ['b@x.com', '2026-01-02', 'B', true,  'tok-b'],
       ['c@x.com', '2026-01-03', 'C', 'TRUE', 'tok-c'],
       ['d@x.com', '2026-01-04', 'D', '',    'tok-d']]);
const { rows } = await readSubscribers(env);
const active = activeSubscribers(rows).map((r) => r.email);
check('a ticked checkbox is excluded', !active.includes('b@x.com'), active.join());
check('the string "TRUE" counts as ticked too', !active.includes('c@x.com'), active.join());
check('an empty cell means still subscribed', active.includes('d@x.com'));
check('only the untouched rows remain', active.join() === 'a@x.com,d@x.com', active.join());

console.log('\na tab somebody made by hand, with no header row');
// The bug this replaced: row 1 held a SUBSCRIBER, was read as the header, so the list looked
// empty — every visit appended a duplicate and nobody could ever be found to unsubscribe.
sheet = [['someone@x.com', '2026-01-01', 'S', false, 'tok-s']];
wrote = [];
let out = await readSubscribers(env);
check('a first row that is not a header is recognised as one', out.needsHeader === true);
check('...and no subscriber is invented from it', out.rows.length === 0);
sheet = [];
out = await readSubscribers(env);
check('an entirely empty tab also asks for a header', out.needsHeader === true);

sheet = [['someone@x.com', '2026-01-01', 'S', false, 'tok-s']];
wrote = [];
await subscribe(env, { email: 'new@x.com' }).catch(() => {});
check('a row is inserted before the header is written, so nothing is overwritten',
  wrote.some((w) => JSON.stringify(w.body).includes('insertDimension')),
  wrote.map((w) => Object.keys(w.body).join()).join(' | '));
check('the header written is the documented one',
  wrote.some((w) => JSON.stringify(w.body.values || '').includes('Date Subscribed')));

console.log('\njoining');
reset([]);
let r = await subscribe(env, { email: ' New.Person@Example.COM ', name: 'New Person' });
check('accepted', r.ok === true);
check('appended in the documented column order',
  JSON.stringify(wrote[0].body.values[0].slice(0, 4))
    === '["new.person@example.com","' + wrote[0].body.values[0][1] + '","New Person",false]',
  JSON.stringify(wrote[0].body.values[0]));
check('the address is lower-cased', wrote[0].body.values[0][0] === 'new.person@example.com');
check('a token is generated', String(wrote[0].body.values[0][4]).length > 20);

reset([['a@x.com', '2026-01-01', 'A', false, 'tok-a']]);
r = await subscribe(env, { email: 'A@X.com' });
check('subscribing twice does not add a second row', wrote.length === 0);
check('...and answers the same way, revealing nothing', r.ok === true && r.message === 'You are on the list.');

reset([['a@x.com', '2026-01-01', 'A', true, 'tok-a']]);
r = await subscribe(env, { email: 'a@x.com' });
check('someone who left is un-ticked in place, not duplicated',
  wrote.length === 1 && wrote[0].url.includes('B2:E2') && wrote[0].body.values[0][2] === false,
  JSON.stringify(wrote[0] && wrote[0].body));

console.log('\nleaving');
reset([['a@x.com', '2026-01-01', 'A', false, 'tok-a']]);
r = await unsubscribe(env, 'tok-a');
check('the right row is ticked',
  r.ok === true && wrote[0].url.includes('!D2') && wrote[0].body.values[0][0] === true,
  JSON.stringify(wrote[0]));
reset([['a@x.com', '2026-01-01', 'A', false, 'tok-a']]);
r = await unsubscribe(env, 'not-a-real-token');
check('a wrong token changes nothing', wrote.length === 0);
check('...and the answer is identical to a used one, so tokens cannot be probed',
  r.message === 'That unsubscribe link is not valid.');
r = await unsubscribe(env, '');
check('an empty token is refused', r.ok === false);

console.log('\ntokens');
const seen = new Set(Array.from({ length: 200 }, () => newToken()));
check('200 tokens, no collisions', seen.size === 200);
check('long enough not to be guessed', [...seen][0].length >= 20, [...seen][0]);

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
