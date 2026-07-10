// Seed Salto remote-open lock maps into settings.salto from Lock (IDs)-2026-07-10.csv.
//
//   node scripts/seed-remote-open-locks.mjs            # DRY RUN — prints the plan
//   node scripts/seed-remote-open-locks.mjs --commit   # writes settings.salto.*
//
// Writes three maps, merging into existing settings (never clobbers other keys):
//   • salto.remoteOpen.locks      { [officeSpaceId]: lockId }   — own-office unlock
//   • salto.remoteOpen.entryDoors [{ label, lockId, floors }]   — building entry by floor
//   • salto.roomLocks             { [roomSpaceId]: lockId }     — meeting-room / studio open
//
// Office/suite locks are matched to spaces by unit number. Meeting-room locks are
// FUZZY-matched by keyword (sky/north/west/earth/south) and only auto-assigned on a
// single confident hit — review the "rooms" section output before --commit.

import fs from 'fs'

function parseEnv(p) {
  const o = {}; if (!fs.existsSync(p)) return o
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return o
}
const env = { ...parseEnv('.env.local'), ...parseEnv('.env') }
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const COMMIT = process.argv.includes('--commit')

// ── Lock IDs (from Lock (IDs)-2026-07-10.csv) ────────────────────────────────
const OFFICE_SUITE = {
  'Office 1': 'e1ab44e3-c3af-4a35-ac9e-4cb26e169ca1', 'Office 2': '4e5aba63-12c6-4049-b02d-320c3cee485e',
  'Office 3': '27886d88-6a86-42c7-a738-13c891b0f9a5', 'Office 4': 'c3c4045a-084d-409b-ade2-27ce1a6c3105',
  'Office 5': '3e6f8966-759d-4604-abea-8fc15d4ec616', 'Office 6': '6eaf9e33-8ccf-495f-98ac-40e7364a33b9',
  'Office 7': '99e0b9c6-f437-465d-a9ba-28ca05ef4f61', 'Office 8': '2beb2267-6930-441a-98a8-bc8b921c2a66',
  'Office 9': 'd2ada8ae-a7dd-430f-8bc4-048dd5627cbb', 'Office 10': '47fbb7f3-4db2-4d9a-8702-ee6258505da3',
  'Office 11': '0923af23-9c96-4d4c-9650-e8f1ded8558b', 'Office 12': 'b16ede5e-6e5b-40e5-a67b-255d448cfa2e',
  'Office 13': 'ecec6c9d-c9cb-4595-a8d6-ad3f736daf72', 'Office 14': '35f1bcbc-9848-4b94-b12e-ed42c95a2279',
  'Office 15': '7023011c-df17-4e3b-acea-eb9e65563000', 'Office 16': '36c35d92-a08a-4fdf-8a14-ce8711a6a983',
  'Office 17': '73374677-c8f9-49b6-bc5e-9ddb7ccd6251',
  'Suite 1': '8416156e-f800-4f5d-8716-08fd243dd7eb', 'Suite 2': '4202e417-c860-4cde-8ad1-16598933f47d',
  'Suite 3': '9d45a5d6-f0a6-43f6-b524-d5e69ada3ae1', 'Suite 4': '776d898a-5c4e-4d23-919b-5f03bc0f96b0',
  'Suite 5': '26f5c7c0-fb02-455b-8022-6bc02239f32b', 'Suite 6': '0ef321a1-ad0b-4597-b5b6-09536ed10480',
  'Suite 7': 'ba33bcb5-a39f-465d-ab91-911f923a78a2', 'Suite 8': '5282f0fd-49fe-4483-9d04-66d6b8e799d2',
  'Suite 9': 'de18a388-d10d-40e7-80ac-fbda186c304a', 'Suite 10': 'a68b8a4f-f203-49fc-a18f-f035af142aa0',
  'Suite 11': 'bd6f7d74-ab5a-44ba-9d4d-54e106e1f5c5', 'Suite 12': '7bb84512-0862-4a6b-813c-2a0d80d5e5cf',
  'Suite 13': '89cc72df-57f2-4501-a758-b3139f32da06', 'Suite 14': '0944316a-3342-4c58-bcaa-3e059433ae38',
  'Suite 15': '742088b0-f375-40d4-bbee-3350e5ba552b', 'Suite 16': '72b16568-6b42-4060-bce9-8ebac1406e5c',
  'Suite 17': '152e3c29-929c-47eb-89dc-a99cc0b08861', 'Suite 18': '0fcacf8b-b7d1-46c0-9d99-a436fa750085',
  'Suite 19': '0dd9e645-f2ce-4b9c-9d70-bebc85aedc3c', 'Suite 20': 'e8eda648-c871-4c37-a151-faeab619534a',
  'Suite 21': 'f9d010f4-6d0b-406e-88d9-5b062cae884f', 'Suite 22': '4d42290f-1586-4566-b6f0-e0c1f412fd25',
  'Suite 23': 'fb6e0c96-be9d-46ec-9571-68adb903dda3', 'Suite 24': '101d05e6-312c-482e-9770-bcbf6f1f54d6',
  'Suite 27': '38a64a2c-10e6-4207-aa66-6f7d4e66d00a',
}

const ENTRY_DOORS = [
  { label: 'L2 Front Entry', lockId: '5f4bc650-4173-493d-8d82-32ae8dd49c2e', floors: [2] },
  { label: 'L2 Rear Entry', lockId: '134dda97-e2cf-48dd-a909-0892b9505c71', floors: [2] },
  { label: 'L4/5 Reception', lockId: '46693618-f861-47af-aa86-6ed5cbe6ff45', floors: [4, 5] },
  { label: 'L5 Breakout Collaboration', lockId: '27b12b69-31cf-4556-a0fb-9d5c68b65bb6', floors: [5] },
]

// Meeting-room / studio locks. Media Studios is unambiguous; the rest are fuzzy.
const MEDIA_STUDIOS_LOCK = 'f330e107-c3cc-48f7-ab10-c14d06ec34fc'
const ROOM_LOCKS_BY_KEYWORD = {
  west: 'd64f507f-c404-4d69-8ba7-d77bc3072b43',   // Meeting Room 1 West 10
  north: 'ab63941c-d8a8-4d66-bf76-8dfda74c69b8',  // Meeting Room 2 North Middle
  south: 'b9982432-7b43-4750-af83-2050aa990475',  // Meeting Room 3 South Right
  earth: 'cdae6df1-e5ef-4270-9913-a82f693fec79',  // Meeting Room 4 Earth Left
  sky: '6fe59d02-1a5b-40da-b1b4-95fc866a2f6d',    // Meeting Room 5 Sky Right
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

async function fetchAll(table) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id,data&limit=5000`, { headers: HDR })
  return r.ok ? r.json() : []
}

const spaces = (await fetchAll('spaces')).map((r) => ({ id: r.id, ...r.data }))
const settingsRows = await fetch(`${URL}/rest/v1/settings?id=eq.global&select=data`, { headers: HDR }).then((r) => r.json())
const settings = settingsRows?.[0]?.data ?? {}
const salto = settings.salto ?? {}

// ── Office/suite locks → spaceId by unit number ──────────────────────────────
const locks = { ...(salto.remoteOpen?.locks ?? {}) }
const officeMatched = [], officeUnmatched = []
for (const [label, lockId] of Object.entries(OFFICE_SUITE)) {
  const sp = spaces.find((s) => norm(s.unitNumber) === norm(label))
  if (sp) { locks[sp.id] = lockId; officeMatched.push(`${label} → ${sp.id}`) }
  else officeUnmatched.push(label)
}

// ── Room locks → spaceId (Media Studios exact; others fuzzy by keyword) ───────
const roomLocks = { ...(salto.roomLocks ?? {}) }
const roomMatched = [], roomAmbiguous = []
const bookableRooms = spaces.filter((s) => /meeting|studio|podcast|room/i.test(`${s.type} ${s.unitNumber}`))
for (const sp of bookableRooms) {
  const name = norm(sp.unitNumber)
  if (/media studio/.test(name) || sp.id === 'hx_studio_1') { roomLocks[sp.id] = MEDIA_STUDIOS_LOCK; roomMatched.push(`${sp.unitNumber} → Media Studios`); continue }
  const hits = Object.entries(ROOM_LOCKS_BY_KEYWORD).filter(([kw]) => name.includes(kw))
  if (hits.length === 1) { roomLocks[sp.id] = hits[0][1]; roomMatched.push(`${sp.unitNumber} → ${hits[0][0]}`) }
  else roomAmbiguous.push(`${sp.unitNumber} (${sp.id}) — ${hits.length ? 'multiple keyword hits' : 'no keyword match'}`)
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n=== ${COMMIT ? 'COMMIT' : 'DRY RUN'} — remote-open lock seed ===\n`)
console.log(`Offices/suites matched (${officeMatched.length}):`); officeMatched.forEach((s) => console.log('  ✓', s))
if (officeUnmatched.length) { console.log(`Offices/suites with NO matching space (${officeUnmatched.length}):`); officeUnmatched.forEach((s) => console.log('  ⚠', s)) }
console.log(`\nEntry doors (${ENTRY_DOORS.length}):`); ENTRY_DOORS.forEach((e) => console.log(`  ✓ ${e.label} — floors [${e.floors.join(',')}]`))
console.log(`\nRooms matched (${roomMatched.length}):`); roomMatched.forEach((s) => console.log('  ✓', s))
if (roomAmbiguous.length) { console.log(`Rooms needing MANUAL mapping (${roomAmbiguous.length}):`); roomAmbiguous.forEach((s) => console.log('  ⚠', s)) }

const nextSalto = {
  ...salto,
  remoteOpen: { ...(salto.remoteOpen ?? {}), locks, entryDoors: ENTRY_DOORS },
  roomLocks,
}

if (!COMMIT) {
  console.log('\nDry run — no changes written. Re-run with --commit to save.')
  process.exit(0)
}

const res = await fetch(`${URL}/rest/v1/settings?id=eq.global`, {
  method: 'PATCH', headers: { ...HDR, Prefer: 'return=minimal' },
  body: JSON.stringify({ data: { ...settings, salto: nextSalto } }),
})
if (!res.ok) { console.error('\n✗ Write failed:', res.status, await res.text()); process.exit(1) }
console.log('\n✓ settings.salto updated (remoteOpen.locks, remoteOpen.entryDoors, roomLocks).')
