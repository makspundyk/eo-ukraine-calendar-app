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

  const cell = (row, field) => {
    const col = header.map[field];
    return col === undefined ? '' : text(row[col]);
  };

  const events = [];
  const seen = new Map();

  for (let i = header.index + 1; i < values.length; i++) {
    const row = values[i] || [];
    const sheetRow = i + 1;                       // 1-based, as the sheet shows it

    const title = cell(row, 'title');
    if (!title) continue;                          // a blank row is not an error

    const status = norm(cell(row, 'status'));
    if (status === 'draft' || status === 'cancelled') continue;

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

    let id = slugify(title);
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) {
      issues.push({ row: sheetRow, kind: 'duplicate_title',
        detail: `"${title}" appears ${n} times; its link is ${id}-${n}` });
      id = `${id}-${n}`;
    }

    const speakerName = cell(row, 'speaker_name');
    const description = cell(row, 'description');

    events.push({
      id,
      title,
      kind,
      type_label: typeLabel,

      start,
      end,
      date_tbc: !start,
      date_note: start ? '' : cell(row, 'date_note'),
      time_start: parseTime(cell(row, 'start_time'), issues, sheetRow),
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
      registration_url: safeUrl(cell(row, 'registration_url'), issues, sheetRow, 'Registration URL'),
      image_url: safeUrl(cell(row, 'image_url'), issues, sheetRow, 'Image URL')
        || FALLBACK_IMAGE[kind] || FALLBACK_IMAGE.other,
      image_credit: cell(row, 'image_credit'),

      source_row: sheetRow,
    });

    if (!cell(row, 'registration_url')) {
      issues.push({ row: sheetRow, kind: 'no_registration_url', detail: `"${title}"` });
    }
  }

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
