// Imports OfficeRND CSV exports (teams + members) into Supabase tenants + members.
// Usage: node scripts/import-officernd.mjs "<teams.csv>" "<members.csv>"
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
import fs from 'fs'

function parseEnv(p) {
  const o = {}; if (!fs.existsSync(p)) return o
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return o
}

// Minimal RFC-4180 CSV parser
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else {
      if (c === '"') q = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
function isoDate(s) {
  if (!s) return ''
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (!m) return ''
  const mo = MONTHS[m[2].toLowerCase()]; if (!mo) return ''
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}
const norm = (s) => (s || '').trim().toLowerCase()
const titleCase = (s) => (s || '').replace(/\b\w/g, (c) => c.toUpperCase())
function companyStatus(s) { const x = norm(s); return x === 'active' ? 'Active' : x === 'former' ? 'Former' : x.includes('lead') || x.includes('prospect') ? 'Lead' : x ? titleCase(x) : 'Active' }
function memberStatus(s) { const x = norm(s); return x === 'active' ? 'Active' : x === 'drop-in' ? 'Drop In' : x === 'former' ? 'Former' : x === 'pending' ? 'Pending' : x ? titleCase(x) : 'Active' }

const env = parseEnv('.env.local')
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const [teamsPath, membersPath] = process.argv.slice(2)
const teamRows = parseCSV(fs.readFileSync(teamsPath, 'utf8'))
const memRows = parseCSV(fs.readFileSync(membersPath, 'utf8'))
const tH = teamRows.shift(), mH = memRows.shift()
const tx = (name) => tH.indexOf(name), mx = (name) => mH.indexOf(name)

// ── Companies ──
const companies = []
const nameToId = new Map()
const contactNames = new Set(), billingNames = new Set()
let ci = 0
for (const r of teamRows) {
  if (!r[tx('Name')]) continue
  const id = `tc${ci++}`
  const name = r[tx('Name')].trim()
  nameToId.set(norm(name), id)
  const contacts = (r[tH.indexOf('Contact Persons')] || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  const billers = (r[tH.indexOf('Billing Persons')] || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  contacts.forEach((n) => contactNames.add(norm(n)))
  billers.forEach((n) => billingNames.add(norm(n)))
  companies.push({
    id, data: {
      id, businessName: name, email: r[tx('Email Address')] || '', url: r[tx('URL')] || '', twitter: r[tx('Twitter')] || '',
      moreInfo: r[tx('More info')] || '', startDate: isoDate(r[tx('Start Date')]), status: companyStatus(r[tx('Status')]),
      industry: r[tx('Industries')] || '', billBusinessName: r[tx('Business Name')] || '', abn: r[tx('Reg Number')] || '',
      currency: r[tx('Currency')] || 'AUD', city: r[tx('City')] || '', state: r[tx('State')] || '', zip: r[tx('Zip')] || '', country: r[tx('Country')] || 'Australia',
      address: r[tx('Address')] || r[tH.indexOf('Billing Address: Address')] || '',
      endDate: isoDate(r[tx('End Date')]), mrr: r[tx('MRR')] || '', vat: r[tx('VAT')] || '',
      taxRate: r[tx('Tax Rate')] || '', paymentMethod: r[tx('Payment Method')] || '', billingPeriodStart: r[tx('Billing Date')] || '1',
      poMembership: r[tH.indexOf('PO Number (For Memberships)')] || '', poOneOff: r[tH.indexOf('PO Number (For One-Off Fees)')] || '',
      contactName: contacts[0] || '', contactPersons: contacts, billingPersons: billers,
      source: 'officernd-import', createdAt: isoDate(r[tx('Start Date')]) || new Date().toISOString().split('T')[0],
    },
  })
}

// ── Members ──
const members = []
for (const r of memRows) {
  const name = (r[mx('Name')] || '').trim(); if (!name) continue
  const coName = (r[mx('Company')] || '').trim()
  let companyId = nameToId.get(norm(coName)) || ''
  if (coName && !companyId) { // create stub company for unmatched
    const id = `tc${ci++}`; nameToId.set(norm(coName), id); companyId = id
    companies.push({ id, data: { id, businessName: coName, status: 'Active', source: 'officernd-import', createdAt: new Date().toISOString().split('T')[0] } })
  }
  const id = r[mx('ID')] ? `m_${r[mx('ID')]}` : `m${Date.now()}${members.length}`
  const access = (r[mx('Access')] || '').trim()
  members.push({
    id, data: {
      id, name, companyId, email: r[mx('Email Address')] || '', phone: r[mx('Phone Number')] || '', bio: r[mx('Bio')] || '',
      membershipType: r[mx('Membership')] || '', startDate: isoDate(r[mx('Start Date')]), endDate: isoDate(r[mx('End Date')]),
      status: memberStatus(r[mx('Status')]), address: r[mx('Address')] || '', city: r[mx('City')] || '', state: r[mx('State')] || '',
      zip: r[mx('Zip')] || '', country: r[mx('Country')] || 'Australia',
      billBusinessName: r[mx('Business Name')] || '', abn: r[mx('Reg Number')] || '', vat: r[mx('VAT')] || '',
      currency: r[mx('Currency')] || 'AUD', taxRate: r[mx('Tax Rate')] || '', paymentMethod: r[mx('Payment Method')] || '',
      billingPeriodStart: r[mx('Billing Date')] || '1', poMembership: r[mH.indexOf('PO Number (For Memberships)')] || '', poOneOff: r[mH.indexOf('PO Number (For One-Off Fees)')] || '',
      documents: r[mx('Documents')] || '', lastLogin: r[mx('Last Login')] || '', access,
      contactPerson: contactNames.has(norm(name)), billingPerson: billingNames.has(norm(name)), portalAccess: !!access, credits: 0,
      source: 'officernd-import', createdAt: isoDate(r[mx('Start Date')]) || new Date().toISOString().split('T')[0],
    },
  })
}

console.log(`Parsed ${companies.length} companies, ${members.length} members.`)

async function bulkUpsert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const res = await fetch(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) { console.error(`${table} insert failed`, res.status, (await res.text()).slice(0, 300)); process.exit(1) }
    console.log(`  ${table}: upserted ${Math.min(i + 500, rows.length)}/${rows.length}`)
  }
}

await bulkUpsert('tenants', companies)
await bulkUpsert('members', members)
console.log('Import complete.')
