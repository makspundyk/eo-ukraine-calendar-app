/**
 * UNSUBSCRIBE — #/unsubscribe/:token, and #/unsubscribe with none.
 * ===========================================================================
 * Vue: pages/unsubscribe/[[token]].vue
 *
 * The link inside a calendar invitation is shared by every guest on that event, so it cannot
 * carry anybody's token. It lands here without one, and this page explains where a personal
 * link is — rather than asking for an address, which would let anyone remove anyone.
 *
 * With a token, one button. No sign-in, nothing to remember, and the token is the only thing
 * that identifies the person.
 */
import { escape as e } from '../format.js';

export const meta = {
  id: 'V4', name: 'Unsubscribe', route: '#/unsubscribe/:token',
  vue: 'pages/unsubscribe/[[token]].vue', apis: ['POST /api/unsubscribe'], blocks: ['Confirm'],
};

export async function load(route) {
  return { token: route.params.token || '' };
}

export function mount({ token }, _ctx) {
  const button = document.querySelector('[data-unsub]');
  if (!button) return;
  const note = document.querySelector('[data-unsub-note]');

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'One moment…';
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      note.className = `unsub-note ${body.ok ? 'good' : 'bad'}`;
      note.textContent = body.message || (body.ok ? 'Done.' : 'That link is not valid.');
      if (body.ok) button.remove();
      else { button.disabled = false; button.textContent = 'Try again'; }
    } catch {
      note.className = 'unsub-note bad';
      note.textContent = 'That did not work. Try again in a moment.';
      button.disabled = false;
      button.textContent = 'Try again';
    }
  });
}

export function render({ token }) {
  if (!token) {
    return `
    <div class="unsub">
      <h1>Leaving the list</h1>
      <p>Your personal unsubscribe link is at the bottom of the message you received when you
        joined. It is unique to you, which is what stops anybody else removing you.</p>
      <p class="muted">Lost it? Reply to any invitation, or write to the chapter, and somebody
        will take you off the list.</p>
      <p><a class="register ghost sm" href="#/">Back to the events</a></p>
    </div>`;
  }
  return `
  <div class="unsub">
    <h1>Stop being invited?</h1>
    <p>You will no longer be added to new EO Ukraine events. Invitations you have already
      accepted stay in your calendar — this only stops future ones.</p>
    <button class="register" data-unsub type="button">Unsubscribe
      <span class="arr" aria-hidden="true">→</span></button>
    <p class="unsub-note" data-unsub-note>You can join again any time from the events page.</p>
    <p><a class="backlink" href="#/">← Back to the events</a></p>
  </div>`;
}
