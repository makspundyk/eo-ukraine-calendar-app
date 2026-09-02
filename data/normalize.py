#!/usr/bin/env python3
"""
Sheet -> events.json.

This is the file the Google Sheets script will become. Everything the sheet gets wrong is
handled HERE, once, with the rule written down — never quietly patched in the UI, because a
fix in a template is invisible the next time the sheet changes.

Run: npm run data
"""
import csv, json, os, re, hashlib, sys
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import CONTENT, FALLBACK

HERE = os.path.dirname(os.path.abspath(__file__))
# The generator's inputs live here; its OUTPUT belongs in the deployed tree.
OUT = os.path.join(HERE, '..', 'public', 'data', 'events.json')
# The season this sheet covers. Rows carry no year at all, so one is inferred (see below).
SEASON_START_YEAR = 2026
SEASON_START_MONTH = 5          # a season runs May -> April

MONTHS = {m: i + 1 for i, m in enumerate(
    ['january','february','march','april','may','june','july','august',
     'september','october','november','december'])}

# ---------------------------------------------------------------- type vocabulary
# The sheet has two competing spellings and two typos. One canonical set, one place.
TYPES = {
    'leaning event':    ('learning',  'Learning event'),
    'learning event':   ('learning',  'Learning event'),
    'test drive':       ('forum',     'Forum test drive'),
    'forum test drive': ('forum',     'Forum test drive'),
    'chapter in-person':('chapter',   'Chapter in-person'),
    'global / regional':('global',    'Global & regional'),
    'social':           ('social',    'Social'),
}

issues = []
def issue(kind, row, detail, fix):
    issues.append({'kind': kind, 'row': row, 'detail': detail, 'applied_fix': fix})


def parse_day(text, row):
    """'18 May' -> (5, 18). No year in the sheet; that is inferred separately."""
    if not text or not text.strip():
        return None
    m = re.match(r'^\s*(\d{1,2})\s+([A-Za-z]+)\s*$', text.strip())
    if not m:
        issue('unparsable_date', row, f'"{text}"', 'row kept with no date, shown under “Date to be confirmed”')
        return None
    day, month = int(m.group(1)), MONTHS.get(m.group(2).lower())
    if not month:
        issue('unknown_month', row, f'"{text}"', 'row kept with no date')
        return None
    return month, day


def infer_year(month, title):
    """
    THE SHEET HAS NO YEAR. Two rules, in order:
      1. a 4-digit year in the title, but ONLY if it is in this season or later.
         "GLC 2027" and "ELC 2026" name the edition; "Forbes Ukraine Entrepreneur 2025"
         names an AWARD, and taking it literally dated two 2026 events to 2025.
      2. otherwise the season: May-Dec -> season start year, Jan-Apr -> the year after
    """
    for y in (int(x) for x in re.findall(r'\b(20\d{2})\b', title or '')):
        if y >= SEASON_START_YEAR:
            return y
    return SEASON_START_YEAR if month >= SEASON_START_MONTH else SEASON_START_YEAR + 1


def parse_time(text, row):
    """'15 00 CET' -> 15:00; '3:30 – 5:00pm' -> 15:30-17:00."""
    if not text or not text.strip():
        return None, None, None
    t = text.strip().replace('–', '-').replace('—', '-')
    tz = 'CET' if 'cet' in t.lower() else None
    t = re.sub(r'\bCET\b', '', t, flags=re.I).strip()

    rng = re.match(r'^(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?\s*-\s*(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?$', t, re.I)
    if rng:
        def to24(h, mi, ap):
            h, mi = int(h), int(mi or 0)
            if ap and ap.lower() == 'pm' and h != 12: h += 12
            if ap and ap.lower() == 'am' and h == 12: h = 0
            return h, mi
        # "3:30 – 5:00pm": the meridiem on the END applies to the start too.
        ap_end = rng.group(6)
        sh, sm = to24(rng.group(1), rng.group(2), rng.group(3) or ap_end)
        eh, em = to24(rng.group(4), rng.group(5), ap_end)
        return f'{sh:02d}:{sm:02d}', f'{eh:02d}:{em:02d}', tz

    one = re.match(r'^(\d{1,2})[\s:.](\d{2})$', t)
    if one:
        return f'{int(one.group(1)):02d}:{one.group(2)}', None, tz
    issue('unparsable_time', row, f'"{text}"', 'time hidden on the card rather than shown wrong')
    return None, None, tz


def cover(slug, kind, place):
    """
    The sheet has no images, and a feed of cards needs one. Rather than ship a stock photo
    per event, each card gets a deterministic gradient keyed by its own id — the same event
    always looks the same, and a new event never looks broken.
    """
    h = int(hashlib.md5(slug.encode()).hexdigest()[:8], 16)
    return {'hue': h % 360, 'kind': kind}


rows = list(csv.DictReader(open(os.path.join(HERE, 'source.tsv')), delimiter='\t'))
events, seen_titles = [], {}

for i, r in enumerate(rows, start=2):        # row 1 is the header in the sheet
    raw_type = (r.get('Type') or '').strip().lower()
    kind, type_label = TYPES.get(raw_type, ('other', (r.get('Type') or 'Other').strip()))
    if raw_type and raw_type not in TYPES:
        issue('unknown_type', i, f'"{r.get("Type")}"', 'shown as-is, styled as “other”')
    if raw_type == 'leaning event':
        issue('typo', i, '"Leaning Event"', 'read as “Learning event”')
    if raw_type == 'global / regional' and r.get('Type', '').strip() != 'Global / Regional':
        issue('typo', i, f'"{r.get("Type").strip()}"', 'read as “Global & regional”')

    name = (r.get('Name') or '').strip()
    desc = (r.get('Description') or '').strip()

    # A LEARNING EVENT PUTS THE SPEAKER IN `Name` AND THE TITLE IN `Description`.
    # Every other type puts the title in `Name`. This is the single biggest trap in the sheet:
    # read naively, five events are titled with a person's name and have no description.
    if kind == 'learning' and name and desc:
        title, speaker, description = desc, name, ''
        issue('column_meaning_differs', i,
              'Learning event: Name holds the SPEAKER and Description holds the TITLE',
              'title taken from Description, speaker from Name')
    else:
        title, speaker, description = name, '', desc
    if not title:
        continue
    if re.search(r'\bplaceholder\b|\btbd\b|\bTBA\b', title, re.I):
        issue('placeholder_title', i, f'"{title}"',
              'published as-is — a placeholder title is visible to every member')

    tbc = bool(re.search(r'\(.*(waiting|check).*dates?.*\)', title, re.I))
    title = re.sub(r'\s*\(.*(waiting|check).*dates?.*\)\s*', '', title, flags=re.I).strip()

    sd = parse_day(r.get('Start Date'), i)
    ed = parse_day(r.get('End Date'), i) or sd
    start = end = None
    if sd:
        y = infer_year(sd[0], title)
        start = date(y, sd[0], sd[1])
        ey = infer_year(ed[0], title) if ed else y
        # An end date before the start means the year rolled: Dec 30 -> Jan 2.
        end = date(ey, ed[0], ed[1]) if ed else start
        if end < start:
            end = date(ey + 1, ed[0], ed[1])
        span = (end - start).days
        if span > 30:
            issue('implausible_end_date', i,
                  f'{start} -> {end} is {span} days',
                  'treated as a single-day event; the End Date column needs fixing')
            end = start

    t_start, t_end, tz = parse_time(r.get('Time'), i)
    place = (r.get('Place') or '').strip()
    online = place.lower() == 'online' or (not place and kind in ('learning', 'forum'))
    if not place and online:
        place = 'Online'

    # `base` is the title slug and stays the key for the editorial content in _content.py.
    # `slug` is the event's URL and follows the same composite rule as lib/normalize.mjs:
    # title + start date, never an encounter-order suffix, so re-sorting the sheet can never
    # move a link from one event to another. See makeId() there for the full reasoning.
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    slug = f'{base}-{start.isoformat()}' if start else base
    seen_titles[slug] = seen_titles.get(slug, 0) + 1
    if seen_titles[slug] > 1:
        issue('duplicate_identity', i, f'"{title}" is indistinguishable from an earlier row',
              'separated by row number; add a Slug column to give it a stable link')
        slug = f'{slug}-r{i}'

    events.append({
        'id': slug,
        'title': title,
        'speaker': speaker,
        'description': description,
        'kind': kind,
        'type_label': type_label,
        'start': start.isoformat() if start else None,
        'end': end.isoformat() if end else None,
        'date_tbc': start is None or tbc,
        'time_start': t_start, 'time_end': t_end, 'timezone': tz or 'CET',
        'place': place, 'is_online': online,
        'owner': (r.get('Event Owner') or '').strip(),
        'guests_welcome': 'leads could be invited' in (r.get('Audience') or '').lower(),
        # NOT IN THE SHEET. The one column that has to be added — see DESIGN.md.
        'registration_url': f'https://eonetwork.org/ukraine/register/{slug}',
        'content_key': base,          # for the editorial merge below; not published
        'cover': cover(slug, kind, place),
        'source_row': i,
    })

# ---- merge the editorial columns the sheet does not have yet --------------
# Each of these becomes a sheet column. Merged here, not in the templates, so the UI cannot
# tell the difference between a value the sheet supplied and one it did not.
for ev in events:
    c = CONTENT.get(ev.pop('content_key'), {})
    ev['summary'] = c.get('summary') or ev['description'][:140] or ''
    if c.get('description'):
        ev['description'] = c['description']
    ev['highlights'] = c.get('highlights', [])
    ev['who_for'] = c.get('who_for', '')
    # One sheet column, one line on the page: "Founder, The Authority Company".
    ev['speaker_title'] = ', '.join(x for x in (c.get('speaker_role'), c.get('speaker_org')) if x)
    # Only meaningful on an event with no date — "Expected spring 2027".
    ev['date_note'] = c.get('date_note', '')
    ev['speaker_bio'] = c.get('speaker_bio', '')
    ev['venue'] = c.get('venue', '') or ('Online' if ev['is_online'] else ev['place'])
    ev['image_url'] = c.get('image_url') or FALLBACK.get(ev['kind'], FALLBACK['other'])
    ev['image_credit'] = c.get('image_credit', 'Unsplash')
    if not c:
        issue('missing_content', ev['source_row'], f'"{ev["title"]}" has no summary or image',
              'a format-based fallback image is used; the row still needs a summary')
    # The card shows the name only; the role and company are their own line on the event page.
    # The old sheet crams all three into one cell, so the name is whatever precedes the comma.
    ev['speaker_name'] = ev['speaker'].split(',')[0].strip() if ev['speaker'] else ''

events.sort(key=lambda e: (e['start'] is None, e['start'] or '', e['title']))
out = {'generated_at': date(2026, 9, 1).isoformat(),
       'season': f'{SEASON_START_YEAR}/{SEASON_START_YEAR + 1}',
       'data_issues': issues, 'data': events}
json.dump(out, open(OUT, 'w'), indent=2, ensure_ascii=False)

print(f'{len(events)} events · {len(issues)} data issues')
for k in sorted({i["kind"] for i in issues}):
    print(f'  {k:26s} {sum(1 for i in issues if i["kind"] == k)}')
