// /api/salto/open — remote-unlock a member's OWN office door from the app.
//
// Deliberately narrow: a member can only open the door of a space their
// company holds an ACTIVE lease on, and only when the admin has (a) enabled
// the feature and (b) mapped that space to a Salto KS lock. The front door,
// reception and common doors are never openable here — those stay on the
// Salto app / fob, per policy.
//
//   GET  → { enabled, doors: [{ spaceId, label }], remaining }  (member-authed)
//   POST { spaceId } → fires the unlock; every attempt is audit-logged to
//         salto_open_log (deny-all RLS) with a per-member daily cap.
//
// Transport: SALTO_REMOTE_OPEN_WEBHOOK (Zapier/bridge zap receives
// { action: 'remote_open', lockId, unit, email }) — swap in the KS Connect
// API here once Hexa's developer credentials exist. Mock when unconfigured.

import { requireMember } from '../_auth.js'
import { applyCors } from '../_cors.js'

const DAILY_CAP_DEFAULT = 10

async function memberDoors(sb, companyId, settings) {
  const cfg = settings?.salto?.remoteOpen ?? {}
  const locks = cfg.locks ?? {} // { [spaceId]: ksLockId }
  const [{ data: lRows }, { data: sRows }] = await Promise.all([
    sb.from('leases').select('data').eq('data->>tenantId', companyId),
    sb.from('spaces').select('data'),
  ])
  const active = (lRows ?? []).map((r) => r.data).filter((l) => l.status === 'active')
  const spaces = (sRows ?? []).map((r) => r.data)
  const doors = []
  for (const lease of active) {
    const space = spaces.find((s) => s.id === lease.spaceId)
    const lockId = locks[lease.spaceId] ?? space?.saltoLockId
    if (space && lockId) doors.push({ spaceId: space.id, label: space.unitNumber, lockId })
  }
  return doors
}

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

  const dayStart = new Date(); dayStart.setUTCHours(dayStart.getUTCHours() - 24)
  const { count } = await sb.from('salto_open_log')
    .select('id', { count: 'exact', head: true })
    .eq('email', auth.user.email)
    .eq('result', 'opened')
    .gte('at', dayStart.toISOString())
  const remaining = Math.max(0, cap - (count ?? 0))

  if (req.method === 'GET') {
    const doors = enabled ? await memberDoors(sb, auth.companyId, settings) : []
    return res.status(200).json({ enabled, remaining, doors: doors.map(({ spaceId, label }) => ({ spaceId, label })) })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!enabled) return res.status(403).json({ error: 'Remote unlock is not enabled.' })

  const { spaceId } = req.body ?? {}
  const doors = await memberDoors(sb, auth.companyId, settings)
  const door = doors.find((d) => d.spaceId === spaceId)
  // Own-door only: anything not on the member's active leases is rejected.
  if (!door) return res.status(403).json({ error: 'That door is not on your membership.' })
  if (remaining <= 0) return res.status(429).json({ error: 'Daily unlock limit reached — use your fob or the Salto app.' })

  const log = async (result) => {
    await sb.from('salto_open_log').insert({
      id: `so_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: auth.user.email, member_id: null, company_id: auth.companyId,
      space_id: door.spaceId, lock_id: String(door.lockId), result,
    }).then(() => {}, () => {})
  }

  const webhook = process.env.SALTO_REMOTE_OPEN_WEBHOOK
  if (!webhook) {
    await log('mock')
    return res.status(200).json({ mock: true, opened: true, door: door.label, note: 'SALTO_REMOTE_OPEN_WEBHOOK not set — no unlock sent.' })
  }

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remote_open',
        lockId: String(door.lockId),
        unit: door.label,
        email: auth.user.email,
        source: 'hexaspace-app',
      }),
    })
    if (!r.ok) throw new Error(`hook ${r.status}`)
    await log('opened')
    return res.status(200).json({ opened: true, door: door.label, remaining: remaining - 1 })
  } catch (err) {
    console.error('salto remote open failed:', err)
    await log('failed')
    return res.status(502).json({ error: 'Could not reach the door system — try your fob or the Salto app.' })
  }
}
