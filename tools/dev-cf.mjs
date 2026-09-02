/**
 * `npm run dev:cf` — run the app the way Cloudflare runs it.
 *
 * serve.mjs is the everyday dev server: instant, no dependencies, and it shares lib/ with the
 * Pages Function so behaviour matches. This script exists for the one thing serve.mjs cannot
 * prove — that functions/api/calendar.js itself compiles and runs in the Workers runtime.
 *
 * It reads the SAME `.env` the rest of the project uses and passes the values to Wrangler as
 * bindings, so there is one local secrets file rather than an `.env` and a `.dev.vars` that
 * drift apart. Nothing is written to disk.
 */
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = resolve(HERE, '..');

const parseEnv = (text) => Object.fromEntries(text.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => {
    const i = l.indexOf('=');
    let v = l.slice(i + 1).trim();
    if (/^(".*"|'.*')$/s.test(v)) v = v.slice(1, -1);
    return [l.slice(0, i).trim(), v];
  }));

let env = {};
try { env = parseEnv(await readFile(join(ROOT, '.env'), 'utf8')); }
catch { console.error('No .env found. Copy .env.example to .env first.'); process.exit(1); }

// Same convenience as serve.mjs: the JSON may live anywhere outside the repo.
if (env.GOOGLE_APPLICATION_CREDENTIALS && !env.GOOGLE_PRIVATE_KEY) {
  const json = JSON.parse(await readFile(resolve(ROOT, env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8'));
  env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||= json.client_email;
  env.GOOGLE_PRIVATE_KEY = json.private_key;
}

const PASS = ['DEMO', 'CLOUDFLARE_ON', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY',
              'GOOGLE_SPREADSHEET_ID', 'GOOGLE_SHEET_RANGE'];
// A shell variable beats the file, matching serve.mjs.
for (const k of PASS) if (process.env[k]) env[k] = process.env[k];
const args = ['wrangler', 'pages', 'dev', 'public', ...process.argv.slice(2)];
for (const k of PASS) if (env[k]) args.push('--binding', `${k}=${env[k]}`);

// The values are arguments to a child process, never printed and never written to a file.
console.log(`  wrangler pages dev public  ·  ${
  PASS.filter((k) => env[k]).length} bindings from .env\n`);
spawn('npx', args, { cwd: ROOT, stdio: 'inherit' })
  .on('exit', (code) => process.exit(code ?? 0));
