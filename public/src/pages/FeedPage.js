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
import { chip, register } from '../components/ui.js';
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

export function render({ events, tbc, q, counts, facets }) {
  let lastMonth = null;
  const rows = events.map((ev) => {
    const m = monthYear(ev.start);
    const head = m !== lastMonth ? Timeline.monthHeader(ev.start) : '';
    lastMonth = m;
    return `${head}<div class="slot">${Timeline.slotRail(ev)}<div>${EventCard.render(ev)}</div></div>`;
  }).join('');

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
    <div></div>${rows}</div>`
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
          ${register(ev.registration_url, { small: true, ghost: true, label: 'Register interest' })}
        </div>`).join('')}
    </div>` : ''}`;
}
