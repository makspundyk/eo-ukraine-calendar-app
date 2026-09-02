/**
 * Every sentence a member can be shown, checked as writing.
 *
 * These are the words somebody reads at the moment something is not working, often while
 * screenshotting it into a chat. They are worth asserting: a message that names our internals,
 * or that tells somebody a thing is broken without saying what to do, costs more than the
 * failure it describes.
 */
import { readFile } from 'node:fs/promises';

let failed = 0;
const check = (n, c, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  <- ${d}`}`); if (!c) failed++;
};

const files = ['google-sheets.mjs', 'attend.mjs', 'subscriptions.mjs', 'calendar.mjs'];
const messages = [];
for (const f of files) {
  const src = await readFile(new URL(`../lib/${f}`, import.meta.url), 'utf8');
  // Messages are written across several lines with `+`, so the whole concatenation has to be
  // read, not just the first quoted fragment — otherwise every long one looks truncated.
  const chain = /(?:public)?[Mm]essage:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/g;
  for (const m of src.matchAll(chain)) {
    const text = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1]).join('');
    if (text.includes('<generic>')) continue;
    messages.push({ file: f, text });
  }
}

console.log(`\n${messages.length} messages a member can see`);
check('all of them found', messages.length > 15, String(messages.length));

const jargony = messages.filter((m) => /service account|spreadsheet|scope|impersonat|delegation|process\.env|undefined|\bnull\b|HTTP \d|\bJSON\b|calendar service/i.test(m.text));
check('none name our internals', jargony.length === 0,
  jargony.map((m) => `${m.file}: "${m.text}"`).join(' | '));

const unpunctuated = messages.filter((m) => !/[.!?]$/.test(m.text.trim()));
check('all are whole sentences', unpunctuated.length === 0,
  unpunctuated.map((m) => `"${m.text}"`).join(' | '));

const shouty = messages.filter((m) => /!{1,}$/.test(m.text) || m.text === m.text.toUpperCase());
check('none shout', shouty.length === 0, shouty.map((m) => m.text).join(' | '));

// A dead end is the failure mode that matters: it tells somebody it is broken and stops.
// "You will not be invited again" is a success. Only phrases that report a FAILURE are held to
// the rule, or every confirmation containing the word "not" is flagged.
const deadEnd = messages.filter((m) => {
  const t = m.text.toLowerCase();
  const isFailure = /could not|did not|cannot|is not valid|does not look|no invitation|not set up|not switched on/.test(t);
  const offersSomething =
    /try again|instead|below|tell the chapter|shortly|check it|nothing more|no need|sample|cancelled|renamed/.test(t);
  return isFailure && !offersSomething;
});
check('every failure says what to do next', deadEnd.length === 0,
  deadEnd.map((m) => `${m.file}: "${m.text}"`).join(' | '));

const tooLong = messages.filter((m) => m.text.length > 160);
check('none is longer than a glance', tooLong.length === 0,
  tooLong.map((m) => m.text.slice(0, 60)).join(' | '));

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
