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

### When events are created, and when changes are sent

| Moment | What happens |
|---|---|
| A row becomes `Published`, is complete, has a date, and `Calendar Event ID` is empty | The event is created **immediately**, and everyone in `DEFAULT_GUESTS` is invited |
| A date, time, timezone or title is changed on a row that already has an event | Queued, and sent **about five minutes after you stop editing** |
| Anything else changes — room, description, guests | Nothing. The organiser owns those |
| Hourly | A sweep catches anything the above missed |

**Why the five-minute wait.** Changing a date, then a start time, then an end time is three
edits describing *one* change. Sending each one moves the event three times and emails every
guest three times. The clock **restarts on every edit**, so only a row you have stopped
touching is sent — you finish, then the calendar catches up once.

The queue is keyed by the calendar event id, not the row number, so sorting the sheet while
something is queued cannot send the update to the wrong event.

If you know you are finished: **EO Calendar → Apply pending changes now**.

### What the invitation says

The description is composed from the sheet when the event is created, written to be read in a
Google Calendar notification email — no styling worth relying on, and a reader deciding in
about four seconds. Reason first, then facts, then the action:

```
Ninety minutes inside a real EO forum — the format, not a description of it.

WHEN
Wednesday, 16 September 2026
15:30 – 17:00 CET (1 hour 30 minutes)

WHERE
Online — Zoom

SPEAKER
Maria Novak — Certified Forum Facilitator

WHAT YOU GET OUT OF IT
• Experience the Forum format from the inside
• Practice experience sharing instead of advice giving
• Understand confidentiality and trust principles

WHO IT IS FOR
Prospective EO members and members who want to understand the Forum experience.

REGISTER
https://example.com/eo-ukraine/forum-test-drive-september

Full details: https://…/#/event/forum-test-drive-september-2026-09-16
```

Every section is dropped when its column is empty, so a thin row produces a short invitation
rather than a scaffold of empty headings.

**The date, time and place are repeated** even though the event already carries them in its own
fields. A forwarded invitation, a notification on a watch, a text-only mail client — all of
them can show the description with none of the chrome around it.

**Plain text, not HTML.** Calendar clients render description markup inconsistently, and the
organiser edits this by hand afterwards; markup she did not write would be in her way.

Set the "Full details" address once: **EO Calendar → Set website address…**. Leave it unset and
that line is omitted.

Written **once, at creation**. Every later sync corrects only the title and the times, so
anything the organiser adds here survives.

### Default guests

**EO Calendar → Set default guests…**, comma separated. They are invited to every **new** event
as it is created, so the organisers get it in their own calendars without anyone remembering.

Stored as a Script Property rather than in `Calendar.gs`, because they are real personal
addresses and that file is in a public repository. Leave it empty and no one is added.

Changing it does not touch events that already exist — it applies to the next one created.

### A published event with no date yet

That is a legitimate state, not an error — the website has a "Dates to be confirmed" section
for it, and the script treats it as such: it is skipped with a note saying so, and **no hook is
needed to catch the moment a date is added.**

The sync is idempotent: it looks at every published row every time. Type the date in, and the
next hourly run creates the event and writes its id back. **EO Calendar → Sync now** does it
immediately if you do not want to wait.

### The `Attendees` column — who is coming

The hourly sync writes the guest list back into an **`Attendees`** column, so the chapter can
see, count and filter it in the sheet without opening Calendar. **EO Calendar → Refresh
attendees now** does it immediately.

```
Anna Koval <anna@example.com> · no
Zoe Adams <zoe@example.com> · yes
maxpundyk@gmail.com · invited
```

`yes` · `no` · `maybe` · `invited` — the reply, in words. Meeting rooms and the calendar itself
are filtered out. The cell note records how many and when it was read.

**On the names.** Google supplies an attendee's name only when somebody typed one, or when the
person is in the same Workspace directory. **A personal `@gmail.com` address usually arrives
with no name at all**, and there is no API that turns an address into one. So the name appears
when Google gives it and the address stands alone when it does not — inventing "Maxpundyk" from
`maxpundyk@gmail.com` would look like data and be a guess.

If you need real names, ask for them at registration and keep them there; the calendar is not
the place that knows.

**This column is personal data.** It is treated as internal — `lib/normalize.mjs` strips it
alongside `Notes` and `Event Owner`, so it never reaches `/api/calendar` or the browser. There
is a test asserting an address in that column does not appear in the published payload.

The list is sorted and written **only when it has changed**, so a quiet hour costs no writes.

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

## Subscriptions

A second tab, **`EventCalendarSubscriptions`**, holds the list. **EO Calendar → Set up
subscriptions** creates it, with `Unsubscribed` as a real checkbox:

| Email | Date Subscribed | Full Name | Unsubscribed | Token |
|---|---|---|---|---|
| `anna@example.com` | `2026-09-02T…` | Anna Koval | ☐ | `k3f9…` |

**Anyone whose `Unsubscribed` box is not ticked gets invited.** Ticking it by hand works exactly
as well as clicking the link — which is what a secretary will actually do when somebody asks
them in person.

`Token` is the only column nobody types. It is what makes an unsubscribe link safe: without it
a link would have to carry an address, and anyone could remove anyone by editing the URL — and
that link travels inside a calendar invitation, which gets forwarded.

### How people join

* **The form at the foot of the events page** — name and address, "Keep me posted"
* **The tickbox on an invitation** — *"Invite me to future events too"*, ticked by default. It
  is a separate action from the invitation, attempted afterwards, so it can never make the
  invitation the member actually asked for fail

The `.ics` feed is still offered next to the form for anyone who would rather give no address
at all.

### Inviting the list to an event

Two new columns on the events tab:

| Column | |
|---|---|
| `Invite Subscribers?` | a checkbox. Tick it when the event is ready |
| `Subscribers Invited At` | written by the script, and the reason nobody is ever invited twice |

**Ticking the box does not send anything for five minutes.** There is no unsend on a mailing to
the whole list, so the tick is recorded and acted on only if it is *still* ticked five minutes
later. Untick it before then and nothing happens — the sheet says "Cancelled — nobody was
invited."

When it fires, every subscriber who has not unsubscribed is **appended** to the event.
Everybody already on it — the default guests, anyone who asked through the site — keeps the
reply they already gave. Their `Full Name` is sent along, so the guest list shows people rather
than addresses.

### Leaving

Every invitation carries a line pointing at `/#/unsubscribe`. That page cannot identify anyone
on its own — **a calendar invitation is shared by every guest, so it cannot carry one person's
token** — so it explains where their personal link is rather than asking for an address, which
would let anyone remove anyone.

The personal link, `/#/unsubscribe/<token>`, is shown once: in the confirmation, to the person
who just gave us the address. That is the only moment we know for certain who they are.

### One more scope

Writing to the sheet needs `https://www.googleapis.com/auth/spreadsheets` added to the same
domain-wide delegation entry. Reading uses `spreadsheets.readonly`; there is no narrower write
scope than "all spreadsheets this user can reach", so authorise it deliberately.

Until it is authorised, subscribing answers *"Subscriptions are not switched on yet"* and the
site keeps offering the `.ics` feed, which needs nothing.

## Testing it

```bash
npm run check
```

Reads only — it never creates, edits or invites. Each step is separate, so a failure names the
one that broke and what to change:

```
1. the service account    key loaded
2. the spreadsheet        rows read, events parsed, how many carry a Calendar Event ID
3. delegation             Google issued a token acting as GOOGLE_IMPERSONATE_USER
4. the calendar           events read on GOOGLE_CALENDAR_ID
```

Step 4 lists `events`, not the calendar's metadata. The granted scope is `calendar.events`,
which deliberately does **not** permit reading calendar metadata — a metadata call returns 403
even when everything is correct, so checking it would report a failure that is not one.

Then, end to end:

1. **In the sheet** — mark a complete row `Published`, then **EO Calendar → Sync now**. It
   reports what it created and writes a `Calendar Event ID` into the row
2. **In Google Calendar** — the event is on the shared calendar. Change the room; nothing in
   the sheet changes, which is the point
3. `npm run check` again — step 4 now lists it
4. **On the site** — `npm run dev`, open that event. It shows *"Get the calendar invitation"*
   rather than the copy buttons. Enter an address you control and send it
5. **In that inbox** — the invitation arrives, with the room on it
6. **Back in Google Calendar** — the guest is on the event's guest list

If step 4 still shows the copy buttons, the row has no `Calendar Event ID` yet: run the sync.

## "It says I am on the list, but nothing arrived"

The two halves are independent. Being **on the guest list** is what the site controls and can
prove; whether an **email arrives** is Google's decision and depends on the recipient's account.

Check the guest list first — that is the fact:

```bash
npm run check     # then open the event in Google Calendar and look at the guests
```

If the address is there with `needsAction`, the site did its job. Then:

* **A personal `@gmail.com` account often does not auto-add** an invitation from a shared
  Workspace calendar. Gmail → Settings → General → *Events from Gmail* controls it, and the
  default is not "always"
* **Check spam.** Invitations from a calendar address rather than a person are a common
  false positive
* **Google only emails when the guest list actually changes.** Pressing the button a second
  time finds the address already there and sends nothing — by design, or a stuck form would
  mail somebody repeatedly

This is why the confirmation offers **"Open it in Google Calendar"** rather than only saying
*sent*. The link works regardless of what the recipient's mail settings do, and it is the same
event — not a copy.

## If it does not work

| Symptom | Cause |
|---|---|
| `auth_failed`, log says `unauthorized_client` | step 2 not done, or the scope does not match exactly |
| `auth_failed`, log says `invalid_grant … Invalid email or User ID` | `GOOGLE_IMPERSONATE_USER` is not a real user in the domain |
| `not_enabled` | `GOOGLE_IMPERSONATE_USER` is unset |
| `no_event` | the row has no `Calendar Event ID` — run the sync |
| `event_missing` | the id is stale, or `GOOGLE_CALENDAR_ID` points at a different calendar |
| 403 `insufficient authentication scopes` | the delegated scope is missing or misspelled in the admin console |
| 404 on the calendar | `GOOGLE_CALENDAR_ID` is wrong, or the calendar is not shared with `GOOGLE_IMPERSONATE_USER` |

**Delegation is per domain.** The service account can only act as users in the domain whose
admin console granted it. Granting it in `ideainyou.com` means `GOOGLE_IMPERSONATE_USER` must
be an `@ideainyou.com` address; an `@eoukraine.com` one fails with
`invalid_grant: Invalid email or User ID`. That user then needs *Make changes to events* on the
calendar — sharing is what connects the two domains, not the delegation.

The reason is always in the server log with the full detail; the browser only ever gets the
short version.
