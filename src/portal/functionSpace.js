// Identify the Hexa Function Space among the spaces list. It carries type
// 'meeting' in the inventory but is booked via its own approval-based tab,
// so it's excluded from the hourly Meeting Rooms calendar.
export function isFunctionSpace(s) {
  if (!s) return false
  return s.type === 'function' || s.id === 'hx_func' || /function/i.test(s.unitNumber || '')
}

export function findFunctionSpace(spaces) {
  return (spaces ?? []).find(isFunctionSpace) ?? null
}
