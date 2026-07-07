// Import the fob/remote allocations exported from the old OfficeRND fob-tracker
// into this platform's fobs + fob_assignments tables.
//
//   node scripts/import-fobs.mjs            # dry run — prints the match report
//   node scripts/import-fobs.mjs --apply     # write to Supabase
//
// Idempotent: fob/assignment ids are derived from the serial, so re-running
// updates in place. Migrated deposits are marked ALREADY PAID (collected in the
// old system) — no new deposit invoice is raised. Unmatched holders still get a
// fob + assignment (with the raw name) flagged `unmatched:true` so no data is
// lost and an admin can re-link them in the Fobs screen.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const DEPOSITS = { fob: 100, remote: 200 }
const now = new Date().toISOString()

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const normSerial = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '')

async function fetchAll(table) {
  const size = 1000; let from = 0; const all = []
  for (;;) {
    const { data, error } = await sb.from(table).select('data').order('id', { ascending: true }).range(from, from + size - 1)
    if (error) { console.error(`fetch ${table}:`, error.message); break }
    if (!data?.length) break
    all.push(...data.map((r) => r.data)); if (data.length < size) break; from += size
  }
  return all
}

async function main() {
  const rows = JSON.parse(readFileSync('scripts/fob-import-data.json', 'utf8'))
  const members = await fetchAll('members')
  const tenants = await fetchAll('tenants')
  const companyById = Object.fromEntries(tenants.map((t) => [t.id, t]))

  // Name → members index for matching.
  const byName = new Map()
  for (const m of members) { const k = norm(m.name); if (!k) continue; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(m) }

  const tokens = (s) => norm(s).split(' ').filter(Boolean)
  function match(holder, suite) {
    const key = norm(holder)
    if (!key) return { member: null, how: 'none' }
    const exact = byName.get(key) || []
    if (exact.length === 1) return { member: exact[0], how: 'exact' }
    if (exact.length > 1) {
      // Same-name members — disambiguate by suite → company name overlap.
      if (suite) {
        const st = norm(suite)
        const hit = exact.find((m) => { const c = companyById[m.companyId]; return c && st.includes(norm(c.businessName)) })
        if (hit) return { member: hit, how: 'exact+suite' }
      }
      return { member: exact[0], how: 'ambiguous', alts: exact.length }
    }
    // Token-based suggestion (whole names only — avoids "Ryan Leong"→"Yan"):
    // a single-name holder matches a member whose FIRST name equals it; a
    // multi-name holder matches a member whose tokens are a superset.
    const ht = tokens(holder)
    const cand = members.filter((m) => {
      const mt = tokens(m.name); if (!mt.length) return false
      return ht.length === 1 ? mt[0] === ht[0] : ht.every((t) => mt.includes(t))
    })
    if (cand.length === 1) return { member: cand[0], how: 'suggest' }
    if (cand.length > 1) return { member: cand[0], how: 'suggest-ambiguous', alts: cand.length }
    return { member: null, how: 'none' }
  }

  const fobRows = [], assignmentRows = []
  const report = { linked: 0, review: 0, unmatched: 0, lost: 0, available: 0 }
  const flags = []

  for (const r of rows) {
    const serial = normSerial(r.serial)
    const fobId = `fob_${serial}`
    const assignmentId = `fa_${serial}`
    const type = r.type === 'remote' ? 'remote' : 'fob'
    const fob = {
      id: fobId, serial, type, location: 'hexa', status: r.status,
      currentMemberId: null, currentCompanyId: null, currentAssignmentId: null,
      notes: r.suite || '', migrated: true, createdAt: now.split('T')[0],
    }

    if (r.status === 'lost') { report.lost++; fobRows.push(fob); continue }
    if (r.status === 'available' || !r.holder) { report.available++; fobRows.push(fob); continue }

    const { member, how, alts } = match(r.holder, r.suite)
    // Only a confident match auto-links the member; everything else keeps the raw
    // holder name + a suggestion, flagged needsReview for an admin to confirm.
    const high = ['exact', 'exact+suite'].includes(how)
    const linked = high ? member : null
    if (high) report.linked++
    else if (member) { report.review++; flags.push(`  ? ${r.holder} → suggest ${member.name} [${how}${alts ? `, ${alts}` : ''}] (${serial})`) }
    else { report.unmatched++; flags.push(`  ✗ ${r.holder} — NO MATCH (${serial}${r.suite ? `, ${r.suite}` : ''})`) }

    const company = linked ? companyById[linked.companyId] : null
    fob.status = 'assigned'
    fob.currentMemberId = linked?.id ?? null
    fob.currentCompanyId = linked?.companyId ?? null
    fob.currentAssignmentId = assignmentId
    fobRows.push(fob)
    assignmentRows.push({
      id: assignmentId, fobId, serial, type,
      memberId: linked?.id ?? null, memberName: linked?.name ?? r.holder,
      companyId: linked?.companyId ?? null, companyName: company?.businessName ?? '',
      suggestedMemberId: !high ? (member?.id ?? null) : null, needsReview: !high, matchMethod: how,
      issuedAt: null, migratedAt: now, expectedReturnAt: null, returnedAt: null,
      depositAmount: DEPOSITS[type], depositStatus: 'paid', lost: false,
      issueNotes: `Migrated from OfficeRND fob tracker${r.suite ? ` · ${r.suite}` : ''}`,
      createdAt: now.split('T')[0],
    })
  }

  console.log(`\nFob import — ${rows.length} rows · ${members.length} members loaded`)
  console.log('Match report:', report)
  if (flags.length) { console.log('\nNeeds a look:'); flags.forEach((f) => console.log(f)) }
  console.log(`\nWould write ${fobRows.length} fobs + ${assignmentRows.length} assignments.`)

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to write.\n'); return }

  const chunk = (arr, n) => arr.reduce((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), [])
  for (const part of chunk(fobRows, 200)) {
    const { error } = await sb.from('fobs').upsert(part.map((d) => ({ id: d.id, data: d, updated_at: now })))
    if (error) console.error('fobs upsert:', error.message)
  }
  for (const part of chunk(assignmentRows, 200)) {
    const { error } = await sb.from('fob_assignments').upsert(part.map((d) => ({ id: d.id, data: d, updated_at: now })))
    if (error) console.error('fob_assignments upsert:', error.message)
  }
  console.log('\n✓ Applied.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
