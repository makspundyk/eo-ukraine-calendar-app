# "Add to calendar" — the four options, and which to use

There are four different things a calendar button can mean, and they differ in one respect
that decides everything: **whether the member gets a copy, or the organiser's actual event.**

| | What it does | Organiser edits later reach the member? | Cost to set up |
|---|---|---|---|
| **1. Add to calendar** | a copy on the member's calendar | **no** | none — shipped |
| **2. Subscribe to the feed** | the whole calendar, re-fetched forever | **yes** | none — shipped |
| **3. Calendar Link column** | opens the organiser's real event | **yes** | paste one URL per event |
| **4. Invite on click** | adds the member as a guest by email | yes | Workspace delegation + collecting emails |

**Use 1 and 2 as the default, and 3 whenever the event has a room to change.** 4 is almost
never worth it — see the bottom.

---

## 1. Add to calendar — shipped

On every event page: **Google Calendar** and **Download .ics**. The `.ics` covers Apple
Calendar, Outlook and everything else, and is generated in the browser from the event already
on screen, so it works on the demo calendar too.

The entry carries the title, the real start and end, the venue, the speaker, the registration
link and a link back to the event page — so a member looking at their calendar in three weeks
can still act on it.

**Its limit, stated on the page rather than hidden:** this is a *copy*. Move the event and the
copy still says the old date. Every button of this kind works this way; it is the format, not
the implementation.

**Times are converted to UTC** using the event's timezone resolved *for that date*, so a talk
at 15:30 CET is 14:30Z in January and 13:30Z in September. Getting this wrong puts every
afternoon event an hour or two out, and it looks plausible enough that nobody notices.

## 2. Subscribe to the feed — shipped

`/api/calendar.ics` is the whole calendar as a subscription. A member subscribes once, and
their calendar re-fetches it: a moved date, a changed room, a cancelled event all arrive on
the next refresh. There is a **Subscribe** link at the foot of the events page.

This is the honest answer to "the manager edits it and everyone sees the change" — with no
Google Calendar to maintain, no emails collected, and no write access to anything.

**How fast is a refresh?** Apple Calendar and Outlook poll every few hours and can be set to
poll more often. **Google Calendar is slow with external feeds — often many hours** — and the
interval is not something the publisher controls. So a feed is right for "the season is in my
calendar and stays right", and wrong for "we moved the room this morning".

If the feed cannot be read, it returns **503 and no body** rather than an empty calendar. An
empty-but-valid calendar would tell every subscriber the whole season had been cancelled.

## 3. `Calendar Link` — one optional column, and the one to reach for

Add a column called **`Calendar Link`** to the sheet. The organiser creates the event in
Google Calendar as they normally would — room, description, guest list, video link — then
copies its URL into that cell.

The button then reads **“Open the calendar invitation”** and goes to that event. There is only
ever *one* event, so anything the organiser changes is what everyone sees. No copy to drift.

This is the best ratio of value to effort in the whole list: no API, no credentials, no emails,
no code beyond reading one more column — and it gives the property that actually matters.

Leave the cell empty and the event falls back to option 1 automatically, so it can be used for
the two events that need a room and skipped for the rest.

**Make the calendar itself readable** (public, or shared with the chapter) or the link opens a
permission wall. Test it while signed out before announcing.

## 4. Invite on click — the one to avoid for now

The idea: a member clicks, we add their email as a guest on the organiser's event.

Real, and generally not worth it:

- **A service account cannot reliably invite attendees.** It needs Google Workspace
  **domain-wide delegation** so it can act as a user in the domain; without it, adding
  attendees is restricted. That is a Workspace admin decision, not a code change.
  ([Google: inviting attendees](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events))
- **It means collecting email addresses** — a form, consent, storage, and a reason to keep
  them. Everything above collects nothing.
- **It needs write access to a calendar**, so a bug can now damage the organiser's real events
  rather than just failing to read.
- **The guest list becomes visible to guests** unless `guestsCanSeeOtherGuests` is set false —
  publishing who is attending, which nobody asked for.

Option 3 gets almost all the benefit for none of this. Revisit 4 only if RSVPs from the site
itself become a requirement, and then treat it as its own project with its own consent flow.

---

## What the sheet needs

Nothing, for options 1 and 2 — they work from the columns already in `SHEET.md`.

For option 3, one optional column:

| Column | | Format | Example |
|---|---|---|---|
| `Calendar Link` | optional | the URL of the Google Calendar event | `https://calendar.google.com/calendar/event?eid=…` |

To get it: open the event in Google Calendar → **⋮ → Publish event**, or open the event and
copy the address from **“Copy link to event”**. Paste it in. Leave it blank for events that do
not need it.
