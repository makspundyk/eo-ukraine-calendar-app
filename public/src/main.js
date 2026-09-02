/**
 * Bootstrap. Migration: this file disappears — the framework provides routing and rendering.
 * What survives is the page contract: meta / load() / render().
 */
import { parse } from './router.js';
import * as FeedPage from './pages/FeedPage.js';
import * as ListPage from './pages/ListPage.js';
import * as EventPage from './pages/EventPage.js';
import { escape as e } from './format.js';
import { source } from './api/http.js';

export const PAGES = { feed: FeedPage, list: ListPage, event: EventPage };

const app = document.getElementById('app');
let current = null;

const shell = (route) => `
  <header class="top">
    <div class="wrap">
      <a class="brand" href="#/">EO&nbsp;Ukraine <small>events</small></a>
      <span class="spacer"></span>
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
    if (route.name === 'event') window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (err) {
    app.innerHTML = shell(route);
    document.getElementById('page').innerHTML = `
      <div class="empty"><b>${e(err.message || 'Something went wrong')}</b>
        <a class="register ghost sm error-back" href="#/">Back to all events</a></div>`;
  }
}

// A table row is a link; making the whole row clickable is the difference between a table
// you can use on a phone and one you cannot.
document.addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-href]');
  if (tr && !ev.target.closest('a')) location.hash = tr.dataset.href.replace(/^#/, '');
});

window.addEventListener('hashchange', () => navigate(parse()));
navigate(parse());
