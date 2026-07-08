// PaperCut MF → Hexa: sync members' print-job history.
//
// PaperCut's XML-RPC API has no transaction-log method, but the server writes
// daily CSV print logs to [app-path]\server\logs\csv\daily. This script (run on
// the server, like the others) parses the recent CSVs, maps PaperCut usernames
// to member emails over localhost XML-RPC, and pushes jobs to
// /api/papercut/jobs → the deny-all `print_jobs` table. Members then see their
// own print activity (and per-job cost) on the portal's Printing tab.
//
// Idempotent: each job's id is a hash of its CSV identity, so re-running any
// window never duplicates. Schedule DAILY alongside sync-pins.mjs (which keeps
// the balance fresh — the two together power the Printing tab).
//
// Env (reuse the connector .env):
//   PAPERCUT_AUTH_TOKEN, PAPERCUT_SERVER (default http://localhost:9191),
//   PAPERCUT_CSV_DIR   (default C:\Program Files\PaperCut MF\server\logs\csv\daily)
//   HEXA_JOBS_URL      (default https://portal.hexaspace.com.au/api/papercut/jobs)
//   PAPERCUT_SYNC_TOKEN, PAPERCUT_JOB_DAYS (default 35), PAPERCUT_DRY_RUN ('1')

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import xmlrpc from 'xmlrpc'

const SERVER = process.env.PAPERCUT_SERVER || 'http://localhost:9191'
const AUTH = process.env.PAPERCUT_AUTH_TOKEN || ''
const CSV_DIR = process.env.PAPERCUT_CSV_DIR || 'C:\\Program Files\\PaperCut MF\\server\\logs\\csv\\daily'
const JOBS_URL = process.env.HEXA_JOBS_URL || 'https://portal.hexaspace.com.au/api/papercut/jobs'
const SYNC_TOKEN = process.env.PAPERCUT_SYNC_TOKEN || ''
const DAYS = Number(process.env.PAPERCUT_JOB_DAYS) || 35
const DRY_RUN = process.env.PAPERCUT_DRY_RUN === '1'

function call(client, method, params) {
  return new Promise((resolve, reject) => {
    client.methodCall(method, [AUTH, ...params], (err, value) => (err ? reject(err) : resolve(value)))
  })
}

// Minimal CSV parser (quoted fields, embedded commas/quotes).
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row) }
  return rows
}

async function main() {
  if (!AUTH) throw new Error('PAPERCUT_AUTH_TOKEN not set.')

  // 1. Username → email map (same indexing approach as the other scripts).
  const url = new URL(SERVER)
  const isHttps = url.protocol === 'https:'
  const opts = { host: url.hostname, port: Number(url.port) || (isHttps ? 9192 : 9191), path: '/rpc/api/xmlrpc' }
  const client = isHttps ? xmlrpc.createSecureClient(opts) : xmlrpc.createClient(opts)

  const users = []
  for (let off = 0; ; off += 1000) {
    const batch = await call(client, 'api.listUserAccounts', [off, 1000])
    users.push(...batch)
    if (batch.length < 1000) break
  }
  const userToEmail = new Map()
  for (const u of users) {
    const em = await call(client, 'api.getUserProperty', [u, 'email']).catch(() => '')
    if (em && String(em).includes('@')) userToEmail.set(String(u).toLowerCase(), String(em).toLowerCase())
  }
  console.log(`Mapped ${userToEmail.size}/${users.length} PaperCut users to emails.`)

  // 2. Recent daily CSVs.
  const cutoff = Date.now() - DAYS * 86400_000
  const files = readdirSync(CSV_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => join(CSV_DIR, f))
    .filter((p) => statSync(p).mtimeMs >= cutoff)
    .sort()
  console.log(`Reading ${files.length} CSV file(s) from ${CSV_DIR} (last ${DAYS} days).`)

  // 3. Parse. Header names vary slightly by version — map by name, not position.
  const jobs = []
  let unmatched = 0
  for (const file of files) {
    const rows = parseCsv(readFileSync(file, 'utf8'))
    const hi = rows.findIndex((r) => r.some((c) => /^time$/i.test(c.trim())) && r.some((c) => /^user$/i.test(c.trim())))
    if (hi === -1) { console.log(`  skip (no header): ${file}`); continue }
    const header = rows[hi].map((h) => h.trim().toLowerCase())
    const col = (...names) => header.findIndex((h) => names.includes(h))
    const cTime = col('time'), cUser = col('user'), cPages = col('pages'), cCopies = col('copies')
    const cPrinter = col('printer'), cDoc = col('document name', 'document'), cCost = col('cost', 'charged cost')
    const cDuplex = col('duplex'), cGray = col('grayscale', 'gray scale')

    for (const r of rows.slice(hi + 1)) {
      const uname = (r[cUser] ?? '').trim().toLowerCase()
      if (!uname) continue
      const email = uname.includes('@') ? uname : userToEmail.get(uname)
      if (!email) { unmatched++; continue }
      const time = (r[cTime] ?? '').trim()
      const d = new Date(time) // CSV times are server-local; the connector runs on that box
      if (Number.isNaN(d.getTime())) continue
      const doc = cDoc >= 0 ? (r[cDoc] ?? '').trim() : ''
      const cost = cCost >= 0 ? Number(r[cCost]) : null
      jobs.push({
        id: createHash('sha1').update(`${uname}|${time}|${doc}|${r[cPrinter] ?? ''}|${cost ?? ''}`).digest('hex'),
        email,
        time: d.toISOString(),
        printer: cPrinter >= 0 ? (r[cPrinter] ?? '').trim() : null,
        document: doc || null,
        pages: cPages >= 0 ? Number(r[cPages]) || null : null,
        copies: cCopies >= 0 ? Number(r[cCopies]) || null : null,
        cost: Number.isFinite(cost) ? cost : null,
        grayscale: cGray >= 0 ? /gray/i.test(r[cGray] ?? '') || /^true$/i.test(r[cGray] ?? '') : null,
        duplex: cDuplex >= 0 ? /duplex/i.test(r[cDuplex] ?? '') || /^true$/i.test(r[cDuplex] ?? '') : null,
      })
    }
  }
  console.log(`Parsed ${jobs.length} member print jobs (${unmatched} rows skipped — user has no email match).`)

  if (DRY_RUN) { console.log('DRY RUN — nothing sent. Sample:', JSON.stringify(jobs.slice(0, 3), null, 2)); return }
  if (!SYNC_TOKEN) throw new Error('PAPERCUT_SYNC_TOKEN not set. Use PAPERCUT_DRY_RUN=1 to preview.')

  let stored = 0
  for (let i = 0; i < jobs.length; i += 500) {
    const res = await fetch(JOBS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SYNC_TOKEN}` },
      body: JSON.stringify({ jobs: jobs.slice(i, i + 500) }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`jobs sync failed (${res.status}): ${JSON.stringify(out)}`)
    stored += out.stored ?? 0
  }
  console.log(`Stored ${stored} jobs.`)
}

main().catch((err) => { console.error('PaperCut print-jobs sync failed:', err.message); process.exit(1) })
