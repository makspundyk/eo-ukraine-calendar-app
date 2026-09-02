/**
 * THE ONE SEAM. Every screen reads through here and nowhere else.
 *
 * MIGRATION: this is where the Google Sheets fetch lands. Replace `loadMock` with a call to
 * the Sheets API, run the rows through the same normaliser as `data/normalize.py`, and
 * nothing above this file changes. That is the whole reason the normaliser is a separate
 * script and not a pile of `if`s inside the templates.
 */
const LATENCY = Number(new URLSearchParams(location.search).get('latency') ?? 120);
const BASE = new URL('../../data/', import.meta.url).href;  // public/src/api/ -> public/data/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cache = null;

export async function fetchEvents() {
  await sleep(LATENCY);
  if (!cache) {
    const res = await fetch(`${BASE}events.json`);
    if (!res.ok) throw new Error('Could not load the calendar');
    cache = await res.json();
  }
  return structuredClone(cache);
}
