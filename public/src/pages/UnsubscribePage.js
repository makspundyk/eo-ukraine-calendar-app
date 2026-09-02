/**
 * UNSUBSCRIBE — #/unsubscribe/:token, and #/unsubscribe with none.
 * ===========================================================================
 * Vue: pages/unsubscribe/[[token]].vue
 *
 * Two ways in, because there have to be.
 *
 * WITH A TOKEN — from the confirmation shown when somebody joined. One button, and the token
 * is the only thing that identifies them, so nobody can remove anybody else.
 *
 * WITHOUT ONE — from the line inside a calendar invitation. An event has ONE description
 * shared by every guest, so that link cannot be personal; there is no token to put in it. The
 * page asks for the address instead. Weaker, and the honest trade: knowing an address is
 * enough to remove it. The alternative was a link that goes to a page saying "sorry, find
 * your other link", which is not a way out at all.
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
  const form = document.querySelector('[data-unsub-form]');
  const button = document.querySelector('[data-unsub]');
  const note = document.querySelector('[data-unsub-note]');
  if (!button) return;

  const send = async (payload) => {
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'One moment…';
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      note.className = `unsub-note ${body.ok ? 'good' : 'bad'}`;
      note.textContent = body.message || (body.ok ? 'Done.' : 'That link is not valid.');
      if (body.ok) { button.remove(); form?.remove(); }
      else { button.disabled = false; button.textContent = previous; }
    } catch {
      note.className = 'unsub-note bad';
      note.textContent = 'That did not work. Try again in a moment.';
      button.disabled = false;
      button.textContent = previous;
    }
  };

  if (form) {
    form.addEventListener('submit', (ev) => { ev.preventDefault();
      send({ email: form.email.value }); });
  } else {
    button.addEventListener('click', () => send({ token }));
  }
}

export function render({ token }) {
  if (!token) {
    return `
    <div class="unsub">
      <h1>Stop being invited?</h1>
      <p>Type the address you are invited on and you will not be added to new EO Ukraine
        events. Invitations you have already accepted stay in your calendar — this only stops
        future ones.</p>
      <form class="unsub-form" data-unsub-form>
        <input type="email" name="email" required autocomplete="email"
               placeholder="your@email.com" aria-label="Your email address" />
        <button type="submit" class="register" data-unsub>Unsubscribe
          <span class="arr" aria-hidden="true">→</span></button>
      </form>
      <p class="unsub-note" data-unsub-note>You can join again any time from the events page.</p>
      <p><a class="backlink" href="#/">← Back to the events</a></p>
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
