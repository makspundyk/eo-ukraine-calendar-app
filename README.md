# EO Ukraine — community events calendar

A static site. No build step: `index.html` loads ES modules directly, so what is in this repo
is what gets deployed. Any static host will serve it from the repo root as-is.

```bash
npm run dev      # http://localhost:4100
```

## How it fits together

| | |
|---|---|
| `public/` | **the static site — everything published, and nothing else** |
| `public/index.html` | the shell — fonts, stylesheets, one module entry point |
| `public/src/` | pages, components, router. `src/api/http.js` is the only place that fetches |
| `public/assets/css/` | `tokens.css` → `base.css` → `components.css`, in that order |
| `public/data/` | `events.json` — the demo calendar, used when the sheet cannot be read |
| `functions/api/calendar.js` | the Pages Function behind `/api/calendar`. **Repo root, not `public/`** |
| `lib/` | server-only: Google auth, the sheet parser, the endpoint's answer. **Not deployed as static** |
| `public/_headers` | Cloudflare Pages headers. `serve.mjs` applies them locally too |
| `data/` | the sheet snapshot and the normaliser. **Not deployed** |
| `docs/` | the sheet standard, the design brief, screenshots. **Not deployed** |
| `public/src/identity.js` | the remembered address: storage, the question, the top-bar control |
| `tools/` | `test-parser.mjs`, `shots.mjs`, `dev-cf.mjs` — none deployed |

## Where the calendar data comes from

```
Browser  ──GET /api/calendar──▶  Cloudflare Pages Function  ──service account──▶  Google Sheets
                                 functions/api/calendar.js                        (private sheet)
```

The sheet is private and stays private. The browser never talks to Google, never sees the
spreadsheet id, and never sees a credential — it only ever receives the event objects it
renders. Locally the same request is answered by `serve.mjs` instead of the Function; both
call the same `lib/`, so there is one API contract and one frontend code path.

**If the sheet cannot be read** — not shared, bad key, empty, unparsable — `/api/calendar`
answers `{ ok: false, source: "mock" }` with a generic message, and the page falls back to the
demo data in `public/data/events.json` and shows a small banner saying so. The site is never
blank and never shows a stack trace. The real reason goes to the server log only.

### What is fetched, and when

Nothing is fetched before it is needed, and nothing twice in a visit:

| | |
|---|---|
| landing on the feed | the upcoming list, **light records only** — no descriptions |
| scrolling | nothing. The feed renders 12 cards and appends more from memory |
| opening an event | that one event's full record, if the list did not already carry it |
| **Past events** | a second request, and only when somebody presses it |

Each result is held until the page is reloaded, so going back, switching to the table, or
reopening an event costs nothing.

Server-side: the access token is cached until it nears expiry, and the parsed sheet for 60
seconds, so a member opening an event straight after the feed loaded costs no upstream call at
all. Cloudflare then caches a successful response at the edge for 120s.

**The sheet read itself is not chunked, deliberately.** Spreadsheet rows are in the order a
human typed them, not date order, so "the next ten events" cannot be a row range — every row
must be read and sorted before the first card is right. And the cost is the round trip, not the
rows: measured against this sheet, one column takes 422ms and all twenty-two take 476ms, on top
of ~190ms to mint a token. Splitting the read into chunks would multiply the round trips and
make the first card appear later. Caching the token and slimming the payload are the wins;
chunking is not.

### Environment

Same names in both places. **Nothing here is ever read by browser code.**

| Name | Cloudflare | Local |
|---|---|---|
| `DEMO` | `0` | `0` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | secret | `.env` |
| `GOOGLE_PRIVATE_KEY` | secret | `.env` |
| `GOOGLE_SPREADSHEET_ID` | secret | `.env` |
| `CLOUDFLARE_ON` | `1` | `0` |
| `GOOGLE_SHEET_RANGE` | optional | optional |

**`DEMO=1` pins the site to the demo calendar** and short-circuits Google entirely — no key is
read, no token requested, nothing leaves the server. It works on a machine with no credentials
at all, which makes it the right switch for a demo, a rehearsal, or while the sheet is being
restructured. The banner then reads *"Demo calendar"* in neutral grey rather than the amber
*"Showing demo events"* used for a failure, so a deliberate choice never looks like a fault.

`DEMO=0`, or unset, reads the live sheet — and still falls back to the demo calendar if the
sheet cannot be read.

`CLOUDFLARE_ON` is **configuration, not a security boundary**. It is read server-side for the
startup log only; the secrets are server-side either way, and no browser code depends on it.
Nothing breaks if it is unset.

Event ids are `title-slug-YYYY-MM-DD`, computed from the whole set of rows at once rather
than row by row, so re-sorting the sheet can never move a link from one event to another. An
optional `Slug` column overrides it. See [`docs/SHEET.md`](docs/SHEET.md).

**The range defaults to the bare tab name, `EventCalendar`** — the whole used range, with no
first row and no last column to outgrow. Both bounds have bitten already: `A3:…` cuts off the
header row this project maps columns by, and `…:V9999` silently hid two columns the moment the
Apps Script appended them at W and X. A range with an end column is a bug waiting for somebody
to add a column.

### Prerequisites

1. Google Sheets API enabled on the project.
2. A service account with a JSON key.
3. The sheet **shared with the service account address as Viewer**. Nothing else grants access
   — the sheet must not be made public and "Publish to web" must not be used.

**The service-account JSON must never be committed.** It lives in `secrets/`, which is
gitignored wholesale — see [`secrets/README.md`](secrets/README.md). `.env`, `.dev.vars` and
`.wrangler/` are ignored too. Only `public/` is ever deployed, and `secrets/` is not inside it.

If a key is ever committed by accident, revoke it in Google Cloud and issue a new one; deleting
the file in a later commit does not help, because the history is already on GitHub.

## Local setup

```bash
npm install
cp .env.example .env      # then fill it in
npm run dev               # http://localhost:4100
```

`.env` accepts the private key directly, or a path to the downloaded JSON:

```
GOOGLE_APPLICATION_CREDENTIALS=./secrets/google-service-account.json
```

That convenience exists locally only; Cloudflare always uses its own secrets.

| Command | |
|---|---|
| `npm run dev` | the app plus `/api/calendar`, from `.env`. What you use day to day |
| `npm run dev:cf` | the same app through **Wrangler**, so the real Pages Function executes. Reads the same `.env` and passes it as bindings, so there is no second secrets file |
| `npm test` | the sheet parser, against fixtures. No network, no credentials |
| `npm run data` | regenerate the demo data from the legacy snapshot |
| `npm run shots` | screenshot every view; fails on a console error |
| `npm run responsive` | every page at seven widths, 320px to 1680px: sideways scroll, overflow, tap targets, unreadable type |

## The remembered address

There is no account, and there must not be one: a chapter calendar that asks for a password
before it will invite somebody to an evening has lost most of them at the password. What does
cost people something is retyping the same address on every event, so that — and only that —
is what is kept.

| | |
|---|---|
| where | `localStorage`, in that browser. Never sent anywhere except when the member asks to be invited, exactly as if they had typed it |
| when it is offered | **after** an invitation or a subscription has already succeeded, never before |
| when it is offered again | never, if the answer was no. A prompt that comes back after a refusal is a nag, so the refusal is recorded and kept |
| how it is taken back | the chip in the top bar, which shows the address in use and clears it in one press |

Escape and the backdrop close the question without answering it — only the second button is a
refusal, and only a refusal is recorded. Signing out clears the address and **not** the
refusal: "not this address any more" is a different answer from "never offer again".

Saving or clearing it does not redraw the page. It usually happens a second after a form has
confirmed something — an invitation with its calendar link, or a subscription carrying the one
unsubscribe link that person will ever be shown — so `identity.js` announces the change and
`main.js` patches the three things that depend on it: the chip, the card buttons, and any
empty email field. A field somebody has already typed a different address into is left alone.

**What it changes on a card.** With an address remembered, *Add to calendar* on a card or a
table row sends a real invitation in one press. Without one, the card links to the event page
instead — a card has no room to explain what an email field is for, and an unexplained email
box is the one thing nobody fills in. That link carries `?invite=1`, which scrolls the event
page to the field and puts the cursor in it.

Before this, a card handed out a **copy** of the event: a block in the member's own diary that
no later change by the organiser could ever reach, and which never told the organiser anybody
was coming. That path still exists, for events the sheet has not yet created a calendar event
for, and only for those.

## Register interest

The lighter half of an invitation, and deliberately a different thing.

| | |
|---|---|
| `/api/attend` | puts the member **on** the organiser's calendar event. Google emails the invitation, it appears in their calendar, and every later change reaches them |
| `/api/interest` | writes their address into the event row's `Interested Emails` cell and does nothing else. No calendar entry, no email, no guest list |

It exists because an event with no date has no calendar event to be a guest of, so those rows
offered a member nothing at all to press — and because wanting to be counted is not the same
as wanting a diary entry.

Where it appears: on a card or a table row when the event has **no date**; on the event page
as a quiet second button under the invitation form, and as the whole action on an event that
cannot be joined yet.

`Interested Emails` is written by the site and by nobody else. The Apps Script owns the
columns it fills FROM the calendar — `Attendees Emails`, `Attendees` — and nothing in a
calendar event corresponds to this one, so the two never collide; they merely agree on the
name, so whichever runs first creates it. The column is listed as internal in
`lib/normalize.mjs`, so it is stripped on the way to the browser exactly as the guest list is.

The write is read-modify-write on a single cell. Two people pressing in the same second could
cost one of them their place in it; at a chapter's traffic that is a theoretical loss, and the
alternative is a database this project deliberately does not have.

## The demo data path

The calendar reads `mocks/events.json`. That file is generated:

```bash
npm run data     # data/source.tsv + data/content.py  ->  public/data/events.json
```

`data/normalize.py` builds the **demo** data from the legacy sheet snapshot in
`data/source.tsv`, and carries the repairs that messy legacy file needs. The **runtime** parser
is `lib/normalize.mjs` — it reads a sheet in the documented format and produces the same event
objects. Two files because they have two jobs; only `lib/` runs in production. Every quirk of the
sheet is handled there, once, and recorded in `data_issues[]` rather than patched silently in
a template — so a fix stays visible the next time the sheet changes.

This project is the reference implementation for
[`docs/CLOUDFLARE-POC-STANDARD.md`](docs/CLOUDFLARE-POC-STANDARD.md) — how to build a POC with
a public front end and a private data source so it deploys to Cloudflare from the first commit.
Read that before starting a similar project.
[`docs/Cloudflare-POC-standard.pdf`](docs/Cloudflare-POC-standard.pdf) is the same document for
sharing, regenerated from `docs/cloudflare-standard-print.html`.

Calendar invitations — the sheet creating real Google Calendar events and the site adding
guests to them — are in [`docs/CALENDAR-INVITATIONS.md`](docs/CALENDAR-INVITATIONS.md); the
four ways an "add to calendar" button can work are compared in
[`docs/CALENDAR-BUTTON.md`](docs/CALENDAR-BUTTON.md).

**Before wiring the live sheet, read [`docs/SHEET.md`](docs/SHEET.md)** — the 22-column
standard the sheet has to follow, and the ten things the current file gets wrong.
[`docs/EO-events-sheet-standard.pdf`](docs/EO-events-sheet-standard.pdf) is the same document
for sharing.

## Deploying to Cloudflare Pages

There is no build step and no server-side code. `serve.mjs` is a development convenience;
Cloudflare never runs it.

| Setting | Value |
|---|---|
| Framework preset | **None** |
| Build command | *(leave empty)* |
| Build output directory | `public` |
| Root directory | *(leave empty)* |

That is the whole configuration. `public/` is the only directory published, so the sheet
sources in `data/`, the documents in `docs/` and this README are never served.

The site is a hash router (`#/event/...`), so every route already resolves to `index.html` —
no `_redirects` file and no SPA rewrite rule.

`public/_headers` carries the security headers and cache policy. `serve.mjs` parses the same
file and applies its global block, so a header that breaks the site breaks it on localhost
first rather than in production.

`functions/` is compiled by Cloudflare separately and is **not** part of the build output. It
must stay at the repository root: anything inside `public/` is published as a static file, so a
Function placed there would be served as readable source and would never run.

Published at **<https://events.eoukraine.com>**.

### Cloudflare setup

Pages → Settings → Variables and secrets, for Production and Preview:

* secrets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`
* plain variable: `CLOUDFLARE_ON=1`

A newline-free paste of the private key is fine — literal `\n` sequences are handled.

Responses are cached at the edge for 120s (`stale-while-revalidate` 600s). Failures are never
cached, so the calendar recovers on the next request once the sheet is fixed.
