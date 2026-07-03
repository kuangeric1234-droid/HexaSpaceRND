# System Gap Backlog

Source of truth for the gap-fixing loop. Work items IN ORDER (top to bottom).
Each loop iteration: pick the FIRST item with status `[ ]`, implement it fully,
verify (build + targeted node tests), flip it to `[x]` with a one-line note of
what was done, then commit with a descriptive message. One item per iteration
unless items are explicitly marked as a pair. When every item is `[x]`, the
loop is done — say so and stop scheduling.

## Ground rules (read every iteration)

- **No Xero dependency.** Xero sync is gated off until ~1 Sep 2026. Never make
  a fix depend on Xero being connected. Credit notes stay manual in Xero.
- **No Salto dependency.** Salto is not configured. Any code path that calls
  Salto (`api/salto/*`, `provisionSaltoAccess`, `revokeSaltoAccess`) must
  degrade gracefully when unconfigured: skip silently server-side, and never
  show the member a dead "activate door access" button/link.
- **Stripe exists as keys only** (`STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`
  in .env.local / Vercel). Item 7 builds the integration; nothing else may
  assume it exists before item 7 is done.
- Stack: React 19 + Vite, Tailwind v4, Supabase (tables are `{id, data}` JSONB
  rows), Vercel serverless in `api/`, state in `src/store/useStore.js`.
  Dates DD/MM/YYYY display, ISO yyyy-MM-dd storage. Currency AUD.
- Verify every item with `npx vite build` plus a quick `node --input-type=module`
  test of any new pure logic (see `src/lib/paymentSchedule.js` history for the
  pattern). For serverless endpoints, test the pure helpers, not the handler.
- Live Supabase credentials are in `.env.local` — use the service key for
  read-only inspection when needed. NEVER mutate production rows except where
  an item explicitly says to backfill.
- Commit after each completed item: `git add -A && git commit` with a message
  describing the fix. Do not push unless asked.
- If an item turns out to be already done / not applicable, mark it `[x]` with
  a note saying why.

## P1 — correctness & money

- [x] **1. Harden `api/proposal-accept.js`.** _Done: availability re-check (409), expiry via shared api/_proposal.js proposalExpired (410 + expired screen on ProposalAccept + expired status from api/proposal.js), alreadyAccepted OR-guard, reservation errors surfaced as warnings in response + admin email, officeIds/parkingIds subset validation (400), past startDate rejected (400)._
  (a) Re-check availability before creating anything: load the chosen offices'
  space rows; if any is `occupied`, or `reserved`/`occupantTenantId` pointing at
  a different tenant, return 409 with a friendly message ("Office X is no longer
  available — please contact us") and do NOT create tenant/lease.
  (b) Enforce proposal expiry: if `lead.proposal.sentAt + (validityDays ?? 14)
  days < today`, return 410 "proposal expired". ProposalAccept.jsx should show
  a matching "This proposal has expired — contact us to refresh it" screen.
  (c) Fix the alreadyAccepted guard: treat `status === 'accepted'` OR
  `lead.tenantId` as already-accepted (currently requires both:
  api/proposal-accept.js:44).
  (d) Stop swallowing reservation errors (line ~122): if a space update fails,
  log it AND include a `warnings` array in the response; also send the admin
  notification email mentioning the failure.
  (e) Validate that submitted officeIds/parkingIds are subsets of the proposal's
  offers, and reject past `startDate` (< today) with 400.
  Acceptance: node test of the date/expiry helpers; manual trace of each branch.

- [x] **2. Single shared billing engine.** _Done: src/lib/billingEngine.js buildMonthlyInvoiceForLease (schedule-based step pricing, office/parking line split, proration, month-key dedup, prepaid/rent-free/ended/not-started skips, lease discount); both Billing.jsx handleBillRun and api/auto-billing.js now call it; cron loads spaces + reports skip reasons; email totals from lineItemsSubtotal. 12 acceptance tests pass._
  Create `src/lib/billingEngine.js` exporting
  `buildMonthlyInvoiceForLease(lease, monthStartDate, { invoices, spaces, settings })`
  → returns an invoice object or `null` (with a `reason`: already-billed /
  rent-free / prepaid / not-started / ended / zero-amount). Rules:
  - Amount comes from `buildPaymentSchedule` (src/lib/paymentSchedule.js) for
    that month — this gives step pricing, multi-item (office+parking) line
    items, rent-free skips, and DST-safe proration in one place. Emit one line
    item per lease item (office line + parking line) using the schedule's
    office/services split.
  - Prepaid skip: `lease.paidInFull && lease.paidUntil >= month` → null.
  - Dedup: an existing non-voided invoice (excluding deposit/bond_refund types)
    whose `periodStart` falls in the same `yyyy-MM` → null.
  - Not started / ended: month entirely outside `startDate..endDate` → null.
  Rewire BOTH engines to call it: `handleBillRun` in
  `src/components/Billing.jsx` and `api/auto-billing.js` (the api file already
  imports from ../src/lib successfully — see its isRentFreeMonth import).
  Discount handling: use `lease.discount ?? items[0].steps[0].discount` in both.
  Acceptance: node tests — stepped lease, office+parking lease, prepaid,
  mid-month start (prorated), ended lease, rent-free month, already-billed
  dedup with a prorated periodStart (e.g. 2026-07-15 must dedup against July).

- [ ] **3. Safer invoice numbering.**
  Both number allocators (useStore addInvoice ~line 1391, auto-billing.js
  ~line 97) pick `max+1` from their own snapshot — concurrent runs collide.
  Minimal fix: in `api/auto-billing.js`, re-read the invoices table's numbers
  immediately before inserting each invoice AND retry once with number+1 if the
  insert reports a duplicate id/number; in the client store, before assigning,
  also scan `invoicesRef.current` (freshest state) rather than the stale `prev`
  snapshot if they differ. Add a `numberSeq` note to docs/build-notes.md
  describing the residual race and the proper fix (a Supabase sequence/RPC) for
  later. Acceptance: build passes; reasoning documented.

- [ ] **4. GST off security deposits.**
  In `raiseSigningInvoices` (src/store/useStore.js ~1424) set
  `vatEnabled: false` on the deposit invoice. In `api/xero/sync.js` force
  `TaxType: 'EXEMPTOUTPUT'` for lines on invoices with
  `invoiceType === 'deposit'` regardless of settings (deposit is not a taxable
  supply while held as security). Check the invoice PDF/detail renders a
  $2,800 deposit as $2,800 total (no +GST). Acceptance: node/manual check of
  totals math in InvoiceDetail/calcInvoiceTotal for a vatEnabled:false invoice.

- [ ] **5. Daily reconcile cron.**
  New `api/reconcile.js` + vercel.json cron (daily, e.g. "30 20 * * *" ≈ 6:30am
  Melbourne). Server-side, using the service key:
  (a) **Commencement flips:** for each active, gate-met lease (port
  `accessGateMet`/`desiredSpaceStatus` from src/lib/onboarding.js into a shared
  or duplicated server helper) whose startDate ≤ today and space is `reserved`
  by that tenant → set space `occupied`.
  (b) **Onboarding catch-up:** for gate-met leases with no `onboardedAt`, send
  the onboarding email (reuse api/_email.js + the onboarding template from the
  templates table) and the portal invite (`api/auth/invite` logic — extract its
  core into a shared server helper rather than HTTP-calling itself), then stamp
  `onboardedAt`. Skip Salto entirely (ground rules).
  (c) **Vacate-date expiry:** leases with `noticeGiven && vacateDate <= today`
  and status active → set status `expired` (offboarding side effects run
  client-side on next load via existing updateLease detection — replicate the
  minimum server-side: free the spaces and stamp `offboardedAt`? NO — keep it
  simple: set a `needsOffboard: true` flag + status expired, and add a check in
  the store's reconcile effect that runs offboardLease for any
  status-expired && !offboardedAt lease, which it already effectively does via
  updateLease... verify and wire the load-time path in useStore reconcile).
  (d) **Bond-refund SLA:** bond_refund invoices approved > 45 days ago and not
  marked refunded → include in the admin digest email.
  Send ONE admin digest email summarising everything the cron did/found.
  Acceptance: node test of the pure gate/status helpers; dry-run mode
  (`?dryRun=1`) that reports without writing, tested against live data
  read-only.

## P2 — member money & lifecycle

- [ ] **6. Bond refund payout tracking.**
  Add a "Mark refunded" action on approved bond_refund invoices in Billing.jsx
  (records `refundedAt`, `refundMethod`, `refundReference`, sets invoice status
  `paid`). Overdue SLA badge: approved > 45 days with no refundedAt shows a red
  "refund overdue" chip in the pending list. Acceptance: build + visual trace.

- [ ] **7. Stripe payments in the member portal.**
  NOTE (2026-07-03): a substantially complete implementation already exists in
  the tree (committed in 6aec311): api/stripe/checkout.js (settings-gated,
  inc-GST totals), api/stripe/webhook.js (signature-verified, idempotent),
  api/stripe/status.js, and a Pay-now flow in src/portal/PortalBilling.jsx.
  This item is now: REVIEW those files against the spec below, fix anything
  missing (STRIPE_WEBHOOK_SECRET in .env.example, webhook URL setup notes in
  docs/build-notes.md, a Settings → Integrations toggle for
  settings.stripe.paymentsEnabled if none exists, success/cancel redirect
  handling in the portal), and test the signature helper. Do not rebuild.
  Original spec:
  (a) `api/stripe/create-checkout-session.js` — POST {invoiceId}; loads the
  invoice + tenant, creates a Stripe Checkout Session (AUD, invoice total incl.
  GST where vatEnabled, `metadata: { invoiceId }`, success/cancel URLs back to
  the portal billing page). Use bare `fetch` against the Stripe REST API
  (https://api.stripe.com/v1/checkout/sessions, form-encoded, Bearer
  STRIPE_SECRET_KEY) — no SDK dependency needed.
  (b) `api/stripe/webhook.js` — verify signature with STRIPE_WEBHOOK_SECRET
  (add to .env.example; constructEvent equivalent via manual HMAC SHA-256 of
  the raw body per Stripe docs), handle `checkout.session.completed` → append a
  payment `{ method: 'stripe', reference: session.id, amount, date }` to the
  invoice, set status paid. The daily reconcile cron (item 5) then handles gate
  flips — note this in a comment.
  (c) Portal: "Pay now" button on pending invoices in
  src/portal/PortalBilling.jsx → calls (a) and redirects to session.url.
  (d) vercel.json: no cron needed; document the webhook URL to configure in the
  Stripe dashboard in docs/build-notes.md.
  Acceptance: build passes; node test of the webhook signature helper; the
  checkout session builder tested with a Stripe test-mode call ONLY if
  STRIPE_SECRET_KEY is a test key (sk_test_...) — otherwise skip live call and
  note it.

- [ ] **8. Portal access revocation on offboarding.**
  In `offboardLease` (src/store/useStore.js ~1557): set
  `portalAccess: false` on all the tenant's members, and call a new
  `api/auth/revoke.js` (service key: `supabase.auth.admin` — ban/disable the
  auth user by email). Portal side: PortalApp should sign out / show "your
  membership has ended" for members with portalAccess false. Acceptance:
  build + trace; do NOT revoke anyone in production data.

- [ ] **9. Renewal auto e-sign.**
  When a renewal contract is created from Renewals.jsx / ContractForm with
  contractType 'Renewal', automatically create the esign_requests row +
  eSignMemberLink and send the esign email (same as ContractDetail's
  "Send for signing" path — extract that into a shared helper in src/lib).
  Acceptance: build + trace of the renewal flow.

- [ ] **10. Onboarding resilience.**
  (a) Onboarding email: omit the Salto/door-access section entirely when the
  lease has no `saltoLink` (check DEFAULT_ONBOARDING_EMAIL_HTML and the
  template render in src/lib/onboarding.js).
  (b) "Resend portal invite" button on MemberProfile.jsx that re-calls
  /api/auth/invite for that member.
  (c) If /api/auth/invite fails during onboarding, record
  `portalInviteFailed: true` on the member and surface a warning chip in
  Members list. Acceptance: build + trace.

## P3 — polish

- [ ] **11. Proposal decline + expiry UX.**
  Add a "Decline" link on ProposalAccept.jsx → POST api/proposal-decline.js
  (sets lead.proposal.status 'declined', moves lead to Lost, notifies admin).
  Lead Detail shows declined state. Acceptance: build + trace.

- [ ] **12. Exit fee & late fee quick actions (manual, not automatic).**
  (a) Offboarding: when a Private Office lease is offboarded, if
  settings.billingRules.exitFee (default 350) > 0, raise a pending one-off
  invoice "Exit fee — cleaning & restoration" (+GST) — behind a confirm in the
  UI flow that triggers termination, defaulting ON for office leases.
  (b) InvoiceDetail: "Add late fee" button on overdue invoices that appends an
  $80 late-fee line item (amount from settings.billingRules.lateFee ?? 80).
  No automatic accrual. Acceptance: build + totals check.

- [ ] **13. Contract number & token hygiene.**
  proposal-accept contract numbering: pad to the same width as existing data
  and re-read before insert (mirror item 3's approach). LeadDetail proposal
  token: drop the weak `${lead.id}-${Date.now()}` fallback — if
  crypto.randomUUID is unavailable use crypto.getRandomValues hex. When
  resending a proposal, keep `previousTokens: []` on the lead and have
  api/proposal.js return a "superseded — ask for the latest link" state for
  old tokens instead of 404. Acceptance: build + node test of token gen.

## Done log

(append one line per completed item: date, item, commit hash)
- 2026-07-03 · Item 1 proposal-accept hardening · b00a3bf
- 2026-07-03 · Item 2 shared billing engine · 6aec311 (commit also swept in a pre-existing uncommitted Stripe integration — see item 7 note)
