/**
 * Exercises lib/calendar.mjs end to end with Google stubbed out: the token endpoint and the
 * Sheets endpoint are intercepted, so the scope handling, the light/full split, the caching
 * and the request COUNT are all assertable without credentials or a network.
 *
 * The request count is the point. It is what turns "we made it lazy" from a claim into a fact.
 */
import { getCalendar } from '../lib/calendar.mjs';

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  <- ${detail}`}`);
  if (!cond) failed++;
};

const HEADER = ['Status','Type','Title','Start Date','Location','Summary','Description',
                'Highlights','Speaker Bio','Registration URL','Notes'];
const year = new Date().getUTCFullYear();
const rows = [];
for (let i = 0; i < 30; i++) {
  rows.push(['Published', 'Social', `Event ${i}`,
    `${i < 20 ? year + 1 : year - 1}-06-${String((i % 28) + 1).padStart(2, '0')}`,
    'Kyiv', `Summary ${i}`, `<p>A long description for event ${i}.</p>`.repeat(6),
    'One\nTwo', 'A biography.', 'https://example.org/r', 'internal note']);
}

let calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url).includes('oauth2') ? 'token' : 'sheets');
  if (String(url).includes('oauth2')) {
    return new Response(JSON.stringify({ access_token: 'stub', expires_in: 3600 }),
      { headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ values: [HEADER, ...rows] }),
    { headers: { 'content-type': 'application/json' } });
};

const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.iam.gserviceaccount.com',
              GOOGLE_PRIVATE_KEY: 'stub', GOOGLE_SPREADSHEET_ID: 'sheet' };
// The real key cannot be imported from a stub, so bypass signing for this harness only.
const realSubtle = crypto.subtle.importKey.bind(crypto.subtle);
crypto.subtle.importKey = async () => ({ stub: true });
crypto.subtle.sign = async () => new Uint8Array(8);

console.log('\nthe list is light, the event is full');
calls = [];
const up = await getCalendar(env, { scope: 'upcoming' });
check('upcoming list returns only upcoming events',
  up.body.count === 20, `${up.body.count}`);
check('totals let the UI label Past without fetching it',
  up.body.totals.upcoming === 20 && up.body.totals.past === 10,
  JSON.stringify(up.body.totals));

const listed = up.body.events[0];
check('list records carry what a card needs',
  ['id','title','start','summary','image_url','registration_url'].every((k) => k in listed));
check('list records do NOT carry the description',
  !('description' in listed), Object.keys(listed).join(','));
check('...nor highlights or the speaker biography',
  !('highlights' in listed) && !('speaker_bio' in listed));
check('nothing internal is in the list',
  !JSON.stringify(up.body).includes('internal note'));

const detail = await getCalendar(env, { eventId: listed.id });
check('one event comes back complete',
  detail.body.event.description.includes('A long description'));
check('...with highlights and the biography',
  detail.body.event.highlights.length === 2 && !!detail.body.event.speaker_bio);
check('...and still nothing internal',
  !JSON.stringify(detail.body).includes('internal note'));

// Like for like: the same event as the list sends it, versus as the detail endpoint sends it.
const lightOne = JSON.stringify(listed).length;
const fullOne = JSON.stringify(detail.body.event).length;
const saved = Math.round((1 - lightOne / fullOne) * 100);
// The fixture's description is short; a real one is several paragraphs, so this is the
// floor of the saving rather than a typical figure.
check(`a list record is ${saved}% smaller than the full one `
    + `(${lightOne} vs ${fullOne} bytes)`, lightOne < fullOne * 0.7,
      `${lightOne} vs ${fullOne}`);
console.log(`     20 upcoming events: ${Math.round(lightOne * 20 / 1024)} KB sent, `
          + `${Math.round(fullOne * 20 / 1024)} KB withheld until an event is opened`);

console.log('\nGoogle is called as little as possible');
calls = [];
await getCalendar(env, { scope: 'upcoming' });
check('a warm request re-reads nothing', calls.length === 0, calls.join(','));
await getCalendar(env, { scope: 'past' });
check('a different scope reuses the same cached sheet', calls.length === 0, calls.join(','));
await getCalendar(env, { eventId: listed.id });
check('opening an event reuses it too', calls.length === 0, calls.join(','));

console.log('\npast is a separate answer');
const past = await getCalendar(env, { scope: 'past' });
check('past returns only past events', past.body.count === 10, `${past.body.count}`);
check('past and upcoming do not overlap',
  !past.body.events.some((p) => up.body.events.some((u) => u.id === p.id)));
check('scope is echoed back', past.body.scope === 'past');

crypto.subtle.importKey = realSubtle;
console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
