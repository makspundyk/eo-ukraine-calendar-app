/**
 * POST /api/attend — { event, email } → the member is added to the organiser's event.
 *
 * The calendar event id is looked up SERVER-SIDE from our own event id. It is never accepted
 * from the request: taking an arbitrary event id from a form would let anyone add guests to
 * any event on the calendar.
 */
import { resolveCalendarEventId } from '../../lib/calendar.mjs';
import { addAttendee } from '../../lib/attend.mjs';

export async function onRequestPost(context) {
  let input = {};
  try { input = await context.request.json(); } catch { /* handled below */ }

  const match = await resolveCalendarEventId(context.env, String(input.event ?? ''))
    .catch(() => null);

  const { status, body, logLine } = await addAttendee(context.env, {
    calendarEventId: match?.calendarEventId,
    email: input.email,
  });
  console.log(logLine);

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
