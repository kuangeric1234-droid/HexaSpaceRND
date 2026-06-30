// Set authoritative private-office occupancy from the actual floorplans.
// Writes occupantTenantId/occupantName + status onto each office space.
//   node scripts/set-occupants.mjs           # dry run
//   node scripts/set-occupants.mjs --commit   # write
import fs from 'fs'

const COMMIT = process.argv.includes('--commit')
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function fetchAll(table) { const res = await fetch(`${URL}/rest/v1/${table}?select=id,data&limit=5000`, { headers: HDR }); return res.ok ? res.json() : [] }
async function bulkUpsert(table, rows) { for (let i = 0; i < rows.length; i += 500) { const res = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) }); if (!res.ok) { console.error('fail', res.status, await res.text()); process.exit(1) } } }

// ── Floorplan truth (suite → company) ────────────────────────────────────────
const L4 = {
  1: 'GrantGuru Pty Ltd.', 2: 'Simple stacks accounting service pty ltd', 3: 'Melbourne Creative Group PTY LTD',
  4: 'Connected Logics', 5: 'Newulife', 6: 'Fureeze', 7: 'Mindmetta PTY Ltd',
  8: 'Simple stacks accounting service pty ltd', 9: 'Digitec It', 10: 'Chethana Psychology',
  11: 'Steadfast Eastern Insurance Brokers P/L', 12: 'Hexa Pacific PTY LTD',
  13: 'Steadfast Eastern Insurance Brokers P/L', 14: 'M&Y OmniReach PTY LTD', 15: 'Money Chain Foreign Exchange',
}
const L2 = {
  2: 'Canwealth VIC PTY LTD', 3: 'PHC Accounting', 4: 'QBS Partners', 5: 'JJT Australia PTY LTD',
  6: 'RC Infrastructure TA Raiden Centauri', 7: 'WEHOME REAL ESTATE PTY LTD', 8: 'Victor Group holdings',
  10: 'NEXUS INTERACTIVE PTY LTD', 11: 'You Hao Pty Ltd', 12: 'You Hao Pty Ltd', 13: 'tantu Australia',
  14: 'AJ LEE', 16: 'Level Up Consult', 17: 'Top bridge group Pty Ltd', 18: 'Earth Power Co',
  19: 'PanAus Partners Melbourne', 20: 'Sleek Circle', 21: 'Karad & Bradley PTY LTD Architects & Planner',
  22: 'Azlan Lawyers', 23: 'Masterlink Communications Pty Ltd', 24: 'WEHOME REAL ESTATE PTY LTD',
  25: 'DCOL Project', 27: 'Global link logistics pty ltd', 29: 'Earth Power Co',
}
// Suites left as-is (couldn't read confidently): L2 1, 9, 15, 26, 28.

const tenants = await fetchAll('tenants')
const norm = (s) => (s || '').toLowerCase().replace(/\bpty\b|\bltd\b|\bp\/l\b|[.,&]/g, '').replace(/\s+/g, ' ').trim()
const byNorm = new Map(tenants.map((t) => [norm(t.data.businessName), t]))
function findTenant(name) {
  const n = norm(name)
  if (byNorm.has(n)) return byNorm.get(n)
  // contains fallback
  let hit = tenants.find((t) => norm(t.data.businessName).includes(n) || n.includes(norm(t.data.businessName)))
  return hit || null
}

const spacesRows = await fetchAll('spaces')
const spaceByFN = new Map(spacesRows.filter((s) => s.data.type === 'office')
  .map((s) => [`${s.data.floor}:${parseInt(String(s.data.unitNumber).replace(/\D/g, ''), 10)}`, s]))

const patchById = new Map(); const unmatchedNames = []; const missingSuites = []
for (const [floor, map] of [['l4', L4], ['l2', L2]]) {
  for (const [n, company] of Object.entries(map)) {
    const row = spaceByFN.get(`${floor}:${n}`)
    if (!row) { missingSuites.push(`${floor} Suite ${n}`); continue }
    const tenant = findTenant(company)
    if (!tenant) unmatchedNames.push(`${floor} Suite ${n}: "${company}"`)
    patchById.set(row.id, { id: row.id, data: { ...row.data, occupantTenantId: tenant?.id || '', occupantName: tenant ? '' : company, status: 'occupied' } })
    console.log(`  ${floor.toUpperCase()} Suite ${String(n).padEnd(3)} → ${tenant ? tenant.data.businessName : '⚠ ' + company}`)
  }
}
// Clear occupancy on office suites NOT in the floorplan map (make them vacant).
const cleared = []
for (const row of spacesRows) {
  if (row.data.type !== 'office' || patchById.has(row.id)) continue
  if (row.data.occupantTenantId || row.data.occupantName || row.data.status === 'occupied') {
    cleared.push(`${row.data.floor} ${row.data.unitNumber}`)
    patchById.set(row.id, { id: row.id, data: { ...row.data, occupantTenantId: '', occupantName: '', status: 'vacant' } })
  }
}
const patches = [...patchById.values()]
console.log(`\nMapped ${patches.length - cleared.length} suites · clearing ${cleared.length} now-vacant: ${cleared.join(', ') || 'none'}`)
if (unmatchedNames.length) console.log(`\n⚠ Company name not found as a tenant:\n  ${unmatchedNames.join('\n  ')}`)
if (missingSuites.length) console.log(`\n⚠ Suite not in layout: ${missingSuites.join(', ')}`)
// Unlink imported contract leases from office spaces, so office occupancy is
// driven solely by the floorplan occupant (no stale/duplicate contract data).
const officeIds = new Set(spacesRows.filter((s) => s.data.type === 'office').map((s) => s.id))
const leaseRows = await fetchAll('leases')
const leasePatches = leaseRows
  .filter((l) => l.data.spaceId && officeIds.has(l.data.spaceId))
  .map((l) => ({ id: l.id, data: { ...l.data, spaceId: '' } }))

console.log(`\nMode: ${COMMIT ? 'COMMIT' : 'DRY RUN'}  ·  will unlink ${leasePatches.length} office contract leases`)
if (COMMIT) {
  await bulkUpsert('spaces', patches)
  if (leasePatches.length) await bulkUpsert('leases', leasePatches)
  console.log(`Wrote ${patches.length} space updates · unlinked ${leasePatches.length} leases.`)
}
