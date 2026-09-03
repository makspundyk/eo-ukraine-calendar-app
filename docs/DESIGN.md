# EO events calendar — design

Version 1.0 · September 2026 · Mockup on mock data

---

## 1. Who this is for

**An EO member. An entrepreneur, not a technical user, and above all short of time.**

They are not browsing. They open this with one question — *"is there anything here I should
be at?"* — and they answer it in under a minute, usually on a phone between meetings.

| | |
|---|---|
| Opens it | a few times a season, and whenever a chapter email lands |
| Device | phone first. Desktop when actually planning travel |
| Decides in | seconds per event. If a card does not answer "when / where / worth it", they scroll past |
| Never wants | a login, a filter panel, a settings screen, or a table of 11 columns |

Everything below follows from that: **the calendar's job is to get a member from "what's on"
to "I'm registered" with as little reading as possible.**

---

## 2. Field order — what a member reads, in the order they read it

They ask four questions, always in this order. The card answers them in that order too;
anything that does not answer one of them is pushed to the event page or cut.

| # | Question | Field | Where |
|---|---|---|---|
| 1 | **Can I make it?** | date, then day-of-week | the spine of the feed, and the first thing on every card |
| 2 | **Do I have to travel?** | online / city | immediately next to the date — this is the single biggest filter, and it decides whether the rest matters |
| 3 | **What is it?** | title, then type | the headline |
| 4 | **Is it worth my evening?** | speaker, for a learning event | directly under the title — for these events the speaker *is* the draw ("Forbes Books", "the founder of UKLON") |
| 5 | how long? | time and duration | a quiet line under the headline |
| 6 | what exactly? | description | **two lines on the feed, in full only on the event page.** Not on the list view at all |
| 7 | can I bring someone? | guests welcome | a small chip — it matters to a member with a prospect, and to nobody else |
| 8 | **How do I join?** | Register | one button, always in the same place |

**Deliberately not on a card:** event owner (internal), audience wording (internal), the
`Types` column (see §4), and the source row. An owner's name answers no question a member has.

**Register is on the card, not only on the event page.** A member who has already decided
should not have to open a page to act — that is one screen of friction between intent and a
registration, on the step where they are most likely to drop.

---

## 3. The two views

Both show the same events; they differ in how much they show at once.

**Filters — two rows, because they are two questions.** What kind of event, and whether a
member can physically get to it. Folding them into one row would force a choice between
questions people ask together: *a learning event I can attend in person*.

The type row is built from the sheet's `Type` column, not from a list in the code — add a type
to the sheet and its tab appears; stop running one and it goes away rather than sitting there
returning nothing. The second row is `All` / `In person` / `Online`, derived from `Location`,
with `All` selected by default. A tab that would return nothing is dimmed rather than removed,
and a tab that is *selected* is never removed even at zero, or a member could neither see what
is filtering the page nor click it off.

Every filter is in the URL, so the exact view a member is looking at can be sent to a colleague.

**Feed** — the default. One card per event with a cover, sticky month headers, and a vertical
timeline down the side: a dot per event, month labels, and the dot for whatever you are
looking at filled in. It answers "what is coming up" by scrolling, the way a member actually
reads a calendar.

**List** — for planning. One row per event, no descriptions, everything comparable at a
glance: date, type, title, speaker, place, register. This is the view you use when deciding
between two trips.

**Event page** — the full description, everything else, and one primary action. Shaped like a
travel booking detail page rather than an article, because a member deciding on an event is
deciding on a trip: an evening, or three days and a flight. In order:

| # | Block | Why it is where it is |
|---|-------|----------------------|
| 1 | Full-bleed photograph, type chip, title, speaker | The place is recognised before a word is read |
| 2 | Journey strip — **start → end**, with duration and place between them | The one fact a member checks twice. It is the only graphic on the page |
| 3 | Register, full width, in the same card as the strip | The action sits against the facts that justify it, never further down |
| 4 | About — the full description, the only place it appears | |
| 5 | What you get out of it | The reason to say yes, after the reason to say no (the date) |
| 6 | Who is speaking | Only rendered when there is a speaker |
| 7 | The details — date, time, where, format, guests | The reference block; a member who scrolled this far wants to check something specific |
| 8 | Sticky action bar (phone only) | Register is never scrolled away from on a small screen |

On the feed and the list, the **whole card or row** opens the event — photograph included, not
only the title. It is one transparent anchor stretched over the card, not a click handler, so
middle-click, cmd-click and "copy link address" behave the way a member expects. Register sits
on its own layer above it, because it goes somewhere else.

All three are the same data. There is no view that shows something the others cannot reach.

---

## 4. What the sheet gets wrong

The normaliser (`mocks/_normalize.py`) fixes these **once, in one place**, and records every
one. It is the script that becomes the Google Sheets fetch, so a fix here is a fix in
production — and a fix made in a template instead would be invisible the next time the sheet
changes.

| Problem | Rows | What it would have caused | Handling |
|---|---|---|---|
| **`Name` means something different per type** | 5 | For a learning event the sheet puts the **speaker** in `Name` and the **title** in `Description`. Read naively, five events are titled with a person's name and show no description | Title from `Description`, speaker from `Name`, for learning events only |
| **No year anywhere in the sheet** | all | Every date ambiguous | Inferred: a year in the title wins *if it is this season or later* — "GLC 2027" ✓, but "Forbes Ukraine Entrepreneur **2025**" is an award, not a date, and taking it literally moved two 2026 events into the past |
| **End date 9 months after the start** | 1 | Presidents Meeting 2027 renders as a 276-day event spanning the whole calendar | Treated as single-day; flagged for correction |
| **`Types` column is a legend, not data** | all | Row 2 has Type "Leaning Event" but Types "Forum Test Drive" — the column is the dropdown list pasted down | Ignored entirely |
| **Typos in the type vocabulary** | 13 | "Leaning Event", "GLobal / Regional", and "Test Drive" vs "Forum Test Drive" would each become their own category | One canonical vocabulary |
| **Placeholder title published** | 1 | "placeholder - legal casestudy" is visible to every member | Shown, and flagged |
| **Four identical rows, one dated** | 4 | Looks like a bug | Kept as separate sessions, three under "date to be confirmed" |

### The one column the sheet has to add

**`Registration URL`.** There is no link in the data, and a calendar whose entire purpose is
to get a member registered cannot have the registration link missing. The mock generates a
placeholder per event; the real sheet needs the column.

Two more worth adding, in order of value: **`Year`** (removes every inference above), and
**`Image`** (a cover per event — until then each card gets a deterministic gradient keyed by
its own id, so an event always looks the same and a new one never looks broken).

## 5. Explanations live behind the "i"

Every form on the site had a paragraph under it saying what pressing the button would do. All
of them were true. None of them were read: a member who has decided to come is looking at the
field and the button, and three lines of grey type between them and the rest of the page is
something to step over, every time, forever.

So the paragraph moved into a tooltip on a small circled **i**, attached to the exact control
it is about — the checkbox, the label above the buttons — rather than sitting under the whole
form. Hover or keyboard focus on a desktop; one tap on a phone, where it opens as a sheet at
the foot of the screen because no CSS can tell whether an anchored bubble would hang off the
edge. Nothing was cut. It is the same words, one press away, next to the thing they describe.

The note element stays where the paragraph was, but empty — it is where the form writes its
answer afterwards, and an empty one takes up no space.

**What did NOT go behind an "i".** An explanation folds away; an action never does. "Or
download the .ics file", "Prefer to subscribe the calendar itself? Take the feed" and "Opens
the EO registration page. Takes about a minute" all stay in the open — the first two are
things to press, and the third is one short line of reassurance directly under the button it
is about.
