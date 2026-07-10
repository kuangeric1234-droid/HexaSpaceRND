// GET /api/salto/open-log — admin audit read for the Access log page.
//
// Returns recent remote-unlock attempts, newest first, enriched with member name
// and company name. Backed by salto_open_log (written by api/salto/open.js, settled
// by api/salto/open-callback.js).
//
// Query params (all optional): from, to (ISO dates), company (tenants.id),
// result ('opened'|'failed'|'dispatched'|'mock'), limit (default 200, max 1000).

import { requireAdmin } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const sb = auth.sb

  const { from, to, company, result } = req.query ?? {}
  const limit = Math.min(1000, Math.max(1, Number(req.query?.limit) || 200))

  let q = sb.from('salto_open_log').select('*').order('at', { ascending: false }).limit(limit)
  if (from) q = q.gte('at', new Date(from).toISOString())
  if (to) q = q.lte('at', new Date(to).toISOString())
  if (company) q = q.eq('company_id', company)
  if (result) q = q.eq('result', result)

  const { data: rows, error } = await q
  if (error) {
    console.error('open-log read failed:', error)
    return res.status(500).json({ error: 'Could not read the access log.' })
  }

  // Enrich with names. Members keyed by lowercased email, companies by id.
  const [{ data: mRows }, { data: tRows }] = await Promise.all([
    sb.from('members').select('data'),
    sb.from('tenants').select('id,data'),
  ])
  const nameByEmail = new Map((mRows ?? [])
    .map((r) => r.data)
    .filter((m) => m?.email)
    .map((m) => [String(m.email).toLowerCase(), m.name || '']))
  const companyById = new Map((tRows ?? []).map((r) => [r.id, r.data?.businessName || '']))

  const entries = (rows ?? []).map((r) => ({
    id: r.id,
    at: r.at,
    email: r.email,
    member: nameByEmail.get(String(r.email ?? '').toLowerCase()) || r.email || '—',
    company: companyById.get(r.company_id) || '—',
    companyId: r.company_id,
    kind: r.kind || (r.space_id ? 'office' : '—'),
    door: r.door_label || r.space_id || r.lock_id || '—',
    lockId: r.lock_id,
    bookingRef: r.booking_ref || null,
    result: r.result || '—',
  }))

  return res.status(200).json({ entries, count: entries.length })
}
