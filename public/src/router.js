/**
 * Hash router. Migration -> Nuxt/Next file routing.
 *   #/            feed        pages/events/index.vue
 *   #/list        list        pages/events/list.vue
 *   #/event/:id   one event   pages/events/[id].vue
 *   #/unsubscribe/:token       pages/unsubscribe/[[token]].vue
 * Filters live in the query so a member can send a colleague the exact list they are seeing.
 */
const routes = [
  { name: 'feed',  re: /^\/$/,               params: [] },
  { name: 'list',  re: /^\/list$/,           params: [] },
  { name: 'event', re: /^\/event\/([^/?]+)$/, params: ['id'] },
  { name: 'unsubscribe', re: /^\/unsubscribe(?:\/([^/?]+))?$/, params: ['token'] },
];

export function parse(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = {};
    r.params.forEach((k, i) => { if (m[i + 1]) params[k] = decodeURIComponent(m[i + 1]); });
    return { name: r.name, params, query, path };
  }
  return { name: 'feed', params: {}, query: {}, path: '/' };
}
export const go = (p) => { location.hash = p; };
