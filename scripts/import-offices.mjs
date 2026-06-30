// Rebuild the private-office inventory from the OfficeRND offices export.
// Authoritative: floor, pax, plan (external/internal), list price, occupant.
//   node scripts/import-offices.mjs "<offices.csv>"            # dry run
//   node scripts/import-offices.mjs "<offices.csv>" --commit   # replace office spaces
import fs from 'fs'

const COMMIT = process.argv.includes('--commit')
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
function parseCSV(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c } else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') {} else f += c } } if (f.length || row.length) { row.push(f); rows.push(row) } return rows }
const norm = (s) => (s || '').toLowerCase().replace(/\bpty\b|\bltd\b|\bp\/l\b|[.,&]/g, '').replace(/\s+/g, ' ').trim()
const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function fetchAll(table) { const res = await fetch(`${URL}/rest/v1/${table}?select=id,data&limit=5000`, { headers: HDR }); return res.ok ? res.json() : [] }
async function del(table, ids) { if (ids.length) await fetch(`${URL}/rest/v1/${table}?id=in.(${ids.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: HDR }) }
async function bulkUpsert(table, rows) { for (let i = 0; i < rows.length; i += 500) { const res = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) }); if (!res.ok) { console.error('upsert fail', res.status, await res.text()); process.exit(1) } } }

const FLOOR = { 'Level 4': 'l4', 'Level 5': 'l5', 'Floor 2': 'l2', 'Level 2': 'l2' }
const tenants = await fetchAll('tenants')
const byNorm = new Map(tenants.map((t) => [norm(t.data.businessName), t]))
const findTenant = (name) => { if (!name) return null; const n = norm(name); return byNorm.get(n) || tenants.find((t) => norm(t.data.businessName).includes(n) || n.includes(norm(t.data.businessName))) || null }

const rows = parseCSV(fs.readFileSync(process.argv[2], 'utf8')); const H = rows.shift(); const ix = (n) => H.indexOf(n)
const data = rows.filter((r) => r[ix('Resource Name')])

const offices = []; const skipped = []; const unmatched = []; const seen = new Map()
for (const r of data) {
  const name = r[ix('Resource Name')].trim()
  const plan = r[ix('Target Plan')] || ''
  if (/^188/i.test(name) || /188/.test(plan)) { skipped.push(`${name} (188)`); continue }
  if (/media studio|digital display/i.test(name) || /digital display/i.test(plan)) { skipped.push(`${name} (non-office)`); continue }
  // Suite 15 & 16 walls were broken through → one merged office "Suite 15 + 16".
  if (/^suite\s*15$/i.test(name) || /^suite\s*16$/i.test(name)) { skipped.push(`${name} (merged into Suite 15 + 16)`); continue }
  if (/^(office\s*)?20$/i.test(name)) { skipped.push(`${name} (no Office 20)`); continue } // L4 tops at Office 15

  let floor = FLOOR[r[ix('Floor')]] || (/^suite/i.test(name) ? 'l2' : 'l4')
  const placement = /internal/i.test(plan) ? 'internal' : 'external'
  let pax = parseInt(r[ix('Size (People)')] || '', 10)
  if (isNaN(pax)) { const m = plan.match(/(\d+)\s*pax/i); pax = m ? +m[1] : null }
  const listPrice = Number(r[ix('List Price')] || 0)
  const soldRaw = Number(r[ix('Sold Price')] || 0)
  const soldPrice = soldRaw > 0 ? soldRaw : null
  const rawStatus = (r[ix('Status')] || '').toLowerCase()
  const member = (r[ix('Member')] || '').trim()
  const occupied = !!member && (rawStatus === 'occupied' || rawStatus === 'available_soon')
  const rank = rawStatus === 'occupied' ? 2 : rawStatus === 'available_soon' ? 1 : 0
  // Actual rate paid: occupied → sold price (blank/0 = comped); vacant → list (asking) price.
  const actualRate = occupied ? (soldPrice ?? 0) : listPrice
  const discount = occupied && listPrice > actualRate ? Math.round((listPrice - actualRate) * 100) / 100 : 0

  // display name: Suite N stays; bare number / Office N → "Office N"
  let unit = name
  if (/^\d+$/.test(name)) unit = `Office ${name}`
  const numslug = unit.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const id = `hx_${floor}_${numslug}`

  // dedupe by id, keeping the higher-ranked record (occupied > available_soon)
  const prev = seen.get(id)
  if (prev && prev.rank >= rank) { skipped.push(`${name} → ${member} (dup of ${prev.member})`); continue }

  const tenant = occupied ? findTenant(member) : null
  if (occupied && !tenant) unmatched.push(`${unit} (${FLOOR_LABEL(floor)}): "${member}"`)

  const rec = { id, unitNumber: unit, type: 'office', floor, placement, pax: pax ?? undefined,
    size: pax ? `${pax} pax${placement === 'internal' ? ' internal' : ''}` : undefined,
    monthlyRate: actualRate, listPrice, soldPrice, discount, plan,
    status: occupied ? 'occupied' : 'vacant',
    occupantName: occupied && !tenant ? member : '', occupantTenantId: tenant?.id || '',
    location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill', attributes: '' }
  seen.set(id, { rank, member })
  const dupIdx = offices.findIndex((o) => o.id === id)
  const entry = { id, data: rec, _member: member, _occ: occupied }
  if (dupIdx >= 0) offices[dupIdx] = entry; else offices.push(entry)
}
function FLOOR_LABEL(f) { return f === 'l4' ? 'Level 4' : f === 'l5' ? 'Level 5' : 'Level 2' }

// report
const order = { l4: 0, l5: 1, l2: 2 }
offices.sort((a, b) => order[a.data.floor] - order[b.data.floor] || a.data.unitNumber.localeCompare(b.data.unitNumber, undefined, { numeric: true }))
let lf = ''
for (const o of offices) {
  if (o.data.floor !== lf) { console.log(`\n-- ${FLOOR_LABEL(o.data.floor)} --`); lf = o.data.floor }
  const occ = o._occ ? (o.data.occupantTenantId ? o._member : `⚠ ${o._member}`) : '(vacant)'
  console.log(`  ${o.data.unitNumber.padEnd(11)} ${String(o.data.pax ?? '').padStart(2)}p ${o.data.placement.padEnd(8)} $${String(o.data.monthlyRate).padStart(6)}/mo  ${occ}`)
}
const counts = offices.reduce((a, o) => { a[o.data.floor] = (a[o.data.floor] || 0) + 1; return a }, {})
console.log(`\nTotal offices: ${offices.length}  (L4 ${counts.l4 || 0}, L5 ${counts.l5 || 0}, L2 ${counts.l2 || 0}) · occupied ${offices.filter((o) => o._occ).length}`)
if (unmatched.length) console.log(`\n⚠ Member not matched to a tenant:\n  ${unmatched.join('\n  ')}`)
if (skipped.length) console.log(`\nSkipped: ${skipped.join(', ')}`)
console.log(`\nMode: ${COMMIT ? 'COMMIT' : 'DRY RUN'}`)

if (COMMIT) {
  const existing = (await fetchAll('spaces')).filter((s) => s.data.type === 'office').map((s) => s.id)
  await del('spaces', existing)
  await bulkUpsert('spaces', offices.map((o) => ({ id: o.id, data: o.data })))
  console.log(`Deleted ${existing.length} old office rows · inserted ${offices.length} offices.`)
}
