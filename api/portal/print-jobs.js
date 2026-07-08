// GET /api/portal/print-jobs
// Returns the CALLER'S OWN PaperCut print jobs — and no one else's. Same
// owner-only pattern as print-pin: the email comes from the caller's verified
// Supabase JWT, never from a query param. print_jobs has deny-all RLS, so this
// service-role endpoint is the only read path.

import { createClient } from '@supabase/supabase-js'
import { applyCors } from '../_cors.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' })

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return res.status(401).json({ error: 'Sign in required.' })

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user?.email) return res.status(401).json({ error: 'Invalid session.' })

  const { data, error } = await supabase
    .from('print_jobs')
    .select('id, ts, printer, document, pages, copies, cost, grayscale, duplex')
    .eq('email', user.email.toLowerCase())
    .order('ts', { ascending: false })
    .limit(200)
  if (error) return res.status(500).json({ error: 'Lookup failed.' })

  return res.status(200).json({ jobs: data ?? [] })
}
