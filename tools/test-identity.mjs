/**
 * The remembered address — the rules that are promises, not preferences.
 *
 * Two of these are the whole feature: a refusal is permanent, and signing out is not a
 * refusal. Both are one line of code and both are invisible until somebody is annoyed by a
 * prompt they already answered, which is exactly the kind of thing that survives a refactor
 * only if a test is holding it.
 */
let failed = 0;
const check = (n, c, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  <- ${d}`}`); if (!c) failed++;
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
// remember()/forget() announce themselves so main.js can patch the page; nothing to patch here.
const announced = [];
globalThis.document = { dispatchEvent: (ev) => announced.push(ev.type) };

const id = await import('../public/src/identity.js');

console.log('\nwhat counts as an address');
check('an ordinary one', id.looksLikeEmail('max@example.com'));
check('a plus tag', id.looksLikeEmail('max+eo@example.co.uk'));
check('no at sign', !id.looksLikeEmail('max.example.com'));
check('no dot in the domain', !id.looksLikeEmail('max@localhost'));
check('empty', !id.looksLikeEmail(''));
check('a comma — two addresses in one field', !id.looksLikeEmail('a@b.com,c@d.com'));

console.log('\nholding it');
store.clear();
check('nothing to start with', id.savedEmail() === '');
check('a malformed address is refused', id.remember('nope') === false);
check('and nothing was stored', id.savedEmail() === '');
id.remember('  Max@Example.com  ', ' Max P ');
check('trimmed on the way in', id.savedEmail() === 'Max@Example.com', id.savedEmail());
check('the name comes too', id.savedName() === 'Max P');
check('the page is told', announced.includes('eo:identity'));

console.log('\nasking, once');
store.clear();
check('a new address is worth asking about', id.shouldAsk('max@example.com'));
id.remember('max@example.com');
check('the one we already hold is not', !id.shouldAsk('max@example.com'));
check('nor is it in another case', !id.shouldAsk('MAX@EXAMPLE.COM'));
check('a different address is', id.shouldAsk('other@example.com'));
check('nonsense never is', !id.shouldAsk('nope'));

console.log('\nno means no');
store.clear();
id.decline();
check('refused, so never asked again', !id.shouldAsk('max@example.com'));
check('not even for a different address', !id.shouldAsk('other@example.com'));
// The way back is the top bar, and saving from there clears the refusal — otherwise somebody
// who once pressed "no" could never be offered the convenience again, having asked for it.
id.remember('max@example.com');
check('saving by hand lifts the refusal', !id.declined());
check('so a later address can be offered again', id.shouldAsk('other@example.com'));

console.log('\nsigning out is not a refusal');
store.clear();
id.remember('max@example.com');
id.forget();
check('the address is gone', id.savedEmail() === '' && id.savedName() === '');
check('but the question may still be asked', id.shouldAsk('other@example.com'));

console.log('\nthe chip');
store.clear();
check('signed out, it invites you in', id.identityBar().includes('Sign in'));
check('and offers no way to sign out of nothing', !id.identityBar().includes('data-me-forget'));
id.remember('max@example.com');
check('signed in, it names the address', id.identityBar().includes('max@example.com'));
check('and can clear it', id.identityBar().includes('data-me-forget'));
// The address comes from storage, but storage is writable by anything on the origin.
id.remember('a"b<img src=x>@example.com');
check('the address is escaped into the bar',
  !id.identityBar().includes('<img'), id.identityBar().slice(0, 200));

console.log('\ntrimming a long address to fit a phone');
check('a short one is left alone', id.shortEmail('max@eo.com') === 'max@eo.com');
check('a long domain is dropped',
  id.shortEmail('maksym@a-very-long-domain-indeed.com') === 'maksym@…', id.shortEmail('maksym@a-very-long-domain-indeed.com'));
check('a long local part is cut',
  id.shortEmail('maksym.pundyk.the.first@eo.com').length <= 13,
  id.shortEmail('maksym.pundyk.the.first@eo.com'));

console.log('\na browser with storage switched off');
globalThis.localStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};
check('reading does not throw', id.savedEmail() === '');
check('writing does not throw', (() => { try { id.remember('max@example.com'); return true; }
  catch { return false; } })());
check('and nothing is remembered, which is the honest outcome', id.savedEmail() === '');

console.log(failed ? `\n${failed} failed\n` : '\nall good\n');
process.exit(failed ? 1 : 0);
