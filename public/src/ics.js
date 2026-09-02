/**
 * iCalendar (RFC 5545) generation.
 * ===========================================================================
 * Deliberately in `public/` even though the server imports it too. It is a pure formatter
 * with no credential in it, the browser needs it for the per-event download, and one
 * implementation is worth more than the tidiness of never importing across the boundary.
 * `lib/ics-feed.mjs` imports it for the subscription feed.
 *
 * The fiddly parts of the format, all of which break silently in one calendar client or
 * another if you get them wrong:
 *
 *   CRLF        lines end \r\n, not \n
 *   folding     lines longer than 75 octets continue on the next line with a leading space
 *   escaping    backslash, semicolon and comma are escaped; newlines become \n
 *   all-day     DTEND is EXCLUSIVE — a one-day event ends the following day
 *   times       emitted in UTC, so no VTIMEZONE component is needed and no client has to
 *               guess what "CET" meant on that particular date
 */

/** The short codes the sheet uses, to the IANA zones a calendar actually understands. */
const ZONES = {
  CET: 'Europe/Berlin', CEST: 'Europe/Berlin',
  EET: 'Europe/Kyiv', EEST: 'Europe/Kyiv',
  GMT: 'Europe/London', BST: 'Europe/London', UTC: 'UTC',
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  JST: 'Asia/Tokyo', IST: 'Asia/Kolkata',
};

/**
 * A wall-clock time in a named zone, as a UTC instant.
 *
 * Done by asking Intl what that instant looks like in the zone and correcting the difference,
 * which handles daylight saving without a table. Twice, because the first correction can
 * itself cross a DST boundary.
 */
export function toUtc(dateIso, timeHm, zoneCode) {
  const zone = ZONES[String(zoneCode || '').toUpperCase()] || 'UTC';
  const [y, m, d] = dateIso.split('-').map(Number);
  const [hh, mm] = (timeHm || '00:00').split(':').map(Number);

  // `want` is the wall clock we are aiming for, read as if it were UTC. It is the fixed
  // target for every iteration — comparing against the moving guess instead subtracts the
  // offset twice, which lands an afternoon talk two hours early and looks plausible.
  const want = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  let utc = want;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(utc))
      .filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute);
    const drift = seen - want;
    if (drift === 0) break;
    utc -= drift;
  }
  return new Date(utc);
}

const pad = (n) => String(n).padStart(2, '0');
const stampUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateOnly = (iso) => iso.replace(/-/g, '');

/** The day after — an all-day DTEND is exclusive, so a one-day event ends tomorrow. */
function dayAfter(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}

const esc = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const stripTags = (s) => String(s ?? '')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

/** RFC 5545 §3.1: fold at 75 octets, continuation lines begin with a space. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < line.length) {
    let end = start;
    let size = 0;
    const limit = out.length === 0 ? 75 : 74;      // the leading space counts
    while (end < line.length) {
      const cp = line.codePointAt(end);
      const w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (size + w > limit) break;
      size += w;
      end += cp > 0xffff ? 2 : 1;                  // do not split a surrogate pair
    }
    out.push((out.length ? ' ' : '') + line.slice(start, end));
    start = end;
  }
  return out.join('\r\n');
}

/**
 * One VEVENT.
 *
 * `origin` is where the event page lives, so a calendar entry can lead back to the details —
 * the thing most "add to calendar" buttons forget, leaving an entry nobody can act on.
 */
export function vevent(ev, { origin = '', stamp = new Date() } = {}) {
  if (!ev.start) return '';                        // an undated event is not a calendar entry

  const url = origin ? `${origin}/#/event/${ev.id}` : '';
  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.id}@eo-ukraine-calendar`,
    `DTSTAMP:${stampUtc(stamp)}`,
  ];

  if (ev.time_start) {
    const startAt = toUtc(ev.start, ev.time_start, ev.timezone);
    const endAt = ev.time_end
      ? toUtc(ev.end || ev.start, ev.time_end, ev.timezone)
      : new Date(startAt.getTime() + 90 * 60_000);   // a sensible default, not a guess at zero
    lines.push(`DTSTART:${stampUtc(startAt)}`, `DTEND:${stampUtc(endAt)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`,
               `DTEND;VALUE=DATE:${dayAfter(ev.end || ev.start)}`);
  }

  const description = [
    stripTags(ev.summary),
    ev.speaker_name ? `Speaker: ${ev.speaker_name}${
      ev.speaker_title ? `, ${ev.speaker_title}` : ''}` : '',
    ev.registration_url ? `Register: ${ev.registration_url}` : '',
    url ? `Details: ${url}` : '',
  ].filter(Boolean).join('\n\n');

  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  const where = ev.is_online ? (ev.venue || 'Online') : (ev.venue || ev.place);
  if (where) lines.push(`LOCATION:${esc(where)}`);
  if (url) lines.push(`URL:${url}`);
  if (ev.type_label) lines.push(`CATEGORIES:${esc(ev.type_label)}`);
  lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');

  return lines.map(fold).join('\r\n');
}

export function calendar(events, { origin = '', name = 'EO Ukraine events', stamp } = {}) {
  const body = events.map((e) => vevent(e, { origin, stamp })).filter(Boolean);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EO Ukraine//Community calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(name)}`),
    'X-PUBLISHED-TTL:PT1H',                        // a hint to re-fetch hourly
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...body,
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}

/**
 * Google's "create an event" URL. This makes a COPY on the member's own calendar — it is not
 * the organiser's event, and later edits by the organiser will not reach it. That is a
 * property of every "add to calendar" button of this kind, not a shortcoming of this one; the
 * subscription feed is what stays in step.
 */
export function googleUrl(ev, { origin = '' } = {}) {
  if (!ev.start) return '';
  const dates = ev.time_start
    ? `${stampUtc(toUtc(ev.start, ev.time_start, ev.timezone))}/${stampUtc(
        ev.time_end ? toUtc(ev.end || ev.start, ev.time_end, ev.timezone)
                    : new Date(toUtc(ev.start, ev.time_start, ev.timezone).getTime() + 90 * 60_000))}`
    : `${dateOnly(ev.start)}/${dayAfter(ev.end || ev.start)}`;

  const details = [
    stripTags(ev.summary),
    ev.registration_url ? `Register: ${ev.registration_url}` : '',
    origin ? `Details: ${origin}/#/event/${ev.id}` : '',
  ].filter(Boolean).join('\n\n');

  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates,
    details,
    location: ev.is_online ? (ev.venue || 'Online') : (ev.venue || ev.place || ''),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
