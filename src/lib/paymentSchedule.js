import { format, parseISO } from 'date-fns'
import { stepMonthly } from './leasePricing.js'

// Build the month-by-month payment schedule shown on the licence agreement.
//
// Amounts come from the lease's pricing steps (so manually-stepped contracts —
// e.g. migrated OfficeRND ones with $0 periods — render as-is). For contracts
// that carry a `rentFreeMonths` count instead (the proposal flow's new-member
// offer), the FINAL N months of the term are zeroed and flagged, matching the
// "final N months rent-free" wording used on proposals.
//
// Returns { rows, totals, gstRate } where each row is
//   { key, label, office, services, total, incGst, free }
export function buildPaymentSchedule(lease, settings) {
  if (!lease?.startDate) return null
  const start = parseISO(lease.startDate)
  // No end date = month-to-month, open-ended. Schedule out ~13 months past
  // today so the current billing month always has a row without rendering a
  // decade-long table on the agreement.
  const openEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 14, 0)
  const end = lease.endDate ? parseISO(lease.endDate) : openEnd
  if (!(start < end)) return null

  const items = lease.items?.length ? lease.items : [{
    spaceId: lease.spaceId,
    steps: [{ startDate: lease.startDate, endDate: lease.endDate, listPrice: lease.listPrice ?? lease.monthlyRent ?? 0, discount: lease.discount ?? '', qty: 1 }],
  }]

  const prorate = settings?.billingRules?.prorate ?? true
  const gstRate = settings?.billingRules?.taxEnabled !== false ? (settings?.billingRules?.taxRate ?? 10) : 0
  const isServices = (spaceId) => /_park_|parking/i.test(String(spaceId ?? ''))
  const round = (n) => Math.round(n * 100) / 100

  const rows = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  // Cap at 10 years as a runaway guard against bad end dates.
  for (let i = 0; i < 120 && cursor <= end; i++) {
    const monthStart = new Date(cursor)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const daysInMonth = monthEnd.getDate()

    let office = 0
    let services = 0
    for (const item of items) {
      for (const step of item.steps ?? []) {
        if (!step.startDate) continue
        const s = parseISO(step.startDate)
        // A step without an end date runs for the life of the contract.
        const e = step.endDate ? parseISO(step.endDate) : end
        const from = s > monthStart ? s : monthStart
        const to = e < monthEnd ? e : monthEnd
        if (to < from) continue
        // Math.round, not floor: a DST transition makes one day 23/25 hours.
        const days = Math.round((to - from) / 86400000) + 1
        const monthly = stepMonthly(step) // list × qty less the step's discount
        const amount = prorate && days < daysInMonth ? (monthly * days) / daysInMonth : monthly
        if (isServices(item.spaceId)) services += amount
        else office += amount
      }
    }

    rows.push({
      key: format(monthStart, 'yyyy-MM'),
      label: format(monthStart, 'MMM-yyyy'),
      office: round(office),
      services: round(services),
      free: false,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // New-member offer: final N months rent-free — only when the steps don't
  // already encode free periods themselves.
  const freeMonths = Math.min(Number(lease.rentFreeMonths ?? 0), rows.length)
  if (freeMonths > 0 && !rows.some((r) => r.office + r.services === 0)) {
    for (const r of rows.slice(-freeMonths)) {
      r.office = 0
      r.services = 0
      r.free = true
    }
  }

  for (const r of rows) {
    r.total = round(r.office + r.services)
    r.incGst = round(r.total * (1 + gstRate / 100))
  }

  const totals = {
    office: round(rows.reduce((s, r) => s + r.office, 0)),
    services: round(rows.reduce((s, r) => s + r.services, 0)),
    total: round(rows.reduce((s, r) => s + r.total, 0)),
    incGst: round(rows.reduce((s, r) => s + r.incGst, 0)),
  }

  return { rows, totals, gstRate }
}

export const scheduleAmount = (n) => n.toLocaleString('en-AU', { minimumFractionDigits: 2 })

// Month-to-month display: an open-ended agreement shouldn't print a year-long
// table. Show the (possibly prorated) first month plus one ongoing row.
export const isMonthToMonthLease = (lease) =>
  lease?.contractType === 'Month-to-month' ||
  /month-to-month/i.test(String(lease?.documentType ?? '')) ||
  (!!lease?.startDate && !lease?.endDate)

export function monthToMonthRows(schedule) {
  if (!schedule?.rows?.length) return []
  const [first, second] = schedule.rows
  const ongoing = second ?? first
  const prorated = second && Math.abs(first.total - second.total) > 0.005
  return [
    { ...first, label: `${first.label}${prorated ? ' (first month, prorated)' : ''}` },
    { ...ongoing, key: 'ongoing', label: 'Each month thereafter — ongoing' },
  ]
}

// Total contract value across the whole term (ex GST) — the sum of every
// scheduled month, so multi-year and multi-office contracts report their real
// worth. null for month-to-month (open-ended) leases; falls back to
// monthlyRent × 12 when the schedule can't be built (missing dates).
export function contractTermValue(lease, settings) {
  if (isMonthToMonthLease(lease)) return null
  const schedule = buildPaymentSchedule(lease, settings)
  const total = schedule?.totals?.total ?? 0
  if (total > 0) return total
  return lease?.monthlyRent ? lease.monthlyRent * 12 : null
}

// True when the given month is $0 under the lease's contract schedule — either
// a step-encoded free period or the final-N-months new-member offer. Billing
// engines use this to skip invoicing months the agreement promises rent-free.
export function isRentFreeMonth(lease, date) {
  const schedule = buildPaymentSchedule(lease, null)
  if (!schedule) return false
  const key = format(date instanceof Date ? date : parseISO(date), 'yyyy-MM')
  const row = schedule.rows.find((r) => r.key === key)
  return !!row && row.total === 0
}
