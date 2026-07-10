// Shared Melbourne-time + booking-status helpers for the Salto endpoints.
// Extracted from room-access.js so api/salto/open.js and room-access.js compute
// booking windows identically (a room's remote-open window MUST match the
// access-grant window, or a member could see an "open" tile for a door their KS
// grant hasn't reached yet).

// Melbourne offset with DST: +11 from the first Sunday of October to the first
// Sunday of April, +10 otherwise.
export function melOffset(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const y = d.getUTCFullYear()
  const firstSunday = (year, month) => {
    const x = new Date(Date.UTC(year, month, 1))
    return 1 + ((7 - x.getUTCDay()) % 7)
  }
  const m = d.getUTCMonth() // 0-based
  if (m > 9 || (m === 9 && d.getUTCDate() >= firstSunday(y, 9))) return '+11:00'
  if (m < 3 || (m === 3 && d.getUTCDate() < firstSunday(y, 3))) return '+11:00'
  return '+10:00'
}

// Render a UTC ms timestamp as Melbourne-local date + time strings, using the
// booking date's fixed offset (melOffset above).
export function melLocal(ms, offset) {
  const hours = Number(offset.slice(1, 3))
  const local = new Date(ms + hours * 3600 * 1000)
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  }
}

export const isConfirmed = (b) => /confirmed|approved/i.test(String(b?.status ?? ''))
export const isCancelled = (b) => /cancel/i.test(String(b?.status ?? ''))
