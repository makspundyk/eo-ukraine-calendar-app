/**
 * EVENTS — the only data source.
 * Migration -> a composable that fetches the sheet and normalises it.
 *
 * The UI never sorts or groups raw rows itself: it asks for what it needs. When this becomes
 * a live sheet, "upcoming" has to mean the same thing on every screen, and that is only true
 * if one function decides it.
 */
import { fetchEvents } from './http.js';

export const useEventsApi = () => ({
  /** Everything, plus the season label and the data issues the normaliser found. */
  all: () => fetchEvents(),

  /**
   * GET one event by id.
   *
   * An id is `title-slug-YYYY-MM-DD`. The exact match is tried first, then — only when it
   * resolves to exactly ONE event — a bare title slug is accepted too. That covers the two
   * cases where a real person's link would otherwise die: a link shared before the event had
   * a date, and a link written by hand without one. Ambiguity is never guessed at: two events
   * sharing a title means the short form resolves to neither.
   */
  async byId(id) {
    const { data } = await fetchEvents();
    const exact = data.find((e) => e.id === id);
    if (exact) return exact;
    const partial = data.filter((e) => e.id.startsWith(`${id}-`));
    return partial.length === 1 ? partial[0] : null;
  },

  /**
   * @param {{kind?:string, when?:'upcoming'|'past'|'all'}} filter
   * Dated events in date order, then the undated ones — which are real events a member can
   * still plan around, so they are listed rather than dropped.
   */
  async list(filter = {}) {
    const { data, generated_at } = await fetchEvents();
    let rows = data;
    if (filter.kind) rows = rows.filter((e) => e.kind === filter.kind);
    const when = filter.when ?? 'upcoming';
    const dated = rows.filter((e) => !e.date_tbc && e.start);
    const tbc = rows.filter((e) => e.date_tbc || !e.start);
    const cut = generated_at;
    const shown = when === 'all' ? dated
      : when === 'past' ? dated.filter((e) => (e.end || e.start) < cut).reverse()
      : dated.filter((e) => (e.end || e.start) >= cut);
    return { today: cut, events: shown, tbc: when === 'past' ? [] : tbc,
             counts: {
               upcoming: dated.filter((e) => (e.end || e.start) >= cut).length,
               past: dated.filter((e) => (e.end || e.start) < cut).length,
             } };
  },
});
