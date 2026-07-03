// Encodes contract payment schedules (extracted 3 Jul 2026 from the signed
// PDFs in Downloads\membership) as pricing steps on the platform leases, so
// the bill run charges exactly what each agreement promises — including
// rent-free months. Contracts whose schedule is flat and already matches are
// skipped; ambiguous ones are FLAGGED and never auto-changed.
//
//   node scripts/apply-contract-schedules.mjs           → dry run (report only)
//   node scripts/apply-contract-schedules.mjs --apply   → write (backup first)
import { readFileSync, writeFileSync } from 'fs'

const APPLY = process.argv.includes('--apply')
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = env.match(/^SUPABASE_URL=(.+)$/m)[1].trim()
const key = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)[1].trim()
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }

// steps: [fromISO, toISO, monthly ex-GST]. Source: LICENCE FEE DETAILS table of each signed PDF.
const CONTRACTS = [
  { con: 'CON-160', name: 'QBS Partners',        end: '2027-06-30', steps: [['2025-06-16','2025-06-30',0],['2025-07-01','2027-06-30',1450]] },
  { con: 'CON-161', name: 'JJT Australia',       end: '2027-06-30', steps: [['2025-06-16','2025-06-30',0],['2025-07-01','2027-06-30',1450]] },
  { con: 'CON-180', name: 'Digitec It',          end: '2026-11-11', steps: [['2025-11-01','2026-11-11',1500]] },
  { con: 'CON-206', name: 'Grand Galaxy',        end: '2027-01-31', steps: [['2025-12-08','2026-01-31',0],['2026-02-01','2027-01-31',1900]] },
  { con: 'CON-207', name: 'tantu Australia',     end: '2026-12-31', steps: [['2026-01-18','2026-03-31',1900],['2026-04-01','2026-04-30',0],['2026-05-01','2026-07-31',1900],['2026-08-01','2026-08-31',0],['2026-09-01','2026-11-30',1900],['2026-12-01','2026-12-31',0]] },
  { con: 'CON-211', name: 'Newulife',            end: '2027-01-31', steps: [['2026-02-06','2026-04-30',2700],['2026-05-01','2026-05-31',0],['2026-06-01','2026-08-31',2700],['2026-09-01','2026-09-30',0],['2026-10-01','2026-12-31',2700],['2027-01-01','2027-01-31',0]] },
  { con: 'CON-216', name: 'GrantGuru',           end: '2027-05-31', steps: [['2026-06-01','2027-05-31',3650]] },
  { con: 'CON-218', name: 'Brixton Insurance',   end: '2027-05-31', steps: [['2026-06-01','2027-05-31',1900]] },
  { con: 'CON-223', name: 'Top 1 Care',          end: '2027-04-30', steps: [['2026-03-01','2026-03-31',0],['2026-04-01','2027-04-30',1700]] },
  { con: 'CON-224', name: 'You Hao',             end: '2027-04-30', steps: [['2026-03-05','2026-03-31',0],['2026-04-01','2027-04-30',1700]] },
  { con: 'CON-225', name: 'Victor Group',        end: '2027-04-30', steps: [['2026-03-02','2026-03-31',0],['2026-04-01','2027-04-30',1500]] },
  { con: 'CON-228', name: 'Wukong Media',        end: '2027-04-30', steps: [['2026-03-05','2027-04-30',1500]] },
  { con: 'CON-229', name: 'Chethana Psychology', end: '2027-02-28', steps: [['2026-03-01','2026-03-21',2750],['2026-03-22','2026-04-20',0],['2026-04-21','2026-05-21',2750],['2026-05-22','2026-06-20',0],['2026-06-21','2026-07-21',2750],['2026-07-22','2026-08-21',0],['2026-08-22','2026-11-20',2750],['2026-11-21','2026-12-21',0],['2026-12-22','2027-02-18',2750]] },
  { con: 'CON-232', name: 'PanAus Partners',     end: '2027-04-30', steps: [['2026-05-01','2026-07-31',900],['2026-08-01','2026-08-31',0],['2026-09-01','2026-11-30',900],['2026-12-01','2026-12-31',0],['2027-01-01','2027-03-31',900],['2027-04-01','2027-04-30',0]] },
  { con: 'CON-235', name: 'NOVAFAB',             end: '2027-04-30', steps: [['2026-04-21','2026-04-30',0],['2026-05-01','2027-01-31',75],['2027-02-01','2027-04-30',0]] },
  { con: 'CON-236', name: 'Sleek Circle',        end: '2027-04-30', steps: [['2026-05-01','2027-01-31',600],['2027-02-01','2027-04-30',0]] },
  { con: 'CON-238', name: 'Masterlink',          end: '2027-04-30', steps: [['2026-05-18','2027-04-30',1750]] },
  { con: 'CON-240', name: 'Melbourne Creative',  end: '2027-06-30', steps: [['2026-05-01','2026-05-31',0],['2026-06-01','2027-06-30',1800]] },
  { con: 'CON-242', name: 'DCOL Project',        end: '2027-05-31', steps: [['2026-06-01','2026-06-30',0],['2026-07-01','2027-05-31',545.45]] },
  { con: 'CON-244', name: 'AJ Lee',              end: '2027-05-31', steps: [['2026-06-03','2027-05-31',1700]] },
]

// Report-only oddities — never auto-changed:
//  - CON-120 WEHOME: contract Suite 7 $1,838/mo to 17/11/2026; platform lease is $1,000 and July was never billed anywhere. Confirm the real deal.
//  - CON-234 Emma Zhang: dedicated desk $500/mo, contract end date ambiguous in PDF.
//  - CON-218 Brixton vs CON-244 AJ Lee both say "Suite 14" — one likely moved.
//  - You Hao Suite 12 duplicate: platform must not keep billing You Hao for Suite 12 (it belongs to Top 1 Care per CON-223).

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

const [leases, tenants] = await Promise.all([getAll('leases'), getAll('tenants')])
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// What would the FLAT lease bill vs the CONTRACT for a given month?
function contractAmountFor(steps, y, m) {
  const mStart = new Date(y, m - 1, 1), mEnd = new Date(y, m, 0)
  const dim = mEnd.getDate()
  let amt = 0
  for (const [f, t, monthly] of steps) {
    const s = new Date(f + 'T00:00:00'), e = new Date(t + 'T00:00:00')
    const from = s > mStart ? s : mStart, to = e < mEnd ? e : mEnd
    if (to < from) continue
    const days = Math.round((to - from) / 86400000) + 1
    amt += days < dim ? (monthly * days) / dim : monthly
  }
  return Math.round(amt * 100) / 100
}

const backup = { at: new Date().toISOString(), leaseBefore: [] }
const report = []

for (const c of CONTRACTS) {
  let lease = leases.find((l) => l.status === 'active' && l.contractNumber === c.con)
  if (!lease) {
    const t = tenants.find((x) => norm(x.businessName).includes(norm(c.name).slice(0, 10)))
    const cands = leases.filter((l) => l.status === 'active' && l.tenantId === t?.id && !/park/i.test(l.id + (l.spaceId ?? '')))
    lease = cands[0]
  }
  if (!lease) { report.push(`MISSING  ${c.con} ${c.name}: no active platform lease found`); continue }

  // Compare Aug 2026 → contract end, flat-rent billing vs contract schedule
  const diffs = []
  const endD = new Date(c.end + 'T00:00:00')
  for (let d = new Date(2026, 7, 1); d <= endD; d.setMonth(d.getMonth() + 1)) {
    const want = contractAmountFor(c.steps, d.getFullYear(), d.getMonth() + 1)
    const flat = Number(lease.monthlyRent ?? 0)
    if (Math.abs(want - flat) > 0.05) diffs.push(`${d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })}: bills $${flat} should be $${want}`)
  }
  const hasSteps = !!lease.items?.some((i) => (i.steps ?? []).length > 0)
  const endsWrong = lease.endDate !== c.end

  if (diffs.length === 0 && !endsWrong) { report.push(`OK       ${c.con} ${c.name} (${lease.contractNumber}/${lease.id}) — flat rent matches contract`); continue }

  report.push(`${APPLY ? 'ENCODED ' : 'ENCODE  '}${c.con} ${c.name} (lease ${lease.id}${hasSteps ? ', HAD steps — overwritten' : ''})${endsWrong ? ` end ${lease.endDate}→${c.end}` : ''}`)
  diffs.slice(0, 14).forEach((x) => report.push(`           ${x}`))

  if (APPLY) {
    backup.leaseBefore.push(JSON.parse(JSON.stringify(lease)))
    lease.items = [{
      spaceId: lease.spaceId,
      steps: c.steps.map(([f, t, p]) => ({ startDate: f, endDate: t, listPrice: p, qty: 1 })),
    }]
    lease.endDate = c.end
    lease.notes = `${lease.notes ?? ''} [Contract schedule encoded 03/07/2026 from signed PDF ${c.con}]`.trim()
    await put('leases', lease.id, lease)
  }
}

if (APPLY) {
  writeFileSync('C:/Users/EricKuang/Downloads/invocies/AUDIT-schedule-encode-backup.json', JSON.stringify(backup, null, 2))
  report.push('\nBackup: Downloads/invocies/AUDIT-schedule-encode-backup.json')
} else {
  report.push('\nDRY RUN — nothing written. Re-run with --apply to encode.')
}
report.push('FLAGGED (manual review, untouched): WEHOME $1,000 vs contract $1,838; Emma Zhang desk end-date; Brixton vs AJ Lee both "Suite 14"; You Hao Suite 12 → Top 1 Care.')
console.log(report.join('\n'))
