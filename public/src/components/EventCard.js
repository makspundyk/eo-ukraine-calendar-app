/**
 * EventCard — one event in the feed.
 * Vue: components/eo/EventCard.vue
 *
 * Image-led, after Kiwi's deal list: the photograph carries the card, and the facts sit on a
 * blurred band inside it rather than in a separate grey strip. A member scrolling a season
 * recognises a place before they read a word, and that recognition is what makes the list
 * feel like something to look forward to rather than a spreadsheet.
 *
 * On the image band, in the order a member reads (DESIGN.md §2):
 *      date · time      can I make it
 *      place            do I have to travel
 *      title            what is it
 * Below the image: the one-line summary, the speaker, and Register.
 * The full description is only ever on the event page.
 *
 * The whole card opens the event, photo included — a member aims at the picture, not at the
 * six words of the title. That is one transparent anchor stretched over the card rather than a
 * click handler, so middle-click, cmd-click and "copy link" all still behave like a link.
 * Register sits above it on its own layer, because it goes somewhere else.
 */
import { escape as e, whenShort, placeShort, timeLabel, nights } from '../format.js';
import { chip, register, fact } from './ui.js';
import { plainText } from '../richtext.js';

export const render = (ev) => `
  <div class="card" data-c="EventCard" data-id="${e(ev.id)}">
    <a class="card-hit" href="#/event/${e(ev.id)}" aria-label="${e(ev.title)}"></a>
    <div class="card-media">
      <img src="${e(ev.image_url)}" alt="" loading="lazy" decoding="async" />
      <span class="card-scrim"></span>
      <span class="card-type">${chip(ev.type_label, ev.kind)}</span>
      <span class="card-overlay">
        <span class="ov-meta">
          <b>${e(whenShort(ev))}</b>
          <span class="ov-dot">•</span>
          <span>${e(placeShort(ev))}</span>
        </span>
        <h3 class="card-title">${e(ev.title)}</h3>
      </span>
    </div>

    <div class="card-body">
      ${ev.summary ? `<p class="summary">${e(plainText(ev.summary))}</p>` : ''}
      <div class="card-foot">
        ${ev.speaker_name
          ? `<span class="speaker"><b>${e(ev.speaker_name)}</b>${
              ev.speaker_title ? ` · ${e(ev.speaker_title)}` : ''}</span>`
          : `<span class="factline">
               ${fact('cal', nights(ev.start, ev.end))}
               ${ev.guests_welcome ? fact('users', 'Guests welcome') : ''}
             </span>`}
        ${register(ev.registration_url, { small: true })}
      </div>
    </div>
  </div>`;
