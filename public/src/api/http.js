/**
 * THE ONE SEAM. Every screen reads through here and nowhere else.
 *
 * /api/calendar is answered by a Cloudflare Pages Function in production and by serve.mjs
 * locally, both running the same lib/. The spreadsheet id and the service account key stay on
 * the server; the browser only ever sees the events it renders.
 *
 * WHAT IS FETCHED, AND WHEN
 * -------------------------
 * Nothing is fetched before it is needed, and nothing is fetched twice:
 *
 *   the feed          the upcoming list, light records only
 *   Past events       a second request, and only when somebody presses it
 *   an opened event   that one event's full record, if the list did not already carry it
 *
 * Each result is held until the page is reloaded, so going back to the feed, switching to the
 * table, or reopening an event costs nothing. The cache is per scope and per id rather than
 * one blob, because that is the granularity the screens actually ask in.
 *
 * A note on what is NOT done here: the sheet read itself is not chunked. Rows in a spreadsheet
 * are in whatever order a human typed them, not date order, so "the next ten events" cannot be
 * a row range — every row has to be read and sorted before the first card is correct. And the
 * cost of that read is the round trip, not the rows: one column takes 422ms, all twenty-two
 * take 476ms. Splitting it into chunks would multiply the round trips and make the first card
 * appear later, not sooner.
 */
const LATENCY = Number(new URLSearchParams(location.search).get('latency') ?? 0);
const API = new URL('../../api/calendar', import.meta.url).pathname;   // -> /api/calendar
const MOCK = new URL('../../data/events.json', import.meta.url).href;
const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : null);

/** What the UI got, and why — read by main.js to show the demo-data notice. */
export const source = { kind: null, reason: null, message: null };

/** Promises, not values: two screens asking at once share one request. */
const lists = new Map();     // scope -> Promise<{events, totals}>
const details = new Map();   // id    -> Promise<event|null>
let mockAll = null;

/** The demo calendar. Loaded once, and only if something actually needs it. */
async function mock() {
  mockAll ??= fetch(MOCK).then((r) => {
    if (!r.ok) throw new Error('Could not load the calendar');
    return r.json();
  });
  return mockAll;
}

const isPast = (e, today) => (e.date_tbc || !e.start ? false : (e.end || e.start) < today);

async function mockList(scope) {
  const { data, generated_at } = await mock();
  source.kind = 'mock';
  const today = generated_at.slice(0, 10);
  const events = scope === 'all' ? data
    : data.filter((e) => (scope === 'past' ? isPast(e, today) : !isPast(e, today)));
  return {
    events,
    generated_at,
    totals: { upcoming: data.filter((e) => !isPast(e, today)).length,
              past: data.filter((e) => isPast(e, today)).length },
  };
}

/**
 * A list, by scope. `past` is never requested until a member asks for it, which is the whole
 * point of the scope being in the URL rather than filtered out of one big payload.
 */
export function listEvents(scope = 'upcoming') {
  if (!lists.has(scope)) {
    lists.set(scope, (async () => {
      await sleep(LATENCY);
      try {
        const res = await fetch(`${API}?scope=${encodeURIComponent(scope)}`,
          { headers: { accept: 'application/json' } });
        if (res.ok) {
          const body = await res.json();
          if (body?.ok && Array.isArray(body.events)) {
            source.kind = 'sheet';
            return { events: body.events, generated_at: body.fetched_at, totals: body.totals };
          }
          source.reason = body?.reason ?? 'unavailable';
          source.message = body?.message ?? null;
        }
      } catch (err) {
        source.reason ??= 'unreachable';
        source.message ??= err.message;
      }
      return mockList(scope);      // no endpoint, or the sheet could not be read
    })());
  }
  return lists.get(scope);
}

/**
 * One event, in full.
 *
 * If a list already carried a complete record — which is what the demo calendar returns — this
 * makes no request at all. From a live sheet the list is deliberately light, so opening an
 * event fetches its description, highlights, biography and venue then and only then.
 */
export function eventDetail(id) {
  if (!details.has(id)) {
    details.set(id, (async () => {
      for (const listed of lists.values()) {
        const found = (await listed).events.find((e) => e.id === id);
        if (found && found.description !== undefined) return found;   // already complete
      }
      try {
        const res = await fetch(`${API}?event=${encodeURIComponent(id)}`,
          { headers: { accept: 'application/json' } });
        if (res.ok) {
          const body = await res.json();
          if (body?.ok && body.event) return body.event;
        }
      } catch { /* falls through to the demo calendar */ }
      const { data } = await mock();
      return data.find((e) => e.id === id)
        ?? data.find((e) => e.id.startsWith(`${id}-`))
        ?? null;
    })());
  }
  return details.get(id);
}

/**
 * The light record for an event, if some list already has it. Lets the event page paint its
 * photograph, title and dates immediately and fill in the prose when it arrives, instead of
 * showing a spinner for facts it is already holding.
 */
export async function knownEvent(id) {
  for (const listed of lists.values()) {
    const found = (await listed).events.find((e) => e.id === id || e.id.startsWith(`${id}-`));
    if (found) return found;
  }
  return null;
}
