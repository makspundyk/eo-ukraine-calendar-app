/**
 * Google Sheets, read through a service account.
 * ===========================================================================
 * ONE implementation, used by both hosts:
 *
 *   Cloudflare   functions/api/calendar.js   -> Workers runtime
 *   this machine serve.mjs                   -> Node 18+
 *
 * It only uses WebCrypto and fetch, which both runtimes have, so there is no "works locally,
 * breaks in production" gap in the part that is hardest to debug remotely.
 *
 * The flow is Google's server-to-server one: sign a JWT with the service account's private
 * key, trade it for an access token, call the Sheets API with that token. The browser never
 * takes part, so the key and the spreadsheet id never leave the server.
 *
 * https://developers.google.com/identity/protocols/oauth2/service-account
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SCOPES = {
  sheets: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  // Only the subscriber list is written, but Google has no narrower write scope than "all
  // spreadsheets this user can reach". Authorise it deliberately, or leave subscriptions off.
  sheetsWrite: 'https://www.googleapis.com/auth/spreadsheets',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
};

/**
 * Thrown for anything the caller should degrade on rather than crash.
 *
 * TWO messages, deliberately. `message` is for the server log and may name the service
 * account, quote Google's response, and say exactly what is misconfigured. `publicMessage` is
 * the only thing that may reach the browser: /api/calendar is world-readable, so it must not
 * carry the service-account address, the spreadsheet id, or a Google error payload.
 */
export class SheetError extends Error {
  constructor(reason, message, { status, publicMessage } = {}) {
    super(message);
    this.reason = reason;      // short machine-readable tag; safe to publish
    this.status = status;      // upstream HTTP status, when there was one
    this.publicMessage = publicMessage || 'The calendar could not be read from the sheet.';
  }
}

const b64url = (bytes) => {
  const arr = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  let binary = '';
  // Chunked: String.fromCharCode(...arr) blows the argument limit on a large key.
  for (let i = 0; i < arr.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemToPkcs8(pem) {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new SheetError('bad_private_key', 'The private key is empty.',
    { publicMessage: 'The calendar service is not configured.' });
  let binary;
  try {
    binary = atob(body);
  } catch {
    throw new SheetError('bad_private_key', 'The private key is not valid base64.',
      { publicMessage: 'The calendar service is not configured.' });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Pasting a key into a dashboard field or a .env line turns the real newlines into the two
 * characters \ and n. Both forms have to work, or the failure is a 400 from Google with no
 * explanation of why.
 */
export const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n').trim();

/**
 * Access tokens are good for an hour and cost ~190ms to mint — a third of the time a cold
 * request spends waiting. Signing a fresh one per request throws that away every time, so it
 * is held until shortly before it expires.
 *
 * Module scope, which both runtimes reuse between requests on the same instance. It is a
 * cache, not a store: a cold isolate simply mints one, and it is never written anywhere it
 * could outlive the process.
 */
const tokenCache = new Map();   // cacheKey -> { token, expiresAt }

/**
 * @param {string} [subject] a user to impersonate. Only works when the service account has
 *   domain-wide delegation and the Workspace admin has authorised this exact scope for it.
 *   Google then issues a token that acts AS that person — which is the only way a service
 *   account can invite attendees to an event.
 */
export async function getAccessToken({ email, privateKey, scope = SCOPES.sheets, subject }) {
  // Keyed by account, scope AND subject: a sheets token must never be handed to a calendar
  // call, and a token minted as one user must never be reused as another.
  const cacheKey = `${email}|${scope}|${subject || ''}|${privateKey.slice(-24)}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  if (subject) claims.sub = subject;      // the impersonation claim
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  let key;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8', pemToPkcs8(privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
    );
  } catch (err) {
    if (err instanceof SheetError) throw err;
    throw new SheetError('bad_private_key',
      'The private key could not be imported. It must be the PKCS#8 key from the service '
      + 'account JSON, BEGIN/END lines included.',
      { publicMessage: 'The calendar service is not configured.' });
  }

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(new Uint8Array(signature))}`,
    }),
  });

  if (!res.ok) {
    // Google's body names the actual problem — a clock skew, a disabled key, a wrong
    // audience. It contains no secret, and without it this is undebuggable from a log.
    const detail = await res.text().catch(() => '');
    // `unauthorized_client` here almost always means one thing: the scope was not authorised
    // for this client id in Workspace admin. Saying so saves an afternoon.
    const hint = subject && /unauthorized_client/.test(detail)
      ? ` — the Workspace admin must authorise scope "${scope}" for this service account's`
        + ' client id under Security → API controls → Domain-wide delegation.'
      : '';
    throw new SheetError('auth_failed',
      `Google refused the service account (${res.status}). ${detail.slice(0, 300)}${hint}`,
      { status: res.status, publicMessage: 'The calendar service could not authenticate.' });
  }
  const data = await res.json();
  if (!data.access_token) throw new SheetError('auth_failed', 'Google returned no access token.',
    { publicMessage: 'The calendar service could not authenticate.' });

  // Retire it a minute early rather than discovering expiry as a 401 mid-request.
  const lifetime = Math.max(60, Number(data.expires_in) || 3600) - 60;
  tokenCache.set(cacheKey, { token: data.access_token,
                             expiresAt: Date.now() + lifetime * 1000 });
  return data.access_token;
}

/**
 * Returns the raw `values` grid, header row included.
 *
 * The range deliberately starts at row 1: this project reads the sheet BY HEADER NAME, so the
 * header has to be in the response. Starting at A3 — as a column-position reader would — makes
 * the whole thing break the first time somebody inserts a column.
 */
export async function fetchSheetValues({ email, privateKey, spreadsheetId, range }) {
  if (!email) throw new SheetError('missing_config', 'GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.',
    { publicMessage: 'The calendar service is not configured.' });
  if (!privateKey) throw new SheetError('missing_config', 'GOOGLE_PRIVATE_KEY is not set.',
    { publicMessage: 'The calendar service is not configured.' });
  if (!spreadsheetId) throw new SheetError('missing_config', 'GOOGLE_SPREADSHEET_ID is not set.',
    { publicMessage: 'The calendar service is not configured.' });

  const token = await getAccessToken({
    email, privateKey: normalizePrivateKey(privateKey), scope: SCOPES.sheets });

  const url = 'https://sheets.googleapis.com/v4/spreadsheets/'
    + `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
    + '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE'
    + '&dateTimeRenderOption=FORMATTED_STRING';

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

  if (res.status === 403) {
    throw new SheetError('not_shared',
      `The sheet is not shared with ${email}. Share it with that address as Viewer.`,
      { status: 403, publicMessage: 'The calendar is not readable by the site.' });
  }
  if (res.status === 404) {
    throw new SheetError('not_found',
      'No spreadsheet with that id, or the tab named in the range does not exist.',
      { status: 404, publicMessage: 'The calendar could not be found.' });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new SheetError('sheets_failed',
      `Sheets API returned ${res.status}. ${detail.slice(0, 300)}`,
      { status: res.status, publicMessage: 'The calendar could not be read right now.' });
  }

  const { values } = await res.json();
  if (!Array.isArray(values) || values.length === 0) {
    throw new SheetError('empty', 'The sheet range came back with no rows at all.',
      { publicMessage: 'The calendar is empty.' });
  }
  return values;
}
