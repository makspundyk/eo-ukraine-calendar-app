# The events sheet — column standard

One tab. One row per event. Row 1 is the header. Filled by hand, so the standard is built to
be short: **22 columns, three of them required.**

### Three rules the rest rests on

1. **The script reads by header name, not by position.** Names are matched lower-cased and
   trimmed, unknown columns are ignored, and column order does not matter — inserting or
   moving a column never breaks anything.
2. **An empty cell means "not known yet", never "no".** The calendar hides what it does not
   know rather than printing something wrong.
3. **Row order in the sheet is irrelevant.** The calendar always sorts by `Start Date`,
   earliest first, and puts every event with an empty `Start Date` in the "Dates to be
   confirmed" section at the foot of the feed. Sort the sheet however suits you.

### There is no ID column

The event's web address is built from its `Title`. That keeps the sheet to things a human
would actually type — but it has one consequence worth knowing: **rename an event and its link
changes.** Anyone who bookmarked or shared the old link lands on "not in the calendar".

So fix typos freely before you announce an event, and treat the title as settled afterwards.

---

## The columns

| # | Column | | Control |
|---|--------|---|---------|
| 1 | `Status` | recommended | dropdown |
| 2 | `Type` | **required** | dropdown |
| 3 | `Title` | **required** | text |
| 4 | `Start Date` | required once known | text |
| 5 | `End Date` | | text |
| 6 | `Start Time` | | text |
| 7 | `End Time` | | text |
| 8 | `Timezone` | | text |
| 9 | `Date Note` | | text |
| 10 | `Location` | recommended | text |
| 11 | `Venue` | | text |
| 12 | `Summary` | recommended | text |
| 13 | `Description` | | text or HTML |
| 14 | `Highlights` | | text, one per line |
| 15 | `Who For` | | text |
| 16 | `Speaker Name` | | text |
| 17 | `Speaker Title` | | text |
| 18 | `Speaker Bio` | | text |
| 19 | `Guests Welcome` | | **checkbox** |
| 20 | `Registration URL` | **required** | text |
| 21 | `Image URL` | recommended | text |
| 22 | `Notes` | | text |

---

### 1. `Status` — dropdown

Whether members can see the row yet.

- `Published` — live on the calendar.
- `Draft` — you are still writing it. Nobody sees it.
- `Cancelled` — it was announced and it is not happening. Removed from the calendar.

**A blank cell counts as Published.** So a half-finished row is visible to everyone until you
set it to Draft. Set Draft first, write second.

### 2. `Type` — dropdown

What kind of event it is. Drives the colour, the label and the filter tabs. Exactly one of:

| Value | Use it for |
|-------|-----------|
| `Learning event` | A speaker teaching something — online or in a room |
| `Forum test drive` | A sample forum session for prospective members |
| `Chapter in-person` | The chapter's own gatherings: retreats, dinners, chapter days |
| `Global / Regional` | Anything run by EO above chapter level — GLC, ELC, Unlimited, Presidents Meeting |
| `Social` | Purely social. No agenda, no speaker |

Anything else is published as written but styled neutral grey and sits outside the filters.

### 3. `Title` — what the event is called

Exactly what a member should read. It is printed verbatim, so nothing parenthetical, no status
notes, no "TBC".

- ✅ `European Leadership Conference (ELC) 2026`
- ✅ `How to Write and Publish a Book`
- ❌ `Joe Gregory` — that is the speaker. It goes in `Speaker Name`
- ❌ `Chapter Retreat (waiting for dates)` — leave `Start Date` empty instead
- ❌ `Placeholder event` — set `Status` to Draft

For a recurring session, put what tells them apart in the title: `Forum Test Drive — October`.

### 4. `Start Date`

`YYYY-MM-DD`. The day the event begins.

- One-day event on 16 September 2026 → `2026-09-16`
- Three-day conference starting 6 October → `2026-10-06`
- **Date genuinely not fixed yet → leave it empty.** The event moves to "Dates to be
  confirmed" at the foot of the feed, which is where it belongs.

Format the column as plain text first (Format → Number → Plain text), or Sheets rewrites
`2026-10-06` into `06/10/2026` for whoever opens it next and the parser sees something else.

### 5. `End Date`

`YYYY-MM-DD`. Only when the event runs across more than one day.

- Single-day event → **leave empty**. Do not repeat the start date
- Conference 6–8 October → `2026-10-08`
- Retreat that crosses new year, 30 Dec – 2 Jan → `2027-01-02`

A multi-day event is **one row**, never one row per day. The calendar counts the days itself
and prints "3 days".

### 6. `Start Time`

`HH:MM`, 24-hour. When it begins, local to the event.

- 3:30 in the afternoon → `15:30`
- 9 in the morning → `09:00`
- Multi-day event where the time varies by day → **leave empty**. Put the schedule in
  `Description`
- Time not decided → leave empty. The page says "to be confirmed"

Not `3:30pm`, not `15 30`, and never the timezone in the same cell.

### 7. `End Time`

`HH:MM`, 24-hour. Only useful on a single-day event — it is what produces "90 minutes" on the
page.

- Session 15:30–17:00 → `17:00`
- Open-ended, or multi-day → leave empty

### 8. `Timezone`

The short code the time is given in. `CET`, `EET`, `JST`.

Leave empty and it is assumed to be `CET`. Fill it in whenever the event is not on European
time — a member reading from Kyiv or Toronto is otherwise guessing.

### 9. `Date Note`

One short phrase, and **only for events with no `Start Date` yet**. It is the difference
between "we have no idea" and "hold the spring".

- `Expected spring 2027`
- `Dates announced in January`
- `Two sessions, autumn`

Leave it empty on any event that has a real date — it is not shown there.

### 10. `Location`

Where it physically is, as a member would say it.

- In person → `City, Country`: `Krakow, Poland`, `Kyiv, Ukraine`
- Online → the single word `Online`. This switches the icon and the wording everywhere,
  including "joining link sent when you register"
- Not chosen yet → leave empty. The card says "Venue TBC"

The card shows the city alone, so put the city first.

### 11. `Venue`

The specific place, shown only on the event page — for a member who has already decided and
now needs to get there. Scenarios:

| Situation | What to write |
|-----------|---------------|
| A hotel, restaurant or office | `Sheraton Grand Kraków, Powiśle 7` — name first, then street |
| A conference centre | `ICE Kraków Congress Centre` |
| Online | The platform: `Zoom`, `Google Meet`, `Microsoft Teams`. **Not the joining link** — that comes from registration |
| A retreat spread over a resort or a whole town | Leave empty. `Location` already says it |
| Venue booked but not announced | `Address sent on registration` |
| Someone's home or a private space | `Address sent on registration` — never a private address in a public calendar |
| Venue not booked yet | Leave empty. The page falls back to `Location` |

### 12. `Summary`

**One sentence, 120 characters or fewer.** It is the line under the photograph on the feed
card, and for most members it is the only sentence they read. Write the reason to come, not a
restatement of the title.

- ✅ `Europe's chapter leadership, together for three days in Kraków.`
- ✅ `Ninety minutes inside a real EO forum — the format, not a description of it.`
- ✅ `Six days in Malta with the chapter — the one that sets the tone for the year.`
- ❌ `Join us for our upcoming learning event!` — says nothing
- ❌ The first line of the description pasted in — it will read as a truncation

Plain sentence. No HTML here; the card clamps it to two lines.

### 13. `Description` — plain text **or HTML**

The full text, shown only on the event page and never truncated there. Write as much as it
deserves.

**Plain text works.** A blank line starts a new paragraph; a single newline is a line break.
Nothing else needed.

**HTML also works** — paste it in and it renders. Supported tags:

```
<p> <br> <strong> <em> <u> <ul> <ol> <li> <a href> <h3> <h4> <blockquote> <hr>
```

Pasting formatted text out of Google Docs or Word also works: the paragraphs survive.

Anything outside that list is stripped and its words kept, so a stray `<div>` or `<span>` costs
you nothing. Scripts, styles, images and event handlers are removed entirely — this is
deliberate, because a shared spreadsheet reaches more people than a codebase does. Links get
`target="_blank"` automatically; a `javascript:` link is dropped.

Example:

```html
<p>Three days, 300 founders, one of Europe's most beautiful cities.</p>
<h3>What the three days look like</h3>
<ul>
  <li>Main-stage speakers, each a founder who has done the thing</li>
  <li>Deep dives <em>chosen by the attendees</em></li>
</ul>
<p>Full agenda on the <a href="https://eonetwork.org/unlimited">EO Unlimited site</a>.</p>
```

### 14. `Highlights`

The ticked "What you get out of it" list. **One per line inside the one cell** — press ⌥⏎ on a
Mac, Alt+Enter on Windows, to add a line without leaving the cell.

Four is the sweet spot. Write outcomes, not agenda items.

```
Which ideas carry a book and which do not
Ghostwriting, hybrid and self-publishing — real costs and timelines
What publication actually does for inbound and speaking
The first three steps to take this month
```

Leave empty and the section is not shown at all. That is fine — better nothing than four
vague lines.

### 15. `Who For`

One sentence naming who should come, so nobody registers for the wrong room.

- `Founders considering a book, and anyone already stuck mid-draft.`
- `Chapter board members and chapter staff.`
- `All EO members. Bring your partner.`
- `Prospective members only.`

### 16. `Speaker Name`

The person's name, **and nothing else**.

- ✅ `Joe Gregory`
- ❌ `Joe Gregory, the Authority Company, part of Forbes Books` — the rest goes in
  `Speaker Title`

Leave empty when there is no single speaker — a conference, a retreat, a social. The speaker
block simply is not shown.

Two speakers: `Anna Koval and Dmytro Sydorenko`.

### 17. `Speaker Title`

Their role and company on one line, exactly as they would introduce themselves. Shown
underneath the name.

- `Founder, The Authority Company`
- `CEO, Fasto · EO Kyiv`
- `Partner, Sayenko Kharenko`

### 18. `Speaker Bio`

One or two sentences: the reason to trust this person on this topic. Not a CV.

- ✅ `Has taken hundreds of founders from "I should write something" to a printed book.`
- ❌ A paragraph of career history

### 19. `Guests Welcome` — checkbox

Tick it when a member may bring a prospective member or a partner. It puts a "Guests welcome"
chip on the card and a line in the details.

Unticked means no. This is the one column where an empty cell means "no" rather than "not
known" — a checkbox has no third state.

### 20. `Registration URL`

The full `https://` link that registers a member. It is behind every Register button, on the
feed, the list and the event page — the calendar exists to produce this click.

- An EO registration page, an Eventbrite link, a Google Form, a Typeform: all fine
- Registration not open yet → point it at the page members should watch, or leave the row as
  `Draft` until it is
- A `mailto:` address works, but a form is better — you will get the attendee list for free

### 21. `Image URL`

A link to the picture **file**, not to the page it sits on. If the link does not end in
`.jpg`, `.png` or `.webp`, or does not open the picture on its own, it will not load.

| Source | How |
|--------|-----|
| **Unsplash** | Right-click the photo → Copy image address. `https://images.unsplash.com/photo-15223832…?w=1600&q=70` |
| **Wikimedia Commons** | Use the "Original file" link. Wikimedia only serves *certain* widths — `1280px-` works, `1600px-` fails |
| **Your own photo** | Upload it somewhere that serves files directly. A Google Drive share link **will not work** — it serves a viewer page |

Landscape, at least 1200px wide, with the interesting part in the **upper half** — the lower
half sits under a frosted band carrying the date, place and title.

Leave it empty and the card falls back to a stock image chosen by `Type`. It looks fine; it
just does not look like the event.

### 22. `Notes`

Internal. Never rendered anywhere. Anything you do not want a member to read goes here and
nowhere else — who is chasing the venue, what the budget is, why the date moved.

---

## Events whose dates are not confirmed

**Leave `Start Date` empty. That is the whole mechanism.** The event drops out of the dated
feed and appears in "Dates to be confirmed" at the bottom, as a compact row with its type, its
title, its location and a *Register interest* button.

Fill in everything else you know — `Title`, `Type`, `Location`, `Summary`, `Registration URL`
— and add a `Date Note` if you can say roughly when. When the date lands, type it into
`Start Date` and the event moves into the feed on its own.

Do not write "TBC" into the `Title` or "TBD" into `Start Date`. Both are printed to members.

---

## What the current sheet has to change

| Today | Becomes | Why |
|-------|---------|-----|
| `Name` holds the **speaker** on learning events and the **title** on everything else | `Title` and `Speaker Name`, always the same meaning | The single biggest trap: read literally, five events are titled with a person's name |
| `Description` holds the **title** on learning events | `Description` is always the description | The other half of the same trap |
| `Start Date` = `18 May`, no year anywhere in the file | `Start Date` = `2026-05-18` | Removes a year inference that has already been wrong twice |
| `Time` = `15 00 CET`, `3:30 – 5:00pm` | `Start Time`, `End Time`, `Timezone` | Three facts in one cell cannot be sorted, filtered or converted |
| `Audience`, free text, searched for the phrase "leads could be invited" | `Guests Welcome` checkbox | A phrase match breaks the moment somebody rewords the sentence |
| `Place` blank on online events | `Location` = `Online` | Blank means "not known". Online is known |
| `(waiting for dates)` inside the title | empty `Start Date` + `Date Note` | The title is printed to members verbatim |
| no registration link anywhere | `Registration URL` | The calendar's entire purpose |
| no image | `Image URL` | |
| `Types`, `Comments` — both unused | `Notes` | One internal column, clearly named |

The parser in `mocks/_normalize.py` still reads the **old** headers and records each of these
as a `data_issues[]` entry rather than silently patching it — 27 at the last run. Point it at a
sheet in the format above and most of that file deletes itself.

---

## How the script will read it

```
GET https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{TAB}!A1:Z?key={API_KEY}
```

The sheet must be shared as **Anyone with the link → Viewer**; an API key cannot open a
private sheet. The response is a `values` array with row 0 as the header — map those names to
the columns above and everything downstream is unchanged.

A checkbox comes back as the string `TRUE` or `FALSE`. A dropdown comes back as its plain
label.
