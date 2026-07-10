// POST /api/salto/open-callback — the remote-open zap reports the real KS result.
//
// A "Webhooks by Zapier" Catch Hook returns 200 the instant it RECEIVES the call,
// before the Salto KS "open door" action runs — so api/salto/open.js can only log
// 'dispatched'. This endpoint is the zap's final step: it POSTs back the true
// outcome, flipping the salto_open_log row to 'opened' or 'failed' so the admin
// Access log reflects what physically happened.
//
// Body: { requestId, result: 'opened' | 'failed', secret }
// Auth: shared secret (SALTO_CALLBACK_SECRET) — this is a public, unauthenticated
// endpoint otherwise. Only flips rows still in the 'dispatched' state (idempotent;
// can't resurrect or overwrite a settled row).

import { serviceClient } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.SALTO_CALLBACK_SECRET
  const given = req.body?.secret || req.headers['x-callback-secret']
  // If a secret is configured it MUST match; if unset we accept (so the zap can be
  // wired before the secret is set) but the endpoint is otherwise inert without data.
  if (secret && given !== secret) return res.status(401).json({ error: 'Unauthorized' })

  const { requestId } = req.body ?? {}
  const raw = String(req.body?.result ?? '').toLowerCase()
  const result = /open|success|ok|true/.test(raw) ? 'opened' : 'failed'
  if (!requestId) return res.status(400).json({ error: 'requestId is required.' })

  const sb = serviceClient()
  // Only settle a row that's still 'dispatched' — keeps the callback idempotent
  // and stops a late/duplicate call from overwriting a mock or already-settled row.
  const { data, error } = await sb.from('salto_open_log')
    .update({ result })
    .eq('id', requestId)
    .eq('result', 'dispatched')
    .select('id')

  if (error) {
    console.error('open-callback update failed:', error)
    return res.status(500).json({ error: 'Could not record result.' })
  }
  return res.status(200).json({ ok: true, requestId, result, updated: (data?.length ?? 0) > 0 })
}
