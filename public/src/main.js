/**
 * Bootstrap. Migration: this file disappears — the framework provides routing and rendering.
 * What survives is the page contract: meta / load() / render().
 */
import { parse } from './router.js';
import * as FeedPage from './pages/FeedPage.js';
import * as ListPage from './pages/ListPage.js';
import * as EventPage from './pages/EventPage.js';
import * as UnsubscribePage from './pages/UnsubscribePage.js';
import { escape as e } from './format.js';
import { source } from './api/http.js';
import { showingLocal, toggleMode, zoneLabel, browserZone } from './timezone.js';

export const PAGES = { feed: FeedPage, list: ListPage, event: EventPage,
                       unsubscribe: UnsubscribePage };

const app = document.getElementById('app');
let current = null;

const shell = (route) => `
  <header class="top">
    <div class="wrap">
      <a class="brand" href="#/">EO&nbsp;Ukraine <small>events</small></a>
      <span class="spacer"></span>
      ${timeSwitch()}
      <nav class="viewswitch" aria-label="View">
        <a href="#/${route.query.kind ? `?kind=${e(route.query.kind)}` : ''}"
           class="${route.name !== 'list' ? 'on' : ''}">Feed</a>
        <a href="#/list${route.query.kind ? `?kind=${e(route.query.kind)}` : ''}"
           class="${route.name === 'list' ? 'on' : ''}">List</a>
      </nav>
    </div>
  </header>
  ${demoNotice()}
  <main><div class="wrap" id="page"></div></main>`;

/**
 * When the sheet could not be read, the calendar still works — it shows the demo data. Saying
 * so is not optional: a chapter administrator looking at last season's events with no warning
 * would reasonably conclude the site is fine, and the broken sheet would go unnoticed for
 * weeks. It names the reason, because "something went wrong" is not actionable.
 */
const demoNotice = () => {
  if (source.kind !== 'mock') return '';
  // Demo mode is somebody's decision; a failed read is not. Saying the same thing for both
  // would hide a broken sheet behind a message that looks intentional.
  const chosen = source.reason === 'demo';
  return `
  <div class="banner${chosen ? ' quiet' : ''}" role="status">
    <div class="wrap">
      <b>${chosen ? 'Demo calendar.' : 'Showing demo events.'}</b>
      <span>${e(chosen
        ? 'These are sample events, not the live chapter calendar.'
        : source.message || 'The live calendar could not be read from the sheet.')}</span>
    </div>
  </div>`;
};

/**
 * The times switch.
 *
 * A member in Kyiv reading "15:30 CET" has to do the arithmetic themselves, and half of them
 * will get it wrong twice a year when the offsets diverge. So times are converted into the
 * browser's own zone by default, and this turns that off for anyone who would rather see the
 * event exactly as it was listed.
 *
 * It says which zone it is showing rather than just "local", because a laptop that is wrong
 * about where it is should be caught by the reader, not trusted silently.
 */
const timeSwitch = () => {
  const local = showingLocal();
  const city = zoneLabel();
  return `
    <button type="button" class="timeswitch ${local ? 'on' : ''}" data-times
      title="${local
        ? `Times are converted to ${e(browserZone())}. Press to see them as listed.`
        : 'Times are shown as listed by the organiser. Press to convert them to your own zone.'}"
      aria-pressed="${local}">
      ${icons.globe}<span>${local ? e(city) : 'As listed'}</span>
    </button>`;
};

const icons = {
  globe: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5`
       + ` 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm4.8 5.8h-2.2a10.6 10.6 0 0 0-.9-3.6 5.3 5.3 0 0 1 3.1`
       + ` 3.6ZM8 2.9c.5.7.9 2 1.1 3.6H6.9C7.1 4.9 7.5 3.6 8 2.9ZM3.2 8.7h2.2c.1 1.3.4 2.5.9`
       + ` 3.6a5.3 5.3 0 0 1-3.1-3.6Zm2.2-1.4H3.2a5.3 5.3 0 0 1 3.1-3.6c-.5 1.1-.8 2.3-.9 3.6Z`
       + `m2.6 5.8c-.5-.7-.9-2-1.1-3.6h2.2c-.2 1.6-.6 2.9-1.1 3.6Zm1.8-.8c.5-1.1.8-2.3.9-3.6h2.2`
       + `a5.3 5.3 0 0 1-3.1 3.6Z"/></svg>`,
};

const skeleton = `<div class="empty"><b>Loading the calendar…</b></div>`;

async function navigate(route) {
  const page = PAGES[route.name] ?? FeedPage;
  const sameShell = current?.name === route.name;
  if (!sameShell || !document.getElementById('page')) {
    app.innerHTML = shell(route);
    document.getElementById('page').innerHTML = skeleton;
  }
  current = route;
  try {
    const data = await page.load(route);
    app.innerHTML = shell(route);
    document.getElementById('page').innerHTML = page.render(data);
    // A page may want to do something after it is in the document — observe a scroll
    // sentinel, or fill itself in as slower data arrives. Migration: an onMounted hook.
    await page.mount?.(data, { rerender: (d) => {
      if (parse().path !== route.path) return;      // the reader has already moved on
      document.getElementById('page').innerHTML = page.render(d);
      page.mount?.(d);            // the repaint dropped the listeners; put them back
    } });
    if (route.name !== 'feed') window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (err) {
    app.innerHTML = shell(route);
    document.getElementById('page').innerHTML = `
      <div class="empty"><b>${e(err.message || 'Something went wrong')}</b>
        <a class="register ghost sm error-back" href="#/">Back to all events</a></div>`;
  }
}

// Flipping the switch changes every date and time on the page, so the page is simply drawn
// again rather than each surface being told about it.
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('[data-times]')) return;
  toggleMode();
  navigate(parse());
});

// A table row is a link; making the whole row clickable is the difference between a table
// you can use on a phone and one you cannot.
document.addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-href]');
  if (tr && !ev.target.closest('a')) location.hash = tr.dataset.href.replace(/^#/, '');
});

window.addEventListener('hashchange', () => navigate(parse()));
navigate(parse());
