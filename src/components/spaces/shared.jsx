// Shared building blocks for the Spaces sub-sections.
// Mirrors the OfficeRND "Space" structure: Locations, Meeting Rooms, Private
// Offices, Media Studios, Podcast Room, Parking, Virtual Office, Dedicated Desks.

import {
  MapPin, Presentation, Building2, Clapperboard, Mic,
  Car, Mail, Armchair,
} from 'lucide-react'

// ── Floors (matches InteractiveFloorPlan ids) ───────────────────────────────
export const FLOORS = [
  { id: 'l2', label: 'Level 2' },
  { id: 'l4', label: 'Level 4' },
  { id: 'l5', label: 'Level 5' },
]
export function floorLabel(id) {
  return FLOORS.find((f) => f.id === id)?.label ?? (id ? id : 'Unassigned')
}

// ── Sub-tabs (order matches the OfficeRND sidebar) ──────────────────────────
export const SPACE_TABS = [
  { key: 'locations', label: 'Locations',       icon: MapPin },
  { key: 'meeting',   label: 'Meeting Rooms',   icon: Presentation, type: 'meeting' },
  { key: 'office',    label: 'Private Offices', icon: Building2,     type: 'office' },
  { key: 'studio',    label: 'Media Studios',   icon: Clapperboard,  type: 'studio' },
  { key: 'podcast',   label: 'Podcast Room',    icon: Mic,           type: 'podcast' },
  { key: 'parking',   label: 'Parking',         icon: Car,           type: 'parking' },
  { key: 'virtual',   label: 'Virtual Office',  icon: Mail,          type: 'virtual' },
  { key: 'desk',      label: 'Dedicated Desks', icon: Armchair,      type: 'desk' },
]

export const STATUS_STYLE = {
  occupied:  'bg-gray-900 text-white',
  vacant:    'bg-green-50 text-green-700 border border-green-200',
  available: 'bg-green-50 text-green-700 border border-green-200',
  reserved:  'bg-amber-50 text-amber-800 border border-amber-200',
}

export function StatusPill({ status }) {
  const s = status === 'vacant' ? 'available' : status
  const label = s === 'reserved' ? 'Under offer' : s
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${STATUS_STYLE[s] || 'bg-muted text-muted-foreground'}`}>
      {label}
    </span>
  )
}

export const money = (n) => `$${Number(n || 0).toLocaleString('en-AU')}`

// ── Private-office pricing (per person / pax, by floor & placement) ──────────
// Level 4/5: external $600pp · internal $500pp.  Level 2: external $500pp · internal $400pp.
export const OFFICE_PRICING = {
  l2: { external: 500, internal: 400 },
  l4: { external: 600, internal: 500 },
  l5: { external: 600, internal: 500 },
}
export function officeRate(floor, placement, pax) {
  const rates = OFFICE_PRICING[floor] || OFFICE_PRICING.l4
  const pp = rates[placement] ?? rates.external
  return (Number(pax) || 0) * pp
}
export function ppRate(floor, placement) {
  const rates = OFFICE_PRICING[floor] || OFFICE_PRICING.l4
  return rates[placement] ?? rates.external
}

// ── Xero revenue accounts ───────────────────────────────────────────────────
// Level 2 bills to its own accounts, separate from Level 4 & 5.
export const XERO_ACCOUNTS = [
  'Deposit in Advance (810)',
  'L4&5 Membership Fees - Offices, Hotdesks, Virtual Offices (201)',
  'L4&5 Membership Fees - Parking Space & Other (202)',
  'L4&5 Membership Fees - Meeting Rooms, Event Space & Media Studios (203)',
  'L2 Membership Fees - Offices, Hotdesks, Virtual Offices (201.1)',
  'L2 Membership Fees - Parking Space & Other (202.2)',
]

export const DEFAULT_XERO_ACCOUNTS = {
  deposits:      'Deposit in Advance (810)',
  membershipL45: 'L4&5 Membership Fees - Offices, Hotdesks, Virtual Offices (201)',
  oneOffL45:     'L4&5 Membership Fees - Parking Space & Other (202)',
  bookingL45:    'L4&5 Membership Fees - Meeting Rooms, Event Space & Media Studios (203)',
  orderL45:      'L4&5 Membership Fees - Meeting Rooms, Event Space & Media Studios (203)',
  membershipL2:  'L2 Membership Fees - Offices, Hotdesks, Virtual Offices (201.1)',
  parkingL2:     'L2 Membership Fees - Parking Space & Other (202.2)',
}

// Short code in trailing parens, e.g. "L4&5 … (201)" → "201".
export function accountCode(s) {
  const m = String(s || '').match(/\(([^)]+)\)\s*$/)
  return m ? m[1] : ''
}

// Which Xero revenue account a space bills to (Level 2 is its own section).
export function revenueAccountFor(space, settings) {
  const x = settings?.xero?.revenueAccounts ?? DEFAULT_XERO_ACCOUNTS
  const isL2 = space.floor === 'l2'
  switch (space.type) {
    case 'office':
    case 'virtual':
    case 'desk':
      return isL2 ? x.membershipL2 : x.membershipL45
    case 'parking':
      return isL2 ? x.parkingL2 : x.oneOffL45
    case 'meeting':
    case 'studio':
    case 'podcast':
      return x.bookingL45
    default:
      return x.membershipL45
  }
}

// ── Tiny form primitives (consistent with the rest of the app) ──────────────
export const ic =
  'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  )
}

export function Modal({ title, onClose, children, maxW = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-card rounded-xl w-full ${maxW} shadow-xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Member assignment helpers ───────────────────────────────────────────────
// Resources that get "assigned" to a member (desks, parking, virtual offices).
export function memberOptions(members, tenants) {
  return members.map((m) => {
    const company = tenants.find((t) => t.id === m.companyId)?.businessName
    return { id: m.id, label: company ? `${m.name} — ${company}` : m.name, companyId: m.companyId }
  })
}

export function assignmentFor(space, members, tenants) {
  if (!space.assignedMemberId) return null
  const m = members.find((x) => x.id === space.assignedMemberId)
  if (!m) return { name: '—', company: '' }
  return { name: m.name, company: tenants.find((t) => t.id === m.companyId)?.businessName ?? '' }
}

// Next sequential unit number for an auto-numbered resource type.
// Parses the trailing integer of existing unitNumbers and returns prefix+next.
export function nextUnitNumber(spaces, type, prefix, start = 1) {
  const nums = spaces
    .filter((s) => s.type === type)
    .map((s) => parseInt(String(s.unitNumber).replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n))
  const next = Math.max(start - 1, ...(nums.length ? nums : [start - 1])) + 1
  return { next, unitNumber: `${prefix}${next}` }
}
