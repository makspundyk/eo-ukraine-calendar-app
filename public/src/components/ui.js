import { escape as e, hasPassed } from '../format.js';
import { googleUrl } from '../ics.js';
import { savedEmail } from '../identity.js';

/** Small inline icons. Inline so the page has no asset dependency at all. */
const P = {
  pin:   'M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.4 4.5 8.5 4.5 8.5s4.5-5.1 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z',
  video: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h5A1.5 1.5 0 0 1 10 4.5v7A1.5 1.5 0 0 1 8.5 13h-5A1.5 1.5 0 0 1 2 11.5v-7Zm9 2.2 3-1.7v6l-3-1.7v-2.6Z',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.6 3.2v3.5l2.6 1.6-.6 1L7.4 8.8V4.7h1.2Z',
  cal:   'M4 1.5v1.3H3A1.5 1.5 0 0 0 1.5 4.3v8.2A1.5 1.5 0 0 0 3 14h10a1.5 1.5 0 0 0 1.5-1.5V4.3A1.5 1.5 0 0 0 13 2.8h-1V1.5h-1.3v1.3H5.3V1.5H4Zm-1.2 4.6h10.4v6.4H2.8V6.1Z',
  users: 'M5.6 7.6a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Zm5.2.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM1.4 13c0-2.2 1.9-3.5 4.2-3.5S9.8 10.8 9.8 13H1.4Zm9.8-2.9c1.8 0 3.4.9 3.4 2.9h-3.6c0-1.1-.4-2-1-2.7.4-.1.8-.2 1.2-.2Z',
};
export const icon = (name) =>
  `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${P[name]}"/></svg>`;

export const chip = (label, kind = 'plain') =>
  `<span class="chip ${e(kind)}">${e(label)}</span>`;

/**
 * The action on a card or a row.
 *
 * Four outcomes, in the order a member benefits from them:
 *
 *   register       the chapter has a registration page — that is the real action, always
 *   invite         the organiser has a calendar event AND we know the reader's address:
 *                  one press puts them ON it and Google sends the invitation
 *   ask            the organiser has an event and we do NOT know the address, so the card
 *                  hands over to the event page, where there is room to ask for it
 *   copy           no organiser event at all — a copy on their own calendar, second best
 *
 * The invite branch is the whole point. A card used to hand out a COPY of the event, which
 * looks identical to the member and is not the same thing at all: it is a block in their own
 * diary that no later change by the organiser can ever reach, and it never told the organiser
 * anybody was coming. Now the card does what the event page does.
 */
export const action = (ev, opts = {}) => {
  // Nothing to register for and nothing to put in a calendar once it is over. Offering either
  // is worse than offering nothing: it says the site does not know what day it is.
  if (hasPassed(ev)) return '';
  if (ev.registration_url) return register(ev.registration_url, opts);

  const cls = `register ${opts.small ? 'sm' : ''} ${opts.ghost ? 'ghost' : ''}`;

  if (ev.invitable) return savedEmail() ? inviteButton(ev.id, cls) : inviteAsk(ev.id, cls);

  // No date, so there is nothing to put in a calendar and no event to be a guest of. Until
  // now these rows offered a member nothing at all to press; interest is the one thing that
  // is still true of an event whose date has not been set.
  if (!ev.start) return savedEmail() ? interestButton(ev.id, cls) : interestAsk(ev.id, cls);

  return register(googleUrl(ev, { origin: location.origin }),
    { ...opts, label: 'Add to calendar' });
};

const ADD = 'Add to calendar <span class="arr" aria-hidden="true">→</span>';
const SAY = 'Register interest <span class="arr" aria-hidden="true">→</span>';

/**
 * One press: the remembered address goes onto the organiser's event.
 *
 * Wired once, from main.js, by delegation — a card is redrawn whenever the feed pages in more
 * events, and a listener bound to the button itself would not survive that.
 */
export const inviteButton = (id, cls) =>
  `<button type="button" class="${e(cls)}" data-invite="${e(id)}">${ADD}</button>`;

/**
 * No address yet, so the card hands over to the event page rather than growing a field. A card
 * has no room to say what the address is for, and an email box with no explanation beside it
 * is the one thing a member will not fill in.
 *
 * `data-invite-ask` is also how main.js finds these to upgrade them in place the moment an
 * address IS remembered, without redrawing a page that may be showing a confirmation.
 */
export const inviteAsk = (id, cls) =>
  `<a class="${e(cls)}" href="#/event/${e(id)}?invite=1" data-invite-ask="${e(id)}">${ADD}</a>`;

/**
 * The same pair for interest: a note to the organiser and nothing else — no calendar entry,
 * no email, no guest list. See lib/interest.mjs.
 */
export const interestButton = (id, cls) =>
  `<button type="button" class="${e(cls)}" data-interest="${e(id)}">${SAY}</button>`;

export const interestAsk = (id, cls) =>
  `<a class="${e(cls)}" href="#/event/${e(id)}?interest=1" data-interest-ask="${e(id)}">${SAY}</a>`;

/**
 * `internal` is a hash link within the site: no new tab, and no rel — opening our own event
 * page in a second tab loses the reader the list they were scrolling.
 */
export const register = (href,
  { small = false, ghost = false, label = 'Register', internal = false } = {}) => `
  <a class="register ${small ? 'sm' : ''} ${ghost ? 'ghost' : ''}" href="${e(href)}"
     ${internal ? '' : 'target="_blank" rel="noopener"'}>
    ${e(label)} <span class="arr" aria-hidden="true">→</span></a>`;

export const fact = (iconName, text) =>
  text ? `<span class="fact">${icon(iconName)}${e(text)}</span>` : '';
