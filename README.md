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

### Environment

Same names in both places. **Nothing here is ever read by browser code.**

| Name | Cloudflare | Local |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | secret | `.env` |
| `GOOGLE_PRIVATE_KEY` | secret | `.env` |
| `GOOGLE_SPREADSHEET_ID` | secret | `.env` |
| `CLOUDFLARE_ON` | `1` | `0` |
| `GOOGLE_SHEET_RANGE` | optional | optional |

`CLOUDFLARE_ON` is **configuration, not a security boundary**. It is read server-side for the
startup log only; the secrets are server-side either way, and no browser code depends on it.
Nothing breaks if it is unset.

**The range defaults to `EventCalendar!A1:V9999`, not `A3:V9999`.** This project reads the
sheet *by header name* (rule 1 of [`docs/SHEET.md`](docs/SHEET.md)), so the header row has to
be inside the range — `A3` would cut it off and there would be nothing to map columns by. The
parser locates the header wherever it sits, so a title row above it is fine.

### Prerequisites

1. Google Sheets API enabled on the project.
2. A service account with a JSON key.
3. The sheet **shared with the service account address as Viewer**. Nothing else grants access
   — the sheet must not be made public and "Publish to web" must not be used.

**The service-account JSON must never be committed, and must not live inside this repository.**
Keep it wherever you downloaded it and point `.env` at it, or paste the key into `.env`. Both
`.env` and `.dev.vars` are gitignored.

## Local setup

```bash
npm install
cp .env.example .env      # then fill it in
npm run dev               # http://localhost:4100
```

`.env` accepts the private key directly, or a path to the downloaded JSON **outside the repo**:

```
GOOGLE_APPLICATION_CREDENTIALS=/Users/you/Downloads/service-account.json
```

That convenience exists locally only; Cloudflare always uses the secrets.

| Command | |
|---|---|
| `npm run dev` | the app plus `/api/calendar`, from `.env`. What you use day to day |
| `npm run dev:cf` | the same app through **Wrangler**, so the real Pages Function executes. Reads the same `.env` and passes it as bindings, so there is no second secrets file |
| `npm test` | the sheet parser, against fixtures. No network, no credentials |
| `npm run data` | regenerate the demo data from the legacy snapshot |
| `npm run shots` | screenshot every view; fails on a console error |

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

### Cloudflare setup

Pages → Settings → Variables and secrets, for Production and Preview:

* secrets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`
* plain variable: `CLOUDFLARE_ON=1`

A newline-free paste of the private key is fine — literal `\n` sequences are handled.

Responses are cached at the edge for 120s (`stale-while-revalidate` 600s). Failures are never
cached, so the calendar recovers on the next request once the sheet is fixed.
