# Invitations: the sheet creates the event, the site adds the guests

The workflow, end to end:

```
manager marks a row Published
        │
        ▼  Apps Script, inside the sheet, running AS the manager
one real event on the manager's Google Calendar
        │      event id + link written back into the sheet
        ▼
manager opens it in Google Calendar and adds the room, the agenda, the video link
        │
        ▼  member clicks "Send it to me" on the website, types their address
POST /api/attend  →  service account, acting as the manager  →  events.patch
        │
        ▼
the member is a guest on the organiser's event. Every later change reaches them.
```

Two halves, deliberately with different authority:

* **Creating** the event needs no delegation at all. Apps Script runs as whoever authorised
  it, so the event is natively theirs.
* **Adding a guest** does need delegation, because a service account acting as itself cannot
  invite attendees. It has to act *as* a person in the domain.

---

## Who owns what — the rule that keeps the sync from fighting the manager

| | Owner | Synced |
|---|---|---|
| Title, Start/End Date, Start/End Time, Timezone | **the sheet** | every sync |
| Location and room, Description, agenda, video link, colour, reminders | **the manager** | **created once, never touched again** |
| Guest list | the website adds; the manager may remove | appended only |

On creation the script fills a starting description and location from the sheet. **After that
it only ever corrects the title and the times.** A room booked by hand at 09:00 is still there
after the 10:00 sync. Without this rule an hourly sync silently undoes the manager's work, and
she stops trusting it within a week.

A row that stops being Published gets its event **cancelled, not deleted**, so guests are told
rather than having it disappear from their calendars.

---

## What to set up

### 1. Google Cloud — the service account you already have

* Project **eo-ukraine**, service account
  **`eo-ukraine-calendar@eo-ukraine.iam.gserviceaccount.com`**
* **Enable the Google Calendar API** in that project — APIs & Services → Library → Google
  Calendar API → Enable. (Sheets is already on.)
* On the service account, tick **Enable Google Workspace Domain-wide Delegation** if it is not
  already on, and note its **OAuth Client ID** — the numeric `client_id` in the key file:

  ```
  116640967835794249132
  ```

  That number is a public identifier, not a credential.

### 2. Google Workspace admin console — the one step only an admin can do

**Security → Access and data control → API controls → Domain-wide delegation → Add new**

| Field | Value |
|---|---|
| Client ID | `116640967835794249132` |
| OAuth scopes | `https://www.googleapis.com/auth/calendar.events` |

One scope, and the narrowest one that works: it permits reading and writing **events**, not
managing calendars, and nothing outside Calendar. Do not add
`https://www.googleapis.com/auth/calendar` — it is broader and unnecessary.

Delegation can take a few minutes to take effect. Until it does, `/api/attend` answers
`auth_failed` and the log says which scope the admin still has to authorise.

### 3. The environment

| Name | | Value |
|---|---|---|
| `GOOGLE_IMPERSONATE_USER` | **new** | the manager, e.g. `admin@eoukraine.com`. Every calendar write happens as this person, so it must be a real user in the Workspace domain |
| `GOOGLE_CALENDAR_ID` | optional | `primary` by default — that user's own calendar. Set it to a shared chapter calendar's id if the events live there instead |

Add both in Cloudflare → Settings → Variables and secrets, and to `.env` locally. Neither is a
secret; they are plain variables.

### 4. The sheet — paste in the Apps Script

> **"EO Calendar" is a menu that appears in the spreadsheet.** It is not a Google Calendar, and
> there is no calendar to create: events go to the ordinary Google Calendar of whoever
> authorises the script. Every Google account already has one.

1. Open the sheet → **Extensions → Apps Script**
2. Paste [`docs/apps-script/Calendar.gs`](apps-script/Calendar.gs) over everything in `Code.gs`
3. **Services → + → Google Calendar API → Add**. It appears in the left sidebar as `Calendar`.
   This is the advanced service the script needs to read back the event's link
4. Rename the project from *Untitled project* to something like *EO calendar sync*, and
   **save** — ⌘S. An unsaved script will not run
5. **Authorise it, as the manager.** The account that grants access is the account the events
   belong to, so sign in as her, not as a developer. Two ways:
   * from the script editor: choose **`syncNow`** in the function dropdown (it says `onOpen` by
     default — that one only builds the menu) and press **Run**
   * or reload the spreadsheet tab, and use **EO Calendar → Sync now**

   Google will say *"Google hasn't verified this app"*. That is expected for a script you
   wrote yourself: **Advanced → Go to (project name) (unsafe) → Allow**. It is asking to manage
   the calendar of the account approving it, which is exactly the intent
6. **EO Calendar → Which calendar am I writing to?** — it prints the calendar's name and id,
   and the account it is running as. Set `GOOGLE_CALENDAR_ID` to that id
7. **EO Calendar → Install hourly sync** — this also installs the on-edit check below

**The menu only appears after the spreadsheet is reloaded**, because `onOpen` runs when the
sheet opens. If it is not there, reload the tab.

### What the script does about incomplete rows

A row can be marked Published before it is ready. The script never creates a half-finished
event, and it says which rows it skipped and why.

**Required before a row is published at all** — the same three as `SHEET.md`:
`Title`, `Type`, `Registration URL`. Without the link the Register button is dead; without the
type the event falls outside every filter.

It also reports a `Start Date` that is not `YYYY-MM-DD`, an `End Date` before the start, a time
that is not `HH:MM`, and an `End Time` with no `Start Time`.

Three places it is caught:

| When | What happens |
|---|---|
| As you mark a row Published | The row turns pink and the Status cell gets a note listing exactly what is missing. The note and the colour clear themselves when the row is fixed |
| **EO Calendar → Check published rows** | Every incomplete published row, listed at once. Run it before announcing a season |
| Every sync | Incomplete rows are skipped, and the summary names them |

**It does not revert the cell.** People set the status first and fill the row afterwards, and a
script that undoes their typing gets switched off within a day. It flags, it does not fight.

### A published event with no date yet

That is a legitimate state, not an error — the website has a "Dates to be confirmed" section
for it, and the script treats it as such: it is skipped with a note saying so, and **no hook is
needed to catch the moment a date is added.**

The sync is idempotent: it looks at every published row every time. Type the date in, and the
next hourly run creates the event and writes its id back. **EO Calendar → Sync now** does it
immediately if you do not want to wait.

### The `Calendar Event ID` column

The script adds it and fills it. It is the difference between creating and updating:

| The cell | What the sync does |
|---|---|
| empty | creates a new event, writes the id and the link back |
| has an id | updates **only** the title and the times on that event |
| has an id, row no longer Published | **cancels** the event and **keeps the id** |
| has an id, row published again | brings the same event back — the guests already on it are still on it |
| has an id, but the event was deleted in Google | creates a fresh one and replaces the id, rather than failing forever |

The fourth row is the reason the id is kept rather than cleared on unpublishing. Clearing it
would mean re-publishing built a *second* event, and everybody already invited would be sitting
on the first one, which they had been told was cancelled.

**Never type in `Calendar Event ID`.** It is the only link between the row and the real event.

#### Which calendar should the events live on?

`CALENDAR_ID` at the top of the script decides, and it must match `GOOGLE_CALENDAR_ID` on the
website or invitations will look for events on a calendar they are not on.

| | |
|---|---|
| **`'primary'`** — the manager's own calendar | Nothing to set up. Right for getting started. Its weakness is that the events belong to one person: if she leaves the chapter, they leave with her |
| **A shared calendar** — `c_…@group.calendar.google.com` | Create one in Google Calendar → *Other calendars → + → Create new calendar*, name it *EO Ukraine events*, then share it with the manager as **Make changes to events**. Paste its id into `CALENDAR_ID`. Better for a chapter: it outlives whoever set it up, and a second admin can be added without handing over an account |

Starting with `'primary'` and moving later is fine — but the events do not follow. Move before
there are many.

The script adds two columns the first time it runs, and fills them itself:

| Column | Written by | What it does |
|---|---|---|
| `Calendar Event ID` | the script | how `/api/attend` finds the event. Never edit it by hand |
| `Calendar Link` | the script | makes the website offer the invitation instead of a copy |

---

## What the member sees

If the row has a `Calendar Event ID`, the event page shows one field and a button:

> **Get the calendar invitation**  ·  `your@email.com`  →  **Send it to me**

Then Google emails them the invitation and it appears in their calendar with the room on it.

If the row has no calendar event, the page falls back to the ordinary **Google Calendar** and
**Download .ics** buttons, which make a copy. Nothing has to be configured for that, and it
keeps working if any of the above is not set up.

---

## What is deliberately not done

* **The calendar event id never reaches the browser.** The page is told only `invitable: true`.
  Accepting an event id from the form would let anyone add guests to any event on the calendar.
* **Existing guests are read before writing.** `PATCH` replaces the whole `attendees` array, so
  sending only the new person would silently remove everybody already invited. This is the
  single easiest way to do real damage here, and there is a test asserting it does not happen.
* **`guestsCanSeeOtherGuests: false`.** Otherwise a public button publishes the attendee list to
  every attendee.
* **Addresses are not stored.** The address goes to Google and nowhere else — not to a log, not
  to a response body, not to the sheet. There is a test asserting no address appears in any
  response.
* **Twenty invitations per event per minute.** Google's quota is the real backstop; this stops a
  stuck script or a held-down button sending a hundred invitations from the chapter's calendar.

---

## If it does not work

| Symptom | Cause |
|---|---|
| `auth_failed`, log says `unauthorized_client` | step 2 not done, or the scope does not match exactly |
| `auth_failed`, log says `invalid_grant … Invalid email or User ID` | `GOOGLE_IMPERSONATE_USER` is not a real user in the domain |
| `not_enabled` | `GOOGLE_IMPERSONATE_USER` is unset |
| `no_event` | the row has no `Calendar Event ID` — run the sync |
| `event_missing` | the id is stale, or `GOOGLE_CALENDAR_ID` points at a different calendar |

The reason is always in the server log with the full detail; the browser only ever gets the
short version.
