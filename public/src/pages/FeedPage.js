/**
 * FEED — the default view.
 * ===========================================================================
 * Vue: pages/events/index.vue
 *
 * A member opens this to answer one question: "is there anything here I should be at?"
 * So it is a chronological scroll, not a grid: the rail carries the dates, the cards carry
 * the reasons, and every card can be acted on without opening it.
 *
 * Undated events are listed at the bottom rather than dropped — three of them are real
 * events a member can plan around, and hiding them would misrepresent the season.
 */
import { useEventsApi } from '../api/useEventsApi.js';
import * as EventCard from '../components/EventCard.js';
import * as Timeline from '../components/Timeline.js';
import { chip, register, action } from '../components/ui.js';
import { escape as e, monthYear, placeLabel } from '../format.js';

export const meta = {
  id: 'V1', name: 'Feed', route: '#/', vue: 'pages/events/index.vue',
  apis: ['GET events (list)'], blocks: ['TimelineRail', 'EventCard', 'FilterBar'],
};

const api = useEventsApi();

/**
 * The filter bar. Two independent rows, because they answer two different questions and a
 * member usually has both in mind at once: "a learning event" and "one I can actually get to".
 * Folding them into one row would force a choice between them.
 *
 *   row 1  what kind of event   — built from the sheet's Type column, never hard-coded
 *   row 2  online or in person  — derived from Location, "All" by default
 *
 * Every link carries the whole state, so any view a member is looking at can be sent to a
 * colleague as a URL and arrive looking the same.
 */
const href = (q, patch) => {
  const next = { kind: q.kind ?? '', where: q.where ?? '', when: q.when ?? '', ...patch };
  const search = Object.entries(next)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `#${q.view === 'list' ? '/list' : '/'}${search ? `?${search}` : ''}`;
};

const tab = (q, patch, label, on, count) => `
  <a href="${e(href(q, patch))}" class="${on ? 'on' : ''}${count === 0 ? ' none' : ''}"
     ${count === 0 ? 'aria-disabled="true"' : ''}>${e(label)}</a>`;

export const filterBar = (q, facets) => {
  const kind = q.kind ?? '';
  const where = q.where ?? '';
  return `
  <div class="filters">
    ${tab(q, { kind: '' }, 'Everything', !kind, facets.total)}
    ${facets.types.map((t) =>
      tab(q, { kind: t.kind }, t.label, kind === t.kind, t.count)).join('')}
    <span class="spacer"></span>
    ${tab(q, { when: q.when === 'past' ? '' : 'past' }, 'Past events', q.when === 'past')}
  </div>
  <div class="filters second">
    <span class="filters-label">Where</span>
    ${tab(q, { where: '' }, 'All', !where, facets.places.all)}
    ${tab(q, { where: 'inperson' }, 'In person', where === 'inperson', facets.places.inperson)}
    ${tab(q, { where: 'online' }, 'Online', where === 'online', facets.places.online)}
  </div>`;
};

export async function load(route) {
  return { ...(await api.list({ kind: route.query.kind, where: route.query.where,
                                when: route.query.when })),
           q: { ...route.query, view: 'feed' } };
}

/**
 * The feed renders a page at a time and appends the next one as the reader nears the end.
 *
 * This is about the DOM, not the network: the events are already in memory. Building two
 * hundred cards — each with a photograph, a scrim and an overlay — costs layout work and
 * decoding a member scrolling past the third card never asked for. A page is enough to fill
 * any screen, and the rest arrives before it is reached.
 */
const PAGE = 12;

/** Posts the address and reports back in place. Bound after render; there are no inline handlers. */
export function wireSubscribe() {
  const form = document.querySelector('[data-subscribe]');
  if (!form) return;
  const note = document.querySelector('[data-subscribe-note]');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, name: form.name.value }),
      });
      const body = await res.json();
      note.className = `subscribe-note ${body.ok ? 'good' : 'bad'}`;
      // The unsubscribe link is shown once, here, to the person who just gave us the address.
      // It is the only place we can put it that is certainly them.
      note.innerHTML = body.ok
        ? `${e(body.message)} You will be invited to each new event.`
          + (body.unsubscribe
             ? ` <a href="${e(body.unsubscribe)}">Leave the list</a> whenever you like.` : '')
        : e(body.message || 'That did not work. Try again in a moment.');
      if (body.ok) form.remove();
    } catch {
      note.className = 'subscribe-note bad';
      note.textContent = 'That did not work. Try again in a moment.';
    } finally { button.disabled = false; }
  });
}

/** Month headers are emitted mid-list, so a page has to know what the previous page ended on. */
function renderSlots(events, from, to) {
  let lastMonth = from > 0 ? monthYear(events[from - 1].start) : null;
  let out = '';
  for (const ev of events.slice(from, to)) {
    const m = monthYear(ev.start);
    if (m !== lastMonth) out += Timeline.monthHeader(ev.start);
    lastMonth = m;
    out += `<div class="slot">${Timeline.slotRail(ev)}<div>${EventCard.render(ev)}</div></div>`;
  }
  return out;
}

/**
 * Appends the next page when the sentinel comes into view. Called by main.js after every
 * render; `mount` is the seam a framework would replace with a lifecycle hook.
 */
/** The subscribe form on the feed, and the paging sentinel. */
export function mount({ events }) {
  wireSubscribe();
  const feed = document.querySelector('.feed');
  const sentinel = document.querySelector('.feed-more');
  if (!feed || !sentinel || events.length <= PAGE) return;

  let shown = PAGE;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((x) => x.isIntersecting)) return;
    sentinel.insertAdjacentHTML('beforebegin', renderSlots(events, shown, shown + PAGE));
    shown += PAGE;
    if (shown >= events.length) { observer.disconnect(); sentinel.remove(); }
  }, { rootMargin: '600px 0px' });      // start early enough that nobody sees a gap
  observer.observe(sentinel);
}

export function render({ events, tbc, q, counts, facets }) {
  const rows = renderSlots(events, 0, PAGE);

  return `
  <div class="page-head">
    <h1>${q.when === 'past' ? 'Past events' : 'What’s coming up'}</h1>
    <p class="sub">${q.when === 'past'
      ? `${counts.past} events already held.`
      : `${counts.upcoming} events ahead — learning sessions, forum test drives, chapter
         gatherings and the global calendar.`}</p>
  </div>

  ${filterBar(q, facets)}

  ${events.length ? `<div class="feed"><div class="rail"><span class="rail-line"></span></div>
    <div></div>${rows}${events.length > 12
      ? '<div class="feed-more" aria-hidden="true"></div>' : ''}</div>`
    : `<div class="empty"><b>Nothing here yet</b>Try another type, or look at past events.</div>`}

  ${tbc.length ? `
    <div class="tbc-head">
      <h2>Dates to be confirmed</h2>
      <p>Announced, but not yet scheduled. Worth knowing about when you plan your year.</p>
    </div>
    <div class="tbc-list">
      ${tbc.map((ev) => `
        <div class="tbc-row">
          ${chip(ev.type_label, ev.kind)}
          <a class="card-hit" href="#/event/${e(ev.id)}" aria-label="${e(ev.title)}"></a>
          <span class="t">${e(ev.title)}</span>
          <span class="factline">${e([ev.date_note, placeLabel(ev)].filter(Boolean).join(' · '))}</span>
          ${ev.registration_url ? register(ev.registration_url, { small: true, ghost: true, label: 'Register interest' }) : ''}
        </div>`).join('')}
    </div>` : ''}

  <div class="subscribe">
    <div class="subscribe-say">
      <b>Never miss an event</b>
      <span>Give us your address and you will be invited to each new event as it is announced —
        straight into your calendar, with the room and any later change. Leave whenever you
        like; every invitation carries the way out.</span>
    </div>
    <form class="subscribe-form" data-subscribe>
      <input type="text" name="name" autocomplete="name" placeholder="Your name" />
      <input type="email" name="email" required autocomplete="email"
             placeholder="your@email.com" aria-label="Your email address" />
      <button type="submit" class="register sm">Keep me posted
        <span class="arr" aria-hidden="true">→</span></button>
    </form>
    <p class="subscribe-note" data-subscribe-note>Prefer to subscribe the calendar itself?
      <a href="/api/calendar.ics">Take the feed</a> instead — no address needed.</p>
  </div>`;
}
