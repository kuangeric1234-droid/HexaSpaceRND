# PaperCut MF connector

Pushes monthly print charges from the **on-prem PaperCut MF server** at Box Hill into
Hexa's Fees, where the bill run folds them onto each company's invoice.

**Why a connector and not a Vercel function:** PaperCut MF's XML-RPC API is bound to
`127.0.0.1` and its auth token is print-admin-grade (it can adjust balances). This script
runs on the LAN so that API never faces the internet. Full rationale + alternatives:
[docs/papercut-integration.md](../../docs/papercut-integration.md).

## One-time setup (on the Box Hill box)

1. **Enable the API** in PaperCut: *Options → Advanced → Enable XML Web Services*, copy the
   **auth token**. If the script runs on a different host than the PaperCut server, also add
   that host's IP to the allowed-addresses list.
2. Install Node 18+ and this folder's dep:
   ```
   cd scripts/papercut-connector
   npm i xmlrpc
   ```
3. Set env (Task Scheduler action, or a local `.env` you load):
   | var | value |
   |-----|-------|
   | `PAPERCUT_SERVER` | `http://localhost:9191` (or `https://…:9192`) |
   | `PAPERCUT_AUTH_TOKEN` | the Web Services auth token |
   | `HEXA_SYNC_URL` | `https://portal.hexaspace.com.au/api/papercut/sync` |
   | `PAPERCUT_SYNC_TOKEN` | shared secret — **must match** the same var set on Vercel |

## Run

```
# preview only — no POST, prints the payload:
PAPERCUT_DRY_RUN=1 node index.mjs --period 2026-07

# live (defaults to the previous calendar month if --period omitted):
node index.mjs --period 2026-07
```

Schedule it monthly, a day or two **before** the bill run, so charges are `Not Paid` in
time to be folded onto the month-end invoices.

## Other scripts in this folder

- **provision-members.mjs** — Hexa roster → PaperCut users/groups/card numbers (dry-run by
  default; `PAPERCUT_PROVISION_APPLY=1` to write). Run nightly or after onboarding.
- **sync-pins.mjs** — reads each user's card number + personal balance back into Hexa
  (`member_pins`) so members see their own print PIN and printing balance in the app/portal.
  Schedule daily-ish to keep the balance fresh.
- **sync-print-jobs.mjs** — parses PaperCut's daily CSV job logs
  (`[app-path]\server\logs\csv\daily`, override with `PAPERCUT_CSV_DIR`) and pushes each
  member's print jobs to `/api/papercut/jobs` → the portal's **Printing** tab (job history +
  per-job cost against their balance). Idempotent; schedule daily alongside sync-pins.
  Extra env: `HEXA_JOBS_URL` (default `…/api/papercut/jobs`), `PAPERCUT_JOB_DAYS` (default 35).
- **auth-provider.mjs / hexa-auth.cmd** — PaperCut **custom authentication program**: lets
  members sign in to print (Mobility Print first-run, the `:9191` user portal) with their
  **Hexa portal email + password** instead of OfficeRnD credentials. See below.

## Portal-credential sign-in (replaces OfficeRnD's papercutauth.exe at cutover)

1. Copy `auth-provider.mjs` + `hexa-auth.cmd` to e.g. `C:\Program Files\PaperCut MF\providers\hexa\`,
   and create `hexa-config.json` there from `hexa-config.example.json` (Supabase URL, **anon**
   key — never the service key — plus the local Web Services token so legacy usernames can be
   resolved to emails).
2. Allow the directory in `[app-path]\server\security.properties`:
   `security.custom-executable.allowed-directory-list=C:\Program Files\PaperCut MF\providers\hexa`
3. In the PaperCut admin config editor set:
   - `auth.source.custom-program` → `C:\Program Files\PaperCut MF\providers\hexa\hexa-auth.cmd`
   - `auth.source.env-vars` → `HEXA_AUTH_CONFIG=C:\Program Files\PaperCut MF\providers\hexa\hexa-config.json`
4. Test: `echo member@example.com& echo theirPortalPassword` piped to `hexa-auth.cmd` should
   print `OK` + the PaperCut username; a wrong password prints `ERROR`.

**Timing: do NOT switch this before cutover** — while members still authenticate with
OfficeRnD credentials, leave papercutauth.exe in place. Switch when the portal migration
completes (members have set portal passwords). Members typing a legacy (non-email) username
still work: the provider resolves it to their email over localhost XML-RPC. Card/PIN release
at the copier is unaffected either way.

## Before go-live — decide the charge model

The script defaults to reading each user's **personal-account balance** as the amount.
Confirm this matches how members actually pay for printing (personal credit vs per-company
shared accounts) and whether to bill **at cost or with markup** — see the open questions in
[docs/papercut-integration.md](../../docs/papercut-integration.md#4-open-questions-resolve-before-coding).
Method/property names are from PaperCut's documented set; verify against your exact MF
version. Test with `PAPERCUT_DRY_RUN=1`, then a single-user live run, before the first full month.
