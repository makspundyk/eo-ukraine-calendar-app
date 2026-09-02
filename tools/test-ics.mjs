/**
 * iCalendar output is read by machines that fail silently, so it is asserted rather than
 * eyeballed. The cases here are the ones that actually break a calendar client.
 */
import { calendar, vevent, googleUrl } from '../public/src/ics.js';

let failed = 0;
const check = (n, c, d = '') => { console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  <- ${d}`}`); if (!c) failed++; };
const stamp = new Date(Date.UTC(2026, 8, 2, 12, 0, 0));
const O = { origin: 'https://example.org', stamp };

console.log('\ntimed events are emitted in UTC, with the zone resolved for that date');
// 16 Sep is CEST (UTC+2), so 15:30 local is 13:30Z. A naive implementation emits 15:30Z.
const summer = vevent({ id: 'a', title: 'Talk', start: '2026-09-16', time_start: '15:30',
  time_end: '17:00', timezone: 'CET', place: 'Online', is_online: true }, O);
check('summer time resolved (15:30 CEST -> 13:30Z)', summer.includes('DTSTART:20260916T133000Z'),
  summer.match(/DTSTART:[^\r\n]*/)?.[0]);
// 20 Jan is CET (UTC+1), so 15:30 local is 14:30Z — the same code, a different offset.
const winter = vevent({ id: 'b', title: 'Talk', start: '2027-01-20', time_start: '15:30',
  timezone: 'CET' }, O);
check('winter time resolved (15:30 CET -> 14:30Z)', winter.includes('DTSTART:20270120T143000Z'),
  winter.match(/DTSTART:[^\r\n]*/)?.[0]);
check('Kyiv is a different zone again',
  vevent({ id: 'c', title: 'T', start: '2026-09-16', time_start: '15:30', timezone: 'EET' }, O)
    .includes('DTSTART:20260916T123000Z'));
check('a missing end time gets a 90-minute default', summer.includes('DTEND:20260916T150000Z'));

console.log('\nall-day events end on the EXCLUSIVE next day');
const oneDay = vevent({ id: 'd', title: 'Day', start: '2026-10-06', place: 'Kyiv' }, O);
check('a one-day event ends the following day',
  oneDay.includes('DTSTART;VALUE=DATE:20261006') && oneDay.includes('DTEND;VALUE=DATE:20261007'),
  oneDay.match(/DTEND[^\r\n]*/)?.[0]);
const span = vevent({ id: 'e', title: 'Conf', start: '2026-10-06', end: '2026-10-08' }, O);
check('a three-day event ends on the 9th, not the 8th',
  span.includes('DTEND;VALUE=DATE:20261009'), span.match(/DTEND[^\r\n]*/)?.[0]);
check('month rollover is handled',
  vevent({ id: 'f', title: 'X', start: '2026-10-31' }, O).includes('DTEND;VALUE=DATE:20261101'));

console.log('\nescaping and folding');
const nasty = vevent({ id: 'g', start: '2026-10-06',
  title: String.raw`Legal, Tax; Risks \ Abroad`,
  summary: 'A summary', registration_url: 'https://example.org/r' }, O);
check('comma, semicolon and backslash escaped',
  nasty.includes(String.raw`SUMMARY:Legal\, Tax\; Risks \\ Abroad`),
  nasty.match(/SUMMARY:[^\r\n]*/)?.[0]);
// The blank line between description parts is the newline that has to survive escaping.
check('newlines become \\n', nasty.includes(String.raw`\n\n`), nasty.match(/DESCRIPTION:[^\r\n]*/)?.[0]);
const longLine = vevent({ id: 'h', start: '2026-10-06', title: 'x'.repeat(200) }, O);
check('lines over 75 octets are folded with a leading space',
  longLine.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75),
  `longest ${Math.max(...longLine.split('\r\n').map((l) => new TextEncoder().encode(l).length))}`);
check('a folded line continues with a space', longLine.includes('\r\n x'));
const cyrillic = vevent({ id: 'i', start: '2026-10-06', title: 'Київ '.repeat(30) }, O);
check('multi-byte characters are folded by OCTET, not by character',
  cyrillic.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));

console.log('\nthe document as a whole');
const doc = calendar([
  { id: 'a', title: 'One', start: '2026-10-06', place: 'Kyiv', summary: 'S',
    registration_url: 'https://example.org/r', type_label: 'Social' },
  { id: 'z', title: 'Undated', start: null },
], O);
check('CRLF throughout', !/[^\r]\n/.test(doc));
check('begins and ends correctly',
  doc.startsWith('BEGIN:VCALENDAR\r\n') && doc.trimEnd().endsWith('END:VCALENDAR'));
check('undated events are omitted, not emitted broken',
  (doc.match(/BEGIN:VEVENT/g) || []).length === 1);
check('the entry links back to the event page', doc.includes('URL:https://example.org/#/event/a'));
check('a refresh hint is present for subscribers', doc.includes('REFRESH-INTERVAL'));
check('HTML in a summary is flattened, not passed through',
  !calendar([{ id: 'a', title: 'T', start: '2026-10-06', summary: '<p>Hi <b>there</b></p>' }], O)
    .includes('<p>'));

console.log('\nthe Google template link');
const g = googleUrl({ id: 'a', title: 'Talk & Tea', start: '2026-09-16', time_start: '15:30',
  time_end: '17:00', timezone: 'CET', place: 'Kyiv' }, O);
check('uses the render TEMPLATE action', g.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
check('carries the same UTC instants', g.includes('20260916T133000Z%2F20260916T150000Z'),
  decodeURIComponent(g.match(/dates=[^&]*/)?.[0] ?? ''));
check('the ampersand in a title is encoded', g.includes('Talk+%26+Tea'));

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
