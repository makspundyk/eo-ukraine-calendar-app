/**
 * Showing times where the reader is.
 * ===========================================================================
 * An event is stored as a wall clock plus a short code — "15:30 CET" — because that is what a
 * person types into a spreadsheet. A member in Kyiv reading that has to do the arithmetic
 * themselves, and half of them will get it wrong twice a year when the offsets diverge.
 *
 * So the browser's own timezone is detected and the times are converted into it, with a switch
 * in the top bar to turn that off and see the event exactly as it was listed. The choice is
 * remembered per browser.
 *
 * THE DATE MOVES WITH THE TIME. An event at 23:30 CET is 00:30 the NEXT DAY in Kyiv, and a
 * 01:00 CET event is the previous day in New York. Converting the clock but leaving the date
 * alone would put people in the wrong room on the wrong day, so `localWhen` returns both and
 * every surface uses the pair.
 */
import { toUtc } from './ics.js';

const KEY = 'eo.times';
const LOCAL = 'local';
const EVENT = 'event';

/** What the browser thinks it is. Falls back to UTC in the rare environment that has none. */
export function browserZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

/**
 * Cities whose IANA name is the old spelling. Browsers still report several of these — Chrome
 * says `Europe/Kiev` — and a Ukrainian chapter's site showing "Kiev" to its own members is not
 * a detail to shrug at.
 */
const RENAMED = {
  Kiev: 'Kyiv', Kyiv: 'Kyiv',
  Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh City', Rangoon: 'Yangon',
  Katmandu: 'Kathmandu', Ulan_Bator: 'Ulaanbaatar', Asmera: 'Asmara',
  Faeroe: 'Faroe', Uzhgorod: 'Uzhhorod', Zaporozhye: 'Zaporizhzhia',
};

/** "Europe/Kyiv" -> "Kyiv". The city is what a person recognises; the region is noise. */
export const zoneLabel = (zone = browserZone()) => {
  const city = String(zone).split('/').pop();
  return (RENAMED[city] || city).replace(/_/g, ' ');
};

/**
 * Which way times are shown. Defaults to the reader's own zone — that is the answer they
 * wanted — and remembers a deliberate choice. A browser with storage switched off simply gets
 * the default every time, which is the right one.
 */
export function mode() {
  try { return localStorage.getItem(KEY) === EVENT ? EVENT : LOCAL; } catch { return LOCAL; }
}

export function setMode(next) {
  try { localStorage.setItem(KEY, next === EVENT ? EVENT : LOCAL); } catch { /* private mode */ }
}

export const toggleMode = () => { setMode(mode() === LOCAL ? EVENT : LOCAL); return mode(); };
export const showingLocal = () => mode() === LOCAL;

const hhmm = (zone) => new Intl.DateTimeFormat('en-GB',
  { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false });
const ymd = (zone) => new Intl.DateTimeFormat('en-CA',
  { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * An event's start and end, as the reader's own clock shows them.
 *
 * Returns `null` when there is nothing to convert — an all-day event has no time, and an event
 * already in the reader's zone would only be rewritten to itself.
 *
 * @returns {{start:string, end:string|null, date:string, endDate:string|null,
 *            zone:string, label:string, shifted:boolean}|null}
 */
export function localWhen(event, zone = browserZone()) {
  if (!event?.start || !event.time_start) return null;

  const startAt = toUtc(event.start, event.time_start, event.timezone);
  const endAt = event.time_end
    ? toUtc(event.end || event.start, event.time_end, event.timezone)
    : null;

  const date = ymd(zone).format(startAt);
  const start = hhmm(zone).format(startAt);
  const end = endAt ? hhmm(zone).format(endAt) : null;
  const endDate = endAt ? ymd(zone).format(endAt) : null;

  // Nothing to say if the clock and the calendar both agree with what the sheet already holds.
  if (start === event.time_start && date === event.start
      && (!end || end === event.time_end)) return null;

  return { start, end, date, endDate, zone, label: zoneLabel(zone),
           shifted: date !== event.start };
}

/** The times to display, honouring the switch. Falls back to the event's own on `event` mode. */
export function displayWhen(event) {
  if (!showingLocal()) return null;
  return localWhen(event);
}
