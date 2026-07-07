# Hexa Space — Data Security Audit & RLS Remediation

**Status:** Phase 1 (audit) complete. Remediation phases tracked below.
**Project:** Supabase `ihvhnsdsvjwpyquvetzz` (`portal.hexaspace.com.au`).
**Trigger:** ~220 members about to be invited to the portal; the public anon key
(shipped in the browser bundle) can currently read **and write** every table.

---

## 0. Executive summary

Two independent, systemic problems:

1. **RLS is enabled on every table but every policy is `using(true)` for the
   `anon` role** (and for `authenticated`). The anon key therefore reads and
   writes everything: all tenants, members' PII, leases, invoices, `settings`
   (bank details + `adminUsers` allow-list), leads, etc. Verified live — see the
   baseline probe (§6). `member_pins` and `integrations` are the only tables
   correctly locked (RLS on, no anon/auth policy → default-deny).

2. **The service-role `api/` layer has no notion of "who is calling."** Every
   endpoint builds its client with `SUPABASE_SERVICE_ROLE_KEY`, so it **bypasses
   RLS**, and almost none verify the caller. An anonymous request can charge
   another tenant's saved card, provision/revoke physical door access by email,
   invite itself into any company, ban any account, or run the monthly bill run.
   **RLS will not fix these** — they need their own auth gates (§5).

Additional exposures: the **`event-insurance` storage bucket is public**
(third-party insurance PDFs with PII reachable by URL); `email_log`/`audit_log`
readable by any session; the admin/member split is purely client-side (both are
generic Supabase-Auth `authenticated` sessions on the same anon-key client).

### Architecture facts (verified in code)

- One Supabase project, one anon key (`src/lib/supabase.js`), three browser
  consumers: **admin app** (`src/`, `useStore` loads all tables), **member
  portal** (`src/portal/`), **mobile app** (`src/app/`), plus **public token
  pages** (`src/components/SignPage.jsx`, `FunctionSignPage.jsx`,
  `EventBookingSignPage.jsx`).
- **Both admins and members authenticate via Supabase Auth** (`PortalLogin` →
  `signInWithPassword`). `src/App.jsx` `RootAuth` decides admin-vs-member purely
  client-side by matching the email against `settings.adminUsers` ∪ a hardcoded
  fallback. `api/auth/login.js` + `src/components/Login.jsx` are **dead code**.
  ⇒ At the DB level the admin app is `authenticated`, **not** `anon`. Locking
  down `anon` does **not** break admin. RLS can only distinguish `anon` from
  `authenticated` today — it cannot tell admin from member.
- Data model: almost every table is a generic KV row `(id text, data jsonb,
  updated_at)`. Scoping fields live **inside** `data` (`companyId`, `tenantId`,
  `memberId`, `email`). `esign_requests` has real columns; `meta` is `(key,value)`.
- Company model: a **tenant == a company**. `members.data.companyId ==
  tenants.id`. Portal identity = `auth.email()` → `members` row (by `data.email`)
  → `data.companyId`; fallback: a `tenants` row whose `data.email` matches.
- `api/` service-role functions are unaffected by RLS (crons, Stripe webhook,
  e-sign countersign, etc. keep working through any RLS change).

---

## 1. Table → consumer → access-needed matrix

Legend — **A**=admin app, **P**=portal/mobile (member), **U**=public token page,
**S**=service-role api. "Member access" is the target end-state for the
`authenticated` (non-admin) role.

| Table | Current anon policy | Consumers | Member access needed (target) | Anon access needed (target) |
|---|---|---|---|---|
| tenants | ALL using(true) | A rw · P r(own+dir) · U r(via sign) · S | SELECT/UPDATE own company row only | none (sign page → endpoint) |
| members | ALL using(true) | A rw · P r(own co)/w(self+invite) · S | SELECT own-company members; UPDATE self | none |
| leases | ALL using(true) | A rw · P r(own) · U rw(sign) · S | SELECT own company (`data->>tenantId`) | none |
| invoices | ALL using(true) | A rw · P r(own) · S | SELECT own company | none |
| spaces | ALL using(true) | A rw · P r(all, inventory) · U r · S | SELECT (inventory is non-sensitive) | none |
| bookings | ALL using(true) | A rw · P rw(own)+r(availability) · S | SELECT/INSERT/UPDATE own; availability via sanitized view | none |
| fees | ALL using(true) | A rw · P r(own)+w(over-allowance) · S | SELECT/INSERT own (`data->>companyId`) | none |
| mail_items | ALL using(true) | A rw · P r(own) · S | SELECT own company | none |
| food_orders | ALL using(true) | A rw · P rw(own) · S | SELECT/INSERT own company | none |
| food_menu_items | ALL using(true) | A rw · P r(menu) · S | SELECT (global menu) | none |
| function_bookings | ALL using(true) | A rw · P r(own)+w(sign) · U rw(sign) · S | SELECT/UPDATE own company | none (sign page → endpoint) |
| event_bookings | anon SELECT+UPDATE | A rw · U rw(sign) · S | admin only | none (sign page → endpoint) |
| esign_requests | anon ALL | A rw · U rw(sign) · S | admin only | none (sign page → endpoint) |
| portal_messages | anon ALL | A rw · P rw(own thread) · S | SELECT/INSERT/UPDATE own tenant thread | none |
| portal_events | anon ALL | A rw · P r(global) · S | SELECT (global events) | none |
| settings | ALL using(true) | A rw · P r(subset) · U r(subset) · S | **no** direct read (public subset via view/endpoint) | none |
| leads | ALL using(true) | A rw · S | admin only | none |
| lead_pipeline_stages | ALL using(true) | A rw · S | admin only | none |
| discounts | ALL using(true) | A rw · S | admin only | none |
| maintenance | anon ALL | A rw · S | admin only | none |
| documents | anon ALL | A rw · S | (future member docs) admin only for now | none |
| referrers | ALL using(true) | A rw · U(via endpoint) · S | admin only | none |
| audit_log | anon ALL | A r · S(w) | admin only | none |
| email_log | anon ALL | A r · S(w) | admin only | none |
| meta | ALL using(true) | A rw · S | admin only | none |
| member_pins | **none (locked)** | S only | none | none — **already correct** |
| integrations | **none (locked)** | S only | none | none — **already correct** |

**Decision — anon needs NO table access.** Every public flow (e-signing,
function/event signing, proposal accept, referrer dashboard, function booking
request) is or will be routed through a token-verifying serverless endpoint
(§4/Phase 2). After Phase 2 the anon role is default-deny on all tables. Supabase
**Auth** endpoints (login, reset, invite-link consumption) are unaffected by
table RLS and remain available.

---

## 2. Client-side call inventory (condensed)

Full per-line inventories were produced for all three surfaces; highlights:

### Admin app (`authenticated`, anon-key client)
Reads/writes **every** table via the generic `syncRow`/`deleteRow`/`seedTable`
helpers in `useStore.js` plus direct calls in components (messages, e-sign
countersign in `ContractDetail.jsx`, events/food/mail/documents). Loads whole
`settings` blob into the browser (`useStore.js:846`, `App.jsx:50`) — **bank
details + adminUsers**. Uploads to the public `event-insurance` bucket.

### Member portal + mobile (`authenticated`)
- Identity resolved **client-side**: email → `members` row → `companyId` →
  `tenants`. (`PortalApp.jsx:120-168`, `app/lib/useMemberData.js:20-42`.)
- **Already server-scoped** (safe): `invoices`, `leases` (`data->>tenantId`),
  `mail_items`, `food_orders` (`data->>companyId`).
- **Whole-table loads that leak cross-company data today** (only masked by JS
  `.filter`): `tenants`, `members`, `bookings`, `fees`, `function_bookings`,
  `portal_messages`. These must move to scoped queries in Phase 3.
- **Room/studio availability legitimately needs other companies' booking
  time-slots** (`PortalCalendar.jsx`, `app/tabs/Book.jsx`, `RoomDetail.jsx` read
  `allBookings` to grey out busy cells / detect clashes, masking foreign titles
  in the UI). A naive per-tenant SELECT policy on `bookings` breaks this ⇒ Phase
  3 adds a **sanitized availability view** exposing only `(resourceId, date,
  startTime, endTime, status)` — never title/memberId/reference.

### Public token pages (`anon`) — must move off anon (Phase 2)
- `SignPage` (`/sign/:token`): reads `esign_requests` (by token), `leases`,
  `tenants`, `spaces`, `settings`, `templates`; **writes** `esign_requests` +
  `leases`.
- `FunctionSignPage` (`/book/function/:token`): loads the **entire**
  `function_bookings` table, finds by `signingToken` client-side; writes it.
- `EventBookingSignPage` (`/sign/event/:token`): loads the **entire**
  `event_bookings` table; writes it; uploads the signed PDF to the public
  `event-insurance` bucket.
- Already server-side (no anon, good templates): `ProposalAccept` (`/api/proposal*`),
  `FunctionBookPage` (`/api/function-request`), `ReferrerDashboard`
  (`/api/referrer-dashboard`). `PortalLogin` uses only `supabase.auth`.

---

## 3. Secrets / sensitive data reaching the browser

| Item | Where | Risk | Remediation |
|---|---|---|---|
| `settings.billing` (bankName, bsb, **acc**) | `useStore.js:846`, invoices | Bank account number in every session; anon-readable | Split public subset (company name + bank details needed on invoices) into a view/endpoint; rest admin-only (Phase 5) |
| `settings.adminUsers` (admin emails/roles) | `App.jsx:50`, `useStore.js:846` | Privilege allow-list, anon-readable → admin targeting | Move role decision to an `admins` table (Phase 4); drop from anon/member reach (Phase 5) |
| `esign_requests.*` incl. signature images | `ContractDetail.jsx:68` (`select('*')`) + open anon | Signing tokens + signature blobs enumerable | Lock to admin/service; sign page via endpoint (Phase 2/4) |
| `event-insurance` bucket (public) | `EventBookings.jsx`, `EventBookingSignPage` | Third-party insurance PDFs (PII) public by URL | Make bucket private; serve via signed URL from an endpoint (Phase 2/5) |
| `email_log`, `audit_log` | `Reports.jsx:34,44` | Email bodies/recipients + full admin action trail readable by any session | Admin-only policies (Phase 4) |
| VITE_ env / hardcoded keys | `src/lib/supabase.js` | Only `VITE_SUPABASE_URL` + anon key (expected public). Stripe/Xero/Resend/Anthropic secrets are server-side env only — **not** in the bundle or `settings`. ✓ | none needed |

No API secrets were found in the client bundle or the `settings` row beyond the
(expected-public) Supabase URL + anon key. `settings.xero` holds only
account-name mappings, not tokens.

---

## 4. Decision: what anon keeps, and the public-endpoint plan (Phase 2)

**Anon keeps no table access.** New/extended serverless endpoints that verify
the flow token server-side (service role, RLS-bypassing):

| Public page | New endpoint(s) | Server-side check |
|---|---|---|
| SignPage | `POST /api/sign/load` `{token}` → scoped lease/tenant/space/settings-subset/templates; `POST /api/sign/submit` `{token, signer…, signature}` | token → `esign_requests` row; only that lease's data returned/written |
| FunctionSignPage | `POST /api/function-bookings/load` `{token}`; extend sign write into `/api/function-bookings/notify` or a new `submit-sign` | token == `data.signingToken`; only that booking |
| EventBookingSignPage | `POST /api/event-bookings/load` `{token}`; sign/details/insurance writes + private PDF upload via endpoint | token == `data.signingToken`; only that booking |

The existing notify endpoints (`function-bookings/notify`,
`event-bookings/send-signing`) already exist and are service-role.

---

## 5. `api/` IDOR / privilege-escalation findings (RLS-independent)

Ranked; all reachable **unauthenticated** because service-role bypasses RLS and
the caller is not verified. Fix pattern: verify a Supabase JWT for member
actions and assert `resource.companyId/tenantId === caller.companyId`; gate
admin actions behind an admin identity; add `CRON_SECRET` to every cron.

| # | Sev | Endpoint | Hole | Fix |
|---|---|---|---|---|
| 1 | CRIT | `portal/add-teammate.js` | trusts `companyId` → creates portal member + auth user under any company | JWT; caller.companyId === companyId |
| 2 | CRIT | `auth/invite.js` | create auth account for any email → logged-in session; attacker `redirectTo` | admin-only; pin redirect server-side |
| 3 | CRIT | `salto/provision.js` | provision door access for any email/door | admin-only; door derived from server-looked-up lease |
| 4 | HIGH | `salto/revoke.js` | revoke any member's door access | admin-only |
| 5 | HIGH | `stripe/charge.js` | charge any tenant's saved card by `invoiceId` | admin-only |
| 6 | HIGH | `food/charge.js` | charge any company's card by `orderId` | JWT; caller owns order |
| 7 | HIGH | `auth/revoke.js` | ban any account by email | admin-only |
| 8 | HIGH | `function-bookings/submit.js` | raise real deposit/$300 invoices for any booking id; can repoint member.companyId | admin-only |
| 9 | HIGH | crons: `auto-billing`, `overdue-reminders`, `reconcile`, `xero/sync`, `*-reminders`, `*-nurture` | no `CRON_SECRET` → anyone triggers bill runs, card charges, mass email | verify `Authorization: Bearer $CRON_SECRET` |
| 10 | MED-HIGH | `google-ads/push.js`,`report.js` | act on arbitrary Google Ads customerId via Hexa token | admin-only; server-side allowlist |
| 11 | MED | `portal/status.js` | membership/enumeration oracle for any email | JWT own-email or admin |
| 12 | MED | `stripe/setup.js` | card-setup session for any tenant | JWT; caller.companyId === tenantId |
| 13 | MED | `send-email`,`portal/notify-*`,`event-bookings/send-signing`,`function-bookings/notify` | branded-email/open-relay (safe-mode gated today) | auth; load booking server-side, don't render body-supplied links/recipients |
| 14 | MED | `sanity-sync.js`,`sanity-upload.js` | unauthenticated website content write/delete | admin-only |
| 15 | MED | `xero/disconnect.js` | unauthenticated integration teardown | admin-only |
| 16 | MED | `proposal.js`/`-accept`/`-decline` | token-only (PII on `proposal.js`); ensure ≥128-bit tokens | verify token entropy; rate-limit |
| 17 | LOW-MED | `book-tour.js`,`function-request.js` | overwrite existing lead/booking matched by email/ref | don't overwrite owned records keyed on email |
| 18 | LOW | `auth/login.js` | default `AUTH_SECRET='hexahub-secret'` (dead code, remove) | delete dead endpoint |

**Safe-mode caveat:** `api/_email.js` currently redirects all mail to
`eric@hexaspace.com.au` while `settings.emails.safeMode !== false` (default ON),
neutering the email-only findings — they go live the moment safe mode is turned
off (imminent per migration notes). Fix regardless.

---

## 6. Baseline adversarial probe (before remediation)

`scripts/security-probe.mjs` uses ONLY the anon key (and, when
`TEST_MEMBER_EMAIL/PASSWORD` are set, a real member JWT). Every probe asserts an
unauthorised action FAILS; a decisive INSERT probe proves each table's policy
state (empty tables can't be judged by reads alone). Full baseline captured in
`docs/_probe-baseline.txt`. Result:

```
=== SUMMARY: baseline — anon can read & write private data ===
anon read tenants/members/leases/invoices/fees/bookings/function_bookings/
  leads/settings/discounts/audit_log/email_log/documents/esign_requests — LEAKED rows
anon INSERT accepted into tenants, members, leases, invoices, fees, bookings,
  mail_items, food_orders, function_bookings, leads, settings, maintenance,
  discounts, referrers, audit_log, email_log, documents  (policy is open)
anon write leases (tamper rent) / invoices (mark paid) / settings / members — ALLOWED
anon read settings.adminUsers/billing (bank details) — LEAKED
```

This is the "before". Each remediation phase re-runs the probe; the target is
**0 holes** with the member positive-control still passing. Per-phase results
are appended below as phases land.

---

## 7. Rollout / sequencing (live production)

Migrations are checked-in SQL (`migrations/`) applied via the Management API.
Ordering matters because destructive drops on the live DB take effect **before**
new frontend code deploys:

1. **Additive first (safe, no breakage):** `admins` table + `is_admin()` +
   `current_company()` helpers; member-scoped policies **alongside** the existing
   permissive ones; sanitized availability view; public settings view. These
   change nothing until the permissive policies are dropped.
2. **Phase 2 anon lockdown** must land only **after** the endpoint-based public
   pages are deployed (else live e-signing breaks). Endpoints + frontend commit
   first; drop anon policies after deploy.
3. **Drop `authenticated` `allow all` policies** (the member-restricting step)
   only **after** (a) member-scoped policies exist, (b) admin `is_admin`
   policies exist, and (c) the portal/app scoped-query build is deployed — so
   admins keep full access and members' portal doesn't blank out.
4. Crons + Stripe webhook + e-sign countersign are service-role → unaffected by
   every RLS change; verified separately.

---

## Phase results

- **Phase 1 — Audit:** ✅ complete (this document + `docs/_probe-baseline.txt`).
- **Phase 2 — Public pages off anon:** ✅ code shipped. SignPage / FunctionSignPage /
  EventBookingSignPage now use token-verifying endpoints (`api/sign/*`,
  `api/function-bookings/{load,sign}`, `api/event-bookings/{load,save,upload}`).
  The anon-drop for those tables is folded into the Phase 6 cutover migration.
- **Phase 3 — Member scoping:** ✅ `migrations/phase3_member_scoping.sql` APPLIED
  live (additive/inert). Helpers `current_email()`/`current_company()`, `mem_*`
  policies, and the sanitized `booking_availability` view. Portal + mobile loaders
  switched to the view for cross-company availability.
- **Phase 4 — Admin auth:** ✅ `migrations/phase4_admin_auth.sql` APPLIED live
  (additive). `admins` allow-list + `is_admin()` + `adm_*` full-access policies +
  a trigger syncing the allow-list from the Settings UI. `App.jsx` role now via the
  `is_admin()` RPC. Seeded admins: eric@, info@, admin@, william@hexa.com.au.
- **Phase 5 — Settings/secrets:** ✅ code shipped. `api/portal/settings.js` public
  subset; mobile reads it instead of the raw row. `event-insurance` bucket
  privatization + signed URLs (`migrations/phase5_storage_bucket.sql`, folded into
  Phase 6). Settings row becomes admin-only at cutover.
- **API IDOR remediation:** ✅ shipped. `api/_auth.js` gates + `src/lib/apiFetch.js`
  send the caller's JWT. Admin-gated: invite, revoke, salto/*, google-ads/*,
  sanity-*, xero/disconnect, send-email, notify-reply, status. Ownership-scoped:
  add-teammate, stripe/charge+checkout+setup, food/charge+checkout,
  function-bookings/submit. Crons require `CRON_SECRET` (or admin).
- **Phase 6 — Cutover + adversarial verification:** ⏳ PENDING DEPLOY. The additive
  work above is live but INERT (permissive policies still present → holes still
  open exactly as at baseline; production behaviour unchanged). The cutover
  (`migrations/phase6_cutover.sql`) drops every permissive policy — it must run
  only AFTER this branch is deployed to production (verified: prod still serves the
  old bundle as of this writing).

## Cutover runbook (Phase 6)

Do these in order:

1. **Deploy** the `security/rls-remediation` branch to **production** (merge to
   `main` → Vercel deploy). This makes the new endpoints + JWT-sending client live.
2. **Set Vercel env vars** (Project → Settings → Environment Variables):
   - `CRON_SECRET` — any long random string. Vercel sends it as the cron Bearer;
     until set, crons run **unguarded** (still functional, just not enforced).
   - `SANITY_WEBHOOK_SECRET` (optional) — if the website Sanity webhook calls
     `portal/notify-event`; also add it to the Sanity webhook's `sanity-webhook-secret` header.
3. **Verify prod is live**: `POST https://portal.hexaspace.com.au/api/sign/load {}`
   should return JSON `{"error":"Missing token."}` (not the SPA HTML / 405).
4. **Apply the cutover**: `node scripts/migrate.mjs migrations/phase6_cutover.sql`.
5. **Verify adversarially** with a member JWT (target 0 holes):
   `node scripts/security-test-member.mjs up` then
   `TEST_MEMBER_EMAIL=… TEST_MEMBER_PASSWORD=… VICTIM_COMPANY_ID=__sectest__co VICTIM_TENANT_ID=tc4 node scripts/security-probe.mjs`
   then `node scripts/security-test-member.mjs down` to remove the disposable member.
6. **Smoke-test** live: admin login + a page load, portal login + bookings/invoices,
   a `/sign/<token>` page, Stripe webhook (unchanged), and one cron (`?key=$CRON_SECRET`).

Rollback: re-adding a permissive policy restores open access, e.g.
`create policy tmp_open on public.<t> for all to authenticated using (true);` (emergency only).

## Residual items (documented, lower priority)

- `api/book-tour.js` / `api/function-request.js` (MED-LOW): public forms overwrite an
  existing lead/booking matched by email/ref. Recommend: don't mutate an owned record
  from a public form keyed only on email; create a new record or require the token.
- `api/auth/login.js` + `src/components/Login.jsx` (LOW): dead code (no endpoint
  validates the token; real login is Supabase Auth). Safe to delete.
- Credit balances (`tenants.data.creditsRemaining`) are written client-side by members
  (booking deduction). Members can update their own tenant row (`mem_upd_tenants`), so a
  determined member could tamper with their own credit balance. Recommend moving credit
  math into the booking endpoint. Not cross-tenant, so out of scope for this pass.
