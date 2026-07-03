// Shared function-booking actions used by the admin hub (FunctionBookings.jsx)
// and the CRM Function Enquiries tab (FunctionEnquiries.jsx). Anything that
// mutates tenants/members/invoices/bookings goes through the passed-in `store`;
// the function_bookings row is written directly to Supabase.
//
// Flow: enquiry → (brochure w/ Book-a-time link) → requested (website form) →
// review/approve → invited (portal invite) → client completes portal → deposit
// raised (awaiting_deposit) → deposit paid → confirmed (balance + calendar) →
// completed → refunded.
import { supabase } from './supabase.js'
import { ADDONS, computeQuote, bufferedWindow, balanceDueDate } from './functionBooking.js'
import { PORTAL_URL } from './sendEmail.js'

const today = () => new Date().toISOString().split('T')[0]
const nowIso = () => new Date().toISOString()
const randToken = () => Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')

export function portalBaseUrl(settings) {
  return settings?.portalUrl || PORTAL_URL
}

export async function persistFn(record) {
  const item = { ...record, updatedAt: nowIso() }
  await supabase.from('function_bookings').upsert({ id: item.id, data: item, updated_at: item.updatedAt })
  return item
}

export function quoteFor(b) {
  return b.quote || computeQuote({ ...b, bookedOn: today() })
}

// Has the client already completed their full details (via the portal)?
function hasDetails(b) {
  return !!(b.signedAt || b.companyInfo || b.memberInfo)
}

// ── 1. Brochure / info email (with the Book-a-time link) ─────────────────────
export async function sendBrochure({ booking, settings }) {
  const requestToken = booking.requestToken || randToken()
  const updated = await persistFn({ ...booking, requestToken, brochureSentAt: nowIso(), stage: booking.stage === 'enquiry' ? 'quoted' : booking.stage })
  await fetch('/api/function-bookings/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking: updated, mode: 'brochure' }),
  }).catch(() => {})
  return updated
}

// ── 2. Portal invite → drop-in account ───────────────────────────────────────
export async function sendBookingInvite({ store, booking, settings }) {
  let tenantId = booking.companyId
  if (!tenantId) {
    const t = store.addTenant({
      businessName: booking.organisation || booking.name || 'Function client',
      contactName: booking.name || '', email: booking.email || '', phone: booking.phone || '',
      clientType: 'function', status: 'prospect', industry: 'Function client',
    })
    tenantId = t.id
  }
  await fetch('/api/auth/invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: booking.email, redirectTo: portalBaseUrl(settings),
      subject: 'Complete your Hexa Space function booking',
      heading: 'Your function booking is approved',
      intro: 'Great news — your date is available! Set up your portal access to enter your company details, confirm your date and time, see your total, and pay your deposit to secure the venue.',
      ctaLabel: 'Set up access & continue',
    }),
  }).catch(() => {})
  return persistFn({ ...booking, companyId: tenantId, stage: 'invited', inviteSentAt: nowIso() })
}

// ── 3. Approve a requested booking ───────────────────────────────────────────
// Website request (no details yet) → send portal invite. Member request (details
// already captured) → raise the deposit straight away via the submit endpoint.
export async function approveFunctionBooking({ store, booking, settings }) {
  if (hasDetails(booking)) {
    await fetch('/api/function-bookings/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: booking.id }),
    }).catch(() => {})
    return persistFn({ ...booking, stage: 'awaiting_deposit', approvedAt: nowIso() })
  }
  return sendBookingInvite({ store, booking, settings })
}

// ── 4. Ask the client to pick a different date (clash) ───────────────────────
export async function askAmendDate({ booking, settings }) {
  const requestToken = booking.requestToken || randToken()
  const updated = await persistFn({ ...booking, requestToken, amendRequestedAt: nowIso() })
  await fetch('/api/function-bookings/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking: updated, mode: 'amend_date' }),
  }).catch(() => {})
  return updated
}

// ── 5. Deposit paid → secure venue: raise balance + place calendar booking ───
export async function confirmDepositPaid({ store, booking, findFunctionSpace }) {
  const b = booking
  const q = computeQuote({ ...b, bookedOn: today() })
  const tenantId = b.tenantId || b.companyId || null
  const clientName = b.organisation || b.companyInfo?.businessName || b.name || 'Function client'
  const invs = store.invoices || []
  const has = (type) => invs.some((i) => i.functionRef === b.ref && i.invoiceType === type && i.status !== 'voided')
  const base = { tenantId, source: 'function', status: 'pending', sentStatus: 'not_sent', functionRef: b.ref, clientName, clientEmail: b.email, issueDate: today() }

  // Safety net: raise the deposit (50% + $300 security) if it was never raised
  // (e.g. a manual hub booking that skipped the portal). One invoice, two lines.
  if (!has('function_deposit')) store.addInvoice({ ...base, invoiceType: 'function_deposit', dueDate: today(), vatEnabled: true, lineItems: [
    { description: `50% deposit — function booking · ${b.eventName || 'Function'} (${b.eventDate})`, revenueAccount: 'Function Space Hire', unitPrice: q.depositHalf, qty: 1, discountPct: 0 },
    { description: `Refundable security deposit · ${b.eventName || 'Function'}`, revenueAccount: 'Security Deposit', unitPrice: q.securityDeposit, qty: 1, discountPct: 0, vatExempt: true },
  ] })

  // Balance = the remaining 50% of the booking cost (GST), due 14 days before.
  if (!has('function_balance')) {
    store.addInvoice({ ...base, invoiceType: 'function_balance', dueDate: balanceDueDate(b.eventDate) || today(), vatEnabled: true, lineItems: [
      { description: `50% balance — function booking · ${b.eventName || 'Function'} (${b.eventDate})`, revenueAccount: 'Function Space Hire', unitPrice: q.balanceHalf, qty: 1, discountPct: 0 },
    ] })
  }

  // Place the calendar booking (venue secured) with ±30-min buffer.
  let calendarBookingId = b.calendarBookingId
  const fn = findFunctionSpace ? findFunctionSpace(store.spaces) : null
  if (fn && b.eventDate && !calendarBookingId) {
    const { blockStart, blockEnd } = bufferedWindow(b.startTime, b.endTime)
    const item = store.addBooking({
      type: 'function', resourceId: fn.id, date: b.eventDate, startTime: blockStart, endTime: blockEnd,
      title: `${b.eventName || 'Function'} (incl. buffer)`, eventType: b.eventType, guests: Number(b.guests) || null,
      status: 'Confirmed', approval: 'approved', source: 'Function Bookings', functionRef: b.ref, repeat: 'none', createdBy: 'Admin',
    })
    calendarBookingId = item?.id
  }
  const updated = await persistFn({ ...b, stage: 'confirmed', confirmedAt: nowIso(), depositPaid: true, quote: q, tenantId, companyId: tenantId, calendarBookingId })
  fetch('/api/function-bookings/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking: updated, mode: 'confirmed' }) }).catch(() => {})
  return updated
}

// ── Decline ──────────────────────────────────────────────────────────────────
export async function declineFunctionBooking({ store, booking }) {
  if (booking.calendarBookingId) store.deleteBooking(booking.calendarBookingId)
  return persistFn({ ...booking, stage: 'declined', calendarBookingId: null })
}

// ── Post-event: resolve the $300 security deposit ────────────────────────────
export async function resolveDeposit({ store, booking, damage, refund, overflow, notes }) {
  const tenantId = booking.tenantId || booking.companyId || null
  const clientName = booking.organisation || booking.name || 'Function client'
  if (refund > 0) store.addInvoice({ tenantId, source: 'function', invoiceType: 'bond_refund', status: 'pending', sentStatus: 'not_sent', functionRef: booking.ref, clientName, clientEmail: booking.email, issueDate: today(), dueDate: today(), vatEnabled: false, lineItems: [{ description: `Security deposit refund · ${booking.eventName || 'Function'}`, revenueAccount: 'Security Deposit', unitPrice: -refund, qty: 1, discountPct: 0 }] })
  if (overflow > 0) store.addInvoice({ tenantId, source: 'function', invoiceType: 'function_damage', status: 'pending', sentStatus: 'not_sent', functionRef: booking.ref, clientName, clientEmail: booking.email, issueDate: today(), dueDate: today(), vatEnabled: true, lineItems: [{ description: `Damage / excess cleaning · ${booking.eventName || 'Function'} — ${notes || ''}`, revenueAccount: 'Function Space Hire', unitPrice: overflow, qty: 1, discountPct: 0 }] })
  return persistFn({ ...booking, stage: 'refunded', refundedAt: nowIso(), refundAmount: refund, damageAmount: damage, damageNotes: notes, securityStatus: damage >= 300 ? 'withheld' : damage > 0 ? 'partial' : 'refunded' })
}
