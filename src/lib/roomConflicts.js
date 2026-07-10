// Physical room conflicts — resolved at READ time (no duplicate calendar holds).
//
// The Hexa Function Space physically comprises the North, South and West meeting
// rooms combined. So booking the Function Space must make North/South/West
// unbookable for that time, and booking any of those three must make the
// Function Space unbookable. Rather than write duplicate holds onto every
// sibling, a booking on any one of these resources is treated as ALSO occupying
// the others whenever availability is checked.
//
// Component rooms are matched by NAME (North / South / West) so this works
// regardless of the exact space ids; the Function Space by isFunctionSpace().

const COMPONENT_ROOM_NAMES = ['north', 'south', 'west']

const norm = (v) => String(v ?? '').trim().toLowerCase()
const isFunctionSpace = (s) => !!s && (s.type === 'function' || s.id === 'hx_func' || /function/i.test(s.unitNumber || ''))
const isComponentRoom = (s) => !!s && COMPONENT_ROOM_NAMES.includes(norm(s.unitNumber))

// Resource ids that physically clash with `resourceId` (share the same floor
// space), excluding itself. Empty for any room that isn't part of the split.
export function conflictingResourceIds(resourceId, spaces) {
  const list = spaces ?? []
  const space = list.find((s) => s.id === resourceId)
  if (!space) return []
  if (isFunctionSpace(space)) return list.filter(isComponentRoom).map((s) => s.id)
  if (isComponentRoom(space)) return list.filter(isFunctionSpace).map((s) => s.id)
  return []
}

// The resource itself + everything it physically shares space with. A booking on
// any of these ids occupies the slot for `resourceId`. Falls back to just the
// resource when `spaces` isn't supplied (preserves old single-resource behaviour).
export function blockingResourceIds(resourceId, spaces) {
  return spaces ? [resourceId, ...conflictingResourceIds(resourceId, spaces)] : [resourceId]
}
