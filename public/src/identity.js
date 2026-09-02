/**
 * The remembered address.
 * ===========================================================================
 * Vue: composables/useIdentity.ts — the same three exported groups (read, write, ask).
 *
 * There is no account here, and there must not be one: a chapter calendar that asks a member
 * to make a password before they can be invited to an evening has lost most of them at the
 * password. What actually costs people something is retyping the same address on every event,
 * so that — and only that — is what is remembered.
 *
 * The bargain is stated where it is made:
 *
 *   asked once      after an invitation or a subscription has ALREADY succeeded, never
 *                   before. Interrupting somebody to ask about storage before they have got
 *                   the thing they came for is the pattern everyone has learned to dismiss.
 *   answered once   "no" is permanent. A prompt that returns after being refused is not a
 *                   question, it is a nag, so the refusal is recorded and honoured for good.
 *   visible always  the top bar shows the address that is being used, and takes it away
 *                   again in one press. Storage nobody can see is storage nobody consented to.
 *
 * Everything lives in this browser. The address is sent to the site only when the member asks
 * for an invitation, exactly as if they had typed it — the storage moves no data anywhere new.
 */
import { escape as e } from './format.js';

const KEY = { email: 'eo.email', name: 'eo.name', asked: 'eo.remember' };

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => {
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); }
  catch { /* private mode: the feature simply does not exist, which is a fine outcome */ }
};

/**
 * Deliberately permissive, and the same shape the server uses. It rejects what is certainly
 * not an address and nothing else — an over-clever pattern rejects real people, and here it
 * would refuse to remember an address the server has just accepted.
 */
export const looksLikeEmail = (v) => typeof v === 'string' && v.trim().length <= 254
  && /^[^\s@,;]+@[^\s@,;.]+\.[^\s@,;]{2,}$/.test(v.trim());

/* --- what we hold ------------------------------------------------------- */

export const savedEmail = () => read(KEY.email);
export const savedName = () => read(KEY.name);
export const declined = () => read(KEY.asked) === 'no';

export function remember(email, name) {
  if (!looksLikeEmail(email)) return false;
  write(KEY.email, email.trim());
  if (name && name.trim()) write(KEY.name, name.trim());
  write(KEY.asked, '');              // it was accepted, so there is nothing to suppress
  announce();
  return true;
}

/**
 * Signing out clears the address and NOT the refusal flag, because they answer different
 * questions. "Not this address any more" is not "never offer again" — somebody who signs out
 * on a borrowed laptop and later gives a different address should be offered the same
 * convenience for it.
 */
export function forget() {
  write(KEY.email, '');
  write(KEY.name, '');
  announce();
}

/**
 * Saying so rather than redrawing the page.
 *
 * The address is usually remembered a second after a form has just confirmed something —
 * "you are on the guest list, here is the link", or a subscription with the ONE unsubscribe
 * link that person will ever be shown. Redrawing the page to update a chip in the corner
 * would take that confirmation away as they were reading it. main.js listens and patches the
 * few things that actually depend on the address.
 */
const announce = () => document.dispatchEvent(new CustomEvent('eo:identity'));

export const decline = () => write(KEY.asked, 'no');

/** Worth asking only about a real address we are not already holding, and only once ever. */
export const shouldAsk = (email) =>
  looksLikeEmail(email) && !declined() && email.trim().toLowerCase() !== savedEmail().toLowerCase();

/* --- asking ------------------------------------------------------------- */

/**
 * The question, as a modal.
 *
 * A real <dialog> rather than a div: it takes the focus, traps it, closes on Escape and comes
 * back to the button that opened it — all of which would otherwise be a hundred lines of
 * keyboard handling that no one would maintain.
 *
 * Escape and the backdrop mean "not now", not "no". Only the second button is a refusal, and
 * only a refusal is recorded — dismissing a box by pressing Escape is not consent to never
 * being offered something again.
 *
 * @returns {Promise<'yes'|'no'|'dismiss'>}
 */
export function askToRemember(email) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask';
    dialog.innerHTML = `
      <h2>Keep this email on this device?</h2>
      <p>We can fill <b>${e(email)}</b> in for you next time, so asking for an invitation to
        the next event is one press instead of typing your address again.</p>
      <p class="ask-fine">It stays in this browser — it is not sent anywhere until you ask for
        an invitation, and you can clear it from the top of any page.</p>
      <div class="ask-act">
        <button type="button" class="register sm" data-yes>Yes, remember it
          <span class="arr" aria-hidden="true">→</span></button>
        <button type="button" class="ask-no" data-no>No, ask me each time</button>
      </div>`;

    let answer = 'dismiss';
    const finish = () => { dialog.remove(); resolve(answer); };

    dialog.querySelector('[data-yes]').addEventListener('click', () => {
      answer = 'yes'; dialog.close();
    });
    dialog.querySelector('[data-no]').addEventListener('click', () => {
      answer = 'no'; dialog.close();
    });
    // Clicking the backdrop lands on the dialog element itself, never on its children.
    dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });
    dialog.addEventListener('close', finish);

    document.body.appendChild(dialog);
    if (dialog.showModal) dialog.showModal();
    else { answer = 'dismiss'; finish(); }        // no <dialog>: skip it rather than block
  });
}

/**
 * Ask, if it is worth asking, and record the answer. Called by the forms AFTER they have
 * succeeded, so the member has what they came for before they are asked anything.
 * @returns {Promise<boolean>} whether the address is now remembered
 */
export async function maybeAsk(email, name) {
  if (!shouldAsk(email)) return false;
  const answer = await askToRemember(email.trim());
  if (answer === 'yes') return remember(email, name);
  if (answer === 'no') decline();
  return false;
}

/* --- the control in the top bar ----------------------------------------- */

const PERSON = 'M8 8.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm0 1.4c-2.9 0-5.2 1.6-5.2 4'
             + '.1 0 .2.1.3.3.3h9.8c.2 0 .3-.1.3-.3 0-2.5-2.3-4.1-5.2-4.1Z';

/** Long addresses would push the view switch off a phone, so the label is trimmed, not the value. */
export const shortEmail = (email) => {
  const [local = '', domain = ''] = email.split('@');
  if (email.length <= 20) return email;
  return local.length <= 12 ? `${local}@…` : `${local.slice(0, 11)}…`;
};

/**
 * Signed in / sign out, as the request put it — though nothing here is an account, so the
 * panel says what it actually is. The address is shown rather than a generic "signed in",
 * because the one question a member has is "which of my addresses is this using?".
 */
export const identityBar = () => {
  const email = savedEmail();
  return `
  <div class="me-wrap">
    <button type="button" class="me${email ? ' on' : ''}" data-me aria-expanded="false"
      aria-controls="me-pop" aria-haspopup="dialog"
      title="${email ? `Using ${e(email)} on this device` : 'Save your email on this device'}">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${PERSON}"/></svg>
      <span>${email ? e(shortEmail(email)) : 'Sign in'}</span>
    </button>
    <div class="me-pop" id="me-pop" role="dialog" aria-label="Your email" hidden>
      <form data-me-form>
        <label for="me-email">Your email on this device</label>
        <input id="me-email" type="email" name="email" autocomplete="email" required
               placeholder="your@email.com" value="${e(email)}" />
        <div class="me-act">
          <button type="submit" class="register sm">Save
            <span class="arr" aria-hidden="true">→</span></button>
          ${email ? '<button type="button" class="ask-no" data-me-forget>Sign out</button>' : ''}
        </div>
      </form>
      <p class="me-note">Kept in this browser so invitation forms are filled in for you.
        There is no password and no account — nothing is sent anywhere until you ask to be
        invited to an event.</p>
    </div>
  </div>`;
};

/**
 * One set of listeners for the life of the page. The bar is redrawn on every navigation, so
 * nothing may be bound to the elements themselves — everything is delegated from the document
 * and reads the bar as it finds it.
 *
 * Nothing here redraws anything: remember() and forget() announce themselves, and main.js
 * decides what that changes on the page.
 */
export function wireIdentity() {
  const panel = () => document.querySelector('.me-pop');
  const chip = () => document.querySelector('[data-me]');

  const open = (yes) => {
    const p = panel();
    if (!p) return;
    p.hidden = !yes;
    chip()?.setAttribute('aria-expanded', String(yes));
    if (yes) p.querySelector('input')?.focus();
  };

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-me]')) { open(panel()?.hidden); return; }
    if (!ev.target.closest('.me-pop')) open(false);       // anywhere else closes it
  });

  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') open(false); });

  document.addEventListener('submit', (ev) => {
    const form = ev.target.closest('[data-me-form]');
    if (!form) return;
    ev.preventDefault();
    const value = form.email.value.trim();
    if (!looksLikeEmail(value)) {
      form.email.setCustomValidity('That does not look like an email address.');
      form.email.reportValidity();
      return;
    }
    remember(value);
    open(false);
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.matches('[data-me-form] input')) ev.target.setCustomValidity('');
  });

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-me-forget]')) return;
    forget();
    open(false);
  });
}
