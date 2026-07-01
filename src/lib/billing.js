// Shared billing display helpers — turn an invoice's lease/space into the labels
// shown on invoices (location + line description). Hexa Space is at Box Hill on
// Levels 2, 4 and 5, so invoices read e.g. "Hexa Space · Level 2" and line items
// "Level 2 Suite 14 · 1 Jun – 30 Jun 2026".
//
// Source of truth is the LEASE (it carries `resource`/`planName` = the unit and
// `level` = the floor), refined by the linked space for a precise floor. This
// keeps working even where a lease has no space link.

const FLOORS = { l2: 'Level 2', l3: 'Level 3', l4: 'Level 4', l5: 'Level 5' }

export function floorName(floor) {
  return FLOORS[String(floor ?? '').toLowerCase()] || ''
}

const isVirtual = (l) => /virtual/i.test(l?.membershipType || '')
const isOffice = (l) => /office/i.test(l?.membershipType || '')

export function invoiceLease(inv, leases = []) {
  return inv ? leases.find((l) => l.id === inv.leaseId) || null : null
}

/** The space an invoice is for: invoice.spaceId, else via its lease. */
export function invoiceSpace(inv, leases = [], spaces = []) {
  if (!inv) return null
  if (inv.spaceId) return spaces.find((s) => s.id === inv.spaceId) || null
  const lease = invoiceLease(inv, leases)
  return lease?.spaceId ? spaces.find((s) => s.id === lease.spaceId) || null : null
}

/** Floor label — precise space floor for real units; the lease's stated level for
 * virtual offices (whose space is a shared placeholder) and as a fallback. */
export function floorLabelFor(lease, space) {
  const level = (lease?.level || '').trim()
  const sf = floorName(space?.floor)
  return isVirtual(lease) ? level || sf : sf || level
}

/** Unit/suite name — clean space name where linked; the lease's own resource for
 * virtual offices; numeric private-office resources ("10") become "Office 10". */
export function unitNameFor(lease, space) {
  const r = (lease?.resource || lease?.planName || '').trim()
  if (isVirtual(lease)) return r || space?.unitNumber || ''
  if (/^\d+$/.test(r) && isOffice(lease)) return `Office ${r}`
  return space?.unitNumber || r || ''
}

/** "Hexa Space · Level 4" when the floor is known, else "Hexa Space". */
export function locationLabel(lease, space) {
  const fl = floorLabelFor(lease, space)
  return fl ? `Hexa Space · ${fl}` : 'Hexa Space'
}

/** Description prefix: "Virtual Office" for virtual plans, else the floor. */
export function descPrefix(lease, space) {
  return isVirtual(lease) ? 'Virtual Office' : floorLabelFor(lease, space)
}

/** "1 Jun – 30 Jun 2026" from ISO date strings. */
export function periodLabel(start, end) {
  if (!start || !end) return ''
  const opt = { day: 'numeric', month: 'short' }
  const s = new Date(start).toLocaleDateString('en-AU', opt)
  const e = new Date(end).toLocaleDateString('en-AU', { ...opt, year: 'numeric' })
  return `${s} – ${e}`
}

// "Level 2 Suite 14 · 1 Jun – 30 Jun 2026" — or, for a virtual office,
// "Virtual Office Suite 403 · 1 Jul – 31 Jul 2026".
export function suiteDescription(lease, space, inv) {
  const unit = unitNameFor(lease, space)
  if (!unit) return ''
  const prefix = descPrefix(lease, space)
  const per = periodLabel(inv?.periodStart, inv?.periodEnd)
  return `${prefix ? prefix + ' ' : ''}${unit}${per ? ` · ${per}` : ''}`
}

/**
 * Description to display for a line item. Reformats the recurring rent line
 * ("Membership Fees") to the Level/Suite/period format; leaves deposits and
 * other lines (or lines with no resolvable unit) as their stored text.
 */
export function lineDescription(line, lease, space, inv) {
  if (line?.revenueAccount === 'Membership Fees') {
    const d = suiteDescription(lease, space, inv)
    if (d) return d
  }
  return line?.description ?? ''
}
