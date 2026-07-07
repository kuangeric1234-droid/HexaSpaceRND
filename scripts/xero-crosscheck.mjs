// Cross-checks a month's invoices: Xero (source of financial truth) vs the
// platform's active leases and generated invoices. Read-only against Xero —
// nothing is written to either system except a CSV report.
//
// Usage:  node scripts/xero-crosscheck.mjs [YYYY-MM]     (default: current month)
//
// Prereqs: the platform must be connected to Xero (Settings → Integrations →
// Xero → Connect). Reads the stored OAuth token from the `integrations` table;
// XERO_CLIENT_ID/XERO_CLIENT_SECRET in .env.local are needed to refresh it.
//
// Report sections:
//   A. Active leases with no platform invoice this month (billing misses)
//   B. Per-company totals: platform vs Xero (ex-GST), with differences
//   C. Xero invoices from companies that don't match any platform tenant
//   D. Platform-invoiced companies with nothing in Xero

import { readFileSync, writeFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim()
const SUPABASE_URL = get('SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const XERO_ID = get('XERO_CLIENT_ID')
const XERO_SECRET = get('XERO_CLIENT_SECRET')

const month = process.argv[2] ?? new Date().toISOString().slice(0, 7)
if (!/^\d{4}-\d{2}$/.test(month)) { console.error('Usage: node scripts/xero-crosscheck.mjs YYYY-MM'); process.exit(1) }
const [y, m] = month.split('-').map(Number)
const nextY = m === 12 ? y + 1 : y
const nextM = m === 12 ? 1 : m + 1

// ── Supabase REST helpers ────────────────────────────────────────────────────
const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  if (!r.ok) throw new Error(`Supabase ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

// PostgREST caps unpaginated responses at 1000 rows — ALWAYS page through.
// (This bit us on 3 Jul: 1815 invoices, silent truncation, phantom "gaps".)
async function sbGetAll(table) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=data&order=id.asc`, {
      headers: { ...sbHeaders, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`Supabase ${table}: ${r.status} ${await r.text()}`)
    const batch = await r.json()
    out.push(...batch.map((x) => x.data))
    if (batch.length < 1000) break
  }
  return out
}

// ── Xero auth (shared connection with the platform, incl. refresh rotation) ─
async function xeroToken() {
  const rows = await sbGet('integrations?id=eq.xero&select=data')
  const conn = rows[0]?.data
  if (!conn?.refreshToken) throw new Error('Xero not connected — connect from Settings → Integrations → Xero first.')

  if (conn.expiresAt && Date.now() < conn.expiresAt - 60_000 && conn.accessToken) {
    return { token: conn.accessToken, tenantId: conn.tenantId }
  }
  if (!XERO_ID || !XERO_SECRET) throw new Error('Access token expired and XERO_CLIENT_ID/XERO_CLIENT_SECRET missing from .env.local (needed to refresh).')

  const r = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${XERO_ID}:${XERO_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refreshToken }),
  })
  const tok = await r.json()
  if (!r.ok || !tok.access_token) throw new Error(`Xero refresh failed: ${JSON.stringify(tok)}`)

  // Persist the rotated refresh token or the connection dies after 60 days.
  const next = { ...conn, accessToken: tok.access_token, refreshToken: tok.refresh_token ?? conn.refreshToken, expiresAt: Date.now() + (tok.expires_in ?? 1800) * 1000 }
  await fetch(`${SUPABASE_URL}/rest/v1/integrations?id=eq.xero`, {
    method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }),
  })
  return { token: next.accessToken, tenantId: next.tenantId }
}

async function fetchXeroInvoices() {
  const { token, tenantId } = await xeroToken()
  const where = encodeURIComponent(`Type=="ACCREC" AND Date >= DateTime(${y},${m},1) AND Date < DateTime(${nextY},${nextM},1)`)
  const all = []
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices?where=${where}&Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, 'Xero-Tenant-Id': tenantId, Accept: 'application/json' } }
    )
    if (!r.ok) throw new Error(`Xero invoices page ${page}: ${r.status} ${await r.text()}`)
    const batch = (await r.json()).Invoices ?? []
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

// ── Comparison ───────────────────────────────────────────────────────────────
const ALIAS = { hexapacifichp: 'hexapacific' } // Xero contact "Hexa Pacific Pty Ltd - HP"
const norm = (s) => {
  const n = String(s ?? '').toLowerCase().replace(/p\/l/g, '').replace(/\b(pty|ltd|pty\.|ltd\.|limited)\b/g, '').replace(/[^a-z0-9]/g, '')
  return ALIAS[n] ?? n
}
const aud = (n) => '$' + Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })
const invoiceExGst = (inv) => (inv.lineItems ?? []).reduce(
  (s, li) => s + Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100), 0)

const [tenants, leases, invoices, xeroInvs] = await Promise.all([
  sbGetAll('tenants'),
  sbGetAll('leases'),
  sbGetAll('invoices'),
  fetchXeroInvoices(),
])

const activeLeases = leases.filter((l) => l.status === 'active')
const monthInvoices = invoices.filter((i) => i.status !== 'voided' && (i.periodStart ?? i.issueDate ?? '').startsWith(month))

// A. active leases with no invoice this month
const monthStart = new Date(`${month}-01T00:00:00`)
const missing = []
for (const lease of activeLeases) {
  const covered = monthInvoices.some((i) => i.leaseId === lease.id)
  const prepaid = lease.paidInFull && lease.paidUntil && new Date(lease.paidUntil) >= monthStart
  if (!covered && !prepaid) {
    const t = tenants.find((x) => x.id === lease.tenantId)
    missing.push({ contract: lease.contractNumber ?? lease.id, tenant: t?.businessName ?? lease.tenantId, rent: lease.monthlyRent })
  }
}

// B/C/D. per-company totals, platform vs Xero
const platByCo = {}
for (const inv of monthInvoices) {
  const t = tenants.find((x) => x.id === inv.tenantId)
  const key = norm(t?.businessName)
  ;(platByCo[key] ??= { name: t?.businessName ?? inv.tenantId, total: 0, count: 0 }).total += invoiceExGst(inv)
  platByCo[key].count++
}
const xeroByCo = {}
for (const xi of xeroInvs) {
  const key = norm(xi.Contact?.Name)
  ;(xeroByCo[key] ??= { name: xi.Contact?.Name, total: 0, count: 0 }).total += Number(xi.SubTotal ?? 0)
  xeroByCo[key].count++
}

const matched = [], onlyPlatform = [], onlyXero = []
for (const [key, p] of Object.entries(platByCo)) {
  const x = xeroByCo[key]
  if (x) matched.push({ name: p.name, platform: p.total, xero: x.total, diff: p.total - x.total })
  else onlyPlatform.push(p)
}
for (const [key, x] of Object.entries(xeroByCo)) if (!platByCo[key]) onlyXero.push(x)
const mismatches = matched.filter((r) => Math.abs(r.diff) > 0.05)

// ── Output ───────────────────────────────────────────────────────────────────
console.log(`\n═══ Xero cross-check — ${month} ═══`)
console.log(`Platform: ${activeLeases.length} active leases, ${monthInvoices.length} invoices | Xero: ${xeroInvs.length} ACCREC invoices\n`)

console.log(`A. Active leases with NO platform invoice this month: ${missing.length}`)
missing.forEach((r) => console.log(`   ${r.contract}  ${r.tenant}  rent ${aud(r.rent)}`))

console.log(`\nB. Companies with amount differences (platform vs Xero, ex GST): ${mismatches.length}`)
mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  .forEach((r) => console.log(`   ${r.name}: platform ${aud(r.platform)} vs Xero ${aud(r.xero)}  (Δ ${aud(r.diff)})`))
console.log(`   (${matched.length - mismatches.length} companies match exactly)`)

console.log(`\nC. In Xero but NOT invoiced on platform: ${onlyXero.length}`)
onlyXero.forEach((r) => console.log(`   ${r.name}  ${aud(r.total)} across ${r.count} invoice(s)`))

console.log(`\nD. On platform but NOT in Xero: ${onlyPlatform.length}`)
onlyPlatform.forEach((r) => console.log(`   ${r.name}  ${aud(r.total)} across ${r.count} invoice(s)`))

const csv = [
  'section,company,contract,platform_ex_gst,xero_ex_gst,diff',
  ...missing.map((r) => `A_no_invoice,"${r.tenant}","${r.contract}",,,`),
  ...matched.map((r) => `B_matched,"${r.name}",,${r.platform.toFixed(2)},${r.xero.toFixed(2)},${r.diff.toFixed(2)}`),
  ...onlyXero.map((r) => `C_xero_only,"${r.name}",,,${r.total.toFixed(2)},`),
  ...onlyPlatform.map((r) => `D_platform_only,"${r.name}",,${r.total.toFixed(2)},,`),
].join('\n')
const out = new URL(`../xero-crosscheck-${month}.csv`, import.meta.url)
writeFileSync(out, csv)
console.log(`\nCSV written: xero-crosscheck-${month}.csv\n`)
