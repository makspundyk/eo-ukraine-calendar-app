/**
 * /api/attend with Google stubbed. The important assertions are the ones about what must
 * NOT happen: no existing guest removed, no address in the response, no unbounded sending.
 */
import { addAttendee } from '../lib/attend.mjs';

let failed = 0;
const check = (n, c, d='') => { console.log(`  ${c?'✓':'✗'} ${n}${c?'':`  <- ${d}`}`); if(!c) failed++; };

const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@p.iam.gserviceaccount.com',
              GOOGLE_PRIVATE_KEY: 'stub', GOOGLE_SPREADSHEET_ID: 's',
              GOOGLE_IMPERSONATE_USER: 'admin@eoukraine.com' };

crypto.subtle.importKey = async () => ({});
crypto.subtle.sign = async () => new Uint8Array(8);

let patched = null;
let existing = [{ email: 'already@there.com', responseStatus: 'accepted' },
                { email: 'someone@else.com', responseStatus: 'needsAction' }];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('oauth2')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));
  if (init.method === 'PATCH') { patched = JSON.parse(init.body); return new Response('{}'); }
  return new Response(JSON.stringify({ id: 'evt1', attendees: existing }));
};

console.log('\nadding a guest');
let r = await addAttendee(env, { calendarEventId: 'evt1', email: 'New.Person@Example.com' });
check('reports success', r.body.ok === true, JSON.stringify(r.body));
check('EXISTING guests are preserved, not replaced',
  patched.attendees.length === 3 && patched.attendees.some((a) => a.email === 'already@there.com'),
  JSON.stringify(patched.attendees));
check('the address is lower-cased', patched.attendees.some((a) => a.email === 'new.person@example.com'));
check('guests cannot see each other', patched.guestsCanSeeOtherGuests === false);
check('guests cannot invite others', patched.guestsCanInviteOthers === false);
check('nothing else on the event is touched',
  Object.keys(patched).every((k) => ['attendees','guestsCanSeeOtherGuests',
    'guestsCanInviteOthers','guestsCanModify'].includes(k)), Object.keys(patched).join(','));

console.log('\nrepeat and refusal');
r = await addAttendee(env, { calendarEventId: 'evt1', email: 'already@there.com' });
check('an already-invited address is not added twice', r.body.already === true);
r = await addAttendee(env, { calendarEventId: 'evt1', email: 'not-an-email' });
check('a malformed address is refused', r.body.reason === 'bad_email');
r = await addAttendee({ ...env, GOOGLE_IMPERSONATE_USER: '' }, { calendarEventId: 'e', email: 'a@b.co' });
check('without an impersonation user it says so rather than half-working',
  r.body.reason === 'not_enabled');
r = await addAttendee(env, { calendarEventId: '', email: 'a@b.co' });
check('a row with no calendar event is handled', r.body.reason === 'no_event');

console.log('\nnothing sensitive leaves the server');
const responses = JSON.stringify([r, await addAttendee(env, { calendarEventId: 'evt1', email: 'x@y.co' })]);
check('no service account address in any response', !responses.includes('gserviceaccount'));
check('no impersonated user in any response', !responses.includes('admin@eoukraine.com'));
check('no other guest address in any response', !responses.includes('someone@else.com'));

console.log('\nrate limiting');
let limited = false;
for (let i = 0; i < 30; i++) {
  const out = await addAttendee(env, { calendarEventId: 'burst', email: `p${i}@example.com` });
  if (out.body.reason === 'rate_limited') { limited = true; break; }
}
check('a burst on one event is stopped', limited);

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
