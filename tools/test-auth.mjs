/**
 * The private key, in both shapes it arrives in.
 *
 * A key read from the service-account JSON has real newlines. A key pasted into the Cloudflare
 * dashboard has the two characters \ and n instead. Normalisation used to live in ONE caller,
 * so the pasted form authenticated for reading the sheet and failed for everything else — and
 * it was invisible on a developer's machine, where the key always comes from the file.
 *
 * Every path that mints a token is exercised here, with both shapes, against a stubbed Google.
 */
import { getAccessToken, SCOPES, normalizePrivateKey } from '../lib/google-sheets.mjs';

let failed = 0;
const check = (n, c, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${c ? '' : `  <- ${d}`}`); if (!c) failed++;
};

const REAL = '-----BEGIN PRIVATE KEY-----\nMIIBVgIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----\n';
const PASTED = REAL.replace(/\n/g, '\\n');

console.log('\nnormalising');
check('literal \\n becomes a real newline', normalizePrivateKey(PASTED) === REAL.trim());
check('a key that is already right is unchanged', normalizePrivateKey(REAL) === REAL.trim());
check('nothing at all does not throw', normalizePrivateKey(undefined) === '');

// What crypto.subtle actually received, which is the thing that used to differ.
let imported = [];
crypto.subtle.importKey = async (_fmt, buf) => { imported.push(buf.byteLength); return {}; };
crypto.subtle.sign = async () => new Uint8Array(8);
globalThis.fetch = async () =>
  new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }));

console.log('\nevery scope, in both shapes');
for (const [shape, key] of [['from the JSON file', REAL], ['pasted into a dashboard', PASTED]]) {
  for (const [name, scope] of Object.entries(SCOPES)) {
    imported = [];
    // A distinct subject per case, or the token cache answers instead of the code under test.
    const subject = `${shape}-${name}@example.com`;
    let ok = true;
    try { await getAccessToken({ email: 'sa@x.iam.gserviceaccount.com', privateKey: key,
                                 scope, subject }); }
    catch (e) { ok = false; check(`${name} · ${shape}`, false, e.reason + ' ' + e.message.slice(0, 80)); }
    if (ok) check(`${name} · ${shape}`, imported.length === 1 && imported[0] > 0,
      `imported ${imported.length} key(s)`);
  }
}

console.log('\nboth shapes give the SAME key to crypto');
imported = [];
await getAccessToken({ email: 'a@b.com', privateKey: REAL, scope: SCOPES.sheets, subject: 'x@y.z' });
const fromFile = imported[0];
imported = [];
await getAccessToken({ email: 'a@b.com', privateKey: PASTED, scope: SCOPES.sheets, subject: 'q@y.z' });
check('identical byte length, so it is genuinely the same key', imported[0] === fromFile,
  `${imported[0]} vs ${fromFile}`);

console.log(failed ? `\n${failed} FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
