// Shared billing display helpers — turn a space/floor into the labels shown on
// invoices (location + line description). Hexa Space occupies Levels 2, 4 and 5
// at Box Hill; invoices should read e.g. "Hexa Space · Level 4" and line items
// "Level 4 Suite 14 · 1 Jun – 30 Jun 2026".

const FLOORS = { l2: 'Level 2', l3: 'Level 3', l4: 'Level 4', l5: 'Level 5' }

export function floorName(floor) {
  return FLOORS[String(floor ?? '').toLowerCase()] || ''
}

/** The space an invoice is for: invoice.spaceId, else via its lease. */
export function invoiceSpace(inv, leases = [], spaces = []) {
  if (!inv) return null
  if (inv.spaceId) return spaces.find((s) => s.id === inv.spaceId) || null
  const lease = leases.find((l) => l.id === inv.leaseId)
  return lease?.spaceId ? spaces.find((s) => s.id === lease.spaceId) || null : null
}

/** "Hexa Space · Level 4" when the floor is known, else "Hexa Space". */
export function locationLabel(space) {
  const fn = floorName(space?.floor)
  return fn ? `Hexa Space · ${fn}` : 'Hexa Space'
}

/** "1 Jun – 30 Jun 2026" from ISO date strings. */
export function periodLabel(start, end) {
  if (!start || !end) return ''
  const opt = { day: 'numeric', month: 'short' }
  const s = new Date(start).toLocaleDateString('en-AU', opt)
  const e = new Date(end).toLocaleDateString('en-AU', { ...opt, year: 'numeric' })
  return `${s} – ${e}`
}

/** "Level 4 Suite 14 · 1 Jun – 30 Jun 2026" — floor + unit + billing period. */
export function suiteDescription(space, inv) {
  if (!space?.unitNumber) return ''
  const fn = floorName(space.floor)
  const per = periodLabel(inv?.periodStart, inv?.periodEnd)
  return `${fn ? fn + ' ' : ''}${space.unitNumber}${per ? ` · ${per}` : ''}`
}

/**
 * Description to display for a line item. Reformats the recurring rent line
 * ("Membership Fees") to the Level/Suite/period format when the space resolves;
 * leaves deposits and other lines (or unresolved spaces) as their stored text.
 */
export function lineDescription(line, space, inv) {
  if (space && line?.revenueAccount === 'Membership Fees') {
    return suiteDescription(space, inv) || line.description
  }
  return line?.description ?? ''
}
