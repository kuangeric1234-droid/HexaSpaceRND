// 7 Jul 2026 — removes the duplicate July invoices created by overlapping
// reconciliation passes. For each (tenant, amount) group of live July invoices,
// KEEPS the oldest (the revived June-30 original whose number matches Xero) and
// DELETES the later copies (inv_auto_* July-1 run, inv_xa_* alignment,
// inv_recon_* audit-reconcile). You Hao special case: keep Suite 11, drop the
// Suite 12 twin (Suite 12 belongs to Top 1 Care). Also recreates the three
// invoices lost in today's shuffle: Top 1 Care $1,700, VERITAS $245.28,
// Ling Ling $180 (all AUTHORISED in Xero).
// Full-row backup first. Run: node scripts/dedup-july.mjs [--apply]
import { readFileSync, writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/^SUPABASE_URL=(.+)$/m)[1].trim()
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)[1].trim()
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }

async function getAll(t) {
  const out = []
  for (let f = 0; ; f += 1000) {
    const r = await fetch(`${url}/rest/v1/${t}?select=data&order=id.asc`, { headers: { ...h, Range: `${f}-${f + 999}` } }).then((x) => x.json())
    out.push(...r.map((x) => x.data))
    if (r.length < 1000) break
  }
  return out
}
const [invoices, tenants] = await Promise.all([getAll('invoices'), getAll('tenants')])
const tot = (i) => Math.round((i.lineItems ?? []).reduce((s, l) => s + Number(l.unitPrice ?? 0) * Number(l.qty ?? 1) * (1 - Number(l.discountPct ?? 0) / 100), 0) * 100) / 100
const tname = (id) => tenants.find((x) => x.id === id)?.businessName ?? id
const norm = (s) => String(s ?? '').toLowerCase().replace(/\b(pty|ltd|limited)\b/g, '').replace(/[^a-z0-9]/g, '')

const live = invoices.filter((i) => i.status !== 'voided' && ((i.periodStart ?? i.issueDate ?? '') + '').startsWith('2026-07'))
const byKey = {}
for (const i of live) (byKey[`${i.tenantId}|${tot(i)}`] ??= []).push(i)

const toDelete = []
for (const group of Object.values(byKey)) {
  if (group.length < 2 || tot(group[0]) === 0) continue
  let keep
  const s11 = group.find((i) => (i.lineItems ?? []).some((l) => /suite\s*11/i.test(l.description ?? '')))
  if (s11) keep = s11 // You Hao: Suite 11 stays, Suite 12 twin goes
  else keep = [...group].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))[0]
  for (const i of group) if (i !== keep) toDelete.push(i)
}

console.log(`Duplicates to delete: ${toDelete.length}  ($${toDelete.reduce((s, i) => s + tot(i), 0).toFixed(2)} excess)`)
toDelete.forEach((i) => console.log(`  DEL ${i.number}  $${tot(i).toFixed(2)}  ${tname(i.tenantId)}  (${i.id.slice(0, 30)})`))

// Recreate the three lost to today's shuffle — only if genuinely absent.
const RESTORE = [
  ['Top 1 Care', 'CON-TOP1CARE', [{ d: 'L2 Suite 12 · Jul 1 – Jul 31, 2026', p: 1700, a: 'Membership Fees' }]],
  ['VERITAS AU', null, [{ d: 'Meeting Room - 8 pax, 2 x $60.00/hr — Jun 26, 2026', p: 240, a: 'Meeting Room & Booking Fees' }, { d: '2% surcharge', p: 5.28, a: 'Parking Fees' }]],
  ['Ling Ling', null, [{ d: 'Cancelled Meeting Room - 8 pax, 3 x $60.00/hr — Jun 18, 2026', p: 180, a: 'Meeting Room & Booking Fees' }]],
]
let nextNum = invoices.map((i) => parseInt((i.number ?? '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n)).reduce((m, n) => Math.max(m, n), 0) + 1
const creates = []
for (const [name, leaseId, lines] of RESTORE) {
  const t = tenants.find((x) => norm(x.businessName).includes(norm(name)))
  if (!t) { console.log(`RESTORE skip: tenant ${name} not found`); continue }
  const has = live.some((i) => i.tenantId === t.id && !toDelete.includes(i) && Math.abs(tot(i) - lines.reduce((s, l) => s + l.p, 0)) < 0.05)
  if (has) { console.log(`RESTORE skip: ${name} already has the invoice`); continue }
  creates.push({
    id: `inv_dd_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    number: `INV-${String(nextNum++).padStart(4, '0')}`,
    tenantId: t.id, leaseId,
    status: 'pending', sentStatus: 'not_sent', source: 'bill-run',
    issueDate: '2026-07-07', dueDate: '2026-07-21', periodStart: '2026-07-01', periodEnd: '2026-07-31',
    reference: '', paymentMethod: '', discountPct: 0, vatEnabled: true, xeroSync: false, isProrated: false,
    lineItems: lines.map((l, ix) => ({ id: `li_dd_${Date.now()}_${ix}`, description: l.d, revenueAccount: l.a, unitPrice: l.p, qty: 1, discountPct: 0 })),
    payments: [], comments: [{ id: `cmt${Date.now()}`, text: 'Recreated 07/07/2026 — lost in duplicate-cleanup shuffle; matches Xero', createdAt: '2026-07-07' }],
    creditNoteForId: null, createdAt: '2026-07-07',
  })
}
creates.forEach((c) => console.log(`  ADD ${c.number}  $${tot(c).toFixed(2)}  ${tname(c.tenantId)}`))

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0) }

writeFileSync('C:/Users/EricKuang/Downloads/invocies/AUDIT-dedup-july-backup.json', JSON.stringify(toDelete, null, 2))
for (let i = 0; i < toDelete.length; i += 50) {
  const ids = toDelete.slice(i, i + 50).map((x) => encodeURIComponent(x.id)).join(',')
  const r = await fetch(`${url}/rest/v1/invoices?id=in.(${ids})`, { method: 'DELETE', headers: h })
  if (!r.ok) { console.error('DELETE failed:', r.status, await r.text()); process.exit(1) }
}
for (const c of creates) {
  await fetch(`${url}/rest/v1/invoices`, { method: 'POST', headers: h, body: JSON.stringify({ id: c.id, data: c, updated_at: new Date().toISOString() }) })
}
console.log(`\nDeleted ${toDelete.length} duplicates, recreated ${creates.length}. Backup: AUDIT-dedup-july-backup.json`)
