// Read-only rundown of every ACTIVE lease for cross-checking, pulling:
//   tenant · contract # · term (start → end) · current monthly rent ·
//   suite/unit(s) · membership/resource · rent-free months · step pricing ·
//   prepaid status · total contract value.
//
// Writes nothing to Supabase. Output: console table + lease-rundown.csv
//
// Usage:  node scripts/lease-rundown.mjs
import { readFileSync, writeFileSync } from 'fs'
import { buildPaymentSchedule } from '../src/lib/paymentSchedule.js'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim()
const URL_ = get('SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
// PostgREST caps at 1000 rows — page through.
async function sbGetAll(table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=data&order=id.asc`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const batch = await r.json()
    out.push(...batch.map((x) => x.data))
    if (batch.length < 1000) break
  }
  return out
}

const [tenants, leases, spaces, members] = await Promise.all([
  sbGetAll('tenants'), sbGetAll('leases'), sbGetAll('spaces'), sbGetAll('members'),
])

const tById = Object.fromEntries(tenants.map((t) => [t.id, t]))
const sById = Object.fromEntries(spaces.map((s) => [s.id, s]))
const membersByCo = {}
for (const m of members) (membersByCo[m.companyId] ??= []).push(m)

const aud = (n) => '$' + Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })
const active = leases.filter((l) => l.status === 'active')

const today = new Date()
const rows = []
for (const l of active) {
  const t = tById[l.tenantId]
  const items = l.items?.length ? l.items : [{ spaceId: l.spaceId }]
  const units = items.map((it) => sById[it.spaceId]?.unitNumber).filter(Boolean).join(', ')
    || l.resource || '(membership / no suite)'
  const membership = [...new Set((membersByCo[l.tenantId] || []).map((m) => m.membershipType).filter(Boolean))].join(', ')

  const sched = buildPaymentSchedule(l, null)
  const curKey = today.toISOString().slice(0, 7)
  const curRow = sched?.rows.find((r) => r.key === curKey)
  const curMonthly = curRow ? curRow.total : (l.monthlyRent ?? 0)
  const freeRows = sched?.rows.filter((r) => r.free || r.total === 0) ?? []
  const freeMonths = freeRows.map((r) => r.label).join(', ')

  // Distinct step prices across the term → "fee structure"
  const steps = []
  for (const it of (l.items?.length ? l.items : [])) {
    for (const st of it.steps ?? []) {
      steps.push(`${sById[it.spaceId]?.unitNumber || it.spaceId || '?'}: ${aud(st.listPrice)}×${st.qty ?? 1} (${st.startDate}→${st.endDate})`)
    }
  }

  rows.push({
    tenant: t?.businessName ?? l.tenantId,
    contract: l.contractNumber ?? l.id,
    start: l.startDate, end: l.endDate,
    units, membership,
    curMonthly,
    discount: l.discount ? `${l.discount}%` : '',
    rentFreeCount: (l.rentFreeMonths ?? 0) || freeRows.length,
    freeMonths,
    prepaid: l.paidInFull ? `prepaid→${l.paidUntil ?? '?'}` : '',
    notice: l.noticeGiven ? `notice→vacate ${l.vacateDate}` : (l.terminationScheduledFor ? `term→${l.terminationScheduledFor}` : ''),
    totalContract: sched?.totals.total ?? '',
    steps: steps.join(' | '),
  })
}

rows.sort((a, b) => String(a.tenant).localeCompare(String(b.tenant)))

console.log(`\n═══ ACTIVE LEASES RUNDOWN — ${active.length} active (of ${leases.length} total) ═══\n`)
for (const r of rows) {
  console.log(`■ ${r.tenant}   [${r.contract}]`)
  console.log(`    Term:       ${r.start || '?'}  →  ${r.end || '?'}${r.notice ? '   ⚠ ' + r.notice : ''}`)
  console.log(`    Suite:      ${r.units}`)
  console.log(`    Membership: ${r.membership || '—'}`)
  console.log(`    Monthly:    ${aud(r.curMonthly)} (ex-GST, this month)${r.discount ? '   discount ' + r.discount : ''}`)
  if (r.rentFreeCount) console.log(`    Rent-free:  ${r.rentFreeCount} month(s)${r.freeMonths ? ' → ' + r.freeMonths : ''}`)
  if (r.prepaid) console.log(`    Prepaid:    ${r.prepaid}`)
  if (r.steps) console.log(`    Steps:      ${r.steps}`)
  console.log(`    Term total: ${aud(r.totalContract)} (ex-GST over full term)`)
  console.log('')
}

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = [
  'tenant,contract,start,end,suite,membership,monthly_ex_gst,discount,rent_free_months,rent_free_which,prepaid,notice,term_total_ex_gst,step_pricing',
  ...rows.map((r) => [r.tenant, r.contract, r.start, r.end, r.units, r.membership, r.curMonthly, r.discount, r.rentFreeCount, r.freeMonths, r.prepaid, r.notice, r.totalContract, r.steps].map(esc).join(',')),
].join('\n')
writeFileSync(new URL('../lease-rundown.csv', import.meta.url), csv)
console.log(`CSV written: lease-rundown.csv  (${rows.length} rows)\n`)
