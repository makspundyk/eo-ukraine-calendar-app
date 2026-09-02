/**
 * Formatting. Migration: these are product decisions, not cosmetics — port them all.
 */
import { displayWhen, zoneLabel } from './timezone.js';

/**
 * A date in this project is a plain calendar date — "2026-09-16", no time, no zone. `new Date`
 * reads that as UTC midnight, so formatting it WITHOUT a timeZone renders it in the browser's
 * zone: 8pm the previous day in New York, and every date on the site is a day early for half
 * the Americas. Every date-only formatter is therefore pinned to UTC.
 */
const D = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o });
const fmtDay   = D({ day: 'numeric' });
const fmtDow   = D({ weekday: 'short' });
const fmtMonY  = D({ month: 'long', year: 'numeric' });
const fmtFull  = D({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = D({ day: 'numeric', month: 'short' });

export const dayNum = (iso) => (iso ? fmtDay.format(new Date(iso)) : '');
export const dow    = (iso) => (iso ? fmtDow.format(new Date(iso)) : '');
export const monthYear = (iso) => (iso ? fmtMonY.format(new Date(iso)) : 'Date to be confirmed');
export const fullDate = (iso) => (iso ? fmtFull.format(new Date(iso)) : 'To be confirmed');

/** A range reads as one thing: "6–8 October 2026", not two dates the reader has to subtract. */
export const dateRange = (a, b) => {
  if (!a) return 'Date to be confirmed';
  const s = new Date(a), e = new Date(b || a);
  if (s.getTime() === e.getTime()) return fmtFull.format(s);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth
    ? `${fmtDay.format(s)}–${fmtDay.format(e)} ${fmtMonY.format(e)}`
    : `${fmtShort.format(s)} – ${fmtShort.format(e)} ${e.getFullYear()}`;
};

/** Days are what a member counts in — "3 days" tells them to book a hotel. */
export const nights = (a, b) => {
  if (!a || !b) return null;
  const d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  return d > 1 ? `${d} days` : null;
};

/**
 * The time as the reader should read it — theirs by default, the event's own when they have
 * asked for that. The zone is always named, because a time without one is a guess.
 */
export const timeLabel = (e) => {
  const local = displayWhen(e);
  if (local) {
    return local.end
      ? `${local.start}–${local.end} ${local.label} time`
      : `${local.start} ${local.label} time`;
  }
  if (!e.time_start) return null;
  return e.time_end
    ? `${e.time_start}–${e.time_end} ${e.timezone}`
    : `${e.time_start} ${e.timezone}`;
};

/**
 * The day an event falls on FOR THE READER. A 23:30 event in one zone is the next morning in
 * another, and showing the converted clock against the original date is worse than not
 * converting at all.
 */
export const displayDate = (e) => displayWhen(e)?.date || e.start;
export const displayEndDate = (e) => displayWhen(e)?.endDate || e.end || e.start;

/** Where beats what: a member filters on travel before anything else. */
export const placeLabel = (e) => (e.is_online ? 'Online' : e.place || 'Venue to be confirmed');

export const isPast = (e, today) => !!e.end && e.end < today;

/**
 * Has this already happened? Uses the reader's own date, which is what they are comparing
 * against when they look at the page.
 *
 * An event with no date has not happened — "dates to be confirmed" is a future state.
 */
export const hasPassed = (ev) => {
  if (!ev.start) return false;
  return (ev.end || ev.start) < new Date().toISOString().slice(0, 10);
};

export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The sheet has no images. Rather than a random gradient per event — which is noise wearing
 * the clothes of information — the cover is keyed to the event TYPE, so colour means the
 * same thing on the cover as it does on the chip. The per-event hash only shifts the shade
 * within that family, so two learning events are distinguishable but obviously related.
 */
const TYPE_HUE = { learning: 208, forum: 268, chapter: 24, global: 163, social: 340, other: 220 };

export const coverStyle = (e, { rich = false } = {}) => {
  const base = TYPE_HUE[e.kind] ?? 220;
  const drift = ((e.cover?.hue ?? 0) % 22) - 11;      // ±11°, same family
  const h = (base + drift + 360) % 360;
  const sat = rich ? 34 : 26;                          // quiet on a card, deeper on the hero
  return `background:linear-gradient(150deg,` +
         `hsl(${h} ${sat}% ${rich ? 40 : 52}%),hsl(${(h + 16) % 360} ${sat + 6}% ${rich ? 26 : 36}%));`;
};


/** Short place for a card: "Kraków", not "Kraków, Poland". Cities are recognisable alone. */
export const placeShort = (e) =>
  e.is_online ? 'Online' : (e.place || '').split(',')[0].trim() || 'Venue TBC';

/** One compact line of when: "6–8 Oct · 3 days" or "16 Sep · 15:30 CET". */
export const whenShort = (e) => {
  if (!e.start) return 'Date to be confirmed';
  const local = displayWhen(e);
  const startIso = local?.date || e.start;
  const endIso = local?.endDate || e.end || e.start;
  const f = D({ day: 'numeric', month: 'short' });
  const s = new Date(startIso), en = new Date(endIso);
  const range = s.getTime() === en.getTime()
    ? f.format(s)
    : `${D({ day: 'numeric' }).format(s)}–${f.format(en)}`;
  const extra = local
    ? `${local.start} ${local.label} time`
    : (e.time_start ? `${e.time_start} ${e.timezone}` : nights(e.start, e.end));
  return extra ? `${range} · ${extra}` : range;
};
