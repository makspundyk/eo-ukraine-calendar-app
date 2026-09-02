/**
 * Sheet rows -> the shape every screen reads.
 * ===========================================================================
 * The runtime counterpart of `data/normalize.py`. That script still exists, but it has a
 * different job: it turns the LEGACY sheet snapshot in `data/source.tsv` into the demo data,
 * and it carries the repairs that legacy file needs. This module reads a sheet that follows
 * `docs/SHEET.md` and is the one used in production.
 *
 * Two rules from that document are implemented here and matter more than anything else:
 *
 *   1. Read BY HEADER NAME, never by column position. The header row is found by looking for
 *      known names rather than assumed to be row 1, so a title row above it, or a column
 *      inserted in the middle, changes nothing.
 *
 *   2. An empty cell means "not known", not "no". Nothing here invents a value; a missing
 *      field becomes empty and the UI hides that part of the card.
 *
 * It also enforces something the document only implies: `Notes` and `Event Owner` are internal
 * columns, and this module is the boundary they must not cross. Whatever it returns is served
 * to the public over /api/calendar, so anyone can read it in devtools.
 */

/** Canonical field <- every header spelling that should land in it, lower-cased. */
const HEADERS = {
  status:           ['status'],
  type:             ['type', 'types'],
  title:            ['title', 'name', 'event', 'event name'],
  start_date:       ['start date', 'start', 'date'],
  end_date:         ['end date', 'end'],
  start_time:       ['start time', 'time'],
  end_time:         ['end time'],
  timezone:         ['timezone', 'time zone', 'tz'],
  date_note:        ['date note'],
  location:         ['location', 'place', 'city'],
  venue:            ['venue'],
  summary:          ['summary'],
  description:      ['description', 'details'],
  highlights:       ['highlights'],
  who_for:          ['who for', 'who is it for', 'audience'],
  speaker_name:     ['speaker name', 'speaker'],
  speaker_title:    ['speaker title', 'speaker role', 'speaker org'],
  speaker_bio:      ['speaker bio'],
  guests_welcome:   ['guests welcome', 'guests'],
  registration_url: ['registration url', 'registration', 'register', 'link'],
  image_url:        ['image url', 'image', 'photo'],
  image_credit:     ['image credit'],
  // Optional. A link to the organiser's OWN Google Calendar event. When it is filled the
  // button opens that event instead of offering a copy, so a later edit by the organiser —
  // a moved room, a changed time — is seen by everybody. See docs/CALENDAR-BUTTON.md.
  calendar_url:     ['calendar link', 'calendar url', 'google calendar link', 'event link'],
  // Optional. Only if a chapter decides it wants permanent links that survive a retitle;
  // absent from docs/SHEET.md's 22 columns and never required. See makeId().
  slug:             ['slug', 'id', 'event id', 'permalink'],
  // Read so they can be recognised and then deliberately dropped. See stripInternal().
  event_owner:      ['event owner', 'owner'],
  notes:            ['notes', 'comments', 'comment'],
};

const TYPES = {
  'learning event':    ['learning', 'Learning event'],
  'leaning event':     ['learning', 'Learning event'],   // the typo that is in the real sheet
  'forum test drive':  ['forum',    'Forum test drive'],
  'test drive':        ['forum',    'Forum test drive'],
  'chapter in-person': ['chapter',  'Chapter in-person'],
  'chapter in person': ['chapter',  'Chapter in-person'],
  'global / regional': ['global',   'Global & regional'],
  'global/regional':   ['global',   'Global & regional'],
  'global & regional': ['global',   'Global & regional'],
  social:              ['social',   'Social'],
};

const FALLBACK_IMAGE = {
  learning: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=1600&q=70',
  forum:    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&q=70',
  chapter:  'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1600&q=70',
  global:   'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=70',
  social:   'https://images.unsplash.com/photo-1541532713592-79a0317b6b77?w=1600&q=70',
  other:    'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1600&q=70',
};

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const norm = (v) => text(v).toLowerCase().replace(/\s+/g, ' ');

/**
 * Find the header row. A sheet often opens with a title or a blank line, and hard-coding
 * "row 3" is how that becomes a silent off-by-one later. Instead: the first row in the first
 * fifteen that carries at least three recognisable headers, one of which names the event.
 */
function findHeaderRow(rows) {
  const known = new Map();
  for (const [field, names] of Object.entries(HEADERS)) {
    for (const n of names) known.set(n, field);
  }
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map(norm);
    const fields = new Set(cells.map((c) => known.get(c)).filter(Boolean));
    if (fields.size >= 3 && (fields.has('title') || fields.has('start_date'))) {
      const map = {};
      cells.forEach((c, col) => {
        const f = known.get(c);
        if (f && map[f] === undefined) map[f] = col;   // first spelling wins
      });
      return { index: i, map };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ values */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * `YYYY-MM-DD` is the documented format and the only one that cannot be misread. Sheets
 * sometimes hands back a locale-formatted string or a serial number anyway, when the column
 * was not set to plain text, so those are recovered rather than silently dropped.
 */
function parseDate(value, issues, row) {
  const raw = text(value);
  if (!raw) return null;

  const iso = raw.match(ISO_DATE);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (d.getUTCMonth() === +iso[2] - 1 && d.getUTCDate() === +iso[3]) return raw;
    issues.push({ row, kind: 'impossible_date', detail: raw });
    return null;
  }

  // A Sheets serial number: days since 1899-12-30.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86400000);
    issues.push({ row, kind: 'date_not_text',
      detail: `"${raw}" arrived as a number; format the column as plain text` });
    return d.toISOString().slice(0, 10);
  }

  // "6 October 2026" / "6 Oct 2026" — recoverable, but the year must be present.
  const words = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (words) {
    const m = MONTHS.findIndex((n) => n.startsWith(words[2].toLowerCase().slice(0, 3)));
    if (m >= 0) {
      issues.push({ row, kind: 'date_not_iso', detail: `"${raw}" should be YYYY-MM-DD` });
      return `${words[3]}-${String(m + 1).padStart(2, '0')}-${words[1].padStart(2, '0')}`;
    }
  }

  issues.push({ row, kind: 'unreadable_date',
    detail: `"${raw}" is not YYYY-MM-DD; the event is shown as “date to be confirmed”` });
  return null;
}

function parseTime(value, issues, row) {
  const raw = text(value);
  if (!raw) return null;

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm && +hhmm[1] < 24 && +hhmm[2] < 60) {
    return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  }
  // "3:30pm", "3.30 pm", "15 30" — readable, but say so.
  const loose = raw.match(/^(\d{1,2})[:.\s]?(\d{2})?\s*(am|pm)?$/i);
  if (loose) {
    let h = +loose[1];
    const m = loose[2] || '00';
    const ap = (loose[3] || '').toLowerCase();
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && +m < 60) {
      issues.push({ row, kind: 'time_not_hhmm', detail: `"${raw}" should be HH:MM, 24-hour` });
      return `${String(h).padStart(2, '0')}:${m}`;
    }
  }
  issues.push({ row, kind: 'unreadable_time', detail: `"${raw}" ignored` });
  return null;
}

/** A Sheets checkbox arrives as the boolean TRUE, or as the string when read as text. */
const parseBool = (v) => v === true || ['true', 'yes', 'y', '1', '✓'].includes(norm(v));

const slugify = (s) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const splitLines = (v) => text(v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** FNV-1a, 4 chars of base36. Deterministic in both runtimes and short enough for a URL. */
function shortHash(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-4);
}

/**
 * The event's permanent address.
 *
 * The obvious answer — slugify the title, and suffix -2 on a repeat — is wrong, and quietly
 * so. The suffix depends on which row is encountered first, so re-sorting the sheet or
 * inserting a row above swaps two events' URLs: a link somebody shared then opens THE WRONG
 * EVENT, which is worse than opening nothing. Nothing about a spreadsheet's row order is
 * stable, so nothing derived from it may appear in a URL.
 *
 * So the id is a composite of things a human actually chose:
 *
 *   1. an explicit `Slug` column, if the sheet has one and the cell is filled. Optional,
 *      and the only way to keep a link alive across a retitle.
 *   2. otherwise slug(title) + start date  ->  forum-test-drive-2026-03-10
 *      The date is always included, not only on a clash: if the bare slug were kept for
 *      "the first one", adding a second event would decide by row order again.
 *   3. undated events have no date to add, so the bare slug stands.
 *
 * Two events genuinely sharing a title AND a date are separated by start time, then by a hash
 * of what else distinguishes them. Both are content, neither is position.
 */
function baseId({ slug, title, start }) {
  if (slug) return slugify(slug);
  const base = slugify(title);
  return start ? `${base}-${start}` : base;
}

/**
 * Assigns every event its id, in one pass over ALL of them rather than row by row.
 *
 * That is the whole point. Deciding at row-time means the first row encountered keeps the
 * clean id and later ones get a suffix — which is encounter order wearing a different hat,
 * and re-sorting the sheet would still move a link from one event to another. So: group by
 * base id first, and if a base is claimed more than once, suffix EVERY member of that group.
 * The result depends only on the SET of rows, never on their order.
 */
function assignIds(records, issues) {
  const groups = new Map();
  for (const r of records) {
    const base = baseId(r.idFields);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(r);
  }

  for (const [base, members] of groups) {
    if (members.length === 1) { members[0].id = base; continue; }

    for (const r of members) {
      const f = r.idFields;
      // A morning and an evening session of the same thing on the same day.
      const discriminator = f.timeStart
        ? f.timeStart.replace(':', '')
        : shortHash([f.registrationUrl, f.location, f.speakerName].filter(Boolean).join('|')
                    || f.title);
      r.id = `${base}-${discriminator}`;
    }

    // Anything still sharing an id is a row that is identical to another in every field that
    // identifies an event — the same event entered twice. The row number is the last resort,
    // and it IS position-dependent, so it is flagged rather than applied quietly.
    const byId = new Map();
    for (const r of members) {
      if (!byId.has(r.id)) { byId.set(r.id, r); continue; }
      r.id = `${r.id}-r${r.sheetRow}`;
      issues.push({ row: r.sheetRow, kind: 'unresolvable_duplicate',
        detail: `"${r.idFields.title}" is indistinguishable from another row; its link `
              + `depends on row order and will change if the sheet is re-sorted. Add a Slug `
              + `column to give both a stable link.` });
    }

    if (members.length > 1) {
      issues.push({ row: members[0].sheetRow, kind: 'duplicate_identity',
        detail: `"${members[0].idFields.title}" appears ${members.length} times with the same `
              + `title and date; links are ${members.map((m) => m.id).join(', ')}` });
    }
  }
}

/** Only http(s) reaches the page: a `javascript:` registration link would be an open door. */
function safeUrl(value, issues, row, field) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch { /* falls through */ }
  issues.push({ row, kind: 'unsafe_url', detail: `${field}: "${raw.slice(0, 60)}" dropped` });
  return '';
}

/* ------------------------------------------------------------------- rows */

export function normalizeRows(values) {
  const issues = [];
  const header = findHeaderRow(values);
  if (!header) {
    const err = new Error(
      'No header row found. The sheet needs a row naming the columns — Title, Type, '
      + 'Start Date and so on. See docs/SHEET.md.');
    err.reason = 'no_header';
    throw err;
  }

  const hasStatus = header.map.status !== undefined;

  const cell = (row, field) => {
    const col = header.map[field];
    return col === undefined ? '' : text(row[col]);
  };

  const records = [];

  for (let i = header.index + 1; i < values.length; i++) {
    const row = values[i] || [];
    const sheetRow = i + 1;                       // 1-based, as the sheet shows it

    const title = cell(row, 'title');
    if (!title) continue;                          // a blank row is not an error

    // Publishing is opt-in: only an explicit "Published" is public. A blank cell is a row
    // somebody is still writing, and a half-written event in front of the whole chapter is a
    // worse failure than a finished one nobody can see yet — so this fails closed.
    //
    // The exception is a sheet with no Status column at all, where there is nothing to opt
    // into and hiding everything would be absurd. Presence of the column is what turns the
    // rule on, not the value in it.
    if (hasStatus) {
      const status = norm(cell(row, 'status'));
      if (status !== 'published') {
        if (status && status !== 'draft' && status !== 'cancelled') {
          issues.push({ row: sheetRow, kind: 'unknown_status',
            detail: `"${cell(row, 'status')}" is not Published, Draft or Cancelled, so `
                  + `"${title}" is not shown. Only "Published" publishes.` });
        }
        continue;
      }
    }

    const rawType = norm(cell(row, 'type'));
    const [kind, typeLabel] = TYPES[rawType] || ['other', text(cell(row, 'type')) || 'Other'];
    if (rawType && !TYPES[rawType]) {
      issues.push({ row: sheetRow, kind: 'unknown_type', detail: `"${cell(row, 'type')}"` });
    }

    const start = parseDate(cell(row, 'start_date'), issues, sheetRow);
    let end = parseDate(cell(row, 'end_date'), issues, sheetRow) || start;
    if (start && end && end < start) {
      issues.push({ row: sheetRow, kind: 'end_before_start', detail: `${start} -> ${end}` });
      end = start;
    }

    const location = cell(row, 'location');
    const isOnline = norm(location) === 'online';

    const speakerName = cell(row, 'speaker_name');
    const description = cell(row, 'description');
    const timeStart = parseTime(cell(row, 'start_time'), issues, sheetRow);
    const registrationUrl = safeUrl(cell(row, 'registration_url'), issues, sheetRow,
      'Registration URL');

    const idFields = { slug: cell(row, 'slug'), title, start, timeStart,
                       registrationUrl, location, speakerName };

    records.push({ sheetRow, idFields, event: {
      id: null,                       // assigned below, once every row is known
      title,
      kind,
      type_label: typeLabel,

      start,
      end,
      date_tbc: !start,
      date_note: start ? '' : cell(row, 'date_note'),
      time_start: timeStart,
      time_end: parseTime(cell(row, 'end_time'), issues, sheetRow),
      timezone: cell(row, 'timezone') || 'CET',

      place: location || (isOnline ? 'Online' : ''),
      is_online: isOnline,
      venue: cell(row, 'venue') || (isOnline ? 'Online' : location),

      summary: cell(row, 'summary'),
      description,
      highlights: splitLines(cell(row, 'highlights')),
      who_for: cell(row, 'who_for'),

      speaker_name: speakerName,
      speaker: speakerName,
      speaker_title: cell(row, 'speaker_title'),
      speaker_bio: cell(row, 'speaker_bio'),

      guests_welcome: parseBool(row[header.map.guests_welcome]),
      registration_url: registrationUrl,
      image_url: safeUrl(cell(row, 'image_url'), issues, sheetRow, 'Image URL')
        || FALLBACK_IMAGE[kind] || FALLBACK_IMAGE.other,
      image_credit: cell(row, 'image_credit'),
      calendar_url: safeUrl(cell(row, 'calendar_url'), issues, sheetRow, 'Calendar Link'),

      source_row: sheetRow,
    } });

    if (!cell(row, 'registration_url')) {
      issues.push({ row: sheetRow, kind: 'no_registration_url', detail: `"${title}"` });
    }
  }

  // A Status column with nothing marked Published is almost always a sheet that predates the
  // opt-in rule rather than a chapter with no events. Left unsaid, it looks like an empty
  // calendar; said, it is a one-word fix.
  if (hasStatus && records.length === 0 && values.length > header.index + 1) {
    issues.push({ row: header.index + 1, kind: 'nothing_published',
      detail: 'The sheet has rows but none has Status set to "Published". Only that exact '
            + 'word publishes a row; blank counts as Draft.' });
  }

  assignIds(records, issues);
  const events = records.map((r) => ({ ...r.event, id: r.id }));

  // Undated events sort last; the feed puts them under "Dates to be confirmed".
  events.sort((a, b) => (!a.start - !b.start)
    || (a.start || '').localeCompare(b.start || '')
    || a.title.localeCompare(b.title));

  return { events, issues, header_row: header.index + 1 };
}

/**
 * The last gate before anything is served. `Notes` and `Event Owner` are never read into an
 * event above, and this asserts it — a field added carelessly later is stripped here rather
 * than published. Cheap, and the alternative is a chapter's internal notes in devtools.
 */
const INTERNAL = new Set(['notes', 'event_owner', 'owner', 'comments']);
export const stripInternal = (event) =>
  Object.fromEntries(Object.entries(event).filter(([k]) => !INTERNAL.has(k)));
