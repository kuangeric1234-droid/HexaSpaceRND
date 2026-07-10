// /api/salto/open — remote-unlock doors from the member app ("My key" tab).
//
// Three door kinds, each authorized server-side from source of truth (the client
// only ever sends a doorId — never a lockId):
//   • office — the member's OWN office/suite door, from an active lease. Lock in
//     settings.salto.remoteOpen.locks[spaceId] (or space.saltoLockId). Always shown.
//   • entry  — a building-entry door for the member's FLOOR. Configured in
//     settings.salto.remoteOpen.entryDoors: [{ lockId, label, floors:[2,4,5] }].
//     Shown when the member's floor (derived from an active-lease space's `floor`,
//     'l2'/'l4'/'l5') is listed on the door.
//   • room   — a meeting room / studio the member's COMPANY holds a Confirmed
//     booking for, openable from 15 min before start until the booking ends
//     (matches the api/salto/room-access grant window). Whole team can open. Lock
//     in settings.salto.roomLocks[spaceId] (or space.saltoLockId).
//
//   GET  → { enabled, remaining, doors: [{ id, kind, label, sublabel?, availableNow, until? }] }
//   POST { doorId } → fires the unlock. Every attempt is written to salto_open_log
//         as 'dispatched'; the zap's callback (api/salto/open-callback.js) flips it
//         to the real 'opened'/'failed'. Per-member shared daily cap across kinds.
//
// Transport — SALTO_REMOTE_OPEN_WEBHOOK: a "Webhooks by Zapier" Catch Hook whose
// zap runs the Salto KS native "open door / pulse lock" action on {{lockId}}, then
// POSTs { requestId, result } back to /api/salto/open-callback. Mock when unset.
//
// ZAP RECIPE (single zap, all kinds — remote open is the same KS action regardless):
//   1. Trigger  Webhooks by Zapier · Catch Hook            → URL = SALTO_REMOTE_OPEN_WEBHOOK
//   2. Filter   Only continue if  source == "hexaspace-app"  AND  token == SALTO_REMOTE_OPEN_TOKEN
//   3. Action   Salto KS · Open door                        → Lock = {{lockId}}
//   4. Action   Webhooks by Zapier · POST                   → /api/salto/open-callback
//               body { requestId: {{requestId}}, result: "opened" (or "failed" on error path),
//                      secret: SALTO_CALLBACK_SECRET }

import { requireMember } from '../_auth.js'
import { applyCors } from '../_cors.js'
import { melOffset, isConfirmed } from './_time.js'

const DAILY_CAP_DEFAULT = 10
const ROOM_LEAD_MS = 15 * 60 * 1000 // door opens 15 min before the booking start

// 'l2' / 'L4' / 4 → 4
function floorNum(f) {
  const m = String(f ?? '').match(/\d+/)
  return m ? Number(m[0]) : null
}

// The full set of doors this member may open right now. Each door keeps its
// lockId (used by POST); GET strips it before returning to the client.
async function memberDoors(sb, companyId, settings) {
  const cfg = settings?.salto?.remoteOpen ?? {}
  const officeLocks = cfg.locks ?? {}                                   // { [spaceId]: lockId }
  const entryDoors = Array.isArray(cfg.entryDoors) ? cfg.entryDoors : [] // [{ lockId, label, floors }]
  const roomLocks = settings?.salto?.roomLocks ?? {}                    // { [spaceId]: lockId }

  const [{ data: lRows }, { data: sRows }, { data: bRows }] = await Promise.all([
    sb.from('leases').select('data').eq('data->>tenantId', companyId),
    sb.from('spaces').select('data'),
    sb.from('bookings').select('data').eq('data->>companyId', companyId),
  ])
  const active = (lRows ?? []).map((r) => r.data).filter((l) => l.status === 'active')
  const spaces = (sRows ?? []).map((r) => r.data)
  const bookings = (bRows ?? []).map((r) => r.data)
  const spaceById = new Map(spaces.map((s) => [s.id, s]))

  const doors = []
  const memberFloors = new Set()

  // ── office: the member's own leased spaces mapped to lock(s) ───────────────
  // A space maps to a single lockId (string) OR, for a dual/combined office, an
  // array of { lockId, label } — so e.g. "Suite 15 + 16" opens both doors.
  for (const lease of active) {
    const space = spaceById.get(lease.spaceId)
    if (!space) continue
    const fl = floorNum(space.floor)
    if (fl != null) memberFloors.add(fl)
    const mapped = officeLocks[lease.spaceId]
    const list = Array.isArray(mapped)
      ? mapped.filter((m) => m?.lockId).map((m) => ({ lockId: String(m.lockId), label: m.label || space.unitNumber }))
      : (mapped ?? space.saltoLockId)
        ? [{ lockId: String(mapped ?? space.saltoLockId), label: space.unitNumber }]
        : []
    for (const l of list) {
      doors.push({
        id: `office:${space.id}:${l.lockId}`, kind: 'office', label: l.label,
        spaceId: space.id, lockId: l.lockId, availableNow: true,
      })
    }
  }

  // ── entry: building-entry doors for the member's floor(s) ──────────────────
  for (const e of entryDoors) {
    if (!e?.lockId) continue
    const floors = (e.floors ?? []).map(floorNum).filter((n) => n != null)
    if (!floors.some((f) => memberFloors.has(f))) continue
    doors.push({
      id: `entry:${e.lockId}`, kind: 'entry', label: e.label || 'Entry',
      spaceId: null, lockId: String(e.lockId), availableNow: true,
    })
  }

  // ── room: confirmed bookings live in their window (−15 min → end) ──────────
  const now = Date.now()
  for (const b of bookings) {
    if (!isConfirmed(b) || !b.date || !b.startTime || !b.endTime || !b.resourceId) continue
    const space = spaceById.get(b.resourceId)
    const lockId = roomLocks[b.resourceId] ?? space?.saltoLockId
    if (!lockId) continue
    const off = melOffset(b.date)
    const from = new Date(`${b.date}T${b.startTime}:00${off}`).getTime()
    const until = new Date(`${b.date}T${b.endTime}:00${off}`).getTime()
    if (isNaN(from) || isNaN(until)) continue
    if (now < from - ROOM_LEAD_MS || now >= until) continue
    doors.push({
      id: `room:${b.id}`, kind: 'room', label: space?.unitNumber ?? 'Meeting room',
      sublabel: `Your booking · ${b.startTime}–${b.endTime}`,
      spaceId: b.resourceId, lockId: String(lockId), availableNow: true,
      until, bookingRef: b.reference ?? b.id,
    })
  }

  // Cosmetic dedupe: one physical lock = one tile (POST still re-resolves the
  // full list by id, so a deduped-out door remains openable).
  const seen = new Set()
  return doors.filter((d) => {
    const k = `${d.kind}:${d.lockId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const publicDoor = ({ id, kind, label, sublabel, availableNow, until }) =>
  ({ id, kind, label, sublabel, availableNow, until })

export default async function handler(req, res) {
  if (applyCors(req, res)) return

  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const sb = auth.sb
  if (!auth.companyId) return res.status(403).json({ error: 'No membership found for your account.' })

  const { data: settRows } = await sb.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const cfg = settings?.salto?.remoteOpen ?? {}
  const enabled = cfg.enabled === true
  const cap = Number(cfg.dailyLimit) > 0 ? Number(cfg.dailyLimit) : DAILY_CAP_DEFAULT

  // Shared daily cap across all door kinds — count anything that fired (real or
  // mock), not failed attempts.
  const dayStart = new Date(); dayStart.setUTCHours(dayStart.getUTCHours() - 24)
  const { count } = await sb.from('salto_open_log')
    .select('id', { count: 'exact', head: true })
    .eq('email', auth.user.email)
    .in('result', ['opened', 'dispatched', 'mock'])
    .gte('at', dayStart.toISOString())
  const remaining = Math.max(0, cap - (count ?? 0))

  if (req.method === 'GET') {
    const doors = enabled ? await memberDoors(sb, auth.companyId, settings) : []
    return res.status(200).json({ enabled, remaining, doors: doors.map(publicDoor) })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!enabled) return res.status(403).json({ error: 'Remote unlock is not enabled.' })

  const { doorId } = req.body ?? {}
  const doors = await memberDoors(sb, auth.companyId, settings)
  const door = doors.find((d) => d.id === doorId)
  // Authorization is the door list itself: anything not currently openable by
  // this member (wrong floor, no active lease, booking outside its window) is absent.
  if (!door) return res.status(403).json({ error: 'That door isn’t available to open right now.' })
  if (remaining <= 0) return res.status(429).json({ error: 'Daily unlock limit reached — use your fob or the Salto app.' })

  const requestId = `so_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const logRow = {
    id: requestId, email: auth.user.email, member_id: null, company_id: auth.companyId,
    space_id: door.spaceId, lock_id: String(door.lockId), kind: door.kind,
    door_label: door.label, booking_ref: door.bookingRef ?? null,
  }
  const writeLog = (result) =>
    sb.from('salto_open_log').upsert({ ...logRow, result }).then(() => {}, () => {})

  const webhook = process.env.SALTO_REMOTE_OPEN_WEBHOOK
  if (!webhook) {
    await writeLog('mock')
    return res.status(200).json({ mock: true, dispatched: true, door: door.label, requestId,
      note: 'SALTO_REMOTE_OPEN_WEBHOOK not set — no unlock sent.' })
  }

  // Record the attempt as 'dispatched' BEFORE firing, so the zap's callback can
  // find the row by requestId even if it beats our response.
  await writeLog('dispatched')
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remote_open',
        requestId,
        kind: door.kind,
        lockId: String(door.lockId),
        lockName: door.label,
        unit: door.label,
        bookingRef: door.bookingRef ?? null,
        email: auth.user.email,
        company: auth.companyId,
        token: process.env.SALTO_REMOTE_OPEN_TOKEN ?? null,
        source: 'hexaspace-app',
      }),
    })
    if (!r.ok) throw new Error(`hook ${r.status}`)
    return res.status(200).json({ dispatched: true, door: door.label, requestId, remaining: remaining - 1 })
  } catch (err) {
    console.error('salto remote open failed:', err)
    await writeLog('failed')
    return res.status(502).json({ error: 'Could not reach the door system — try your fob or the Salto app.' })
  }
}
