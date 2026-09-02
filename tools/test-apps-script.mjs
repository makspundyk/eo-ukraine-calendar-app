import { readFile } from 'node:fs/promises';
let src = await readFile('docs/apps-script/Calendar.gs', 'utf8');
// stub the two Apps Script globals the pure helpers touch
const shim = `
const Utilities = { formatDate: (d, _tz, fmt) => {
  const p = (n) => String(n).padStart(2, '0');
  return fmt === 'yyyy-MM-dd'
    ? \`\${d.getUTCFullYear()}-\${p(d.getUTCMonth() + 1)}-\${p(d.getUTCDate())}\` : '';
} };
const Logger = { log() {} }; const SpreadsheetApp = { getActiveSpreadsheet: () => { throw 0; } };
`;
const mod = await import('data:text/javascript,' + encodeURIComponent(
  shim + src + '\nexport { times_, nextDay_, addMinutes_, iso_, findHeaderRow_, problems_, '
  + 'isPublished_ };'));

let failed = 0;
const check = (n, c, d='') => { console.log(`  ${c?'✓':'✗'} ${n}${c?'':`  <- ${d}`}`); if(!c) failed++; };
const H = ['Status','Title','Start Date','End Date','Start Time','End Time','Timezone','Venue'];
const row = (o) => H.map((h) => o[h] ?? '');
const head = mod.findHeaderRow_([H]);
const T = (o) => mod.times_(row(o), head.map);

console.log('\nApps Script date handling');
check('an all-day event ends on the exclusive next day',
  JSON.stringify(T({ 'Start Date':'2026-10-06' })) === '{"start":{"date":"2026-10-06"},"end":{"date":"2026-10-07"}}',
  JSON.stringify(T({ 'Start Date':'2026-10-06' })));
check('a multi-day span ends the day after the end date',
  T({ 'Start Date':'2026-10-06', 'End Date':'2026-10-08' }).end.date === '2026-10-09');
check('month rollover', mod.nextDay_('2026-10-31') === '2026-11-01');
check('year rollover', mod.nextDay_('2026-12-31') === '2027-01-01');

console.log('\nApps Script time handling');
const timed = T({ 'Start Date':'2026-09-16', 'Start Time':'15:30', 'End Time':'17:00', Timezone:'CET' });
check('a timed event carries a real IANA zone, not "CET"',
  timed.start.timeZone === 'Europe/Berlin', timed.start.timeZone);
check('dateTime is local wall clock, zone given separately',
  timed.start.dateTime === '2026-09-16T15:30:00', timed.start.dateTime);
check('a missing end time becomes 90 minutes',
  T({ 'Start Date':'2026-09-16', 'Start Time':'15:30', Timezone:'CET' }).end.dateTime === '2026-09-16T17:00:00');
check('EET maps to Kyiv',
  T({ 'Start Date':'2026-09-16', 'Start Time':'09:00', Timezone:'EET' }).start.timeZone === 'Europe/Kyiv');
check('an evening event ending past midnight rolls to the next day',
  T({ 'Start Date':'2026-09-16', 'Start Time':'22:00', 'End Time':'01:00' }).end.dateTime.startsWith('2026-09-17'),
  T({ 'Start Date':'2026-09-16', 'Start Time':'22:00', 'End Time':'01:00' }).end.dateTime);
check('single-digit hours are padded', mod.addMinutes_('09:00', 90) === '10:30');

console.log('\nrefusing to publish an incomplete row');
const V = ['Status','Type','Title','Start Date','End Date','Start Time','End Time','Registration URL'];
const vhead = mod.findHeaderRow_([V]);
const vrow = (o) => V.map((h) => o[h] ?? '');
const P = (o) => mod.problems_(vrow(o), vhead.map);
const complete = { Status:'Published', Type:'Social', Title:'T', 'Start Date':'2026-10-06',
                   'Registration URL':'https://e.org/r' };

check('a complete row has no problems', P(complete).length === 0, P(complete).join('; '));
check('a missing Registration URL is caught',
  P({ ...complete, 'Registration URL':'' }).join().includes('Registration URL'));
check('a missing Type is caught', P({ ...complete, Type:'' }).join().includes('Type'));
check('a missing Title is caught', P({ ...complete, Title:'' }).join().includes('Title'));
// The one that must NOT be an error: "dates to be confirmed" is a real, published state.
check('NO Start Date is not a problem — it is a legitimate published state',
  P({ ...complete, 'Start Date':'' }).length === 0,
  P({ ...complete, 'Start Date':'' }).join('; '));
check('a badly formatted date IS a problem',
  P({ ...complete, 'Start Date':'6 Oct 2026' }).join().includes('YYYY-MM-DD'));
check('an end date before the start is caught',
  P({ ...complete, 'End Date':'2026-10-01' }).join().includes('before'));
check('a badly formatted time is caught',
  P({ ...complete, 'Start Time':'3:30pm' }).join().includes('HH:MM'));
check('an end time with no start time is caught',
  P({ ...complete, 'End Time':'17:00' }).join().includes('End Time is set'));
check('a Draft row is not published', !mod.isPublished_(vrow({ ...complete, Status:'Draft' }), vhead.map));
check('a blank status is not published', !mod.isPublished_(vrow({ ...complete, Status:'' }), vhead.map));
check('with no Status column at all, everything publishes',
  mod.isPublished_(['x'], {}) === true);

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
