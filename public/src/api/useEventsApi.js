/**
 * EVENTS — the only data source.
 * Migration -> a composable that fetches the sheet and normalises it.
 *
 * The UI never sorts or groups raw rows itself: it asks for what it needs. When this becomes
 * a live sheet, "upcoming" has to mean the same thing on every screen, and that is only true
 * if one function decides it.
 */
import { listEvents, eventDetail, knownEvent } from './http.js';

export const useEventsApi = () => ({
  /** The upcoming list. Past events are a separate scope and are never fetched with it. */
  all: () => listEvents('upcoming'),

  /** What the list already knows about an event — enough to paint the page while detail loads. */
  known: (id) => knownEvent(id),

  /**
   * GET one event by id.
   *
   * An id is `title-slug-YYYY-MM-DD`. The exact match is tried first, then — only when it
   * resolves to exactly ONE event — a bare title slug is accepted too. That covers the two
   * cases where a real person's link would otherwise die: a link shared before the event had
   * a date, and a link written by hand without one. Ambiguity is never guessed at: two events
   * sharing a title means the short form resolves to neither.
   */
  byId: (id) => eventDetail(id),

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
    const when = filter.when ?? 'upcoming';
    // Only the scope being looked at is fetched. Pressing "Past events" is what causes the
    // past to be requested, and it is then held for the rest of the visit.
    const { events: data, generated_at, totals } = await listEvents(when);
    const cut = generated_at;

    const byKind = (e) => !filter.kind || e.kind === filter.kind;
    const byWhere = (e) => !filter.where
      || (filter.where === 'online' ? e.is_online : !e.is_online);

    const scoped = data;                       // the server already applied the scope
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

    return {
      today: cut,
      events: shown,
      tbc: when === 'past' ? [] : rows.filter((e) => e.date_tbc || !e.start),
      facets: { types, places, total: scoped.filter(byWhere).length },
      // From the server, so the Past tab can be labelled without fetching the past.
      counts: totals ?? { upcoming: 0, past: 0 },
    };
  },
});
