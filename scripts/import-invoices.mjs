// Import the OfficeRND invoices export into the invoices table, matched to
// clients (tenants by ContactName / email / ABN).
//   node scripts/import-invoices.mjs "<invoices.csv>"            # dry run (report)
//   node scripts/import-invoices.mjs "<invoices.csv>" --commit   # write invoices (+ tenant stubs)
import fs from 'fs'

const COMMIT = process.argv.includes('--commit')
function parseEnv(p) { const o = {}; if (!fs.existsSync(p)) return o; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue; const i = t.indexOf('='); o[t.slice(0, i).trim()] = t.slice(i + 1).trim() } return o }
function parseCSV(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c } else { if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = '' } else if (c === '\r') {} else f += c } } if (f.length || row.length) { row.push(f); rows.push(row) } return rows }
const norm = (s) => (s || '').toLowerCase().replace(/\bpty\b|\bltd\b|\bp\/l\b|[.,&]/g, '').replace(/\s+/g, ' ').trim()
const num = (s) => { const n = Number(String(s || '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }

const env = parseEnv('.env.local'); const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const HDR = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function fetchAll(table) { const res = await fetch(`${URL}/rest/v1/${table}?select=id,data&limit=10000`, { headers: HDR }); return res.ok ? res.json() : [] }
async function bulkUpsert(table, rows) { for (let i = 0; i < rows.length; i += 500) { const res = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) }); if (!res.ok) { console.error('upsert fail', res.status, await res.text()); process.exit(1) } } }

const statusMap = (s) => { const x = (s || '').toLowerCase(); return ({ paid: 'paid', overdue: 'overdue', pending: 'pending', partially_paid: 'pending', voided: 'voided', failed: 'pending', refunded: 'voided' })[x] || 'pending' }

const tenants = await fetchAll('tenants')
const byName = new Map(tenants.map((t) => [norm(t.data.businessName), t.id]))
const byEmail = new Map(tenants.filter((t) => t.data.email).map((t) => [t.data.email.toLowerCase().trim(), t.id]))
const byAbn = new Map(tenants.filter((t) => t.data.abn).map((t) => [String(t.data.abn).replace(/\s/g, ''), t.id]))
function matchTenant(name, email, abn) {
  return byName.get(norm(name)) || (email && byEmail.get(email.toLowerCase().trim())) || (abn && byAbn.get(String(abn).replace(/\s/g, ''))) || ''
}

const rows = parseCSV(fs.readFileSync(process.argv[2], 'utf8')); const H = rows.shift(); const ix = (n) => H.indexOf(n)
const data = rows.filter((r) => r[ix('InvoiceNumber')])

// group line items by invoice
const groups = new Map()
for (const r of data) { const k = r[ix('InvoiceNumber')]; (groups.get(k) || groups.set(k, []).get(k)).push(r) }

const invoices = []; const unmatched = new Map(); let matched = 0; let totalMismatch = 0
const newTenants = new Map()
for (const [number, lines] of groups) {
  const r0 = lines[0]
  const contact = (r0[ix('ContactName')] || '').trim()
  const email = r0[ix('EmailAddress')] || ''; const abn = r0[ix('RegistrationNumber')] || ''
  let tenantId = matchTenant(contact, email, abn)
  if (tenantId) matched++
  else if (contact) { unmatched.set(contact, (unmatched.get(contact) || 0) + 1); if (COMMIT) { const id = newTenants.get(norm(contact)) || `tc_inv_${newTenants.size}`; newTenants.set(norm(contact), id); tenantId = id } }

  const amount = num(r0[ix('Amount')]); const lineSum = lines.reduce((s, l) => s + num(l[ix('LineTotal')]), 0)
  if (Math.abs(amount - lineSum) > 0.05) totalMismatch++
  const isCredit = (r0[ix('DocumentType')] || '') === 'creditNote'

  invoices.push({ id: number, data: {
    id: number, number, tenantId, contactName: contact, companyName: contact,
    status: statusMap(r0[ix('Status')]), sentStatus: 'sent', source: 'officernd-import',
    issueDate: r0[ix('InvoiceDate')] || '', dueDate: r0[ix('DueDate')] || '',
    periodStart: r0[ix('StartDate')] || '', periodEnd: r0[ix('EndDate')] || '',
    reference: r0[ix('Reference')] || '', paymentMethod: r0[ix('PaymentMethod')] || '',
    discountPct: 0, vatEnabled: false, xeroSync: false, currency: r0[ix('Currency')] || 'AUD',
    invoiceType: isCredit ? 'creditNote' : undefined,
    lineItems: lines.map((l, i) => ({ id: `${number}_li${i}`, description: l[ix('Description')] || '', revenueAccount: l[ix('AccountName')] || 'Membership Fees', unitPrice: num(l[ix('LineTotal')]), qty: 1, discountPct: 0 })),
    payments: num(r0[ix('PaidAmount')]) > 0 ? [{ id: `${number}_p0`, date: r0[ix('InvoiceDate')] || '', amount: num(r0[ix('PaidAmount')]), method: r0[ix('PaymentMethod')] || 'Bank Transfer', note: 'Imported from OfficeRND' }] : [],
    comments: [], creditNoteForId: null, createdAt: r0[ix('InvoiceCreationDate')] || r0[ix('InvoiceDate')] || '', isProrated: false,
  } })
}

console.log(`Invoices: ${invoices.length} · matched to existing tenant: ${matched} · unmatched contacts: ${unmatched.size}`)
console.log(`Line-total vs Amount mismatches (>$0.05): ${totalMismatch}`)
const st = invoices.reduce((a, i) => { a[i.data.status] = (a[i.data.status] || 0) + 1; return a }, {})
console.log('Statuses:', JSON.stringify(st))
if (unmatched.size) { console.log(`\nUnmatched contacts (${unmatched.size}) — would get a tenant stub on commit:`); [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`)) }
console.log(`\nMode: ${COMMIT ? 'COMMIT' : 'DRY RUN'}`)

if (COMMIT) {
  if (newTenants.size) {
    const stubs = [...newTenants.entries()].map(([nm, id]) => ({ id, data: { id, businessName: [...unmatched.keys()].find((c) => norm(c) === nm) || nm, status: 'Active', source: 'invoice-import', createdAt: new Date().toISOString().split('T')[0] } }))
    await bulkUpsert('tenants', stubs)
    console.log(`Created ${stubs.length} tenant stubs.`)
  }
  await bulkUpsert('invoices', invoices)
  console.log(`Wrote ${invoices.length} invoices.`)
}
