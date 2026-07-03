// POST /api/stripe/setup — starts a hosted Stripe Checkout session in SETUP
// mode: verifies the member's card (incl. 3D-Secure) and saves it for future
// off-session charges, without taking a payment. Body: { tenantId, returnTo }.
// The webhook (checkout.session.completed, mode=setup) writes the card back
// onto the tenant record.
import { createClient } from '@supabase/supabase-js'
import { stripeConfigured, stripeFetch, ensureStripeCustomer } from '../_stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!stripeConfigured() || !serviceKey) return res.status(500).json({ error: 'Stripe not configured.' })

  const { tenantId, returnTo } = req.body ?? {}
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required.' })

  try {
    const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
    const { data: tRow } = await supabase.from('tenants').select('data').eq('id', tenantId).single()
    const tenant = tRow?.data
    if (!tenant) return res.status(404).json({ error: 'Account not found.' })

    const customerId = await ensureStripeCustomer(supabase, tenant)

    const base = `https://${req.headers.host}`
    const back = returnTo && String(returnTo).startsWith('/') ? `${base}${returnTo}` : (returnTo || `${base}/billing`)
    const sep = back.includes('?') ? '&' : '?'
    const r = await stripeFetch('/checkout/sessions', {
      mode: 'setup',
      customer: customerId,
      'payment_method_types[0]': 'card',
      success_url: `${back}${sep}card=saved`,
      cancel_url: back,
      metadata: { tenantId, kind: 'card_setup' },
    })
    if (!r.ok || !r.json.url) {
      console.error('Stripe setup session failed:', r.json)
      return res.status(500).json({ error: r.json.error?.message ?? 'Could not start card setup.' })
    }
    return res.status(200).json({ url: r.json.url })
  } catch (err) {
    console.error('Stripe setup error:', err)
    return res.status(500).json({ error: err.message })
  }
}
