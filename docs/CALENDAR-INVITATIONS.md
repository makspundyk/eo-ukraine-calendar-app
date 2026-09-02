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

1. Open the sheet → **Extensions → Apps Script**
2. Paste [`docs/apps-script/Calendar.gs`](apps-script/Calendar.gs) over the empty file
3. **Services → + → Google Calendar API → Add** (this turns on the advanced service the script
   needs to get the event's link back)
4. Save, then reload the sheet. A new **EO Calendar** menu appears
5. **EO Calendar → Sync now**, and grant access when asked. Whoever grants it is the account
   the events belong to — this should be the manager, not a developer
6. **EO Calendar → Install hourly sync**

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
