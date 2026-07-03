// 3 Jul 2026 — aligns the platform's July billing to Xero (source of truth).
// Everything below mirrors Xero invoice line items exactly (INV numbers cited).
// Writes AUDIT-xero-align2-backup.json (before-states + created ids) FIRST.
// Idempotent: skips creates whose id already exists / voids already voided.
//
// Run: node scripts/align-july-to-xero.mjs
import { readFileSync, writeFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/^SUPABASE_URL=(.+)$/m)[1].trim()
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)[1].trim()
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }

async function getAll(table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/${table}?select=data&order=id.asc`, { headers: { ...h, Range: `${from}-${from + 999}` } })
    const batch = await r.json()
    out.push(...batch.map((x) => x.data))
    if (batch.length < 1000) break
  }
  return out
}
const put = (t, id, data) => fetch(`${url}/rest/v1/${t}`, { method: 'POST', headers: h, body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }) })

const [invoices, tenants, leases, spaces] = await Promise.all([getAll('invoices'), getAll('tenants'), getAll('leases'), getAll('spaces')])
const today = new Date().toISOString().split('T')[0]
const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
const backup = { at: new Date().toISOString(), invoiceBefore: [], created: { tenants: [], leases: [], spaces: [], invoices: [] } }
const log = []

const norm = (s) => String(s ?? '').toLowerCase().replace(/p\/l/g, '').replace(/\b(pty|ltd|limited)\b/g, '').replace(/[^a-z0-9]/g, '')
const tenantByName = (name) => tenants.find((t) => norm(t.businessName) === norm(name)) ?? tenants.find((t) => norm(t.businessName).includes(norm(name)))
const liveJulyInvoices = (tenantId) => invoices.filter((i) => i.tenantId === tenantId && i.status !== 'voided' && (i.periodStart ?? '').startsWith('2026-07'))

let nextNum = invoices.map((i) => parseInt((i.number ?? '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n)).reduce((m, n) => Math.max(m, n), 0) + 1

function mkInvoice({ tenantId, leaseId, lineItems, note }) {
  return {
    id: `inv_xa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    number: `INV-${String(nextNum++).padStart(4, '0')}`,
    tenantId, leaseId: leaseId ?? null,
    status: 'pending', sentStatus: 'not_sent', source: 'bill-run',
    issueDate: today, dueDate: due, periodStart: '2026-07-01', periodEnd: '2026-07-31',
    reference: '', paymentMethod: '', discountPct: 0,
    vatEnabled: true, xeroSync: false, isProrated: false,
    lineItems,
    payments: [], comments: [{ id: `cmt${Date.now()}${Math.random().toString(36).slice(2, 4)}`, text: note, createdAt: today }],
    creditNoteForId: null, createdAt: today,
  }
}
const li = (desc, amount, account = 'Membership Fees') => ({
  id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
  description: desc, revenueAccount: account, unitPrice: amount, qty: 1, discountPct: 0,
})

async function voidInvoice(inv, why) {
  backup.invoiceBefore.push(JSON.parse(JSON.stringify(inv)))
  inv.status = 'voided'
  inv.comments = [...(inv.comments ?? []), { id: `cmt${Date.now()}`, text: `Voided 03/07/2026 — ${why}`, createdAt: today }]
  await put('invoices', inv.id, inv)
  log.push(`VOIDED ${inv.number} — ${why}`)
}

async function addLines(companyName, extraLines, why) {
  const t = tenantByName(companyName)
  if (!t) { log.push(`SKIP extras ${companyName}: tenant not found`); return }
  const target = liveJulyInvoices(t.id).sort((a, b) => (b.lineItems?.[0]?.unitPrice ?? 0) - (a.lineItems?.[0]?.unitPrice ?? 0))[0]
  if (!target) { log.push(`SKIP extras ${companyName}: no live July invoice`); return }
  if ((target.lineItems ?? []).some((l) => l.xeroAlign)) { log.push(`SKIP extras ${companyName}: already aligned`); return }
  backup.invoiceBefore.push(JSON.parse(JSON.stringify(target)))
  target.lineItems = [...target.lineItems, ...extraLines.map((l) => ({ ...l, xeroAlign: true }))]
  await put('invoices', target.id, target)
  const add = extraLines.reduce((s, l) => s + l.unitPrice, 0)
  log.push(`EXTRAS ${target.number} ${companyName}: +$${add.toFixed(2)} (${why})`)
}

async function mkTenant(name, extras = {}) {
  const existing = tenantByName(name)
  if (existing) return existing
  const t = { id: `tc_xa_${norm(name).slice(0, 12)}`, businessName: name, contactName: '', email: '', phone: '', abn: '', industry: '', country: 'Australia', createdAt: today, ...extras }
  await put('tenants', t.id, t)
  tenants.push(t)
  backup.created.tenants.push(t.id)
  log.push(`TENANT created: ${name}`)
  return t
}

async function mkLease(tenant, { contract, rent, spaceLabel, spaceType, floor }) {
  const existing = leases.find((l) => l.contractNumber === contract && l.status === 'active')
  if (existing) return existing
  const spaceId = `hx_xa_${norm(spaceLabel).slice(0, 16)}`
  if (!spaces.find((s) => s.id === spaceId)) {
    const sp = { id: spaceId, unitNumber: spaceLabel, type: spaceType, size: '', monthlyRate: rent, status: 'occupied', location: 'huntingdale', floor }
    await put('spaces', spaceId, sp)
    spaces.push(sp)
    backup.created.spaces.push(spaceId)
  }
  const lease = {
    id: `l_xa_${norm(contract)}`, tenantId: tenant.id, spaceId, contractNumber: contract,
    startDate: '2026-07-01', endDate: '2027-06-30', monthlyRent: rent, bondAmount: 0,
    status: 'active', notes: 'Created 03/07/2026 — Xero alignment (OfficeRND migration)', createdAt: today,
  }
  await put('leases', lease.id, lease)
  leases.push(lease)
  backup.created.leases.push(lease.id)
  log.push(`LEASE created: ${contract} ${tenant.businessName} $${rent}/mo (${spaceLabel})`)
  return lease
}

async function billIfMissing(tenant, lease, desc, amount, account = 'Membership Fees') {
  const exists = invoices.some((i) => i.leaseId === lease.id && i.status !== 'voided' && (i.periodStart ?? '').startsWith('2026-07'))
  if (exists) { log.push(`SKIP invoice ${tenant.businessName} (${lease.contractNumber}): July exists`); return }
  const inv = mkInvoice({
    tenantId: tenant.id, leaseId: lease.id,
    lineItems: [li(desc, amount, account)],
    note: 'Created 03/07/2026 — Xero alignment (source of truth)',
  })
  await put('invoices', inv.id, inv)
  invoices.push(inv)
  backup.created.invoices.push(inv.id)
  log.push(`INVOICE ${inv.number} ${tenant.businessName} $${amount.toFixed(2)} — ${desc.slice(0, 50)}`)
}

// ═══ 1. Void the 3 test invoices ═══
for (const name of ['Eric Kuang', 'Eric', 'Hexa Space']) {
  const t = tenants.find((x) => (x.businessName ?? '').trim().toLowerCase() === name.toLowerCase())
  if (!t) { log.push(`SKIP test void: tenant "${name}" not found`); continue }
  for (const inv of liveJulyInvoices(t.id)) await voidInvoice(inv, 'test invoice (user-confirmed test data)')
}

// ═══ 2. Top bridge: Xero INV-3025 = parking only $150; office line gone ═══
{
  const t = tenantByName('Top bridge group')
  if (t) {
    for (const inv of liveJulyInvoices(t.id)) await voidInvoice(inv, 'Xero align: Top bridge July is parking-only $150 (Xero INV-3025)')
    const lease = await mkLease(t, { contract: 'CON-TOPBRIDGE-PARK', rent: 150, spaceLabel: 'Level 2 Parking (Top bridge)', spaceType: 'parking', floor: 'l2' })
    await billIfMissing(t, lease, 'Level 2 Parking · Jul 1 – Jul 31, 2026 ($250 less $100 discount)', 150, 'Parking Fees')
  } else log.push('SKIP Top bridge: tenant not found')
}

// ═══ 2b. You Hao Suite 12 → belongs to Top 1 Care ═══
// Signed contracts prove it: CON-223 = Top 1 Care, Suite 12, $1,700 (their
// PDF), CON-224 = You Hao, Suite 11, $1,700. The migration attached BOTH to
// You Hao. Cancel You Hao's CON-223 lease + void its July invoice; section 4
// below creates Top 1 Care with its own Suite 12 lease + invoice (Xero INV-3055).
{
  const t = tenantByName('You Hao')
  const wrongLease = leases.find((l) => l.tenantId === t?.id && l.status === 'active' && l.contractNumber === 'CON-223')
  if (wrongLease) {
    for (const inv of liveJulyInvoices(t.id).filter((i) => i.leaseId === wrongLease.id)) {
      await voidInvoice(inv, 'Suite 12 belongs to Top 1 Care (contract CON-223) — was wrongly attached to You Hao in migration')
    }
    backup.created.leases.push({ cancelled: wrongLease.id, before: JSON.parse(JSON.stringify(wrongLease)) })
    wrongLease.status = 'cancelled'
    wrongLease.notes = `${wrongLease.notes ?? ''} [Cancelled 03/07/2026 — CON-223/Suite 12 belongs to Top 1 Care per signed contract]`.trim()
    await put('leases', wrongLease.id, wrongLease)
    log.push(`CANCELLED You Hao lease CON-223 (Suite 12 → Top 1 Care)`)
  } else log.push('SKIP You Hao CON-223: not found on You Hao (already fixed?)')
}

// ═══ 3. Missing parking leases + July invoices (net $ from Xero) ═══
const PARKING = [
  ['tantu Australia', 'Level 2 Parking', 150, 'l2'],                    // INV-3063
  ['Grand Galaxy Bus and Coaster', 'Level 2 Parking - L223', 150, 'l2'], // INV-3062
  ['Digitec It', 'Level 2 Parking (Digitec)', 150, 'l2'],               // INV-3031
  ['Global link logistics', 'Level 3 Parking', 150, 'l2'],              // INV-3026
  ['Canwealth VIC', 'Level 2 Parking x2', 300, 'l2'],                   // INV-3014
]
for (const [name, label, net, floor] of PARKING) {
  const t = tenantByName(name)
  if (!t) { log.push(`SKIP parking ${name}: tenant not found`); continue }
  const baseLease = leases.find((l) => l.tenantId === t.id && l.status === 'active')
  const contract = `${baseLease?.contractNumber && baseLease.contractNumber !== 'MTM' ? baseLease.contractNumber : 'CON-' + norm(name).slice(0, 8).toUpperCase()}-PARK`
  const lease = await mkLease(t, { contract, rent: net, spaceLabel: label, spaceType: 'parking', floor })
  await billIfMissing(t, lease, `${label} · Jul 1 – Jul 31, 2026`, net, 'Parking Fees')
}

// ═══ 4. Xero-only members → tenants + leases + July invoices (net of discounts) ═══
const NEW_MEMBERS = [
  // [name, contract, rent(net), space label, type, floor, xero ref]
  ['golden united investment pty ltd', 'CON-GOLDENUNITED', 2800, 'Office 15 (Level 4)', 'office', 'l4'],   // INV-3002
  ['Wukong Media', 'CON-WUKONG', 1500, 'Office 6 (Level 4)', 'office', 'l4'],                              // INV-3009 ($3600 - $2100 disc)
  ['HORUS ENERGY', 'CON-HORUS', 150, 'Virtual Office VO6', 'virtual', 'l4'],                               // INV-3013
  ['Top 1 Care Pty Ltd', 'CON-TOP1CARE', 1700, 'L2 Suite 12', 'office', 'l2'],                             // INV-3055 ($3500 - $1800 disc)
  ['Stella Li', 'CON-STELLALI', 350, 'Flexible Access', 'desk', 'l4'],                                     // INV-3087
]
for (const [name, contract, rent, label, type, floor] of NEW_MEMBERS) {
  const t = await mkTenant(name)
  const lease = await mkLease(t, { contract, rent, spaceLabel: label, spaceType: type, floor })
  await billIfMissing(t, lease, `${label} · Jul 1 – Jul 31, 2026`, rent)
}
// golden united also has Level 4 Parking L412 $220 (INV-3002)
{
  const t = tenantByName('golden united')
  if (t) {
    const lease = await mkLease(t, { contract: 'CON-GOLDENUNITED-PARK', rent: 220, spaceLabel: 'Level 4 Parking L412', spaceType: 'parking', floor: 'l4' })
    await billIfMissing(t, lease, 'Level 4 Parking - L412 · Jul 1 – Jul 31, 2026', 220, 'Parking Fees')
  }
}

// ═══ 5. One-off casual charges (no lease) — Xero INV-3007/3081/3088 ═══
const CASUALS = [
  ['VERITAS AU PTY LTD', [li('Meeting Room - 8 pax, 2 x $60.00/hr — Jun 26, 2026', 240, 'Meeting Room & Booking Fees'), li('2% surcharge', 5.28, 'Parking Fees')]],
  ['Ling Ling', [li('Cancelled Meeting Room - 8 pax, 3 x $60.00/hr — Jun 18, 2026', 180, 'Meeting Room & Booking Fees')]],
  ['Murphy Kandege', [li('Meeting Room - 8 pax, 2 x $60.00/hr — Jun 5, 2026', 120, 'Meeting Room & Booking Fees'), li('2% surcharge', 2.64, 'Parking Fees')]],
]
for (const [name, lines] of CASUALS) {
  const t = await mkTenant(name)
  if (liveJulyInvoices(t.id).length) { log.push(`SKIP casual ${name}: July invoice exists`); continue }
  const inv = mkInvoice({ tenantId: t.id, leaseId: null, lineItems: lines, note: 'Created 03/07/2026 — Xero alignment (casual booking billed by OfficeRND)' })
  await put('invoices', inv.id, inv)
  invoices.push(inv)
  backup.created.invoices.push(inv.id)
  log.push(`INVOICE ${inv.number} ${name} $${lines.reduce((s, l) => s + l.unitPrice, 0).toFixed(2)} (casual)`)
}

// ═══ 6. Add Xero extras to existing July invoices ═══
await addLines('JOYOWO GEO', [li('Meeting Room - 8 pax, 3 x $42.00/hr (30% disc) — Jun 24, 2026', 126, 'Meeting Room & Booking Fees')], 'Xero INV-3038')
await addLines('Mynt.Media', [li('Photography Studio, 1 x $70.00/hr (30% disc) — Jun 10, 2026', 70, 'Meeting Room & Booking Fees'), li('2% surcharge', 4.84, 'Parking Fees')], 'Xero INV-3018')
await addLines('Verge Legal', [li('Meeting Room - 10 pax, 1 x $56.00/hr (30% disc) — Jun 5, 2026', 56, 'Meeting Room & Booking Fees')], 'Xero INV-3005')
await addLines('Simple stacks accounting service', [li('PaperCut printing fees — June 2026', 262.8, 'Parking Fees')], 'Xero INV-3078')
await addLines('M&Y OmniReach', [li('PaperCut printing fees — June 2026', 24, 'Parking Fees')], 'Xero INV-3061')
await addLines('Azlan Lawyers', [li('2% surcharge', 11, 'Parking Fees')], 'Xero INV-3077')
await addLines('AC Bridge International Group', [li('2% surcharge', 3.3, 'Parking Fees')], 'Xero INV-3022')
await addLines('Hexa Pacific', [li('PaperCut printing fees — June 2026', 166.2, 'Parking Fees')], 'Xero INV-3003')

writeFileSync('C:/Users/EricKuang/Downloads/invocies/AUDIT-xero-align2-backup.json', JSON.stringify(backup, null, 2))
console.log(log.join('\n'))
console.log(`\nBackup: Downloads/invocies/AUDIT-xero-align2-backup.json`)
console.log('NOTE: WEHOME24 untouched (no July invoice in Xero or platform) — confirm whether their lease should bill from August.')
