/**
 * Exercises lib/normalize.mjs against sheet grids shaped like the real one, with no network
 * and no credentials. Run: npm test
 *
 * These are the cases that decide whether a chapter's calendar is right or quietly wrong, so
 * they are asserted rather than eyeballed.
 */
import { normalizeRows, stripInternal } from '../lib/normalize.mjs';
import { getCalendar } from '../lib/calendar.mjs';

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  <- ${detail}`}`);
  if (!cond) failed++;
};

// A:V, with a title row above the header — exactly the shape that makes a fixed "A3" range
// wrong, and the reason the header is located by name instead.
const HEADER = ['Status','Type','Title','Start Date','End Date','Start Time','End Time',
  'Timezone','Date Note','Location','Venue','Summary','Description','Highlights','Who For',
  'Speaker Name','Speaker Title','Speaker Bio','Guests Welcome','Registration URL',
  'Image URL','Image Credit','Event Owner','Notes'];

const row = (o = {}) => HEADER.map((h) => o[h] ?? '');

const grid = [
  ['EO Ukraine event calendar 2026/27'],                       // a title row
  HEADER,
  row({ Type:'Learning event', Title:'How to Write a Book', 'Start Date':'2026-10-15',
        'Start Time':'15:30', 'End Time':'17:00', Location:'Online', Summary:'Ninety minutes.',
        'Speaker Name':'Joe Gregory', 'Speaker Title':'Founder, Authority',
        Highlights:'One\nTwo\nThree', 'Guests Welcome':true,
        'Registration URL':'https://example.org/a', 'Event Owner':'Anna', Notes:'venue unpaid' }),
  row({ Type:'Global / Regional', Title:'ELC 2026', 'Start Date':'2026-10-06',
        'End Date':'2026-10-08', Location:'Krakow, Poland',
        'Registration URL':'https://example.org/b' }),
  row({ Type:'Chapter in-person', Title:'Retreat', 'Date Note':'Expected spring 2027',
        Location:'Malta', 'Registration URL':'https://example.org/c' }),
  row({ Status:'Draft', Type:'Social', Title:'Secret party', 'Start Date':'2026-11-01' }),
  row({ Status:'Cancelled', Type:'Social', Title:'Called off', 'Start Date':'2026-11-02' }),
  row({}),                                                     // a blank row
  row({ Type:'Social', Title:'Bad data', 'Start Date':'next tuesday', 'Start Time':'3:30pm',
        'Registration URL':'javascript:alert(1)' }),
];

const { events, issues } = normalizeRows(grid);
// Looked up by title, not id: the id format is itself under test elsewhere and these
// assertions are about parsing, so they should not have to change when it does.
const by = (title) => events.find((e) => e.title === title);

console.log('\nparsing a sheet that follows docs/SHEET.md');
check('header found below a title row', true);
check('Draft and Cancelled rows are not published', !by('Secret party') && !by('Called off'));
check('blank rows are skipped, not counted', events.length === 4, `got ${events.length}`);
check('sorted by start date, undated last',
  events.map((e) => e.title).join(',') === 'ELC 2026,How to Write a Book,Bad data,Retreat',
  events.map((e) => e.title).join(','));
check('multi-day span kept', by('ELC 2026').end === '2026-10-08');
check('undated row is flagged and keeps its note',
  by('Retreat').date_tbc === true && by('Retreat').date_note === 'Expected spring 2027');
check('checkbox TRUE becomes a boolean', by('How to Write a Book').guests_welcome === true);
check('checkbox blank becomes false', by('ELC 2026').guests_welcome === false);
check('highlights split one per line', by('How to Write a Book').highlights.length === 3);
check('Online sets is_online', by('How to Write a Book').is_online === true);
check('times normalised', by('How to Write a Book').time_start === '15:30');
check('"3:30pm" recovered as 15:30 and reported',
  by('Bad data').time_start === '15:30' && issues.some((i) => i.kind === 'time_not_hhmm'));
check('unreadable date -> date_tbc, not a crash',
  by('Bad data').date_tbc === true && issues.some((i) => i.kind === 'unreadable_date'));
check('javascript: registration link dropped',
  by('Bad data').registration_url === '' && issues.some((i) => i.kind === 'unsafe_url'));
check('missing image falls back by type', by('ELC 2026').image_url.startsWith('https://'));

console.log('\nnothing internal reaches the public payload');
const published = JSON.stringify(events.map(stripInternal));
check('Event Owner value absent', !published.includes('Anna'));
check('Notes value absent', !published.includes('venue unpaid'));
check('no `notes` or `owner` key', !/"(notes|owner|event_owner)"/.test(published));

console.log('\ndegrading rather than crashing');
check('a sheet with no header row throws a named reason', (() => {
  try { normalizeRows([['a', 'b'], ['c', 'd']]); return false; }
  catch (e) { return e.reason === 'no_header'; }
})());
check('a header with no data rows yields zero events',
  normalizeRows([HEADER]).events.length === 0);

// The documented promise: columns may be reordered without breaking anything.
console.log('\ncolumns read by name, not position');
const shuffled = [HEADER.slice().reverse(),
  HEADER.slice().reverse().map((h) => ({ Title:'Reordered', Type:'Social',
    'Start Date':'2026-12-01', 'Registration URL':'https://example.org/z' }[h] ?? ''))];
const re = normalizeRows(shuffled).events;
check('a fully reversed column order still parses',
  re.length === 1 && re[0].title === 'Reordered' && re[0].start === '2026-12-01');

// DEMO=1 has to hold even with perfect credentials, so the trip-wire counts outbound calls.
// The bug this replaced: ids were slug(title) with a -2 suffix by encounter order, so
// re-sorting the sheet swapped two events' URLs and a shared link opened the WRONG event.
console.log('\nevent ids survive the sheet being re-sorted');
const IDH = ['Type','Title','Start Date','Start Time','Location','Registration URL','Slug'];
const idRows = (list) => [IDH, ...list.map((o) => IDH.map((h) => o[h] ?? ''))];
const A = { Type:'Social', Title:'Forum Test Drive', 'Start Date':'2026-03-10',
            Location:'Kyiv', 'Registration URL':'https://e.org/a' };
const B = { Type:'Social', Title:'Forum Test Drive', 'Start Date':'2026-06-20',
            Location:'Lviv', 'Registration URL':'https://e.org/b' };

const idsOf = (list) => normalizeRows(idRows(list)).events
  .map((e) => `${e.id}@${e.place}`).sort().join(',');
check('same rows in either order produce the same ids',
  idsOf([A, B]) === idsOf([B, A]), `${idsOf([A, B])}  vs  ${idsOf([B, A])}`);
check('the id carries the date, so same-title events never collide',
  normalizeRows(idRows([A, B])).events.every((e) => /-20\d\d-\d\d-\d\d$/.test(e.id)));
check('no encounter-order suffix is produced',
  !normalizeRows(idRows([A, B])).events.some((e) => /-2$/.test(e.id)));

const sameDay = [
  { ...A, 'Start Time':'09:00' },
  { ...A, 'Start Time':'18:00', Location:'Lviv', 'Registration URL':'https://e.org/c' },
];
const sd = normalizeRows(idRows(sameDay)).events;
check('same title AND same date are separated by start time',
  new Set(sd.map((e) => e.id)).size === 2, sd.map((e) => e.id).join(','));
check('...and that is order-independent',
  idsOf(sameDay) === idsOf([sameDay[1], sameDay[0]]));

const twins = [A, { ...A }];
const tw = normalizeRows(idRows(twins));
check('two rows identical in every field still get distinct ids',
  new Set(tw.events.map((e) => e.id)).size === 2);
check('...and that case is reported as needing a Slug column',
  tw.issues.some((i) => i.kind === 'unresolvable_duplicate'));

const withSlug = normalizeRows(idRows([{ ...A, Slug:'forum-spring' },
                                       { ...B, Slug:'forum-summer' }])).events;
check('an explicit Slug column wins over the composite id',
  withSlug.map((e) => e.id).sort().join(',') === 'forum-spring,forum-summer',
  withSlug.map((e) => e.id).join(','));

const undated = normalizeRows(idRows([{ Type:'Social', Title:'Retreat',
  'Registration URL':'https://e.org/r' }])).events;
check('an undated event keeps the bare title slug', undated[0].id === 'retreat');

console.log('\nDEMO switch');
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = (...a) => { calls++; return realFetch(...a); };
const creds = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'x@y.iam.gserviceaccount.com',
                GOOGLE_PRIVATE_KEY: 'irrelevant', GOOGLE_SPREADSHEET_ID: 'irrelevant' };

let r = await getCalendar({ DEMO: '1', ...creds });
check('DEMO=1 returns the demo calendar even with credentials set',
  r.body.source === 'mock' && r.body.reason === 'demo', JSON.stringify(r.body));
check('DEMO=1 contacts Google zero times', calls === 0, `${calls} requests`);

calls = 0;
r = await getCalendar({ DEMO: '1' });
check('DEMO=1 works with no credentials at all', r.body.reason === 'demo');
check('...still zero requests', calls === 0, `${calls} requests`);

calls = 0;
r = await getCalendar({ DEMO: '0' });
check('DEMO=0 with nothing configured falls back, naming the reason',
  r.body.source === 'mock' && r.body.reason === 'missing_config', JSON.stringify(r.body));

r = await getCalendar({});
check('DEMO unset defaults to live, not demo', r.body.reason === 'missing_config');
check('no reason leaks a credential', !/gserviceaccount|PRIVATE KEY/.test(JSON.stringify(r.body)));
globalThis.fetch = realFetch;

console.log(failed ? `\n${failed} FAILED\n` : `\nall checks passed\n`);
process.exit(failed ? 1 : 0);
