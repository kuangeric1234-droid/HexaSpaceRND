// GET/POST /api/salto/room-access — hourly cron (+ manual admin trigger).
// Finds CONFIRMED meeting-room bookings starting within the next 24h whose
// access hasn't been sent, and fires the meeting-room zap once per member of
// the booking company: Find User → Delay Until accessFrom → Add to "Meeting
// Room" group → Delay Until accessUntil → Remove from group. Early sending is
// safe — the zap waits for the booking start. Bookings are stamped
// roomAccessSentAt so this never double-fires.

import { createClient } from '@supabase/supabase-js'
import { selectAllRows } from '../_db.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// Melbourne offset with DST: +11 from the first Sunday of October to the
// first Sunday of April, +10 otherwise.
function melOffset(dateStr) {
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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  const { requireCronOrAdmin } = await import('../_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const hook = process.env.SALTO_ROOM_ACCESS_WEBHOOK
  if (!hook) return res.status(200).json({ skipped: 'SALTO_ROOM_ACCESS_WEBHOOK not set' })

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [bkRows, memRows, tRows, spRows, settRes] = await Promise.all([
    selectAllRows(supabase, 'bookings'),
    selectAllRows(supabase, 'members'),
    selectAllRows(supabase, 'tenants'),
    selectAllRows(supabase, 'spaces'),
    supabase.from('settings').select('data').eq('id', 'global').single(),
  ])
  const bookings = bkRows.map((r) => r.data)
  const members = memRows.map((r) => r.data)
  const tenants = tRows.map((r) => r.data)
  const spaces = spRows.map((r) => r.data)
  const groupIds = settRes.data?.data?.salto?.accessGroupIds ?? {}

  const now = Date.now()
  const horizon = now + 24 * 3600 * 1000
  const sent = [], skippedNoMembers = []

  for (const b of bookings) {
    if (b.roomAccessSentAt) continue
    if (!/confirmed|approved/i.test(String(b.status ?? ''))) continue
    if (!b.date || !b.startTime || !b.endTime || !b.companyId) continue
    const off = melOffset(b.date)
    const from = new Date(`${b.date}T${b.startTime}:00${off}`).getTime()
    const until = new Date(`${b.date}T${b.endTime}:00${off}`).getTime()
    if (isNaN(from) || isNaN(until) || until <= now || from > horizon) continue

    const room = spaces.find((s) => s.id === b.resourceId)
    // Rooms use the umbrella "Meeting Room" group (all room locks); a space's
    // explicit saltoDoors override wins (e.g. Level2 Boardroom, Media Studios).
    const accessGroup = room?.saltoDoors ?? 'Meeting Room'
    const company = tenants.find((t) => t.id === b.companyId)
    const team = members.filter((m) => m.companyId === b.companyId && m.email)
    if (team.length === 0) { skippedNoMembers.push(b.reference ?? b.id); continue }

    for (const m of team) {
      await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant_room_access',
          email: m.email,
          memberName: m.name ?? '',
          company: company?.businessName ?? '',
          accessGroup,
          accessGroupId: groupIds[accessGroup] ?? null,
          roomName: room?.unitNumber ?? '',
          bookingRef: b.reference ?? b.id,
          // Full datetimes for Zapier "Delay Until"…
          accessFrom: new Date(from).toISOString(),
          accessUntil: new Date(until).toISOString(),
          // …and split date/time fields straight from the booking, for any
          // KS field that wants them separately (Melbourne local).
          startDate: b.date,
          endDate: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          source: 'hexaspace-platform',
        }),
      }).catch(() => {})
    }
    await supabase.from('bookings').upsert({ id: b.id, data: { ...b, roomAccessSentAt: new Date().toISOString() }, updated_at: new Date().toISOString() })
    sent.push({ booking: b.reference ?? b.id, room: room?.unitNumber, members: team.length })
  }

  return res.status(200).json({ sent, skippedNoMembers })
}
