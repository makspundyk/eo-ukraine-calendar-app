/**
 * Not a module — deliberately. If the page is opened straight off the disk, ES modules and
 * fetch are both blocked by the browser, so main.js never runs and the screen stays blank.
 * A classic script still runs, and says why.
 *
 * It lives in its own file rather than inline in index.html so the Content-Security-Policy can
 * keep `script-src 'self'` with no inline exception — the one directive that actually stops an
 * injected <script> from running.
 */
if (location.protocol === 'file:') {
  document.getElementById('app').className = 'served-warning';
  document.getElementById('app').innerHTML =
    '<h1>This page has to be served</h1>' +
    '<p>Browsers block modules and fetch over <code>file://</code>. ' +
    'Run <code>npm run dev</code> in the project root and open ' +
    '<a href="http://localhost:4100">localhost:4100</a>.</p>';
}
