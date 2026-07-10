// One-off: link each meeting room to its Salto KS lock id so the app's
// "My key" / live-booking tile can remote-open it. Ids taken from the KS lock
// export (Downloads/Lock (ID)-2026-07-10.csv), matched by room name.
//
// Sets data.saltoLockId on each matching `spaces` row (leaves the rest intact),
// and turns on Settings → salto.remoteOpen.enabled so unlocks are actually
// dispatched. Idempotent.
//
// Preview:  node scripts/set-room-locks.mjs --dry
// Apply:    node scripts/set-room-locks.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry')

const env = Object.fromEntries(
  readFileSync('C:/Hexa-Space-RND/.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Meeting room (by leading word of its name) → KS lock id.
const LOCKS = {
  west:    'd64f507f-c404-4d69-8ba7-d77bc3072b43', // Meeting Room 1 West 10
  north:   'ab63941c-d8a8-4d66-bf76-8dfda74c69b8', // Meeting Room 2 North Middle
  south:   'b9982432-7b43-4750-af83-2050aa990475', // Meeting Room 3 South Right
  earth:   'cdae6df1-e5ef-4270-9913-a82f693fec79', // Meeting Room 4 Earth Left
  sky:     '6fe59d02-1a5b-40da-b1b4-95fc866a2f6d', // Meeting Room 5 Sky Right
  sun:     '665d1295-0d34-44fc-8f50-6378c81efe6d', // Meeting Room Sun
  moon:    'a88d5bbc-1955-4406-a17a-f3ab5b6ef164', // Meeting Room: Moon Right
  central: '1d119bd7-7da9-4de0-a606-1f689a0988b1', // Level 2 Central
  east:    'd56e3aa9-378c-4ddd-aa55-805c514422a4', // Tea Room (East = the tearoom)
}

const leadWord = (name) => String(name || '').trim().toLowerCase().split(/[\s(/·—-]/)[0]
const isFunctionSpace = (s) => s.type === 'function' || s.id === 'hx_func' || /function/i.test(s.unitNumber || '')

const { data: rows, error } = await sb.from('spaces').select('id, data')
if (error) { console.error('Fetch failed:', error.message); process.exit(1) }

const rooms = (rows ?? [])
  .map((r) => ({ id: r.id, data: r.data }))
  .filter((r) => r.data?.type === 'meeting' && !isFunctionSpace(r.data))

const nowIso = new Date().toISOString()
let changed = 0
const unmatched = []

for (const r of rooms) {
  const lockId = LOCKS[leadWord(r.data.unitNumber)]
  if (!lockId) { unmatched.push(r.data.unitNumber); continue }
  if (r.data.saltoLockId === lockId) {
    console.log(`  ok   ${String(r.data.unitNumber).padEnd(22)} ${lockId}`)
    continue
  }
  console.log(`${DRY ? 'would' : 'set  '} ${String(r.data.unitNumber).padEnd(22)} ${r.data.saltoLockId ?? '(unset)'} → ${lockId}`)
  changed++
  if (!DRY) {
    const { error: upErr } = await sb.from('spaces')
      .update({ data: { ...r.data, saltoLockId: lockId }, updated_at: nowIso })
      .eq('id', r.id)
    if (upErr) console.error(`  ERR ${r.id}: ${upErr.message}`)
  }
}

// Enable remote unlock so the app actually dispatches opens.
const { data: settRow } = await sb.from('settings').select('data').eq('id', 'global').single()
const settings = settRow?.data ?? {}
const remoteOpen = settings.salto?.remoteOpen ?? {}
if (remoteOpen.enabled === true) {
  console.log('\nremoteOpen.enabled already true.')
} else {
  console.log(`\n${DRY ? 'would enable' : 'enabling'} Settings → remote unlock (salto.remoteOpen.enabled = true)`)
  console.log('  NOTE: this also enables in-app remote-open for office & building-entry doors.')
  if (!DRY) {
    const next = { ...settings, salto: { ...(settings.salto ?? {}), remoteOpen: { ...remoteOpen, enabled: true } } }
    const { error: sErr } = await sb.from('settings').update({ data: next, updated_at: nowIso }).eq('id', 'global')
    if (sErr) console.error('  settings ERR:', sErr.message)
  }
}

console.log(`\n${rooms.length} meeting rooms · ${changed} ${DRY ? 'would change' : 'updated'}`)
if (unmatched.length) console.log(`No lock mapped for: ${unmatched.join(', ')} (add to LOCKS if they need remote unlock)`)
if (DRY) console.log('(dry run — re-run without --dry to apply)')
