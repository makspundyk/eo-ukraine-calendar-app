/**
 * LIST — the planning view.
 * ===========================================================================
 * Vue: pages/events/list.vue
 *
 * The feed answers "what's coming up". This answers "which of these two do I go to" — so it
 * is dense, comparable, and carries NO descriptions (DESIGN.md §2): a description is a
 * reading task, and this view exists for scanning.
 *
 * Same data, same order, same Register button. Nothing is reachable here that the feed
 * cannot reach.
 */
import { useEventsApi } from '../api/useEventsApi.js';
import { chip, register } from '../components/ui.js';
import { escape as e, dateRange, dayNum, dow, timeLabel, placeLabel, nights } from '../format.js';
import { filterBar } from './FeedPage.js';

export const meta = {
  id: 'V2', name: 'List', route: '#/list', vue: 'pages/events/list.vue',
  apis: ['GET events (list)'], blocks: ['FilterBar', 'EventTable'],
};

const api = useEventsApi();

export async function load(route) {
  return { ...(await api.list({ kind: route.query.kind, when: route.query.when })),
           q: { ...route.query, view: 'list' } };
}

const row = (ev) => `
  <tr data-href="#/event/${e(ev.id)}">
    <td class="when">
      ${ev.start ? `<b>${e(dateRange(ev.start, ev.end))}</b>
        <span>${e(dow(ev.start))}${timeLabel(ev) ? ` · ${e(timeLabel(ev))}` : ''}</span>`
      : '<b>To be confirmed</b>'}
    </td>
    <td>${chip(ev.type_label, ev.kind)}</td>
    <td>
      <div class="ttl">${e(ev.title)}</div>
      ${ev.speaker ? `<div class="sub">${e(ev.speaker)}</div>` : ''}
    </td>
    <td>${e(placeLabel(ev))}${nights(ev.start, ev.end)
      ? `<div class="sub">${e(nights(ev.start, ev.end))}</div>` : ''}</td>
    <td class="right">${register(ev.registration_url, { small: true, ghost: true })}</td>
  </tr>`;

export function render({ events, tbc, q, counts }) {
  const all = [...events, ...tbc];
  return `
  <div class="page-head">
    <h1>${q.when === 'past' ? 'Past events' : 'All events'}</h1>
    <p class="sub">${all.length} events${q.when === 'past' ? ' already held' : ' this season'}
      — compare dates, places and formats side by side.</p>
  </div>

  ${filterBar(q)}

  ${all.length ? `<div class="listwrap"><div class="tbl-scroll"><table class="tbl">
    <thead><tr>
      <th>When</th><th>Type</th><th>Event</th><th>Where</th><th class="right">&nbsp;</th>
    </tr></thead>
    <tbody>${all.map(row).join('')}</tbody>
  </table></div></div>`
  : `<div class="empty"><b>Nothing here yet</b>Try another type, or look at past events.</div>`}`;
}
