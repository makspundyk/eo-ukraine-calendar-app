/**
 * POST /api/subscribe — { email, name? } → the address joins EventCalendarSubscriptions.
 *
 * Answers the same way whether the address was new or already there. Saying "already
 * subscribed" would turn the form into a way of testing who is a member of this chapter.
 */
import { subscribe } from '../../lib/subscriptions.mjs';

export async function onRequestPost(context) {
  let input = {};
  try { input = await context.request.json(); } catch { /* validated below */ }

  let body;
  try {
    const out = await subscribe(context.env, { email: input.email, name: input.name });
    if (out.log) console.log(`subscribe: ${out.log}`);
    // The token is the unsubscribe key. It goes back to the person who just gave us their
    // address, and to nobody else.
    body = out.ok
      ? { ok: true, message: out.message, unsubscribe: out.token ? `/#/unsubscribe/${out.token}` : '' }
      : { ok: false, reason: out.reason, message: out.message };
  } catch (err) {
    console.log(`subscribe: [${err.reason || 'failed'}] ${err.message}`);
    body = { ok: false, reason: err.reason || 'failed',
             message: err.publicMessage || 'That did not work. Try again in a moment.' };
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
