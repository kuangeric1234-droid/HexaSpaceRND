// Meeting-room credit model.
//
// Each membership grants a MONTHLY credit allowance that a company can spend on
// room bookings. 1 credit = A$40 of bookings. Allowance is a company-level pool
// (summed across the company's active memberships), reset each month, deducted by
// bookings, and — when exhausted — a Booking Fee is raised for the overage which
// is added to the company's month-end bill.

export const CREDIT_VALUE = 40 // A$ per credit

// Monthly credit allocation per membership type. Private Office is per-pax.
export const MEMBERSHIP_CREDITS = {
  'Flexible Desk': 4,
  'Dedicated Desk': 8,
  'Private Office': 5, // × pax
  'Virtual Office': 0,
}

// Credits granted by a single membership, given its type and (for offices) pax.
export function membershipCredits(type, pax) {
  if (type === 'Private Office') return (Number(pax) || 0) * MEMBERSHIP_CREDITS['Private Office']
  return MEMBERSHIP_CREDITS[type] ?? 0
}

// Classify a lease/membership into one of the four membership types. Mirrors the
// classifier in Memberships.jsx so the allowance matches what's shown there.
export function classifyMembership(lease, space) {
  const text = `${lease?.planName || ''} ${space?.unitNumber || ''} ${space?.attributes || ''} ${space?.type || ''}`.toLowerCase()
  if (text.includes('virtual')) return 'Virtual Office'
  if (text.includes('flex')) return 'Flexible Desk'
  if (text.includes('dedicated')) return 'Dedicated Desk'
  return 'Private Office'
}

// A company's computed monthly allowance = sum of its active memberships' credits.
export function computeMonthlyAllowance(tenantId, leases, spaces) {
  return (leases ?? [])
    .filter((l) => l.tenantId === tenantId && l.status === 'active')
    .reduce((sum, l) => {
      const space = (spaces ?? []).find((s) => s.id === l.spaceId)
      return sum + membershipCredits(classifyMembership(l, space), space?.pax)
    }, 0)
}

// Effective allowance: a manual override on the company wins, else the computed value.
export function effectiveAllowance(tenant, computed) {
  const o = tenant?.creditAllowanceOverride
  return (o === 0 || o) ? Number(o) : computed
}

// Credits needed to cover a dollar cost (rounded to 0.01 credit).
export function creditsForCost(cost) {
  return Math.round((Number(cost || 0) / CREDIT_VALUE) * 100) / 100
}

export const round2 = (n) => Math.round(Number(n || 0) * 100) / 100
