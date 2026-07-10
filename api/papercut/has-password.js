// POST /api/papercut/has-password
// Cutover straggler check for the PaperCut auth switch (Phase 5). The on-prem
// connector posts the list of ACTIVE-PRINTER emails (from the print logs); this
// returns, per email, whether that member has a PORTAL PASSWORD set in Supabase
// Auth. Members WITHOUT one can't sign in to print once auth.source.custom-program
// flips to hexa-auth.cmd — so `missing` is the "who gets locked out" list.
// (Card/tap release at the copier is unaffected; only Mobility-Print first-run and
// the :9191 web sign-in consult the auth program.) See docs/papercut-cutover.md.
//
// WHY AN ENDPOINT, NOT a direct query from the box: the service-role key stays on
// the portal, never on the connector — same split that kept the earlier check
// portal-side. Auth is the shared PAPERCUT_SYNC_TOKEN, like the other PaperCut
// endpoints. Returns ONLY a boolean per email — never a hash or any other auth field.
// Backed by the SECURITY DEFINER fn public.papercut_has_password (papercut-has-password-schema.sql).

import { createClient } from '@supabase/supabase-js'
import { applyCors } from '../_cors.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env.PAPERCUT_SYNC_TOKEN
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const { emails } = req.body ?? {}
  if (!Array.isArray(emails)) {
    return res.status(400).json({ error: 'emails must be an array of strings.' })
  }

  if (token) {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (bearer !== token) return res.status(401).json({ error: 'Invalid PaperCut sync token.' })
  } else {
    // No token set → don't touch auth data. Mirror the mock stance of the other endpoints.
    return res.status(200).json({ mock: true, note: 'PAPERCUT_SYNC_TOKEN not set — nothing checked.', results: [] })
  }

  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' })

  // Normalise + dedupe; cap the batch so a malformed caller can't ask for the world.
  const list = [...new Set(
    emails
      .filter((e) => typeof e === 'string' && e.includes('@'))
      .map((e) => e.trim().toLowerCase()),
  )].slice(0, 1000)

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let rows
  try {
    const { data, error } = await supabase.rpc('papercut_has_password', { emails: list })
    if (error) throw error
    rows = data ?? []
  } catch (err) {
    console.error('has-password check error:', err.message)
    return res.status(500).json({ error: 'Password check failed.' })
  }

  const has = new Map(rows.map((r) => [String(r.email).toLowerCase(), !!r.has_password]))
  const results = list.map((email) => ({ email, hasPassword: has.get(email) ?? false }))
  const missing = results.filter((r) => !r.hasPassword).map((r) => r.email)

  return res.status(200).json({
    checked: results.length,
    withPassword: results.length - missing.length,
    withoutPassword: missing.length,
    missing,   // ← the lock-out risk list: active printers with no portal password
    results,
  })
}
