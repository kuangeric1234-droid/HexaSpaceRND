// Fob & Remote tracker — shared constants and pure helpers.
//
// Model (two Supabase tables, {id,data,updated_at} rows):
//   fobs             — physical device inventory (one row per serial)
//   fob_assignments  — issue/return history; the OPEN one (returnedAt == null)
//                      is the device's current holder + live deposit
//   fob_requests     — portal "please issue me a fob" requests, admin-actioned
//
// A device requires a REFUNDABLE deposit ($100 fob / $200 remote), invoiced when
// it's issued and refunded (via the Billing bond-refund approval queue) when it's
// returned. A lost device forfeits its deposit; a replacement takes a fresh one.

export const DEVICE_TYPES = ['fob', 'remote']
export const DEPOSITS = { fob: 100, remote: 200 }
export const LOCATIONS = ['hexa', 'panorama', 'kai', 'other']

// Physical device lifecycle.
export const FOB_STATUS = {
  available:   { label: 'Available',   cls: 'bg-green-100 text-green-700' },
  assigned:    { label: 'Issued',      cls: 'bg-blue-100 text-blue-700' },
  lost:        { label: 'Lost',        cls: 'bg-red-100 text-red-700' },
  deactivated: { label: 'Deactivated', cls: 'bg-gray-100 text-gray-500' },
  retired:     { label: 'Retired',     cls: 'bg-gray-100 text-gray-500' },
}

// Deposit lifecycle on an assignment.
export const DEPOSIT_STATUS = {
  pending:   { label: 'Deposit due',      cls: 'bg-orange-100 text-orange-700' },
  paid:      { label: 'Deposit held',     cls: 'bg-green-100 text-green-700' },
  refunding: { label: 'Refund pending',   cls: 'bg-amber-100 text-amber-700' },
  refunded:  { label: 'Refunded',         cls: 'bg-emerald-100 text-emerald-700' },
  forfeited: { label: 'Forfeited',        cls: 'bg-red-100 text-red-600' },
  waived:    { label: 'Waived',           cls: 'bg-gray-100 text-gray-500' },
}

export function depositFor(type) {
  return DEPOSITS[type] ?? DEPOSITS.fob
}

// Serials are normalised uppercase, whitespace stripped (matches the old tracker's
// DB trigger) so "80 7a pd" and "807APD" collide instead of duplicating.
export function normalizeSerial(s) {
  return String(s ?? '').toUpperCase().replace(/\s+/g, '')
}

export function money(n) {
  return `$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// The live (un-returned) assignment for a device, if issued.
export function openAssignment(fobId, assignments) {
  return (assignments ?? []).find((a) => a.fobId === fobId && !a.returnedAt) ?? null
}

// A member's devices currently on hand.
export function memberOpenAssignments(memberId, assignments) {
  return (assignments ?? []).filter((a) => a.memberId === memberId && !a.returnedAt)
}

// A company's devices currently on hand.
export function companyOpenAssignments(companyId, assignments) {
  return (assignments ?? []).filter((a) => a.companyId === companyId && !a.returnedAt)
}

// Per-company rollup for the profile summary.
export function companyFobSummary(companyId, assignments, invoices) {
  const open = companyOpenAssignments(companyId, assignments)
  const depositsHeld = open.reduce((s, a) => s + (depositPaid(a, invoices) ? Number(a.depositAmount || 0) : 0), 0)
  const owing = open.reduce((s, a) => s + (depositPaid(a, invoices) ? 0 : Number(a.depositAmount || 0)), 0)
  return { held: open.length, depositsHeld, depositOwing: owing, assignments: open }
}

// Is the deposit for this assignment actually paid? Authoritative answer comes
// from the linked deposit invoice (fobAssignmentId), not the coarse cached status.
export function depositPaid(assignment, invoices) {
  if (!assignment) return false
  const inv = (invoices ?? []).find((i) => i.fobAssignmentId === assignment.id && i.invoiceType === 'fob_deposit')
  if (inv) return inv.status === 'paid'
  return assignment.depositStatus === 'paid'
}

// Coarse deposit status for a badge, reconciled with the live invoice.
export function depositState(assignment, invoices) {
  if (!assignment) return 'pending'
  if (['forfeited', 'refunded', 'refunding', 'waived'].includes(assignment.depositStatus)) return assignment.depositStatus
  return depositPaid(assignment, invoices) ? 'paid' : 'pending'
}
