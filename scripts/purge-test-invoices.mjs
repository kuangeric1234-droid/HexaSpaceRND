// Permanently deletes VOIDED invoices numbered after INV-3090 — the platform
// test runs / incorrect bill-run output, per Eric 7 Jul 2026 ("the invoices
// after 3090"). The genuine July run (Xero-matched) is numbered ≤ INV-3090;
// voided invoices in that range and ALL non-voided invoices are untouched.
//
//   node scripts/purge-test-invoices.mjs           → dry run (counts + list)
//   node scripts/purge-test-invoices.mjs --apply   → full-row backup, then DELETE
import { readFileSync, writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/^SUPABASE_URL=(.+)$/m)[1].trim()
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)[1].trim()
const h = { apikey: key, Authorization: `Bearer ${key}` }

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

const [invoices, tenants] = await Promise.all([getAll('invoices'), getAll('tenants')])
const num = (i) => parseInt(String(i.number ?? '').replace(/\D/g, ''), 10) || 0
const total = (i) => (i.lineItems ?? []).reduce((s, li) => s + Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100), 0)
const tname = (i) => tenants.find((x) => x.id === i.tenantId)?.businessName ?? i.tenantId ?? 'no tenant'

const toDelete = invoices.filter((i) => i.status === 'voided' && num(i) > 3090)
const keptVoided = invoices.filter((i) => i.status === 'voided' && num(i) <= 3090)

console.log(`Voided > INV-3090 (DELETE): ${toDelete.length}  ($${toDelete.reduce((s, i) => s + total(i), 0).toFixed(2)})`)
console.log(`Voided ≤ INV-3090 (kept):   ${keptVoided.length}`)
console.log(`Non-voided (untouched):     ${invoices.length - toDelete.length - keptVoided.length}`)

if (!APPLY) {
  console.log('\nWould delete:')
  toDelete.sort((a, b) => num(a) - num(b)).forEach((i) => console.log(`  ${i.number}  ${(i.periodStart ?? i.issueDate ?? '').slice(0, 10)}  $${total(i).toFixed(2).padStart(10)}  ${tname(i)}`))
  console.log('\nDRY RUN — nothing deleted. Re-run with --apply.')
  process.exit(0)
}

// Full-row backup BEFORE deleting — restorable via upsert.
writeFileSync('C:/Users/EricKuang/Downloads/invocies/AUDIT-purge-test-invoices-backup.json', JSON.stringify(toDelete, null, 2))
let deleted = 0
for (let i = 0; i < toDelete.length; i += 50) {
  const ids = toDelete.slice(i, i + 50).map((x) => encodeURIComponent(x.id)).join(',')
  const r = await fetch(`${url}/rest/v1/invoices?id=in.(${ids})`, { method: 'DELETE', headers: h })
  if (!r.ok) { console.error('DELETE failed:', r.status, await r.text()); process.exit(1) }
  deleted += Math.min(50, toDelete.length - i)
}
console.log(`\nDeleted ${deleted} voided test invoices. Full-row backup: Downloads/invocies/AUDIT-purge-test-invoices-backup.json`)
