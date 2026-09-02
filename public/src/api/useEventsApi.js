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
   * @param {{kind?:string, where?:'online'|'inperson', when?:'upcoming'|'past'|'all'}} filter
   *
   * Dated events in date order, then the undated ones — which are real events a member can
   * still plan around, so they are listed rather than dropped.
   *
   * `kind` and `where` are independent and combine: "a learning event I can attend in person"
   * is one question, and answering it should not need two clicks in the same row.
   *
   * It also returns the FACETS the filter bar draws itself from. The type list is whatever
   * the sheet's Type column actually contains, not a list hard-coded in the UI — add a type
   * to the sheet and the tab appears; stop running one and it goes away, rather than sitting
   * there returning nothing. Each dimension is counted with the OTHER one applied, so the
   * number on a tab is what you will actually get when you press it.
   */
  async list(filter = {}) {
    const { data, generated_at } = await fetchEvents();
    const when = filter.when ?? 'upcoming';
    const cut = generated_at;

    const inScope = (e) => {
      if (e.date_tbc || !e.start) return when !== 'past';   // undated is never "past"
      const endish = e.end || e.start;
      return when === 'all' ? true : when === 'past' ? endish < cut : endish >= cut;
    };
    const byKind = (e) => !filter.kind || e.kind === filter.kind;
    const byWhere = (e) => !filter.where
      || (filter.where === 'online' ? e.is_online : !e.is_online);

    const scoped = data.filter(inScope);
    const rows = scoped.filter(byKind).filter(byWhere);

    const dated = rows.filter((e) => !e.date_tbc && e.start);
    const shown = when === 'past'
      ? [...dated].sort((a, b) => (b.end || b.start).localeCompare(a.end || a.start))
      : dated;

    // Types in a stable order: the ones the chapter runs regularly first, in the order a
    // member thinks of them, then anything new out of the sheet, alphabetically.
    const ORDER = ['learning', 'forum', 'chapter', 'global', 'social'];
    const forTypes = scoped.filter(byWhere);
    const types = [...new Map(forTypes.map((e) => [e.kind, e.type_label])).entries()]
      .map(([kind, label]) => ({ kind, label,
        count: forTypes.filter((e) => e.kind === kind).length }))
      .sort((a, b) => {
        const ia = ORDER.indexOf(a.kind), ib = ORDER.indexOf(b.kind);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return a.label.localeCompare(b.label);
      });

    // A selected type whose count has fallen to zero must still be listed. Otherwise picking
    // "Global & regional" and then "Online" makes the Global tab disappear, and a member can
    // neither see what is selected nor click it off again.
    if (filter.kind && !types.some((t) => t.kind === filter.kind)) {
      const known = data.find((e) => e.kind === filter.kind);
      types.push({ kind: filter.kind, label: known?.type_label ?? filter.kind, count: 0 });
    }

    const forWhere = scoped.filter(byKind);
    const places = {
      all: forWhere.length,
      online: forWhere.filter((e) => e.is_online).length,
      inperson: forWhere.filter((e) => !e.is_online).length,
    };

    const datedAll = data.filter((e) => !e.date_tbc && e.start).filter(byKind).filter(byWhere);
    return {
      today: cut,
      events: shown,
      tbc: when === 'past' ? [] : rows.filter((e) => e.date_tbc || !e.start),
      facets: { types, places, total: scoped.filter(byWhere).length },
      counts: {
        upcoming: datedAll.filter((e) => (e.end || e.start) >= cut).length,
        past: datedAll.filter((e) => (e.end || e.start) < cut).length,
      },
    };
  },
});
