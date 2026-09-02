/**
 * Toast — a sentence at the foot of the screen.
 * Vue: components/eo/Toast.vue, driven by a useToast() composable.
 *
 * It exists for one thing: a card in the feed can now send a real invitation, and a card has
 * nowhere to put the answer. Growing the card to hold a paragraph would move every card below
 * it; saying nothing would leave a member pressing the button again. So the answer is said
 * once, out of the way, and taken back.
 *
 * role="status" rather than "alert": it is read out after whatever the member is doing rather
 * than interrupting it, which is right for a confirmation and wrong for an error they must act
 * on — and none of these are errors they must act on.
 */
import { escape as e } from '../format.js';

const HOLD = 7000;

function tray() {
  let el = document.querySelector('.toasts');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toasts';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {string} message plain text; escaped here
 * @param {{kind?:'good'|'bad', link?:{href:string,label:string}}} opts
 */
export function toast(message, { kind = 'good', link = null } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${e(message)}</span>${link
    ? `<a href="${e(link.href)}" target="_blank" rel="noopener">${e(link.label)}</a>` : ''}
    <button type="button" class="toast-x" aria-label="Dismiss">×</button>`;

  const away = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.toast-x').addEventListener('click', away);
  const timer = setTimeout(away, HOLD);
  // Reading a message should not be a race: hovering it stops the clock.
  el.addEventListener('mouseenter', () => clearTimeout(timer));

  tray().appendChild(el);
  return el;
}
