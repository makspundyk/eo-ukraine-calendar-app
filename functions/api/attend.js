/**
 * POST /api/attend — { event, email } → the member is added to the organiser's event.
 *
 * The calendar event id is looked up SERVER-SIDE from our own event id. It is never accepted
 * from the request: taking an arbitrary event id from a form would let anyone add guests to
 * any event on the calendar.
 */
import { resolveCalendarEventId } from '../../lib/calendar.mjs';
import { addAttendee } from '../../lib/attend.mjs';
import { subscribe } from '../../lib/subscriptions.mjs';

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

  // Ticking the box is a second, independent action: joining the list. It must not be able to
  // fail the invitation the member actually asked for, so it is attempted afterwards and its
  // failure is logged rather than returned.
  if (body.ok && input.subscribe) {
    try {
      const sub = await subscribe(context.env, { email: input.email });
      if (sub.ok) body.subscribed = true;
      if (sub.ok && sub.token) body.unsubscribe = `/#/unsubscribe/${sub.token}`;
      else if (!sub.ok) console.log(`attend: subscribe declined [${sub.reason}]`);
    } catch (err) { console.log(`attend: subscribe failed [${err.reason}] ${err.message}`); }
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
