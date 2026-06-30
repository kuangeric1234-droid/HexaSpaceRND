import fs from 'fs'

function parseEnv(p) {
  const o = {}; if (!fs.existsSync(p)) return o
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return o
}
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c === '\r') {} else field += c }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const env = parseEnv('.env.local')
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
async function fetchAll(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=data`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  return (await res.json()).map((r) => r.data)
}

const rows = parseCSV(fs.readFileSync(process.argv[2], 'utf8'))
const H = rows.shift()
const x = (n) => H.indexOf(n)
const data = rows.filter((r) => r[x('Number')])

const tenants = await fetchAll('tenants')
const spaces = await fetchAll('spaces')
const norm = (s) => (s || '').trim().toLowerCase()
const tByName = new Map(tenants.map((t) => [norm(t.businessName), t]))

console.log(`Contracts: ${data.length}  ·  tenants: ${tenants.length}  ·  spaces: ${spaces.length}`)

// Distinct resources
const resCount = {}, planCount = {}, statusCount = {}
let teamMatched = 0, teamMissing = []
for (const r of data) {
  const res = (r[x('Resources')] || '').trim() || '(none)'
  resCount[res] = (resCount[res] || 0) + 1
  const plan = (r[x('Recurring Plans')] || '').trim() || '(none)'
  planCount[plan] = (planCount[plan] || 0) + 1
  const st = (r[x('Status')] || '').trim(); statusCount[st] = (statusCount[st] || 0) + 1
  const team = r[x('Team')]
  if (team) { if (tByName.has(norm(team))) teamMatched++; else teamMissing.push(team) }
}

console.log('\n=== distinct Resources (count) ===')
Object.entries(resCount).sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`))

console.log('\n=== distinct Recurring Plans ===')
Object.entries(planCount).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`))

console.log('\n=== Status ===')
Object.entries(statusCount).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`))

console.log(`\n=== Team match: ${teamMatched}/${data.length} matched to a tenant ===`)
const missUniq = [...new Set(teamMissing)]
console.log(`Unmatched teams (${missUniq.length}):`)
missUniq.slice(0, 40).forEach((t) => console.log(`  - ${t}`))

console.log('\n=== current space unitNumbers (offices only) ===')
console.log('  ' + spaces.filter((s) => s.type === 'office').map((s) => `${s.unitNumber}/${s.floor}`).join(', '))
console.log('\n=== ALL space unitNumbers by type ===')
const byType = {}
spaces.forEach((s) => { (byType[s.type] ||= []).push(s.unitNumber) })
Object.entries(byType).forEach(([t, arr]) => console.log(`  ${t}: ${arr.join(', ')}`))
