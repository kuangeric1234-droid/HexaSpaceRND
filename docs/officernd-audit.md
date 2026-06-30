# OfficeRND Audit → Hexa Space RND Build Map

Audit of the live OfficeRND Flex instance (admin/hexa-space) on 2026-06-30, to drive
what we build into Hexa Space RND. Captured via screenshots of each section.

## 1. OfficeRND navigation / structure

**Flex Operations**
- **Operations**: Companies · Members (586) · Contracts (219) · Memberships · Fees · Bookings · Opportunities (CRM) · Tours · Orders · Email Activity · Activity Log · Who is in
- **Billing**: Invoices · Plans (36) · Resource Rates · Categories · Discounts · Invoice Adjustments
- **Space**: Locations · Floorplans (empty in ORND) · Resources · Offices
- **Calendar**: meeting-room / resource bookings

**Flex Hubs**: Experience Hub · Growth Hub · Visitor Hub · Integration Hub · Data Hub · AI Hub · Settings

## 2. Feature inventory (observed + standard)

### Members (Operations › Members) — 586
Table: Name · Company · Location · Status (Active / Drop-in / Former) · Access roles
(Contact Person, Billing Person, Member Portal User) · View Details.
Actions: Add Member, Invite, Import, Export, Quick Add, Member Apps. Column filters/sort,
quick filters.

### Contracts (Operations › Contracts) — 219
Columns: Number (CON-251) · Document Type (License Agreement / Virtual Office Membership
Agreement / Membership Agreement Month-to-month) · Stage (New/Active/Signed/Renewal/
Not Signed/Not Renewed) · **Signature Status (E-Signed / Out For Signature / Manually
Signed)** with signer · Company (+contact+location) · Period (start–end, **notice period**
1–2 months, **Rolling Stage**) · Value. Add Contract, Settings, import.
→ Built-in **e-signature** + contract lifecycle + auto-renew/notice logic.

### Plans (Billing › Plans) — 36 (27 Monthly + 9 One-Offs)
Columns: Price · Name · Active count · Locations · Extras · Amenities. Type badge
(Private office / Virtual Office), Admin-only flag, **category "Membership Fees"**.
Real plans incl: 1 Pax Internal $700 · 2 pax external $1,800 · 4 pax external $2,800 ·
5 pax external $4,500 · 6 pax $5,400 · 8 pax $7,200 · 12 pax external suite $10,800 ·
26pax enterprise suite $20,000 · ACEDA Basic Membership (Virtual Office) $0.
One-Offs (9) = setup/booking/other fees. Add Plan, Merge, import.

### Billing › Invoices
Columns: Number · Customer · Status (Awaiting Approval / Not Sent / Sent / Paid / Overdue)
· Due Date · Period · Amount · Issue Date · Allocation · Actions (Approve + dropdown).
Toolbar: **Bill run**, Add Invoice, Add Payment, **Add Credit Note**, Export, "…".
Active filters (date range, status). → Xero sync (Integration Hub).

### Billing sub-tabs
- **Resource Rates** — hourly/half-day/day rates per resource (meeting rooms, function space).
- **Categories** — invoice line-item categories (Membership Fees, etc.).
- **Discounts** — Percent-Off / Amount-Off plan discounts.
- **Invoice Adjustments** — credits/adjustments.

### Fees (Operations › Fees)
One-off / recurring fees applied to members (setup, booking, parking, etc.).

### Calendar (meeting-room bookings)
Day/Week/Month. Resource columns w/ **hourly rate + capacity**:
EARTH (DI) $20/hr cap4 · SKY (TIAN) Consulting $20/hr cap4 · NORTH (BEI) $60/hr cap8 ·
SOUTH (NAN) $60/hr cap4 · EAST (DONG) Tearoom $80/hr cap6 · WEST (XI) $80/hr cap8 ·
CENTRAL (ZHONG) $80/hr cap14 · **Hexa Function Space $250/hr**.
Book panel: From/To, capacity slider, amenities filter. **Parent/child resource blocking**
("Blocked from Child booking: SOUTH (NAN)"). Bookings show member + title.
→ Members can also book from the member portal / website (booking credits + overage rates,
cancellation fees) per OfficeRND standard.

### Space
Locations · **Floorplans (EMPTY in ORND — Hexa has them on file, not loaded)** · Resources · Offices.
Floorplans normally: interactive desks/offices/rooms assigned to members from the plan.

### Opportunities (CRM) + Tours
Opportunities pipeline (leads), Tours scheduling. (Pages rendered blank — likely lightly used.)

### Integration Hub (per research — to confirm in-instance)
Xero (invoice/payment sync) · Salto / Kisi / Brivo (door access) · PaperCut MF (print billing) ·
+ Stripe/GoCardless, calendar, SSO, Zapier, API/webhooks.

### Other hubs
Experience Hub (member portal, community, events, broadcasts/blast email), Growth Hub
(sales/CRM, sign-up flows, virtual-office instant signup), Visitor Hub (check-in/visitors),
Data Hub (analytics/reports/occupancy), AI Hub.

## 3. What Hexa Space RND already has (from codebase audit)
Dashboard · Tenants · Spaces · Leases · Agreements (PDF + e-sign) · Renewals · Billing/Invoices
(+ Xero-style, bill-run cron, overdue cron) · Plans (templates/settings) · Events + Event Bookings
(vendor e-sign) · Member Portal · Maintenance · Reports · Marketing/Ads (Claude AI) · Leads/CRM
(EnquiriesInbox, LeadDetail, pipeline stages) · Resend email · Referrals.

## 4. Gap analysis → build backlog (HAVE / PARTIAL / BUILD)

| Area | OfficeRND | Hexa RND today | Action |
|---|---|---|---|
| Members directory + statuses + access roles | ✓ | tenants/leads | **PARTIAL** — add member status (active/drop-in/former) + access roles |
| Contracts list + lifecycle (stage, notice, rolling, value) | ✓ | leases + agreements | **PARTIAL** — add contract stages, notice periods, auto-rolling |
| **Contract ↔ floorplan assignment** | floorplans empty | none | **BUILD** — load Hexa floorplans, assign offices/desks to contracts |
| E-signature on contracts | ✓ | esign on agreements/events | **PARTIAL** — extend e-sign to all contract types |
| Plans / membership catalog (monthly + one-off) | 36 plans | plans/templates | **PARTIAL** — model plan catalog w/ type, category, extras |
| Fees + fee types (setup, booking, parking) | ✓ | partial | **BUILD** — fee types incl. car-parking allocation, booking fees |
| Discount types (Percent / Amount off) | ✓ | discounts (basic) | **PARTIAL** — add discount types + plan-level discounts |
| Invoices + Bill run + Credit notes + Payments | ✓ | invoices + bill-run cron | **PARTIAL** — add credit notes, payment allocation, statuses |
| Resource rates (hourly/half/day) | ✓ | none | **BUILD** — per-room rate cards |
| **Meeting-room calendar + booking** | ✓ 8 rooms+function | none (events only) | **BUILD** — calendar, room resources, parent/child blocking, credits, cancellation fees |
| **Website meeting-room booking** | member portal | none | **BUILD** — public booking flow → admin calendar |
| **Virtual office instant signup** (web→contract) | Growth Hub | enquiry intake only | **BUILD** — instant VO signup + auto-prepared contract |
| Automatic renewals (no-notice → renew) | ✓ | renewals flag | **PARTIAL** — auto-renew engine on notice expiry |
| **Blast email to active/inactive segments** | Experience Hub | none | **BUILD** — segmented broadcast email (Resend) |
| Xero integration | ✓ | Xero-style invoices | **BUILD** — real Xero 2-way sync |
| Salto access control | ✓ | none | **BUILD** — Salto door access by membership |
| PaperCut printing | ✓ | none | **BUILD** — PaperCut print billing → invoices |
| CRM (Opportunities, Tours) | ✓ | leads/enquiries | **PARTIAL** — pipeline, tours scheduling |
| Member portal | ✓ | portal exists | **PARTIAL** — add bookings/credits to portal |
| Reports / occupancy (Data Hub) | ✓ | reports | **PARTIAL** |

## 5. Data correction for the marketing website
Real meeting-room hourly rates (from ORND calendar) differ from the site's current data:
- NORTH (BEI) = **$60/hr** (site had $80), SOUTH (NAN) = **$60/hr** (site had $80),
  EAST (DONG) Tearoom = **$80/hr** (site had $120). EARTH/SKY $20, WEST $80 correct.
- There is an 8th room **CENTRAL (ZHONG) $80/hr cap14** not on the site.
- **Hexa Function Space $250/hr.**
→ Update `site/src/data/content.ts` meeting rooms when we revisit the website.

## 6. Suggested build order
1. **Spaces + Floorplans + contract→space assignment** (core of the model).
2. **Plans/Fees/Discounts model** (membership catalog + fee types + parking + booking fees).
3. **Contracts lifecycle** (stages, notice, auto-renew, e-sign all types).
4. **Meeting-room calendar + resource rates + website booking**.
5. **Virtual-office instant signup** (web → auto contract).
6. **Blast email segments**.
7. **Integrations**: Xero, then Salto, then PaperCut.
