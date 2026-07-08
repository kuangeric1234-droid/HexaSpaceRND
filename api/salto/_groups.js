// Shared: resolve the Salto KS access-group name from what the platform knows
// about a member's space. KS groups are per-space ("Office 15", "Suite 12")
// plus functional groups — names verified against the live KS list (7 Jul 2026).
// A space's explicit saltoDoors field always wins.
export function resolveAccessGroup(doorId, spaceLabel, membershipType) {
  if (doorId) return doorId
  const label = `${spaceLabel ?? ''} ${membershipType ?? ''}`
  const m = label.match(/(office|suite)\s*0?(\d+)/i)
  if (m) return `${m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()} ${Number(m[2])}`
  if (/dedicated/i.test(label)) return 'Dedicated Desk'
  if (/virtual|\bvo\b/i.test(label)) return 'Virtual Office'
  if (/flex|desk|coworking/i.test(label)) return 'Flexible Access'
  return 'Flexible Access' // safest general-member default (KS has no "Members" group)
}
