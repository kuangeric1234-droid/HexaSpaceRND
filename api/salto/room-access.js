// GET/POST /api/salto/room-access — hourly cron (+ admin/member trigger).
// Grants meeting-room door access for CONFIRMED bookings, then reconciles the
// grant away once the room is no longer booked. Whole-team access, two shapes
// (hybrid, per Eric 10 Jul 2026):
//
//   • PRIVATE OFFICE / SUITE companies → LOCK-CENTRIC. The company already has
//     an exclusive KS access group (e.g. "Office 11"). We add the BOOKED ROOM'S
//     LOCK to that group for the window and remove it after. Cost is flat —
//     ~1 add + ~1 remove per group, regardless of team size.
//   • DEDICATED DESK / FLEXIBLE DESK / VIRTUAL OFFICE (shared groups) →
//     USER-CENTRIC. Those groups hold many companies' members, so we can't add
//     a room lock to them without leaking the room building-wide. Instead we add
//     each teammate to the umbrella "Meeting Room" group and remove them after.
//
// TIMING & THE BACK-TO-BACK RACE:
//   ADD is pre-scheduled precisely — the zap does `Delay Until {{accessFrom}}`
//   then the add. REMOVE is NOT pre-scheduled; the sweep fires it only when it
//   observes that NO currently-active booking still needs that grant. This kills
//   the race where two back-to-back bookings of the same room by the same
//   company would otherwise have the earlier booking's remove strip the later
//   one mid-meeting. Removal timing is therefore cron-granular (the group keeps
//   room access until the sweep after the last booking ends) — harmless.
//
// Delays are free in Zapier; only the add and remove actions bill as tasks.
// Bookings are stamped roomAccessSentAt (added) / roomAccessRemovedAt (removed)
// so nothing double-fires.
//
// Webhooks (all optional; each falls back to SALTO_ROOM_ACCESS_WEBHOOK so a
// single combined zap with Paths on {op, subject} also works):
//   SALTO_ROOM_USER_ADD_WEBHOOK    op=add    subject=user  (Delay → Add User to group)
//   SALTO_ROOM_USER_REMOVE_WEBHOOK op=remove subject=user  (Remove User from group)
//   SALTO_ROOM_LOCK_ADD_WEBHOOK    op=add    subject=lock  (Delay → Add Lock to group)
//   SALTO_ROOM_LOCK_REMOVE_WEBHOOK op=remove subject=lock  (Remove Lock from group)

import { createClient } from '@supabase/supabase-js'
import { selectAllRows } from '../_db.js'
import { resolveAccessGroup } from './_groups.js'
import { melOffset, melLocal, isConfirmed, isCancelled } from './_time.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// Shared functional groups contain many companies' members — a room lock must
// NEVER be added to these (it would grant the room building-wide). Anything else
// resolveAccessGroup returns (Office N / Suite N / a saltoDoors override) is
// treated as company-exclusive and is safe for lock-centric grants.
const SHARED_GROUPS = new Set(['Dedicated Desk', 'Virtual Office', 'Flexible Access'])

async function postHook(hook, payload) {
  if (!hook) return
  await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  // Cron, admin, OR member: members trigger a sweep when they book (their
  // bookings auto-confirm). The sweep only reads CONFIRMED bookings from the
  // DB, so the caller can't influence what gets granted.
  const { requireCronOrAdmin, requireMember } = await import('../_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) {
    const m = await requireMember(req)
    if (m.error) return res.status(m.status).json({ error: m.error })
  }

  const H = process.env
  const combined = H.SALTO_ROOM_ACCESS_WEBHOOK
  const hooks = {
    userAdd: H.SALTO_ROOM_USER_ADD_WEBHOOK || combined,
    userRemove: H.SALTO_ROOM_USER_REMOVE_WEBHOOK || combined,
    lockAdd: H.SALTO_ROOM_LOCK_ADD_WEBHOOK || H.SALTO_ROOM_LOCK_WEBHOOK || combined,
    lockRemove: H.SALTO_ROOM_LOCK_REMOVE_WEBHOOK || H.SALTO_ROOM_LOCK_WEBHOOK || combined,
  }
  if (!hooks.userAdd && !hooks.lockAdd) {
    return res.status(200).json({ skipped: 'no Salto room-access webhook configured' })
  }

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [bkRows, memRows, tRows, spRows, lsRows, settRes] = await Promise.all([
    selectAllRows(supabase, 'bookings'),
    selectAllRows(supabase, 'members'),
    selectAllRows(supabase, 'tenants'),
    selectAllRows(supabase, 'spaces'),
    selectAllRows(supabase, 'leases'),
    supabase.from('settings').select('data').eq('id', 'global').single(),
  ])
  const bookings = bkRows.map((r) => r.data)
  const members = memRows.map((r) => r.data)
  const tenants = tRows.map((r) => r.data)
  const spaces = spRows.map((r) => r.data)
  const leases = lsRows.map((r) => r.data)
  const salto = settRes.data?.data?.salto ?? {}
  const groupIds = salto.accessGroupIds ?? {}
  const roomLocks = salto.roomLocks ?? {}

  const activeLeases = leases.filter((l) => l.status === 'active')

  // The exclusive (company-owned) KS access groups a company holds, from its
  // active office/suite leases. Shared functional groups are excluded — a room
  // lock can't be added to those safely. A group is only usable here if we have
  // its KS id: a null id (office/suite with no KS group yet, e.g. Office 2/16/17
  // or bad migration data) would send an empty access_group_id and error the
  // "Add a Lock" step — so we drop it and let the booking fall back to
  // user-centric instead of failing.
  const groupCache = new Map()
  function exclusiveGroupsFor(companyId) {
    if (groupCache.has(companyId)) return groupCache.get(companyId)
    const out = new Map()
    for (const l of activeLeases) {
      if (l.tenantId !== companyId) continue
      const sp = spaces.find((s) => s.id === l.spaceId)
      const g = resolveAccessGroup(sp?.saltoDoors, sp?.unitNumber, l.membershipType)
      if (g && !SHARED_GROUPS.has(g) && groupIds[g]) out.set(g, groupIds[g])
    }
    const arr = [...out].map(([name, id]) => ({ name, id }))
    groupCache.set(companyId, arr)
    return arr
  }

  const roomLockId = (room) => roomLocks[room?.id] ?? room?.saltoLockId ?? null

  // Build the plan for a booking: its window and the concrete grant targets.
  // Returns null for anything that isn't a schedulable room booking.
  function planFor(b) {
    if (!b.date || !b.startTime || !b.endTime || !b.companyId) return null
    const off = melOffset(b.date)
    const from = new Date(`${b.date}T${b.startTime}:00${off}`).getTime()
    const until = new Date(`${b.date}T${b.endTime}:00${off}`).getTime()
    if (isNaN(from) || isNaN(until)) return null
    const openFrom = from - 15 * 60 * 1000 // door opens 15 min early to set up
    const room = spaces.find((s) => s.id === b.resourceId)
    const company = tenants.find((t) => t.id === b.companyId)

    const exclusive = exclusiveGroupsFor(b.companyId)
    const lockId = roomLockId(room)
    const targets = []
    let mode

    // LOCK-CENTRIC when the company has an exclusive group AND we know the
    // room's lock id. Otherwise fall back to USER-CENTRIC so access still works
    // (just at the per-member task cost) even before roomLocks is populated.
    if (exclusive.length && lockId) {
      mode = 'lock'
      const lockName = room?.saltoDoors ?? room?.unitNumber ?? ''
      for (const g of exclusive) {
        targets.push({
          key: `lock|${g.name}|${lockId}`,
          subject: 'lock',
          accessGroup: g.name, accessGroupId: g.id,
          lockId, lockName,
        })
      }
    } else {
      mode = 'user'
      const umbrella = room?.saltoDoors ?? 'Meeting Room'
      const umbrellaId = groupIds[umbrella] ?? null
      const team = members.filter((m) => m.companyId === b.companyId && m.email && m.status !== 'archived')
      for (const m of team) {
        targets.push({
          key: `user|${String(m.email).toLowerCase()}|${umbrella}`,
          subject: 'user',
          email: m.email, memberName: m.name ?? '',
          accessGroup: umbrella, accessGroupId: umbrellaId,
        })
      }
    }

    const l = melLocal(openFrom, off)
    return {
      room, company, from, until, openFrom, mode, targets,
      accessFrom: new Date(openFrom).toISOString(),
      accessFromDate: l.date, accessFromTime: l.time,
      roomName: room?.unitNumber ?? '',
      companyName: company?.businessName ?? '',
    }
  }

  const now = Date.now()
  const horizon = now + 27 * 24 * 3600 * 1000 // Zapier "Delay Until" maxes ~1 month

  // The targets we should reconcile against: what was actually granted at add
  // time (stored on the booking) wins over a fresh recompute, so membership /
  // roomLocks changes between add and remove can't leave a grant stranded.
  const targetsOf = (b, p) => (b.roomAccessTargets?.length ? b.roomAccessTargets : p.targets)

  // Every grant target that a CONFIRMED booking needs RIGHT NOW. A remove is
  // suppressed while its key is in here — that's what makes back-to-back /
  // overlapping bookings safe.
  const activeKeys = new Set()
  for (const b of bookings) {
    if (!isConfirmed(b)) continue
    const p = planFor(b)
    if (!p) continue
    if (now >= p.openFrom && now < p.until) for (const t of targetsOf(b, p)) activeKeys.add(t.key)
  }

  const added = [], removed = [], skippedNoTargets = []
  const nowIso = new Date().toISOString()
  const stamp = (b, patch) =>
    supabase.from('bookings').upsert({ id: b.id, data: { ...b, ...patch }, updated_at: nowIso })

  // ── ADD: grant access for confirmed, not-yet-granted, upcoming bookings ─────
  for (const b of bookings) {
    if (b.roomAccessSentAt) continue
    if (!isConfirmed(b)) continue
    const p = planFor(b)
    if (!p) continue
    if (p.until <= now || p.from > horizon) continue
    if (p.targets.length === 0) { skippedNoTargets.push(b.reference ?? b.id); continue }

    for (const t of p.targets) {
      await postHook(t.subject === 'lock' ? hooks.lockAdd : hooks.userAdd, {
        op: 'add',
        subject: t.subject,
        action: 'grant_room_access',
        accessGroup: t.accessGroup,
        accessGroupId: t.accessGroupId,
        ...(t.subject === 'lock'
          ? { lockId: t.lockId, lockName: t.lockName }
          : { email: t.email, memberName: t.memberName }),
        roomName: p.roomName,
        company: p.companyName,
        bookingRef: b.reference ?? b.id,
        // Zap step 1 is `Delay Until {{accessFrom}}`, then the add fires. Opens
        // 15 min before the booking start.
        accessFrom: p.accessFrom,
        accessFromDate: p.accessFromDate,
        accessFromTime: p.accessFromTime,
        source: 'hexaspace-platform',
      })
    }
    // Persist exactly what we granted so the remove pass reconciles against it.
    await stamp(b, { roomAccessSentAt: nowIso, roomAccessMode: p.mode, roomAccessTargets: p.targets })
    added.push({ booking: b.reference ?? b.id, room: p.roomName, mode: p.mode, targets: p.targets.length })
  }

  // ── REMOVE: reconcile grants away once no active booking needs them ─────────
  for (const b of bookings) {
    if (!b.roomAccessSentAt || b.roomAccessRemovedAt) continue
    const p = planFor(b)
    if (!p) continue
    // Remove once the window has passed, or once a cancellation happens AFTER
    // the door already opened (openFrom). A booking cancelled while still in the
    // future is left alone here: its pre-scheduled add hasn't fired yet, so a
    // remove now would no-op and the delayed add would later leak through — we
    // let the window-ended path clean it up instead.
    const windowEnded = p.until <= now
    const cancelledAndOpen = isCancelled(b) && now >= p.openFrom
    if (!windowEnded && !cancelledAndOpen) continue

    for (const t of targetsOf(b, p)) {
      if (activeKeys.has(t.key)) continue // another live booking still needs it
      await postHook(t.subject === 'lock' ? hooks.lockRemove : hooks.userRemove, {
        op: 'remove',
        subject: t.subject,
        action: 'revoke_room_access',
        accessGroup: t.accessGroup,
        accessGroupId: t.accessGroupId,
        ...(t.subject === 'lock'
          ? { lockId: t.lockId, lockName: t.lockName }
          : { email: t.email, memberName: t.memberName }),
        roomName: p.roomName,
        company: p.companyName,
        bookingRef: b.reference ?? b.id,
        source: 'hexaspace-platform',
      })
    }
    await stamp(b, { roomAccessRemovedAt: nowIso })
    removed.push({ booking: b.reference ?? b.id, room: p.roomName, mode: p.mode })
  }

  return res.status(200).json({ added, removed, skippedNoTargets })
}
