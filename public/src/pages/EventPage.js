/**
 * EVENT — one event, in full.
 * ===========================================================================
 * Vue: pages/events/[id].vue
 *
 * Shaped like a travel booking detail page, and deliberately so. A member deciding on an
 * event is deciding on a trip: an evening, or three days and a flight. The page answers in
 * that order — a photo of where, then a journey strip that reads START → END at a glance,
 * then the reasons, then the facts, with Register never more than a thumb away.
 *
 * Blocks are separate white cards rather than one column of prose. Each card is one
 * question; a member who only wants the date never has to read the paragraphs.
 */
import { useEventsApi } from '../api/useEventsApi.js';
import { chip, register, icon } from '../components/ui.js';
import { richText } from '../richtext.js';
import {
  escape as e, dayNum, dow, fullDate, dateRange, timeLabel, placeLabel,
  placeShort, nights,
} from '../format.js';

export const meta = {
  id: 'V3', name: 'Event', route: '#/event/:id', vue: 'pages/events/[id].vue',
  apis: ['GET event by id'],
  blocks: ['Hero', 'JourneyCard', 'About', 'Highlights', 'Speaker', 'Details', 'MobileBar'],
};

const api = useEventsApi();

/**
 * Two-stage load. The list already holds this event's photograph, title, dates and place, so
 * the page paints from that immediately and the description, highlights, biography and venue
 * fill in when they arrive — a member reading the headline does not wait on prose they have
 * not reached yet. Arriving on a deep link there is nothing cached, so it waits once.
 */
export async function load(route) {
  const known = await api.known(route.params.id);
  if (known && known.description === undefined) return { ev: known, partial: true };
  const ev = known?.description !== undefined ? known : await api.byId(route.params.id);
  if (!ev) throw new Error('That event is not in the calendar.');
  return { ev, partial: false };
}

/** Fetch the rest, then repaint in place. */
export async function mount({ ev, partial }, { rerender } = {}) {
  if (!partial || !rerender) return;
  const full = await api.byId(ev.id);
  if (full) rerender({ ev: full, partial: false });
}

/* --- pieces ------------------------------------------------------------- */

const card = (title, body, extra = '') => (body ? `
  <section class="pcard ${extra}">
    ${title ? `<h2>${e(title)}</h2>` : ''}
    ${body}
  </section>` : '');

/**
 * The journey strip. Two ends and the distance between them — the one graphic on the page,
 * because it is the one fact a member checks twice: when does this start, when am I free again.
 * A one-evening event has no second end, so it shows the clock instead of a second date.
 */
function journey(ev) {
  const multi = ev.end && ev.end !== ev.start;
  const span = multi ? nights(ev.start, ev.end)
    : (ev.time_start && ev.time_end ? duration(ev) : null);

  const left = ev.date_tbc
    ? { big: '—', small: 'Date to be confirmed', sub: '' }
    : { big: dayNum(ev.start), small: mon(ev.start), sub: dow(ev.start) };

  const right = multi
    ? { big: dayNum(ev.end), small: mon(ev.end), sub: dow(ev.end) }
    : ev.time_start
      ? { big: ev.time_start, small: ev.time_end ? `to ${ev.time_end}` : 'Starts', sub: ev.timezone }
      : { big: '·', small: 'Time', sub: 'to be confirmed' };

  return `
  <div class="jrn">
    <div class="jrn-end">
      <b>${e(left.big)}</b><span>${e(left.small)}</span><i>${e(left.sub)}</i>
    </div>
    <div class="jrn-line">
      <span class="jrn-dot"></span>
      <span class="jrn-rule"></span>
      <span class="jrn-mid">${icon(ev.is_online ? 'video' : 'pin')}${e(
        [span, ev.is_online ? 'Online' : placeShort(ev)].filter(Boolean).join(' · '))}</span>
      <span class="jrn-rule"></span>
      <span class="jrn-dot end"></span>
    </div>
    <div class="jrn-end right">
      <b>${e(right.big)}</b><span>${e(right.small)}</span><i>${e(right.sub)}</i>
    </div>
  </div>`;
}

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const mon = (iso) => (iso ? MON.format(new Date(iso)) : '');

function duration(ev) {
  const [h1, m1] = ev.time_start.split(':').map(Number);
  const [h2, m2] = ev.time_end.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) return null;
  return mins % 60 === 0 ? `${mins / 60} hours` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const row = (ic, label, value, sub = '') => (value ? `
  <div class="drow">
    <span class="drow-i">${icon(ic)}</span>
    <div><span class="drow-l">${e(label)}</span>
      <b>${e(value)}</b>${sub ? `<em>${e(sub)}</em>` : ''}</div>
  </div>` : '');

const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

/* --- page --------------------------------------------------------------- */

export function render({ ev, partial }) {
  const cta = register(ev.registration_url, {
    label: ev.date_tbc ? 'Register interest' : 'Register for this event',
  });

  // The sheet's Description cell may hold HTML. richText() renders it from an allowlist —
  // never bind the raw value here.
  const paras = richText(ev.description);

  return `
  <div class="ev">
    <div class="ev-hero">
      <img src="${e(ev.image_url)}" alt="" />
      <span class="ev-scrim"></span>
      <a class="ev-back" href="#/" aria-label="Back to all events">←</a>
      <div class="ev-hero-in">
        <div class="ev-chips">
          ${chip(ev.type_label, ev.kind)}
          ${ev.guests_welcome ? chip('Guests welcome', 'plain') : ''}
        </div>
        <h1>${e(ev.title)}</h1>
        ${ev.speaker_name ? `<p class="ev-with">with ${e(ev.speaker_name)}</p>` : ''}
      </div>
    </div>

    <div class="ev-col">
      <section class="pcard lift">
        ${journey(ev)}
        <div class="jrn-act">
          ${cta}
          <p class="micro">${ev.date_tbc
            ? 'We will email you as soon as the date is set.'
            : 'Opens the EO registration page. Takes about a minute.'}</p>
        </div>
      </section>

      ${paras ? card('About this event', `<div class="rich">${paras}</div>`)
        : partial ? `<section class="pcard"><h2>About this event</h2>
            <div class="skeleton"><span></span><span></span><span></span></div></section>`
        : card('About this event', `<p class="muted">No description has been added yet.</p>`)}

      ${card('What you get out of it', ev.highlights?.length ? `
        <ul class="ticks">${ev.highlights.map((h) => `
          <li><span class="tick">✓</span>${e(h)}</li>`).join('')}</ul>` : '')}

      ${ev.speaker_name ? `
      <section class="pcard">
        <h2>Who is speaking</h2>
        <div class="spk">
          <span class="spk-av">${e(initials(ev.speaker_name))}</span>
          <div>
            <b>${e(ev.speaker_name)}</b>
            ${ev.speaker_title
              ? `<span>${e(ev.speaker_title)}</span>`
              : (ev.speaker !== ev.speaker_name ? `<span>${e(ev.speaker)}</span>` : '')}
          </div>
        </div>
        ${ev.speaker_bio ? `<p class="spk-bio">${e(ev.speaker_bio)}</p>` : ''}
      </section>` : ''}

      <section class="pcard">
        <h2>The details</h2>
        <div class="drows">
          ${row('cal', 'Date', dateRange(ev.start, ev.end),
                ev.date_tbc ? ev.date_note : (nights(ev.start, ev.end) || ''))}
          ${row('clock', 'Time', timeLabel(ev) || (ev.date_tbc ? 'Announced with the date' : 'To be confirmed'))}
          ${row(ev.is_online ? 'video' : 'pin', ev.is_online ? 'Joining' : 'Where',
                ev.venue || placeLabel(ev),
                ev.is_online ? 'Link sent when you register' : '')}
          ${row('users', 'Format', ev.type_label, ev.who_for || '')}
          ${ev.guests_welcome ? row('users', 'Guests', 'You may bring a prospective member') : ''}
        </div>
        ${ev.image_credit ? `<p class="credit">Photo: ${e(ev.image_credit)}</p>` : ''}
      </section>

      <a class="backlink" href="#/">← All events</a>
    </div>

    <div class="ev-bar">
      <div>
        <b>${e(ev.date_tbc ? 'Date to be confirmed' : fullDate(ev.start))}</b>
        <span>${e(placeLabel(ev))}</span>
      </div>
      ${register(ev.registration_url, { label: ev.date_tbc ? 'Register interest' : 'Register', small: true })}
    </div>
  </div>`;
}
