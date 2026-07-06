import { format, parseISO } from 'date-fns'
import { buildPaymentSchedule } from './paymentSchedule.js'

// Single monthly-invoice builder shared by the in-app Bill Run
// (src/components/Billing.jsx) and the auto-billing cron (api/auto-billing.js),
// so both engines price a lease identically: step pricing and the
// office/parking split via buildPaymentSchedule, DST-safe proration,
// rent-free skips, prepaid skips, and month-key dedup.
//
// Returns { invoice, reason }. invoice is null when there is nothing to bill;
// reason is one of: 'no-dates' | 'not-started' | 'ended' | 'already-billed' |
// 'prepaid' | 'rent-free' | 'zero-amount'. The caller assigns id + number
// (numbering schemes differ per engine) and may override source/sentStatus.
export function buildMonthlyInvoiceForLease(lease, monthStart, { invoices = [], spaces = [], settings = {}, source = 'bill-run' } = {}) {
  if (!lease?.startDate || !lease?.endDate) return { invoice: null, reason: 'no-dates' }
  const month = monthStart instanceof Date ? monthStart : parseISO(String(monthStart))
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const key = format(mStart, 'yyyy-MM')
  const fmt = (d) => format(d, 'yyyy-MM-dd')

  const start = parseISO(lease.startDate)
  // A served notice / scheduled cancellation caps billing at the vacate date —
  // the contract may still be "active" until then, but nothing past it is
  // ever invoiced and the final month is prorated to it.
  const capISO = [
    lease.endDate,
    lease.noticeGiven ? lease.vacateDate : null,
    lease.terminationScheduledFor,
  ].filter(Boolean).sort()[0]
  const end = parseISO(capISO)
  if (start > mEnd) return { invoice: null, reason: 'not-started' }
  if (end < mStart) return { invoice: null, reason: 'ended' }

  // Dedup on the month KEY, not an exact periodStart match — a prorated
  // invoice's periodStart lands mid-month and must still block a re-bill.
  const already = invoices.some((i) =>
    i.leaseId === lease.id && i.status !== 'voided' &&
    !['deposit', 'bond_refund'].includes(i.invoiceType) &&
    String(i.periodStart || '').startsWith(key)
  )
  if (already) return { invoice: null, reason: 'already-billed' }

  // Prepaid membership covering this month (OfficeRND-migrated prepayments).
  if (lease.paidInFull && lease.paidUntil && String(lease.paidUntil).slice(0, 7) >= key) {
    return { invoice: null, reason: 'prepaid' }
  }

  const schedule = buildPaymentSchedule(lease, settings)
  const row = schedule?.rows.find((r) => r.key === key)
  if (!row) return { invoice: null, reason: 'not-started' }
  if (row.free) return { invoice: null, reason: 'rent-free' }
  if (row.total <= 0) return { invoice: null, reason: 'zero-amount' }

  const periodStart = start > mStart ? start : mStart
  const periodEnd = end < mEnd ? end : mEnd
  const isProrated = fmt(periodStart) !== fmt(mStart) || fmt(periodEnd) !== fmt(mEnd)

  // Scale the schedule's amounts when the cap truncates this month: the
  // payment schedule reflects the CONTRACT term, the cap reflects the
  // cancellation. (Math.round day counts — DST months have a 23/25h day.)
  const round2 = (n) => Math.round(n * 100) / 100
  const dayCount = (a, b) => Math.round((b - a) / 86400000) + 1
  const contractEnd = parseISO(lease.endDate)
  const schedTo = contractEnd < mEnd ? contractEnd : mEnd
  let officeAmt = row.office
  let servicesAmt = row.services
  if (periodEnd < schedTo && schedTo >= periodStart) {
    const factor = Math.max(0, dayCount(periodStart, periodEnd) / dayCount(periodStart, schedTo))
    officeAmt = round2(officeAmt * factor)
    servicesAmt = round2(servicesAmt * factor)
  }
  if (officeAmt + servicesAmt <= 0) return { invoice: null, reason: 'zero-amount' }
  const dayMon = (d, withYear) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  const periodLabel = `${dayMon(periodStart)} – ${dayMon(periodEnd, true)}${isProrated ? ' (prorated)' : ''}`

  const discountPct = parseFloat(lease.discount ?? lease.items?.[0]?.steps?.[0]?.discount ?? '') || 0
  const spaceById = Object.fromEntries((spaces ?? []).map((s) => [s.id, s]))
  const itemIds = (lease.items?.length ? lease.items : [{ spaceId: lease.spaceId }]).map((it) => it.spaceId)
  const isParking = (id) => /_park_|parking/i.test(String(id ?? ''))
  const unitNames = (ids) => ids.map((id) => spaceById[id]?.unitNumber).filter(Boolean).join(', ')
  const officeUnits = unitNames(itemIds.filter((id) => !isParking(id))) || lease.resource || lease.contractNumber || 'Membership'
  const parkingUnits = unitNames(itemIds.filter(isParking))

  const lineItems = []
  if (officeAmt > 0) {
    lineItems.push({
      id: `li_${lease.id}_${key}_m`,
      description: `${officeUnits} · ${periodLabel}`,
      revenueAccount: 'Membership Fees',
      unitPrice: officeAmt, qty: 1, discountPct,
    })
  }
  if (servicesAmt > 0) {
    lineItems.push({
      id: `li_${lease.id}_${key}_p`,
      description: `${parkingUnits ? `Parking ${parkingUnits}` : 'Parking'} · ${periodLabel}`,
      revenueAccount: 'Parking',
      unitPrice: servicesAmt, qty: 1, discountPct,
    })
  }

  const dueDays = settings?.invoicing?.dueDateDays ?? 14
  const due = new Date(mStart); due.setDate(due.getDate() + dueDays)

  return {
    invoice: {
      tenantId: lease.tenantId,
      leaseId: lease.id,
      status: 'pending',
      sentStatus: 'not_sent',
      source,
      issueDate: fmt(mStart),
      dueDate: fmt(due),
      periodStart: fmt(periodStart),
      periodEnd: fmt(periodEnd),
      reference: '',
      paymentMethod: '',
      discountPct: 0,
      vatEnabled: true,
      xeroSync: false,
      isProrated,
      lineItems,
      payments: [],
      comments: [],
      creditNoteForId: null,
    },
    reason: null,
  }
}

// Net subtotal of an invoice's line items after line-level discounts.
export function lineItemsSubtotal(lineItems = []) {
  return Math.round(lineItems.reduce((s, li) =>
    s + Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100), 0) * 100) / 100
}
