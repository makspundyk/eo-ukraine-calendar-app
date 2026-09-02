/**
 * EVENT — one event, in full.
 * ===========================================================================
 * Vue: pages/events/[id].vue
 *
 * Shaped like a travel booking detail page, and deliberately so. A member deciding on an
 * event is deciding on a trip: an evening, or three days and a flight. The page answers in
 * that order — a photo of where, then a journey strip that reads START → END at a glance,
 * then the reasons, then the facts, with Register never more than a thumb away.
 *
 * Blocks are separate white cards rather than one column of prose. Each card is one
 * question; a member who only wants the date never has to read the paragraphs.
 */
import { useEventsApi } from '../api/useEventsApi.js';
import { chip, register, action, icon } from '../components/ui.js';
import { richText } from '../richtext.js';
import { vevent, googleUrl } from '../ics.js';

/** The note is set with innerHTML so it can carry a link; everything interpolated is escaped. */
const esc = (v) => e(v);
import {
  escape as e, dayNum, dow, fullDate, dateRange, timeLabel, placeLabel,
  placeShort, nights, hasPassed, displayDate, displayEndDate,
} from '../format.js';
import { displayWhen } from '../timezone.js';
import { savedEmail, maybeAsk } from '../identity.js';
import { requestInvitation, requestInterest } from '../api/attend.js';

export const meta = {
  id: 'V3', name: 'Event', route: '#/event/:id', vue: 'pages/events/[id].vue',
  apis: ['GET event by id'],
  blocks: ['Hero', 'JourneyCard', 'About', 'Highlights', 'Speaker', 'Details', 'MobileBar'],
};

const api = useEventsApi();

/**
 * Two-stage load. The list already holds this event's photograph, title, dates and place, so
 * the page paints from that immediately and the description, highlights, biography and venue
 * fill in when they arrive — a member reading the headline does not wait on prose they have
 * not reached yet. Arriving on a deep link there is nothing cached, so it waits once.
 */
export async function load(route) {
  // `?invite=1` is how a card with no remembered address hands over: it has no room to ask
  // for one, so it sends the reader here, to the field and the sentence explaining it.
  const wants = Boolean(route.query.invite || route.query.interest);
  const known = await api.known(route.params.id);
  if (known && known.description === undefined) return { ev: known, partial: true, wants };
  const ev = known?.description !== undefined ? known : await api.byId(route.params.id);
  if (!ev) throw new Error('That event is not in the calendar. It may have been renamed or '
    + 'taken down — the full list is on the events page.');
  return { ev, partial: false, wants };
}

/** Fetch the rest, then repaint in place. */
export async function mount({ ev, partial, wants }, { rerender } = {}) {
  wireDownload(ev);
  wireAttend();
  wireInterest();
  if (wants) focusInvite();
  if (!partial || !rerender) return;
  const full = await api.byId(ev.id);
  if (full) rerender({ ev: full, partial: false, wants });
}

/**
 * Bring the field into view and put the cursor in it. Scrolled rather than jumped to, because
 * a member who arrives from a card needs to see WHICH event this is before they type — landing
 * on a bare input with the title off screen is how people register for the wrong evening.
 */
function focusInvite() {
  const input = document.querySelector('form.attend input[type=email]');
  if (!input) return;
  input.closest('.pcard')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!input.value) input.focus({ preventScroll: true });
}

/* --- pieces ------------------------------------------------------------- */

const card = (title, body, extra = '') => (body ? `
  <section class="pcard ${extra}">
    ${title ? `<h2>${e(title)}</h2>` : ''}
    ${body}
  </section>` : '');

/**
 * The journey strip. Two ends and the distance between them — the one graphic on the page,
 * because it is the one fact a member checks twice: when does this start, when am I free again.
 * A one-evening event has no second end, so it shows the clock instead of a second date.
 */
function journey(ev) {
  const multi = ev.end && ev.end !== ev.start;
  const span = multi ? nights(ev.start, ev.end)
    : (ev.time_start && ev.time_end ? duration(ev) : null);

  // Each end is labelled. Without labels a single-day event puts a big DATE on the left and a
  // big TIME on the right — two different units in the same visual slot — and "16" for the
  // sixteenth reads as four in the afternoon.
  const local = displayWhen(ev);
  const startIso = displayDate(ev);
  const endIso = displayEndDate(ev);

  const left = ev.date_tbc
    ? { label: 'When', big: '—', small: 'Date to be confirmed', sub: '' }
    : { label: multi ? 'Starts' : 'Date',
        big: dayNum(startIso), small: mon(startIso), sub: dow(startIso) };

  const right = multi
    ? { label: 'Ends', big: dayNum(endIso), small: mon(endIso), sub: dow(endIso) }
    : ev.time_start
      ? { label: 'Time', big: local ? local.start : ev.time_start,
          small: (local ? local.end : ev.time_end)
            ? `to ${local ? local.end : ev.time_end}` : 'Starts',
          sub: local ? `${local.label} time` : ev.timezone }
      : { label: 'Time', big: '·', small: 'to be', sub: 'confirmed' };

  return `
  <div class="jrn">
    <div class="jrn-end">
      <u>${e(left.label)}</u>
      <b>${e(left.big)}</b><span>${e(left.small)}</span><i>${e(left.sub)}</i>
    </div>
    <div class="jrn-line">
      <span class="jrn-dot"></span>
      <span class="jrn-rule"></span>
      <span class="jrn-mid">${icon(ev.is_online ? 'video' : 'pin')}${e(
        [span, ev.is_online ? 'Online' : placeShort(ev)].filter(Boolean).join(' · '))}</span>
      <span class="jrn-rule"></span>
      <span class="jrn-dot end"></span>
    </div>
    <div class="jrn-end right">
      <u>${e(right.label)}</u>
      <b>${e(right.big)}</b><span>${e(right.small)}</span><i>${e(right.sub)}</i>
    </div>
  </div>`;
}

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const mon = (iso) => (iso ? MON.format(new Date(iso)) : '');

function duration(ev) {
  const [h1, m1] = ev.time_start.split(':').map(Number);
  const [h2, m2] = ev.time_end.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins <= 0) return null;
  return mins % 60 === 0 ? `${mins / 60} hours` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const row = (ic, label, value, sub = '') => (value ? `
  <div class="drow">
    <span class="drow-i">${icon(ic)}</span>
    <div><span class="drow-l">${e(label)}</span>
      <b>${e(value)}</b>${sub ? `<em>${e(sub)}</em>` : ''}</div>
  </div>` : '');

/**
 * Add to calendar.
 *
 * Two links rather than a menu, because a menu for two things is a click that buys nothing.
 * Both make a COPY on the member's own calendar — an organiser's later edit will not reach
 * it, which is a property of the format and not of this button. The subscribe link in the
 * footer is the one that stays in step, and it is offered right next to these so the choice
 * is visible rather than assumed.
 *
 * The .ics is built here and handed over as a Blob: no round trip, and it works identically
 * when the page is running on the demo calendar.
 */
const addToCalendar = (ev) => {
  if (!ev.start || hasPassed(ev)) return '';

  // The organiser has a real event and the site can put the member ON it. One field, because
  // the address is the only thing we do not already know, and it is not stored anywhere here.
  if (ev.invitable) {
    return `
    <div class="addcal">
      <span class="addcal-label">${icon('cal')} Get the calendar invitation</span>
      <form class="attend" data-attend="${e(ev.id)}">
        <input type="email" name="email" required autocomplete="email"
               value="${e(savedEmail())}"
               placeholder="your@email.com" aria-label="Your email address" />
        <button type="submit" class="addcal-btn primary">Send it to me</button>
        <label class="attend-opt"><input type="checkbox" name="subscribe" checked />
          Invite me to future events too</label>
      </form>
      <span class="addcal-note" data-attend-note>The organiser's own event, so the room and any
        later change reach you automatically. Untick the box and your address is used for this
        invitation only; leave it ticked and it joins the chapter's list, which you can leave
        from any invitation.</span>
    </div>`;
  }

  // A link to the organiser's event, but no way to put the member ON it. Second best: they
  // can at least see it. Checked AFTER `invitable`, because being able to invite somebody
  // beats merely being able to show them the page — a row that has both should invite.
  if (ev.calendar_url) {
    return `
    <div class="addcal">
      <span class="addcal-label">${icon('cal')} Add to your calendar</span>
      <a class="addcal-btn primary" href="${e(ev.calendar_url)}" target="_blank"
         rel="noopener">Open the calendar invitation</a>
      <span class="addcal-note">This is the organiser's event, so any later change to the
        room or the time reaches you automatically.</span>
    </div>`;
  }

  const g = googleUrl(ev, { origin: location.origin });
  return `
  <div class="addcal">
    <span class="addcal-label">${icon('cal')} Add to your calendar</span>
    <a class="addcal-btn" href="${e(g)}" target="_blank" rel="noopener">Google Calendar</a>
    <a class="addcal-btn" href="#" data-ics="${e(ev.id)}">Download&nbsp;.ics</a>
    <span class="addcal-note">This puts a copy in your own calendar. To stay in step with
      later changes, subscribe to the whole calendar from the foot of the events page.</span>
  </div>`;
};

/**
 * The download is wired after render rather than with an inline handler, because the
 * Content-Security-Policy forbids inline script — see public/_headers.
 */
/**
 * Submits the one field and reports back in place.
 *
 * The order matters at the end: the invitation is confirmed FIRST and the question about
 * remembering the address comes after, on top of the confirmation. A member who is asked
 * about storage before they can see whether the thing they pressed worked will answer the
 * question to make it go away, which is not an answer.
 */
export function wireAttend() {
  const form = document.querySelector('[data-attend]');
  if (!form) return;
  const note = document.querySelector('[data-attend-note]');
  const button = form.querySelector('button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.querySelector('input[type=email]').value.trim();
    const subscribe = form.querySelector('[name=subscribe]')?.checked;
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Sending…';
    try {
      const body = await requestInvitation({ event: form.dataset.attend, email, subscribe });
      // The link is offered on success because the email is not guaranteed: a personal Gmail
      // account may not auto-add an invitation from a shared calendar, and it can land in
      // spam. Saying "sent" and stopping there leaves somebody staring at an empty calendar.
      setNote(note, body.ok, body.ok
        ? [esc(body.message),
           body.link ? `<a href="${esc(body.link)}" target="_blank" rel="noopener">`
                       + 'Open it in Google Calendar</a> if it does not appear.' : '',
           body.subscribed ? 'You are also on the list for future events'
             + (body.unsubscribe ? ` — <a href="${esc(body.unsubscribe)}">leave it</a>` : '')
             + '.' : ''].filter(Boolean).join(' ')
        : esc(body.message || 'That did not work. Try again in a moment.'));
      if (body.ok) {
        form.remove();
        if (await maybeAsk(email)) rememberedNote(note);
      }
    } catch {
      setNote(note, false, 'That did not work. Try again in a moment.');
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  });
}

/**
 * Register interest, from either place it is offered: its own form on an event that cannot be
 * joined, or the quiet second button under the invitation form.
 *
 * The two share one handler because they are one action with two entry points, and the only
 * difference is which field holds the address.
 */
export function wireInterest() {
  const own = document.querySelector('[data-interest-form]');
  const alt = document.querySelector('[data-interest-alt]');

  const send = async (id, form, button, note) => {
    const email = form.querySelector('input[type=email]').value.trim();
    if (!email) {                       // the alt button bypasses the form's own validation
      form.querySelector('input[type=email]').reportValidity();
      return;
    }
    button.disabled = true;
    const previous = button.innerHTML;
    button.textContent = 'One moment…';
    const body = await requestInterest({ event: id, email,
      subscribe: form.querySelector('[name=subscribe]')?.checked });

    setNote(note, body.ok, body.ok
      ? [esc(body.message),
         body.subscribed ? 'You are also on the list for future events'
           + (body.unsubscribe ? ` — <a href="${esc(body.unsubscribe)}">leave it</a>` : '')
           + '.' : ''].filter(Boolean).join(' ')
      : esc(body.message || 'That did not work. Try again in a moment.'));

    if (body.ok) {
      form.remove();
      if (await maybeAsk(email)) rememberedNote(note);
    } else {
      button.disabled = false;
      button.innerHTML = previous;
    }
  };

  own?.addEventListener('submit', (event) => {
    event.preventDefault();
    send(own.dataset.interestForm, own, own.querySelector('button[type=submit]'),
         document.querySelector('[data-interest-note]'));
  });

  // Inside the invitation form: same address, different action. It must not submit the form,
  // which is why it is a plain button and not a second submit.
  alt?.addEventListener('click', () => {
    const form = alt.closest('form');
    send(alt.dataset.interestAlt, form, alt, document.querySelector('[data-attend-note]'));
  });
}

/** The note keeps whichever class it was rendered with; only the verdict changes. */
function setNote(note, ok, html) {
  if (!note) return;
  const base = note.classList.contains('micro') ? 'micro' : 'addcal-note';
  note.className = `${base} ${ok ? 'good' : 'bad'}`;
  note.innerHTML = html;
}

/**
 * Said once, where the answer was given. Somebody who has just agreed to have their address
 * kept should be told what that changed, in the same place they agreed — not left to discover
 * a new chip in the top bar and wonder what it is.
 */
const rememberedNote = (note) => {
  note.insertAdjacentHTML('beforeend',
    ' Your address is saved on this device — the next event is one press.');
};

export function wireDownload(ev) {
  const link = document.querySelector('[data-ics]');
  if (!link) return;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0',
      'PRODID:-//EO Ukraine//Community calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      vevent(ev, { origin: location.origin }), 'END:VCALENDAR'].join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

/* --- page --------------------------------------------------------------- */

/**
 * When there is nowhere to register, the calendar IS the action.
 *
 * Rendering a Register button with no destination is worse than rendering none: a member
 * presses it, nothing happens, and they conclude the site is broken rather than that the
 * chapter has not opened registration yet.
 */
function primaryAction(ev) {
  if (hasPassed(ev)) {
    return `<p class="micro past">This event has already taken place.</p>`;
  }
  if (ev.registration_url) {
    return `${register(ev.registration_url, {
      label: ev.date_tbc ? 'Register interest' : 'Register for this event' })}
      <p class="micro">${ev.date_tbc
        ? 'We will email you as soon as the date is set.'
        : 'Opens the EO registration page. Takes about a minute.'}</p>`;
  }
  // No date yet, so there is nothing to register for and nothing to put in a calendar. What
  // is still true is that somebody wants to come, and that is worth recording.
  if (!ev.start) {
    return interestForm(ev, 'The date is not set yet. Leave your address and the organiser '
      + 'will tell you as soon as it is — nothing goes in your calendar and no invitation is '
      + 'sent until there is something to be invited to.');
  }
  if (ev.invitable) {
    return `
      <form class="attend wide" data-attend="${e(ev.id)}">
        ${emailField()}
        <button type="submit" class="register">Send me the invitation
          <span class="arr" aria-hidden="true">→</span></button>
        <label class="attend-opt"><input type="checkbox" name="subscribe" checked />
          Invite me to future events too</label>
        <button type="button" class="ask-no attend-alt" data-interest-alt="${e(ev.id)}">
          Not sure yet — just tell the organiser I am interested</button>
      </form>
      <p class="micro" data-attend-note>The organiser's own event, so the room and any later
        change reach you automatically. Untick the box and your address is used for this
        invitation only; leave it ticked and it joins the chapter's list, which you can leave
        from any invitation.</p>`;
  }
  return `
    <a class="register" href="${e(googleUrl(ev, { origin: location.origin }))}"
       target="_blank" rel="noopener">Add to Google Calendar
       <span class="arr" aria-hidden="true">→</span></a>
    <p class="micro">Or <a href="#" data-ics="${e(ev.id)}">download the .ics file</a> for Apple
      Calendar, Outlook and everything else.</p>
    ${interestForm(ev, 'This one has no registration page yet. Leave your address and the '
      + 'organiser will come back to you — nothing goes in your calendar and no invitation is '
      + 'sent.')}`;
}

const emailField = () => `
  <input type="email" name="email" required autocomplete="email"
         value="${e(savedEmail())}"
         placeholder="your@email.com" aria-label="Your email address" />`;

/**
 * Register interest — a note to the organiser, and nothing else.
 *
 * Deliberately NOT an invitation: no calendar entry, no email, no guest list. It is the only
 * thing that is still true of an event whose date has not been set, and it is the honest
 * answer for somebody who wants to be counted without a diary entry. See lib/interest.mjs.
 */
const interestForm = (ev, note) => `
  <form class="attend wide interest" data-interest-form="${e(ev.id)}">
    ${emailField()}
    <button type="submit" class="register">Register interest
      <span class="arr" aria-hidden="true">→</span></button>
    <label class="attend-opt"><input type="checkbox" name="subscribe" checked />
      Tell me about other events too</label>
  </form>
  <p class="micro" data-interest-note>${e(note)}</p>`;

export function render({ ev, partial }) {
  const cta = primaryAction(ev);
  const local = displayWhen(ev);
  const startIso = displayDate(ev);
  const endIso = displayEndDate(ev);

  // The sheet's Description cell may hold HTML. richText() renders it from an allowlist —
  // never bind the raw value here.
  const paras = richText(ev.description);

  return `
  <div class="ev">
    <div class="ev-hero">
      <img src="${e(ev.image_url)}" alt="" />
      <span class="ev-scrim"></span>
      <a class="ev-back" href="#/" aria-label="Back to all events">←</a>
      <div class="ev-hero-in">
        <div class="ev-chips">
          ${chip(ev.type_label, ev.kind)}
          ${ev.guests_welcome ? chip('Guests welcome', 'plain') : ''}
        </div>
        <h1>${e(ev.title)}</h1>
        ${ev.speaker_name ? `<p class="ev-with">with ${e(ev.speaker_name)}</p>` : ''}
      </div>
    </div>

    <div class="ev-col">
      <section class="pcard lift">
        ${journey(ev)}
        <div class="jrn-act">${cta}</div>
        ${ev.registration_url ? addToCalendar(ev) : ''}
      </section>

      ${paras ? card('About this event', `<div class="rich">${paras}</div>`)
        : partial ? `<section class="pcard"><h2>About this event</h2>
            <div class="skeleton"><span></span><span></span><span></span></div></section>`
        : card('About this event', `<p class="muted">No description has been added yet.</p>`)}

      ${card('What you get out of it', ev.highlights?.length ? `
        <ul class="ticks">${ev.highlights.map((h) => `
          <li><span class="tick">✓</span>${e(h)}</li>`).join('')}</ul>` : '')}

      ${ev.speaker_name ? `
      <section class="pcard">
        <h2>Who is speaking</h2>
        <div class="spk">
          <span class="spk-av">${e(initials(ev.speaker_name))}</span>
          <div>
            <b>${e(ev.speaker_name)}</b>
            ${ev.speaker_title
              ? `<span>${e(ev.speaker_title)}</span>`
              : (ev.speaker !== ev.speaker_name ? `<span>${e(ev.speaker)}</span>` : '')}
          </div>
        </div>
        ${ev.speaker_bio ? `<p class="spk-bio">${e(ev.speaker_bio)}</p>` : ''}
      </section>` : ''}

      <section class="pcard">
        <h2>The details</h2>
        <div class="drows">
          ${row('cal', 'Date', dateRange(startIso, ev.end ? endIso : null),
                ev.date_tbc ? ev.date_note : (nights(ev.start, ev.end) || ''))}
          ${row('clock', 'Time', timeLabel(ev) || (ev.date_tbc ? 'Announced with the date' : 'To be confirmed'))}
          ${row(ev.is_online ? 'video' : 'pin', ev.is_online ? 'Joining' : 'Where',
                ev.venue || placeLabel(ev),
                ev.is_online ? 'Link sent when you register' : '')}
          ${row('users', 'Format', ev.type_label, ev.who_for || '')}
          ${ev.guests_welcome ? row('users', 'Guests', 'You may bring a prospective member') : ''}
        </div>
        ${ev.image_credit ? `<p class="credit">Photo: ${e(ev.image_credit)}</p>` : ''}
      </section>

      <a class="backlink" href="#/">← All events</a>
    </div>

    ${hasPassed(ev) ? '' : `<div class="ev-bar">
      <div>
        <b>${e(ev.date_tbc ? 'Date to be confirmed' : fullDate(startIso))}</b>
        <span>${e(placeLabel(ev))}</span>
      </div>
      ${action(ev, { label: ev.date_tbc ? 'Register interest' : 'Register', small: true })}
    </div>`}
  </div>`;
}
