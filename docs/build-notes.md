# Hexa Space RND — Build Notes

## Approach
Build out each Operations section first (the views/data), THEN wire the cross-cutting
flows that connect them.

## Sections (Operations)
- Companies ✅ (3-tab Add modal, list)
- Members ✅ (records + 4-tab modal + full profile)
- Contracts — existing (Leases); lifecycle TODO
- Memberships ✅ (4 type columns + billing-period navigator + overdue flags; read-only)
- Fees — IN PROGRESS (Booking Fees, Fob Key Order Fees, PaperCut Fees)
- Bookings — scaffold (rooms); calendar + flow TODO
- Activity Log ✅ (reads audit_log)

## Fees
Shows fees we've charged. Types: **Booking Fees**, **Fob Key Order Fees**, **PaperCut Fees**
(printing — once we integrate PaperCut). Tabs: All / Not Paid / Waived / Invoiced /
Awaiting Approval. Columns: Name(+type) · Member · Date(+status) · Price.

## Flows (do AFTER sections)
1. **Contract → Membership flow** (keystone): sign a member/company onto a space for a
   period at a price →
   - drops into the right Memberships type column for each billing period,
   - marks the space **occupied** on the floorplan,
   - shows on the member's profile,
   - generates **invoices** → feeds overdue flags on Memberships.
2. Bill run / invoicing → Fees & invoices feed member profile + overdue flags.
3. Website booking → Bookings.
4. Integrations: PaperCut (print fees), Salto (door access), Xero (invoice sync).

## Invoice numbering (numberSeq)
Invoice numbers live INSIDE the JSONB `data` of the `invoices` rows — there is
no DB uniqueness constraint or sequence. Allocation everywhere is
"max existing + 1":
- client store `addInvoice` (src/store/useStore.js) — max over React state ∪
  invoicesRef (freshest in-memory view),
- auto-billing cron (api/auto-billing.js) — re-reads all invoice numbers from
  Supabase immediately before EACH insert, monotonic within the run, and
  retries once on a duplicate-id insert error.

Residual race: two writers allocating in the same instant (in-app Bill Run
clicked at the exact moment the monthly cron fires) can still mint the same
number — the fresh re-read narrows the window to sub-second but cannot close
it. Proper fix when it matters: a Postgres sequence exposed via RPC
(`create sequence invoice_number_seq; create function next_invoice_number()
returns bigint …`) and calling it from both writers, plus a backfill +
unique index on `(data->>'number')`.

## Stripe online payments (member portal)
Flow: portal invoice "Pay" button → POST /api/stripe/checkout (403 unless
Settings → Integrations → Stripe → "Enable online payments" is ON) → hosted
Stripe Checkout (amount inc. GST) → redirect back to /billing?paid=<number>
(green confirmation banner) → Stripe calls POST /api/stripe/webhook
(signature-verified) → invoice marked paid in Supabase → the daily reconcile
cron picks up the paid gate (space flip + onboarding) even if no admin opens
the app.

One-time setup:
1. Vercel env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (and optionally
   VITE_STRIPE_PUBLISHABLE_KEY — reserved, not used by hosted Checkout).
2. Stripe dashboard → Developers → Webhooks → Add endpoint:
   https://portal.hexaspace.com.au/api/stripe/webhook
   with event `checkout.session.completed`; copy the signing secret into
   STRIPE_WEBHOOK_SECRET.
3. Settings → Integrations → Stripe → toggle "Enable online payments"
   (persisted as settings.stripe.paymentsEnabled; /api/stripe/status shows
   which env keys the deployment can see).

## Card on file (VO / desk memberships)
Virtual Office, Flexible Desk and Dedicated Desk agreements require a verified
payment card, captured via Stripe Checkout (setup mode, $0, 3D-Secure) right
after the client signs on the /sign/<token> page. The webhook writes
stripeCustomerId / stripePaymentMethodId / brand / last4 / expiry onto the
tenant; the member portal (Billing → Payment) shows the card with a Replace
flow; the contract (template + PDF) carries a PAYMENT AUTHORITY section
authorising off-session charges for overdue amounts.

Collection:
- Admin: Invoice detail → "Charge saved card" (any unpaid invoice, any tenant
  with a card).
- Automatic: Settings → Stripe → "Auto-charge overdue invoices" — the daily
  overdue cron charges saved cards for overdue invoices (one attempt per
  invoice per day, receipt email on success, reminder email on failure;
  failures recorded as lastChargeAttempt/lastChargeError on the invoice).

Suggested clause for the editable Terms & Conditions template (Templates →
T&C), alongside clause 7 (Fees, Payment and Invoicing):
  "Direct debit of stored card: For Virtual Office, Flexible Desk and
  Dedicated Desk memberships, the Member must register a valid payment card
  (verified and stored by Stripe) at signing and keep one registered for the
  duration of the membership. Hexa Space may charge this card any amount
  that remains unpaid after its invoice due date. A receipt is issued for
  every charge. Card numbers are held by Stripe; Hexa Space does not store
  full card details."
