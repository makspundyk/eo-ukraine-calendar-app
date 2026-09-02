/**
 * POST /api/attend — put a member on the organiser's real calendar event.
 * ===========================================================================
 * The last of the four options in docs/CALENDAR-BUTTON.md, and the only one where the member
 * ends up ON the organiser's event rather than holding a copy of it. Google then sends them
 * the invitation, shows them the room, and pushes every later change the organiser makes.
 *
 * WHO DOES WHAT
 *
 *   Apps Script, in the sheet    creates the event on the organiser's calendar and writes the
 *                                event id back into the sheet. It runs AS the organiser, so
 *                                the event is natively hers — no delegation needed for this.
 *   this module                  adds one attendee to that event, impersonating the organiser
 *                                through domain-wide delegation.
 *
 * The split matters: the sheet owns WHEN, the organiser owns WHERE and WHAT. This module only
 * ever appends to `attendees` — it never writes a title, a time, a location or a description,
 * so nothing the organiser types into her own event can be overwritten by a sync.
 *
 * WHY DELEGATION IS UNAVOIDABLE HERE
 * A service account acting as itself cannot invite attendees; Google refuses. It has to act
 * as a real person in the domain, which is what `subject` does, and which a Workspace admin
 * has to authorise for this exact scope.
 */
import { getAccessToken, SCOPES, SheetError } from './google-sheets.mjs';
import { readConfig } from './calendar.mjs';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars';

/**
 * Deliberately permissive: a member may register with any address they like. It rejects the
 * shapes that are certainly not addresses, and nothing else — an over-clever pattern rejects
 * real people and they have no way to appeal.
 */
const looksLikeEmail = (v) =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@,;]+@[^\s@,;.]+\.[^\s@,;]{2,}$/.test(v.trim());

/**
 * A courtesy limit, per event, in memory. Google's own quota is the real backstop; this exists
 * so a stuck script or someone holding down a button cannot send a hundred invitations from
 * the chapter's calendar in a minute.
 */
const RATE = new Map();     // eventId -> timestamps
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function withinRate(key) {
  const now = Date.now();
  const seen = (RATE.get(key) || []).filter((t) => now - t < WINDOW_MS);
  seen.push(now);
  RATE.set(key, seen);
  return seen.length <= MAX_PER_WINDOW;
}

export function readAttendConfig(env = {}) {
  return {
    ...readConfig(env),
    // A real Workspace user. Every calendar write happens as this person.
    impersonate: env.GOOGLE_IMPERSONATE_USER,
    calendarId: env.GOOGLE_CALENDAR_ID || 'primary',
  };
}

/**
 * @param {{calendarEventId:string, email:string, title?:string}} input
 * @returns {{body:object, status:number, logLine:string}}
 */
export async function addAttendee(env, input) {
  const config = readAttendConfig(env);
  const email = String(input.email ?? '').trim().toLowerCase();

  if (!config.impersonate || !config.email || !config.privateKey) {
    return {
      status: 200,
      body: { ok: false, reason: 'not_enabled',
              message: 'Invitations are not switched on yet. Use the calendar buttons below '
                     + 'and you will still have it in your diary.' },
      logLine: 'attend: GOOGLE_IMPERSONATE_USER or the service account is not configured',
    };
  }
  if (!input.calendarEventId) {
    return {
      status: 200,
      body: { ok: false, reason: 'no_event',
              message: 'There is no invitation for this event yet. Use the calendar buttons '
                     + 'below, or try again shortly.' },
      logLine: 'attend: the row has no Calendar Event ID',
    };
  }
  if (!looksLikeEmail(email)) {
    return {
      status: 200,
      body: { ok: false, reason: 'bad_email',
              message: 'That does not look like an email address — check it and try again.' },
      logLine: 'attend: rejected a malformed address',
    };
  }
  if (!withinRate(input.calendarEventId)) {
    return {
      status: 200,
      body: { ok: false, reason: 'rate_limited',
              message: 'That is a lot of invitations at once. Try again in a minute.' },
      logLine: `attend: rate limit hit for ${input.calendarEventId}`,
    };
  }

  try {
    const token = await getAccessToken({
      email: config.email, privateKey: config.privateKey,
      scope: SCOPES.calendar, subject: config.impersonate,
    });

    const base = `${CALENDAR_API}/${encodeURIComponent(config.calendarId)}`
               + `/events/${encodeURIComponent(input.calendarEventId)}`;
    const auth = { authorization: `Bearer ${token}` };

    // Read first: attendees must be APPENDED. PATCH replaces the whole array, so sending only
    // the new person would silently remove everybody already invited.
    const current = await fetch(base, { headers: auth });
    if (!current.ok) {
      const detail = await current.text().catch(() => '');
      throw new SheetError('event_missing',
        `Could not read the calendar event (${current.status}). ${detail.slice(0, 200)}`,
        { publicMessage: 'That invitation could not be found. It may have been cancelled.' });
    }
    const event = await current.json();
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];

    // Returning the event's own link matters more than it looks. Google decides whether an
    // invitation email arrives and whether a personal Gmail account auto-adds it — a consumer
    // account often does neither, so a guest can be correctly on the list and still see
    // nothing. The link is the one thing that always works.
    const link = event.htmlLink || '';

    if (attendees.some((a) => String(a.email).toLowerCase() === email)) {
      return {
        status: 200,
        body: { ok: true, already: true, link,
                message: 'You are already on the guest list — no need to do it again.' },
        logLine: `attend: already invited to ${input.calendarEventId}`,
      };
    }

    const res = await fetch(`${base}?sendUpdates=all`, {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        attendees: [...attendees, { email, responseStatus: 'needsAction' }],
        // Members must not be able to see each other's addresses through a public button.
        guestsCanSeeOtherGuests: false,
        guestsCanInviteOthers: false,
        guestsCanModify: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new SheetError('invite_failed',
        `Calendar refused the invitation (${res.status}). ${detail.slice(0, 300)}`,
        { publicMessage: 'The invitation could not be sent just now. Try again in a moment.' });
    }

    return {
      status: 200,
      body: { ok: true, link,
              message: 'You are on the guest list. Google will email the invitation.' },
      logLine: `attend: invited one guest to ${input.calendarEventId}`,
    };
  } catch (err) {
    return {
      status: 200,
      body: { ok: false, reason: err.reason || 'failed',
              message: err instanceof SheetError
                ? err.publicMessage
                : 'The invitation could not be sent just now. Try again in a moment.' },
      // The address and Google's own words stay here, out of the response.
      logLine: `attend: [${err.reason || 'failed'}] ${err.message}`,
    };
  }
}
