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
