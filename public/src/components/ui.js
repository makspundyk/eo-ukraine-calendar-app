import { escape as e } from '../format.js';

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
 * The single action, identical on every surface. A member who has already decided should
 * never have to open another page to act.
 */
export const register = (href, { small = false, ghost = false, label = 'Register' } = {}) => `
  <a class="register ${small ? 'sm' : ''} ${ghost ? 'ghost' : ''}" href="${e(href)}"
     target="_blank" rel="noopener" onclick="event.stopPropagation()">
    ${e(label)} <span class="arr" aria-hidden="true">→</span></a>`;

export const fact = (iconName, text) =>
  text ? `<span class="fact">${icon(iconName)}${e(text)}</span>` : '';
