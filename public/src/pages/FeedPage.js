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

export const KINDS = [
  ['', 'Everything'], ['learning', 'Learning'], ['forum', 'Forum test drive'],
  ['chapter', 'Chapter'], ['global', 'Global & regional'], ['social', 'Social'],
];

export const filterBar = (q) => `
  <div class="filters">
    ${KINDS.map(([k, label]) => `
      <a href="#${e(q.view === 'list' ? '/list' : '/')}${
        k || q.when === 'past' ? '?' : ''}${
        [k ? `kind=${k}` : '', q.when === 'past' ? 'when=past' : ''].filter(Boolean).join('&')}"
         class="${(q.kind ?? '') === k ? 'on' : ''}">${e(label)}</a>`).join('')}
    <span class="spacer"></span>
    <a href="#${e(q.view === 'list' ? '/list' : '/')}${
      q.when === 'past' ? (q.kind ? `?kind=${e(q.kind)}` : '')
                        : `?${q.kind ? `kind=${e(q.kind)}&` : ''}when=past`}"
       class="${q.when === 'past' ? 'on' : ''}">Past events</a>
  </div>`;

export async function load(route) {
  return { ...(await api.list({ kind: route.query.kind, when: route.query.when })),
           q: { ...route.query, view: 'feed' } };
}

export function render({ events, tbc, q, counts }) {
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

  ${filterBar(q)}

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
