# secrets/

Local credentials. **Everything in this directory except this file is gitignored and must
never be committed.**

## What goes here

`google-service-account.json` — the JSON key for the service account that reads the private
events sheet. Download it from Google Cloud → IAM & Admin → Service Accounts → Keys.

The account also has to be given **Viewer** access to the spreadsheet itself, by sharing the
sheet with its `client_email` address. Nothing else grants access; the sheet must not be made
public and "Publish to web" must not be used.

`.env` in the repository root points at this file:

```
GOOGLE_APPLICATION_CREDENTIALS=./secrets/google-service-account.json
```

`serve.mjs` and `tools/dev-cf.mjs` read the email and private key straight out of it, so the
key does not have to be pasted into a second file.

## What this is not for

Production. Cloudflare Pages holds `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` and
`GOOGLE_SPREADSHEET_ID` as secrets in the project settings, and the deployed site reads them
from `context.env`. This directory is never uploaded: only `public/` is published, and this is
not inside it.

## If a key is ever committed

Revoke it in Google Cloud and create a new one. Deleting the file in a later commit does not
help — it stays in the history, and the history is on GitHub.
