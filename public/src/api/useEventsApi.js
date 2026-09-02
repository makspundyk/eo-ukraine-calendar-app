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

  /** GET one event by id. */
  async byId(id) {
    const { data } = await fetchEvents();
    return data.find((e) => e.id === id) ?? null;
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
