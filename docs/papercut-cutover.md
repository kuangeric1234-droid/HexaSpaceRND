# PaperCut cutover runbook — OfficeRnD → Hexa connector

Migrates print provisioning, auth, and billing from the OfficeRnD PaperCut agent to the Hexa
connector (`scripts/papercut-connector/`). Runs on the Box Hill PaperCut server (PaperCut MF
22.0.9, internal Derby DB, XML-RPC API on `127.0.0.1`).

**No secrets in this file.** The Web Services auth token, Supabase keys, `PAPERCUT_SYNC_TOKEN`,
and any passwords live only in the gitignored `.env` / `providers/hexa/hexa-config.json` on the
server — never here.

## The charge model (what we're implementing)
- Each member gets **$30/month** print credit. Rates: **A4 $0.30 b/w / $0.60 colour · A3 $0.60 /
  $1.20**.
- Accounts are **restricted** (so the balance is tracked) **with overdraft enabled** (so members
  are **never blocked** — they print past $30 into a negative balance).
- **Month-end** (`index.mjs`, before the native quota allocation): bill `abs(negative balance)` as
  fees → the bill run folds it onto the invoice → **reset billed members to $30**. The native
  monthly quota tops up everyone else, capped at $30 (MaxAccumulation = 30), so no double credit.

## Hard gates (do not start Phase 3/5 until true)
1. **Overdraft enabled globally** before anyone is set restricted (else restricting blocks at $0).
2. **Members have portal passwords** before the auth switch (Phase 5) — anyone without one can't
   print after it. Depends on the portal migration.
3. **Elevated OS session** for: `server.properties` (Phase 5), the `config.json` ACL tighten
   (Phase 6), and service changes (Phase 1). Confirmed on this box: `server-command.exe` needs
   elevation (even reads are access-denied). **Phase 3A needs an admin BROWSER login only** — it's
   a normal UI field, not a config key (see 3A). All other XML-RPC calls (incl. Phase 3B) are
   token-auth and headless. Book the window with **both** OS elevation and an admin browser.
4. **Stop the OfficeRnD prune (Phase 1) before any live provision** — its nightly ~21:32
   `deleteExistingUser` removes non-OfficeRnD users, so provisioned accounts vanish within hours.

## Pre-flight (read-only)
- Confirm elevated.
- `server.properties`: current `auth.source.custom-program` (should be OfficeRnD's
  `papercutauth.exe`), web-services enabled, allowed-hosts.
- Connector files present in the checkout: `provision-members.mjs`, `sync-pins.mjs`,
  `sync-print-jobs.mjs`, `index.mjs`, `hexa-auth.cmd`, `auth-provider.mjs`, `hexa-config.json`,
  `.env`. Confirm `index.mjs` is the version with the $30 reset (`git pull` first).
- Snapshot for rollback: total user count; a few users' `restricted` + `balance`; the current
  `auth.source.custom-program`.

## Phase 1 — stop the nightly prune (reversible)
- `Stop-Service PaperCutCA; Set-Service PaperCutCA -StartupType Disabled`
- Verify stopped + disabled. Note: OfficeRnD no longer provisions new members, so the connector
  must take over (Phase 2).
- **Rollback:** `Set-Service PaperCutCA -StartupType Automatic; Start-Service PaperCutCA`

## Phase 2 — connector takes over provisioning
- **ORDER: Phase 1 MUST be done first.** Do not live-provision until PaperCutCA is confirmed
  **stopped + disabled** — otherwise the nightly ~21:32 prune deletes the ~226 accounts you just
  created within hours. The dry-run is always safe; only the live apply is gated on this. (This is
  why the connector-side auto-mode guardrail blocks the write until the prune-gate is lifted.)
- Dry-run: `node provision-members.mjs` (APPLY unset) → review CREATE/ASSIGN/KEEP counts.
- Live: `PAPERCUT_PROVISION_APPLY=1 node provision-members.mjs` — creates users + auto-generates a
  PIN (primary-card-number) at creation; backfills a PIN for any existing member missing one.
- Verify: a newly-created member persists (no prune now), has a card, and appears in `member_pins`
  after `node sync-pins.mjs`.
- Schedule a nightly Task running `provision-members.mjs` so new signups get accounts.

## Phase 3 — restricted + overdraft + $30 quota (no cap) — GATED
Split by requirement: **3A needs an admin/elevated session; 3B is headless.**

### 3A — enable overdraft globally  (ADMIN BROWSER — not OS elevation)
So restricted ≠ blocked.

**RESOLVED (16 Jul 2026): this is NOT a config key.** It's a normal admin UI field — no Config
Editor, no `server-command set-config`, no key to hunt. Per PaperCut's manual:

> **Options tab → General page → Account Options area → "Default overdraft limit for restricted
> users/accounts" → enter the limit → Apply.**

This is why `system.default-user-overdraft` read back `""` — it was never a real key, and
`getConfigValue` returns `""` for unknown keys, which made the guess look ambiguous rather than
simply wrong. Earlier notes framing 3A as "needs elevation for server-command" were chasing a
ghost: **3A needs an admin browser login only.** (OS elevation is still required for Phase 1's
service change, Phase 5's `server.properties`, and Phase 6's ACL — just not for this.)

1. Set the field to a high limit (e.g. `100000` = effectively unlimited) → Apply.
2. **Still open (docs don't say):** whether the default applies retroactively to EXISTING restricted
   users or only newly-restricted ones. Do not assume — the VERIFY step below is what settles it.

**VERIFY (the real pass/fail — not a balance write):** read demo's effective overdraft
(`api.getUserOverdraftMode` + limit) — it must reflect the global you set. A negative balance via
`adjustUserAccountBalance` proves nothing (admin adjustments always succeed); the effective
overdraft limit is what stops a restricted user being blocked at release.

### 3B — 2-member restricted test  (HEADLESS; token-auth API, no elevation)
For 2 TEST accounts (not real members):
`api.setUserProperty(user, 'restricted', 'TRUE')` → read back `restricted` (TRUE), `balance`
(~30), and the effective overdraft limit (from 3A). Confirm restricted + $30 + overdraft in
effect. **Pause for sign-off.**

### Bulk (after go)
Set active members restricted + in the $30 quota group; ensure each holds the current month's $30.
Verify sample balances = $30, not capped; run `sync-pins.mjs`.
Also confirm **A3 b/w page cost = $0.60** (A4 $0.30/$0.60 + A3 colour $1.20 verified from print
logs; A3 b/w inferred) and that `index.mjs` is the pulled version with the $30 reset
(`PAPERCUT_DRY_RUN=1 node index.mjs` runs clean).

## Phase 4 — schedule the syncs
Windows Task Scheduler:
- `sync-pins.mjs` — daily (PINs + balances → portal dashboard).
- `sync-print-jobs.mjs` — daily (job history → portal Printing tab).
- `index.mjs` — monthly, **month-end BEFORE the native quota allocation** and before the bill run
  (its reset assumes it reads the true negative balance).
Run each once manually first.

## Phase 5 — switch print login to portal credentials — GATED on portal passwords

### Pre-cutover straggler check — who actually gets locked out
The gate is **not** "everyone signed up for the portal." It's "every member who actually prints has
a portal password." Drive to *that* number, not total signup:
1. On the box, list distinct users from the last ~30 days of print logs
   (`[app-path]\server\logs\csv\daily`) → resolve each to its portal email → `active-printer-emails.txt`.
   (Real denominator observed 2026-07-10: **22** distinct printers, not 431 — all resolved cleanly.)
2. Diff those emails against portal-password status **portal-side** (service key never leaves the
   portal): `POST /api/papercut/has-password` with `{ emails: [...] }`, Bearer `PAPERCUT_SYNC_TOKEN`.
   Returns `missing` = active printers with **no** portal password. Backed by the SECURITY DEFINER
   fn `public.papercut_has_password` (`papercut-has-password-schema.sql` — run it in Supabase once).
3. Chase invites for the `missing` list only. Flip when it's empty (or holds only dormant
   non-printers). **Caveat:** print logs rotate at ~30 days, so quarterly/dormant printers aren't in
   the count — they're the tail you mop up AFTER the flip (rollback is one command), not a gate.
   Only card/tap release is unaffected for the password-less; Mobility-Print first-run and the
   `:9191` web sign-in are what break, which is why this is a chase and not a blocker.

- Copy `hexa-auth.cmd` + `auth-provider.mjs` + `hexa-config.json` to
  `C:\Program Files\PaperCut MF\providers\hexa\`.
- Add that dir to `security.custom-executable.allowed-directory-list`.
- Set `auth.source.custom-program` → `…\hexa\hexa-auth.cmd`; `auth.source.env-vars` →
  `HEXA_AUTH_CONFIG=…\hexa\hexa-config.json`.
- Restart the PaperCut app server.
- Verify: a member logs in with their **portal** password through the real PaperCut path; a member
  with **no** portal password is correctly refused.
- **Rollback:** point `auth.source.custom-program` back to `papercutauth.exe`, restart. Keep
  `papercutauth.exe` in place until confident.
- (Known cosmetic: `auth-provider.mjs` prints a libuv teardown assertion on exit; stdout is
  flushed first and PaperCut ignores the exit code. Harden later by draining stdin before exit.)

## Phase 6 — lockdown + post-cutover watch
- Tighten the ACL on `providers\config.json` (holds cleartext OfficeRnD + API secrets) to
  Administrators + SYSTEM only.
- That night ~21:32: confirm **no prune** ran (PaperCutCA disabled).
- Confirm a fresh test signup gets a PaperCut account from the nightly provision task.
- After a soak period, retire the OfficeRnD agent.

## Validation status (as of go-live prep)
- ✅ PIN auto-created at provisioning · PIN + balance → `member_pins` → dashboard · restricted +
  $30 produces a real balance · portal-credential login (positive + negative) · `index.mjs` reset
  loop present and dry-run clean.
- ⏳ Overdraft enablement · bulk restrict · auth switch (needs portal passwords) · scheduling.
