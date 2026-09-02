/** POST /api/unsubscribe — { token } → the subscriber stops being invited. */
import { unsubscribe } from '../../lib/subscriptions.mjs';

export async function onRequestPost(context) {
  let input = {};
  try { input = await context.request.json(); } catch { /* validated below */ }

  let body;
  try {
    const out = await unsubscribe(context.env, input.token);
    body = { ok: out.ok, message: out.message, reason: out.reason };
  } catch (err) {
    console.log(`unsubscribe: [${err.reason || 'failed'}] ${err.message}`);
    body = { ok: false, reason: err.reason || 'failed',
             message: err.publicMessage || 'That did not work. Try again in a moment.' };
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
