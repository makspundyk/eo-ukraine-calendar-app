/**
 * POST /api/interest — { event, email, subscribe? } → the address is recorded against the row.
 *
 * No calendar entry and no email: this is a note to the organiser, not an invitation. See
 * lib/interest.mjs for why it is a separate thing from /api/attend.
 */
import { registerInterest } from '../../lib/interest.mjs';
import { subscribe } from '../../lib/subscriptions.mjs';

export async function onRequestPost(context) {
  let input = {};
  try { input = await context.request.json(); } catch { /* handled below */ }

  const { status, body, logLine } = await registerInterest(context.env, {
    event: String(input.event ?? ''), email: input.email,
  });
  console.log(logLine);

  // Joining the chapter's list is a second, independent action. It must not be able to fail
  // the thing the member actually pressed, so it happens afterwards and its failure is logged.
  if (body.ok && input.subscribe) {
    try {
      const sub = await subscribe(context.env, { email: input.email });
      if (sub.ok) body.subscribed = true;
      if (sub.ok && sub.token) body.unsubscribe = `/#/unsubscribe/${sub.token}`;
      else if (!sub.ok) console.log(`interest: subscribe declined [${sub.reason}]`);
    } catch (err) { console.log(`interest: subscribe failed [${err.reason}] ${err.message}`); }
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
