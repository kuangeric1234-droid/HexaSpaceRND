// Read-only inspection: shows whether imported members/companies carry any
// office/suite assignment we can match on. Prints business fields only.
import fs from 'fs'

function parseEnv(p) {
  const o = {}; if (!fs.existsSync(p)) return o
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return o
}
const env = parseEnv('.env.local')
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing env'); process.exit(1) }

async function fetchAll(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=data`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) { console.error(table, res.status); return [] }
  return (await res.json()).map((r) => r.data)
}

const tenants = await fetchAll('tenants')
const members = await fetchAll('members')
const spaces = await fetchAll('spaces')

console.log(`\nCOUNTS: tenants=${tenants.length} members=${members.length} spaces=${spaces.length}`)

console.log('\n=== distinct member membershipType values ===')
const mt = {}
members.forEach((m) => { const k = (m.membershipType || '(blank)'); mt[k] = (mt[k] || 0) + 1 })
Object.entries(mt).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n.toString().padStart(3)}  ${k}`))

console.log('\n=== tenant fields present (first tenant) ===')
console.log('  ' + Object.keys(tenants[0] || {}).join(', '))

console.log('\n=== any office/suite-looking strings in tenant data ===')
let hits = 0
for (const t of tenants) {
  const blob = JSON.stringify(t).toLowerCase()
  if (/suite|office|level\s*\d|pax|desk|virtual/.test(blob)) {
    const m = JSON.stringify(t).match(/("[^"]*?(?:suite|office|level|pax|virtual)[^"]*?")/i)
    console.log(`  ${t.businessName} → ${m ? m[1] : ''}`)
    if (++hits >= 25) { console.log('  …(truncated)'); break }
  }
}
if (!hits) console.log('  none found')

console.log('\n=== sample members (name · company · membership) ===')
members.slice(0, 15).forEach((m) => {
  const co = tenants.find((t) => t.id === m.companyId)?.businessName || m.companyId || '—'
  console.log(`  ${m.name}  ·  ${co}  ·  ${m.membershipType || ''}`)
})
