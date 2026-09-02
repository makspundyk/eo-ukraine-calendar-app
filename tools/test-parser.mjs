/**
 * Exercises lib/normalize.mjs against sheet grids shaped like the real one, with no network
 * and no credentials. Run: npm test
 *
 * These are the cases that decide whether a chapter's calendar is right or quietly wrong, so
 * they are asserted rather than eyeballed.
 */
import { normalizeRows, stripInternal } from '../lib/normalize.mjs';

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
const by = (id) => events.find((e) => e.id === id);

console.log('\nparsing a sheet that follows docs/SHEET.md');
check('header found below a title row', true);
check('Draft and Cancelled rows are not published', !by('secret-party') && !by('called-off'));
check('blank rows are skipped, not counted', events.length === 4, `got ${events.length}`);
check('sorted by start date, undated last',
  events.map((e) => e.id).join(',') === 'elc-2026,how-to-write-a-book,bad-data,retreat',
  events.map((e) => e.id).join(','));
check('multi-day span kept', by('elc-2026').end === '2026-10-08');
check('undated row is flagged and keeps its note',
  by('retreat').date_tbc === true && by('retreat').date_note === 'Expected spring 2027');
check('checkbox TRUE becomes a boolean', by('how-to-write-a-book').guests_welcome === true);
check('checkbox blank becomes false', by('elc-2026').guests_welcome === false);
check('highlights split one per line', by('how-to-write-a-book').highlights.length === 3);
check('Online sets is_online', by('how-to-write-a-book').is_online === true);
check('times normalised', by('how-to-write-a-book').time_start === '15:30');
check('"3:30pm" recovered as 15:30 and reported',
  by('bad-data').time_start === '15:30' && issues.some((i) => i.kind === 'time_not_hhmm'));
check('unreadable date -> date_tbc, not a crash',
  by('bad-data').date_tbc === true && issues.some((i) => i.kind === 'unreadable_date'));
check('javascript: registration link dropped',
  by('bad-data').registration_url === '' && issues.some((i) => i.kind === 'unsafe_url'));
check('missing image falls back by type', by('elc-2026').image_url.startsWith('https://'));

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

console.log(failed ? `\n${failed} FAILED\n` : `\nall checks passed\n`);
process.exit(failed ? 1 : 0);
