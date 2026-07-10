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

// Invoice-facing name for a booking charge. When credits part-covered it, the
// "(over allowance)" tag explains the partial amount; when the company had no
// credits at all, it's just a plain room charge: room, rate, date & time.
export function bookingFeeName({ roomName, rate, date, startTime, endTime, usedCredits }) {
  const dmy = date ? String(date).split('-').reverse().join('/') : ''
  const when = [dmy, startTime && endTime ? `${startTime}–${endTime}` : startTime || ''].filter(Boolean).join(' ')
  const base = `Meeting room — ${roomName || ''}`.trim()
  if (Number(usedCredits) > 0) return `${base} · ${when} (over allowance)`
  return `${base} · $${Number(rate) || 0}/hr · ${when}`
}

export const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

// ── Meeting-room perk (by membership) ───────────────────────────────────────
// Members get certain rooms FREE (no credits) up to hour caps, varying by
// membership type. Defaults below; overridable per-tier via
// settings.officePerks.tiers. Caps are PER COMPANY (shared by the team).
export const PERK_TIER_ORDER = ['Private Office', 'Dedicated Desk', 'Flexible Desk', 'Virtual Office']
export const PERK_TIER_DEFAULTS = {
  'Private Office': { rooms: ['Sky', 'Earth', 'Sun', 'Moon'], maxHoursPerBooking: 2, maxHoursPerDay: 4 },
  'Dedicated Desk': { rooms: ['Sky', 'Earth', 'Sun', 'Moon'], maxHoursPerBooking: 2, maxHoursPerDay: 4 },
  'Flexible Desk':  { rooms: ['Sky', 'Earth', 'Sun', 'Moon'], maxHoursPerBooking: 2, maxHoursPerDay: 4 },
  'Virtual Office': { rooms: ['Sky', 'Earth'],                maxHoursPerBooking: 2, maxHoursPerDay: 2 },
}

// Normalized tiers (rooms lowercased for matching), with optional settings override.
export function perkTiers(settings) {
  const override = settings?.officePerks?.tiers
  const src = (override && typeof override === 'object') ? override : PERK_TIER_DEFAULTS
  const out = {}
  for (const type of PERK_TIER_ORDER) {
    const v = src[type] ?? PERK_TIER_DEFAULTS[type]
    out[type] = {
      rooms: (Array.isArray(v.rooms) ? v.rooms : []).map((r) => String(r).toLowerCase()),
      maxHoursPerBooking: Number(v.maxHoursPerBooking ?? PERK_TIER_DEFAULTS[type].maxHoursPerBooking),
      maxHoursPerDay: Number(v.maxHoursPerDay ?? PERK_TIER_DEFAULTS[type].maxHoursPerDay),
    }
  }
  return out
}

// The most generous perk a company qualifies for across its ACTIVE memberships,
// or null. "Most generous" = most free rooms, then highest daily cap.
export function companyPerk(companyId, leases, spaces, settings) {
  if (!companyId) return null
  const tiers = perkTiers(settings)
  let best = null
  for (const l of (leases ?? [])) {
    if (l.tenantId !== companyId || l.status !== 'active') continue
    const t = tiers[classifyMembership(l, (spaces ?? []).find((s) => s.id === l.spaceId))]
    if (!t || t.rooms.length === 0) continue
    if (!best || t.rooms.length > best.rooms.length || (t.rooms.length === best.rooms.length && t.maxHoursPerDay > best.maxHoursPerDay)) best = t
  }
  return best
}

// Is this room free under the given perk (from companyPerk)?
export function isPerkRoom(space, perk) {
  return !!perk && !!space && perk.rooms.includes(String(space.unitNumber || '').toLowerCase())
}

// Hours a company has already booked TODAY in its perk rooms (excludes cancelled).
export function perkHoursUsed({ companyId, date, bookings, perk, spaces, excludeIds = [] }) {
  if (!perk) return 0
  const perkIds = new Set((spaces ?? []).filter((s) => isPerkRoom(s, perk)).map((s) => s.id))
  return (bookings ?? [])
    .filter((b) => b.companyId === companyId && b.date === date && b.status !== 'Cancelled'
      && perkIds.has(b.resourceId) && !excludeIds.includes(b.id))
    .reduce((sum, b) => { const d = hoursBetween(b.startTime, b.endTime); return sum + (d > 0 ? d : 0) }, 0)
}

function hoursBetween(start, end) {
  const dec = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h + (m || 0) / 60 }
  return dec(end) - dec(start)
}

// ── After-hours bookings ─────────────────────────────────────────────────────
// Everyone can book the CORE hours (business day). Only members whose membership
// grants 24/7 building access (eligibleTiers) can book the wider EXTENDED window
// (early mornings / evenings). Pricing is identical to daytime — the only gate is
// who can book when. All hours are 24h decimals, Melbourne-local. Overridable via
// settings.afterHours.
export const AFTER_HOURS_DEFAULTS = {
  coreStart: 9,        // business-hours band any member can book
  coreEnd: 17,
  extendedStart: 5,    // widest window a 24/7 member can reach (early morning)
  extendedEnd: 23,     // …through to late evening — before & after hours
  eligibleTiers: ['Private Office', 'Dedicated Desk'], // the "24/7 access" memberships
}

export function afterHoursConfig(settings) {
  const c = settings?.afterHours ?? {}
  const d = AFTER_HOURS_DEFAULTS
  return {
    coreStart: Number(c.coreStart ?? d.coreStart),
    coreEnd: Number(c.coreEnd ?? d.coreEnd),
    extendedStart: Number(c.extendedStart ?? d.extendedStart),
    extendedEnd: Number(c.extendedEnd ?? d.extendedEnd),
    eligibleTiers: Array.isArray(c.eligibleTiers) ? c.eligibleTiers : d.eligibleTiers,
  }
}

// Does the company hold an active membership in an after-hours-eligible tier?
export function companyCanAfterHours(companyId, leases, spaces, settings) {
  if (!companyId) return false
  const set = new Set(afterHoursConfig(settings).eligibleTiers)
  return (leases ?? []).some((l) =>
    l.tenantId === companyId && l.status === 'active'
    && set.has(classifyMembership(l, (spaces ?? []).find((s) => s.id === l.spaceId))))
}

// Bookable window [start, end) in decimal hours: the extended window for a 24/7
// company, else core hours. Pass the result of companyCanAfterHours.
export function bookingWindow(canAfterHours, settings) {
  const c = afterHoursConfig(settings)
  return canAfterHours
    ? { start: c.extendedStart, end: c.extendedEnd }
    : { start: c.coreStart, end: c.coreEnd }
}

// Where to email a company: its own email, else the member flagged Billing
// Person, else the Contact Person, else any member with an email. Used by
// EVERY company-facing send (invoices, reminders, mail alerts, renewals) so
// email-less companies still reach a human. Server twin: api/_email.js.
export function billingEmailFor(tenant, members = []) {
  if (tenant?.email) return tenant.email
  const mine = (members ?? []).filter((m) => m.companyId === tenant?.id && m.email)
  return (mine.find((m) => m.billingPerson) ?? mine.find((m) => m.contactPerson) ?? mine[0])?.email || ''
}
