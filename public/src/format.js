/**
 * Formatting. Migration: these are product decisions, not cosmetics — port them all.
 */
const D = (o) => new Intl.DateTimeFormat('en-GB', o);
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

export const timeLabel = (e) => {
  if (!e.time_start) return null;
  return e.time_end
    ? `${e.time_start}–${e.time_end} ${e.timezone}`
    : `${e.time_start} ${e.timezone}`;
};

/** Where beats what: a member filters on travel before anything else. */
export const placeLabel = (e) => (e.is_online ? 'Online' : e.place || 'Venue to be confirmed');

export const isPast = (e, today) => !!e.end && e.end < today;

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
  const f = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  const s = new Date(e.start), en = new Date(e.end || e.start);
  const range = s.getTime() === en.getTime()
    ? f.format(s)
    : `${new Intl.DateTimeFormat('en-GB', { day: 'numeric' }).format(s)}–${f.format(en)}`;
  const extra = e.time_start ? `${e.time_start} ${e.timezone}` : nights(e.start, e.end);
  return extra ? `${range} · ${extra}` : range;
};
