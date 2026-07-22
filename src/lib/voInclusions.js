// Virtual Office membership inclusions — printed on the Virtual Office
// Membership Agreement (screen/e-sign template + PDF export).
// Two packages: $75+GST (basic) and $150+GST (premium). The premium-only
// lines below are dropped from contracts priced under $150/month.
export const VO_PREMIUM_ONLY = [
  'Daily Access to Sky & Tian Meeting Room + Consulting Rooms (2 Hours Daily)',
  'Coworking lounge access with Enterprise-Grade WiFi. 9:00AM - 5:30PM',
  'Complimentary Tea & Coffee',
]

export const VO_INCLUSIONS = [
  'Premium Business Address in Box Hill (Level 4/830 Whitehorse Road Box Hill VIC 3128)',
  'Mail & Package Handling',
  'Access to Reception Services',
  'Booking access to meeting rooms, event spaces and media studios with member’s discount (Refer to Meeting Room Pricing Guide)',
  'Daily Access to Sky & Tian Meeting Room + Consulting Rooms (2 Hours Daily)',
  'Coworking lounge access with Enterprise-Grade WiFi. 9:00AM - 5:30PM',
  'Connection to the Ucommune network across China, Singapore and Hong Kong',
  'Exclusive invitations to community events',
  'Complimentary Tea & Coffee',
]

export const isVirtualOfficeAgreement = (lease, space) =>
  /virtual office/i.test(String(lease?.documentType ?? '')) || space?.type === 'virtual'

// The VO package is priced off the contract's LIST monthly (a discounted
// premium contract is still the premium package).
const voListMonthly = (lease) =>
  Number(lease?.items?.[0]?.steps?.[0]?.listPrice ?? lease?.listPrice ?? lease?.monthlyRent ?? 0)

// The full inclusions list an agreement should print: VO agreements get their
// package's standard set first, then whatever negotiated extras were typed on
// the contract (lease.inclusions — one per line). Any agreement type can carry
// custom inclusions; the section renders whenever this returns items.
export function leaseInclusions(lease, space) {
  const custom = String(lease?.inclusions ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
  if (!isVirtualOfficeAgreement(lease, space)) return custom
  const base = voListMonthly(lease) >= 150
    ? VO_INCLUSIONS
    : VO_INCLUSIONS.filter((i) => !VO_PREMIUM_ONLY.includes(i))
  return [...base, ...custom]
}
