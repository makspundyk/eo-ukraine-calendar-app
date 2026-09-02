/**
 * Timeline — the rail down the side of the feed.
 * Vue: components/eo/TimelineRail.vue
 *
 * It is not decoration. In a scrolling feed the date has to stay legible without being
 * repeated inside every card, and a member scanning for "when" reads down a single column
 * far faster than they read across cards. So the rail carries the date at a size the card
 * could not give it, a dot per event coloured by type, and a sticky month header — which is
 * what tells you where you are once you have scrolled past the top.
 */
import { escape as e, dayNum, dow, monthYear } from '../format.js';

export const monthHeader = (iso) => `
  <div class="month">
    <div class="month-label">${e(monthYear(iso))}</div>
    <div class="month-rule"></div>
  </div>`;

export const slotRail = (ev) => `
  <div class="slot-rail">
    <span class="dot ${e(ev.kind)}"></span>
    <span class="when"><b>${e(dayNum(ev.start))}</b><i>${e(dow(ev.start))}</i></span>
  </div>`;
