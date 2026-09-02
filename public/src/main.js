/**
 * Bootstrap. Migration: this file disappears — the framework provides routing and rendering.
 * What survives is the page contract: meta / load() / render().
 */
import { parse } from './router.js';
import * as FeedPage from './pages/FeedPage.js';
import * as ListPage from './pages/ListPage.js';
import * as EventPage from './pages/EventPage.js';
import { escape as e } from './format.js';

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
  <main><div class="wrap" id="page"></div></main>`;

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
