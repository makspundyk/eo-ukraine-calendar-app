/**
 * Timezone conversion, without a browser. These are the cases where getting it wrong puts
 * somebody in the wrong room on the wrong day, so they are asserted rather than eyeballed.
 */
let failed = 0;
const check = (n, c, d='') => { console.log(`  ${c?'✓':'✗'} ${n}${c?'':`  <- ${d}`}`); if(!c) failed++; };

// The module reaches for localStorage and Intl; only the first needs standing in for.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null,
                            setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };

const tz = await import('../public/src/timezone.js');

console.log('\nnaming the zone');
check('the city, not the region', tz.zoneLabel('Europe/Berlin') === 'Berlin');
check('underscores become spaces', tz.zoneLabel('America/New_York') === 'New York');
// Chrome still reports Europe/Kiev. A Ukrainian chapter showing "Kiev" is not a small thing.
check('the legacy Kiev spelling is corrected to Kyiv', tz.zoneLabel('Europe/Kiev') === 'Kyiv');
check('Kyiv stays Kyiv', tz.zoneLabel('Europe/Kyiv') === 'Kyiv');
check('Calcutta is corrected too', tz.zoneLabel('Asia/Calcutta') === 'Kolkata');

console.log('\nremembering the choice');
store.clear();
check('converts by default — that is the answer people wanted', tz.showingLocal());
tz.toggleMode();
check('a choice sticks', !tz.showingLocal());
tz.toggleMode();
check('and toggles back', tz.showingLocal());

console.log('\nconverting');
const summer = { start: '2026-09-16', time_start: '15:30', time_end: '17:00', timezone: 'CET' };
let w = tz.localWhen(summer, 'Europe/Kyiv');
check('CEST to Kyiv is one hour on', w.start === '16:30' && w.end === '18:00', JSON.stringify(w));
check('the day does not move', w.date === '2026-09-16' && w.shifted === false);

w = tz.localWhen(summer, 'America/New_York');
check('CEST to New York is six hours back', w.start === '09:30', JSON.stringify(w));

// The case that matters: converting the clock but not the calendar puts people out by a day.
w = tz.localWhen(summer, 'Pacific/Auckland');
check('Auckland is the NEXT day', w.date === '2026-09-17' && w.shifted === true, JSON.stringify(w));
check('...and the time with it', w.start === '01:30');

const lateNight = { start: '2026-09-16', time_start: '23:30', timezone: 'CET' };
check('23:30 CEST is the next morning in Kyiv',
  tz.localWhen(lateNight, 'Europe/Kyiv').date === '2026-09-17');
const earlyMorning = { start: '2026-09-16', time_start: '01:00', timezone: 'CET' };
check('01:00 CEST is the PREVIOUS day in New York',
  tz.localWhen(earlyMorning, 'America/New_York').date === '2026-09-15');

console.log('\nwhen there is nothing to convert');
check('an event already in the reader\'s zone returns nothing',
  tz.localWhen(summer, 'Europe/Berlin') === null);
check('an all-day event has no time to convert',
  tz.localWhen({ start: '2026-10-06', timezone: 'CET' }, 'Pacific/Auckland') === null);
check('an undated event is left alone',
  tz.localWhen({ time_start: '15:30', timezone: 'CET' }, 'Europe/Kyiv') === null);

console.log('\nthe same instant across the winter boundary');
const winter = { start: '2027-01-20', time_start: '15:30', timezone: 'CET' };
check('CET to Kyiv in January is still one hour on',
  tz.localWhen(winter, 'Europe/Kyiv').start === '16:30');
// Europe and America change clocks on different dates; a fixed offset gets this wrong.
const gap = { start: '2026-10-27', time_start: '15:30', timezone: 'CET' };
check('the week Europe has changed and America has not is handled',
  tz.localWhen(gap, 'America/New_York').start === '10:30',
  tz.localWhen(gap, 'America/New_York').start);

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
