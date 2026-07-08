// POST /api/papercut/jobs
// Ingests per-member print jobs (pushed by the on-prem connector's
// sync-print-jobs script, which reads PaperCut's daily CSV job logs) into the
// access-controlled `print_jobs` table. Members later read their OWN jobs via
// GET /api/portal/print-jobs (JWT-verified, owner-only).
//
// Body: { jobs: [{ id, email, time, printer, document, pages, copies, cost,
//                  grayscale, duplex }] }
// `id` is a deterministic hash the connector computes from the CSV row, so
// re-pushing the same window is idempotent (upsert on id, never duplicates).
//
// Auth: shared PAPERCUT_SYNC_TOKEN (Authorization: Bearer <token>), same as the
// other PaperCut endpoints. Mock/no-op when unconfigured.

import { createClient } from '@supabase/supabase-js'
import { applyCors } from '../_cors.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env.PAPERCUT_SYNC_TOKEN
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const { jobs } = req.body ?? {}
  if (!Array.isArray(jobs)) return res.status(400).json({ error: 'jobs must be an array.' })

  if (token) {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (bearer !== token) return res.status(401).json({ error: 'Invalid PaperCut sync token.' })
  }

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
  const rows = jobs
    .filter((j) => j?.id && j?.email)
    .map((j) => ({
      id: String(j.id),
      email: String(j.email).toLowerCase(),
      ts: j.time ? new Date(j.time).toISOString() : null,
      printer: j.printer ? String(j.printer).slice(0, 200) : null,
      document: j.document ? String(j.document).slice(0, 300) : null,
      pages: num(j.pages),
      copies: num(j.copies),
      cost: num(j.cost),
      grayscale: j.grayscale === true || j.grayscale === 'true' || j.grayscale === 'GRAYSCALE',
      duplex: j.duplex === true || j.duplex === 'true' || j.duplex === 'DUPLEX',
    }))

  if (!token || !serviceKey) {
    return res.status(200).json({ mock: true, received: jobs.length, wouldStore: rows.length, note: 'PaperCut not configured — mock only, nothing stored.' })
  }

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let stored = 0
  const failed = []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('print_jobs').upsert(chunk, { onConflict: 'id' })
    if (error) failed.push(error.message)
    else stored += chunk.length
  }

  return res.status(200).json({ ok: true, stored, failedBatches: failed.length, failedDetail: failed.slice(0, 3) })
}
