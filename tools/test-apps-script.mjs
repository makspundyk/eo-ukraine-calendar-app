import { readFile } from 'node:fs/promises';
let src = await readFile('docs/apps-script/Calendar.gs', 'utf8');
// stub the two Apps Script globals the pure helpers touch
let props = {};
const shim = `
const PropertiesService = { getScriptProperties: () => ({
  getProperty: (k) => (k in globalThis.__props ? globalThis.__props[k] : null),
  setProperty: (k, v) => { globalThis.__props[k] = String(v); },
  deleteProperty: (k) => { delete globalThis.__props[k]; },
}) };
const Utilities = { formatDate: (d, _tz, fmt) => {
  const p = (n) => String(n).padStart(2, '0');
  if (fmt === 'yyyy-MM-dd')
    return \`\${d.getUTCFullYear()}-\${p(d.getUTCMonth() + 1)}-\${p(d.getUTCDate())}\`;
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long',
    day: 'numeric', month: 'long', year: 'numeric' }).format(d);
} };
const Logger = { log() {} }; const SpreadsheetApp = { getActiveSpreadsheet: () => { throw 0; } };
`;
const mod = await import('data:text/javascript,' + encodeURIComponent(
  shim + src + '\nexport { times_, nextDay_, addMinutes_, iso_, findHeaderRow_, problems_, '
  + 'isPublished_, defaultGuests_, markPending_, pending_, savePending_, QUIET_MS, WATCHED, '
  + 'description_, durationLabel_, minutesBetween_, attendeeLines_, checked_, '
  + 'pendingInvites_, savePendingInvites_, attendeeEmails_, recordedEmails_, isPast_, '
  + 'today_ };'));

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

console.log('\nthe five-minute guard on "Invite subscribers?"');
globalThis.__props = {};
check('a Sheets checkbox reads as ticked', mod.checked_(true) && mod.checked_('TRUE'));
check('blank means not ticked', !mod.checked_('') && !mod.checked_(false) && !mod.checked_(undefined));
mod.savePendingInvites_({ 'evt-1': Date.now() });
check('a fresh tick is inside the grace period',
  Date.now() - mod.pendingInvites_()['evt-1'] < mod.QUIET_MS);
mod.savePendingInvites_({ 'evt-1': Date.now() - mod.QUIET_MS - 1 });
check('a tick older than five minutes is due',
  Date.now() - mod.pendingInvites_()['evt-1'] >= mod.QUIET_MS);
mod.savePendingInvites_({});
check('unticking removes it, so nobody is invited', Object.keys(mod.pendingInvites_()).length === 0);
globalThis.__props = {};

console.log('\nthe guest list written back into the sheet');
const A = (attendees) => mod.attendeeLines_({ attendees });
const lines = A([
  { email: 'zoe@x.com', displayName: 'Zoe Adams', responseStatus: 'accepted' },
  { email: 'anna@x.com', displayName: 'Anna Koval', responseStatus: 'declined' },
  { email: 'maxpundyk@gmail.com', responseStatus: 'needsAction' },
  { email: 'room-3@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
  { email: 'calendar@group.calendar.google.com', self: true, responseStatus: 'accepted' },
]).split('\n');
check('a name is used when Google supplies one',
  lines.some((l) => l.startsWith('Zoe Adams <zoe@x.com>')), lines.join(' | '));
check('an address with no name stands alone, not invented from the address',
  lines.some((l) => l.startsWith('maxpundyk@gmail.com')) && !lines.join().includes('Maxpundyk'));
check('the reply is shown in plain words',
  lines.join('\n').includes('· yes') && lines.join('\n').includes('· no')
  && lines.join('\n').includes('· invited'), lines.join(' | '));
check('meeting rooms are not guests', !lines.join().includes('room-3'));
check('the calendar itself is not a guest', !lines.join().includes('group.calendar.google.com'));
check('sorted, so an unchanged list produces an unchanged cell',
  lines.join('\n') === lines.slice().sort().join('\n'));
check('no attendees gives an empty cell, not a placeholder', A([]) === '' && A(undefined) === '');

console.log('\nnothing is created for an event that already happened');
const PH = ['Status','Type','Title','Start Date','End Date'];
const phead = mod.findHeaderRow_([PH]);
const prow = (o) => PH.map((h) => o[h] ?? '');
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
const past = (o) => mod.isPast_(prow(o), phead.map);

check('yesterday is past', past({ 'Start Date': day(-1) }));
check('today is NOT past — it may still be ahead of the clock',
  !past({ 'Start Date': day(0) }), mod.today_());
check('tomorrow is not past', !past({ 'Start Date': day(1) }));
check('a run that started last week but ends tomorrow is not past',
  !past({ 'Start Date': day(-7), 'End Date': day(1) }));
check('a run that ended yesterday is past',
  past({ 'Start Date': day(-7), 'End Date': day(-1) }));
check('no date at all is not past — "to be confirmed" is a future state',
  !past({ 'Start Date': '' }));
check('an unreadable date is not treated as past', !past({ 'Start Date': 'next tuesday' }));

console.log('\nthe recovery column');
const guests = [
  { email: 'Zoe@X.com', displayName: 'Zoe Adams', responseStatus: 'accepted' },
  { email: 'anna@x.com', displayName: 'Anna Koval', responseStatus: 'declined' },
  { email: 'room@resource.calendar.google.com', resource: true },
  { email: 'cal@group.calendar.google.com', self: true },
];
const flat = mod.attendeeEmails_({ attendees: guests });
check('addresses only, comma separated, ready to paste into Google Calendar',
  flat === 'anna@x.com, zoe@x.com', flat);
check('rooms and the calendar itself are not people', !flat.includes('resource') && !flat.includes('group.calendar'));
check('lower-cased and sorted, so an unchanged list writes nothing',
  flat === flat.toLowerCase() && flat === flat.split(', ').sort().join(', '));

const R = ['Attendees Emails'];
const rhead = mod.findHeaderRow_([['Title', 'Start Date', 'Status', 'Attendees Emails']]);
const back = mod.recordedEmails_(['t', '2026-01-01', 'Published',
  ' A@X.com, b@x.com \n c@x.com ; not-an-address '], rhead.map);
check('read back for a rebuild, whatever the separator',
  back.join() === 'a@x.com,b@x.com,c@x.com', back.join());
check('rubbish is dropped rather than invited', !back.join().includes('not-an-address'));
check('an empty column recovers nothing', mod.recordedEmails_(['t','','',''], rhead.map).length === 0);

console.log('\nthe invitation body');
const D = ['Status','Type','Title','Start Date','End Date','Start Time','End Time','Timezone',
           'Date Note','Location','Venue','Summary','Highlights','Who For','Speaker Name',
           'Speaker Title','Registration URL'];
const dhead = mod.findHeaderRow_([D]);
const drow = (o) => D.map((h) => o[h] ?? '');
globalThis.__props = { SITE_URL: 'https://eo.example/' };   // trailing slash on purpose
const body = mod.description_(drow({
  Title: 'Forum Test Drive — September', 'Start Date': '2026-09-16',
  'Start Time': '15:30', 'End Time': '17:00', Timezone: 'CET', Location: 'Online',
  Summary: 'Ninety minutes inside a real EO forum — the format, not a description of it.',
  Highlights: 'How a forum actually runs\nThe confidentiality rule, in practice\nWhether it is for you',
  'Who For': 'Prospective members, and anyone curious.',
  'Speaker Name': 'Anna Koval', 'Speaker Title': 'Moderator, EO Kyiv',
  'Registration URL': 'https://example.org/register',
}), dhead.map);

check('opens with the reason, not a label', body.startsWith('Ninety minutes'));
check('spells the date out in full', body.includes('Wednesday, 16 September 2026'), body.slice(0,120));
check('gives the time with the zone', body.includes('15:30 – 17:00 CET'));
check('states the duration', body.includes('(1 hour 30 minutes)'), body.match(/\(.*minutes\)/)?.[0]);
check('names the place', body.includes('WHERE\nOnline'));
check('names the speaker with their title', body.includes('Anna Koval — Moderator, EO Kyiv'));
check('bullets the highlights', (body.match(/• /g) || []).length === 3);
check('carries who it is for', body.includes('Prospective members'));
check('ends on the action', body.indexOf('REGISTER') > body.indexOf('WHO IT IS FOR'));
check('links back to the event page',
  body.includes('https://eo.example/#/event/forum-test-drive-september-2026-09-16'),
  body.match(/Full details:.*/)?.[0]);
check('tells the organiser her edits are safe', body.includes('will not overwrite'));
// A trailing slash on the property must not produce a double slash in the link.
check('the address is normalised', !body.includes('eo.example//'), body.match(/Full details:.*/)?.[0]);
globalThis.__props = {};
const defaulted = mod.description_(drow({ Title: 'X', 'Start Date': '2026-10-06' }), dhead.map);
check('with no property set it still links somewhere real',
  defaulted.includes('https://events.eoukraine.com/#/event/x-2026-10-06'),
  defaulted.match(/Full details:.*/)?.[0]);
globalThis.__props = { SITE_URL: 'https://eo.example/' };
check('carries a way out for anyone invited by subscription',
  body.includes('/#/unsubscribe'), body.slice(-200));
check('no triple blank lines', !/\n\n\n/.test(body));

const multi = mod.description_(drow({ Title: 'Retreat', 'Start Date': '2026-11-10',
  'End Date': '2026-11-15', Location: 'Malta' }), dhead.map);
check('a span reads as a range plus a day count',
  multi.includes('Tuesday, 10 November 2026  to  Sunday, 15 November 2026')
  && multi.includes('6 days'), multi.slice(0, 160));
const tbc = mod.description_(drow({ Title: 'Powerhouse', 'Date Note': 'Expected spring 2027' }),
  dhead.map);
check('an undated event says when it is expected', tbc.includes('Expected spring 2027'));

check('an evening event running past midnight has a sane duration',
  mod.minutesBetween_('22:00', '01:00') === 180);
check('durations read naturally',
  mod.durationLabel_(90) === '1 hour 30 minutes' && mod.durationLabel_(120) === '2 hours'
  && mod.durationLabel_(45) === '45 minutes');
globalThis.__props = {};

console.log('\nthe quiet period before a date change is sent');
globalThis.__props = {};
mod.markPending_('evt-a');
check('an edit queues the event rather than sending it', 'evt-a' in mod.pending_());
const t0 = mod.pending_()['evt-a'];
await new Promise((r) => setTimeout(r, 5));
mod.markPending_('evt-a');
check('a second edit RESTARTS the clock rather than adding a second entry',
  Object.keys(mod.pending_()).length === 1 && mod.pending_()['evt-a'] > t0);
check('the wait is five minutes', mod.QUIET_MS === 300000, String(mod.QUIET_MS));
const age = Date.now() - mod.pending_()['evt-a'];
check('a freshly edited row is NOT due yet', age < mod.QUIET_MS);
mod.savePending_({ 'evt-old': Date.now() - mod.QUIET_MS - 1000 });
check('a row quiet for longer than the wait IS due',
  Date.now() - mod.pending_()['evt-old'] >= mod.QUIET_MS);
check('the queue is keyed by event id, so sorting the sheet cannot misroute an update',
  Object.keys(mod.pending_()).every((k) => k.startsWith('evt')));
check('only when/what fields are watched',
  mod.WATCHED.join() === 'title,start_date,end_date,start_time,end_time,timezone',
  mod.WATCHED.join());
check('the room and the description are NOT watched',
  !mod.WATCHED.includes('location') && !mod.WATCHED.includes('venue')
  && !mod.WATCHED.includes('summary'));

console.log('\ndefault guests');
globalThis.__props = { DEFAULT_GUESTS: ' a@b.com , c@d.com ,,not-an-email ' };
const g = mod.defaultGuests_();
check('parsed, trimmed, and rubbish dropped',
  g.length === 2 && g[0].email === 'a@b.com' && g[1].email === 'c@d.com',
  JSON.stringify(g));
check('each is invited, not marked as accepted on their behalf',
  g.every((x) => x.responseStatus === 'needsAction'));
globalThis.__props = {};
check('unset means nobody is added', mod.defaultGuests_().length === 0);

console.log('\nrefusing to publish an incomplete row');
const V = ['Status','Type','Title','Start Date','End Date','Start Time','End Time','Registration URL'];
const vhead = mod.findHeaderRow_([V]);
const vrow = (o) => V.map((h) => o[h] ?? '');
const P = (o) => mod.problems_(vrow(o), vhead.map);
const complete = { Status:'Published', Type:'Social', Title:'T', 'Start Date':'2026-10-06',
                   'Registration URL':'https://e.org/r' };

check('a complete row has no problems', P(complete).length === 0, P(complete).join('; '));
// Registration opens later, or never. The site offers the calendar instead of a dead button,
// so a row without one is finished, not broken.
check('a missing Registration URL is NOT a problem',
  P({ ...complete, 'Registration URL':'' }).length === 0,
  P({ ...complete, 'Registration URL':'' }).join('; '));
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
