/**
 * Rich text from a spreadsheet cell.
 * ===========================================================================
 * Vue: keep this file as-is and call it from a v-html binding. Do NOT bind a raw sheet value
 * to v-html anywhere — that is the whole reason this module exists.
 *
 * The Description column is filled by hand, and the chapter team will paste HTML into it. Two
 * things follow from that:
 *
 *   1. It has to RENDER, not show its own tags. A member should never see "<p>".
 *   2. It cannot be trusted verbatim. A spreadsheet is shared with more people than a
 *      codebase is, and one pasted <script> — or an <img onerror> copied out of a formatting
 *      tool — would run on every visitor's browser. So the HTML is parsed and rebuilt from an
 *      allowlist: known tags survive, everything else is unwrapped to its own words, and every
 *      attribute is dropped except a safe href.
 *
 * A cell with no tags at all still works: a blank line becomes a paragraph, a single newline
 * becomes a line break. Whoever fills the sheet can ignore HTML entirely.
 */
import { escape as e } from './format.js';

/** Enough to write an event description well, and nothing that can carry behaviour. */
const ALLOWED = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
                 'a', 'h3', 'h4', 'blockquote', 'hr'];
const NOT_ALLOWED = `:not(${ALLOWED.join(',')})`;
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);
const SAFE_HREF = /^(https?:|mailto:)/i;
/** Containers a word processor emits for what the author meant as a paragraph. */
const BLOCKS = 'div,section,article,header,footer,main,pre';

const looksLikeHtml = (s) => /<[a-z][\s\S]*>/i.test(s);

export function richText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (!looksLikeHtml(raw)) {
    return raw.split(/\n{2,}/).filter(Boolean)
      .map((p) => `<p>${e(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const body = doc.body;

  // Paste from Google Docs or Word arrives as one <div> per paragraph. Unwrapping those would
  // run every paragraph together into a single block, so they become paragraphs instead. The
  // browser flattens any nesting when this HTML is set back onto the page, which is what we
  // want anyway.
  for (const el of [...body.querySelectorAll(BLOCKS)]) {
    const para = doc.createElement('p');
    para.append(...el.childNodes);
    el.replaceWith(para);
  }

  // Unwrap anything off the allowlist, over and over — a <span> nested in a <div> in a <font>
  // takes three passes, and querySelector always returns the shallowest remaining one.
  let el;
  while ((el = body.querySelector(NOT_ALLOWED))) {
    if (DROP_ENTIRELY.has(el.tagName)) el.remove();
    else el.replaceWith(...el.childNodes);          // keep the words, lose the tag
  }

  for (const node of body.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      const keep = node.tagName === 'A' && attr.name === 'href' && SAFE_HREF.test(attr.value);
      if (!keep) node.removeAttribute(attr.name);
    }
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // Anything left loose at the top level — a stray text node, a bare <strong> — gets a
  // paragraph, so every word on the page is typeset by the same rule.
  const BLOCK_TAGS = new Set(['P', 'UL', 'OL', 'H3', 'H4', 'BLOCKQUOTE', 'HR']);
  let run = null;
  for (const node of [...body.childNodes]) {
    if (node.nodeType === 1 && BLOCK_TAGS.has(node.tagName)) { run = null; continue; }
    if (node.nodeType === 3 && !node.textContent.trim()) continue;
    if (!run) { run = doc.createElement('p'); node.replaceWith(run); run.append(node); }
    else run.append(node);
  }
  return body.innerHTML;
}

/** The card summary is two clamped lines. Tags there would fight the clamp, so it stays flat. */
export const plainText = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || !looksLikeHtml(raw)) return raw;
  return new DOMParser().parseFromString(raw, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
};
