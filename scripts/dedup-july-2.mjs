// 7 Jul 2026 — final two duplicate groups the amount-matcher couldn't see
// (different per-invoice splits of the same Xero charge). User-approved
// continuation of scripts/dedup-july.mjs.
//
// Simple Stacks — Xero INV-3078 = $5,262.80 total. Platform had BOTH the
//   combined INV-3078 ($5,262.80) AND a two-part set (INV-3223 $3,462.80 +
//   INV-3240 $1,800). Keep the combined (number matches Xero); delete the set.
// M&Y OmniReach — Xero INV-3061 = $1,674 incl parking. Platform had BOTH the
//   combined INV-3061 AND a separate $150 parking invoice INV-3238. Delete the
//   parking extra.
// Full-row backup first. Run: node scripts/dedup-july-2.mjs
import { readFileSync, writeFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/^SUPABASE_URL=(.+)$/m)[1].trim()
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)[1].trim()
const h = { apikey: key, Authorization: `Bearer ${key}` }

const IDS = ['inv_recon_CON-1782796539118', 'inv_sp_ss_office8', 'inv_recon_CON-251-PARK']
const rows = await fetch(`${url}/rest/v1/invoices?id=in.(${IDS.join(',')})&select=data`, { headers: h }).then((r) => r.json())
if (!rows.length) { console.log('Nothing to do — already deleted.'); process.exit(0) }
writeFileSync('C:/Users/EricKuang/Downloads/invocies/AUDIT-dedup2-backup.json', JSON.stringify(rows.map((r) => r.data), null, 2))
const d = await fetch(`${url}/rest/v1/invoices?id=in.(${IDS.join(',')})`, { method: 'DELETE', headers: { ...h, Prefer: 'return=representation' } }).then((r) => r.json())
console.log('Deleted:', d.map((x) => `${x.data?.number ?? x.id}`).join(', '))
console.log('Backup: Downloads/invocies/AUDIT-dedup2-backup.json')
