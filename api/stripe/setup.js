// POST /api/stripe/setup — starts a hosted Stripe Checkout session in SETUP
// mode: verifies the member's card (incl. 3D-Secure) and saves it for future
// off-session charges, without taking a payment. Body: { tenantId, returnTo }.
// The webhook (checkout.session.completed, mode=setup) writes the card back
// onto the tenant record.
import { stripeConfigured, stripeFetch, ensureStripeCustomer } from '../_stripe.js'
import { applyCors } from '../_cors.js'
import { requireMember, isAdminEmail, isBillingAuthority } from '../_auth.js'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!stripeConfigured()) return res.status(500).json({ error: 'Stripe not configured.' })

  // Verify the caller. A member sets up a card for THEIR OWN company (tenantId is
  // derived from their session, not the body); an admin may target any tenantId.
  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const supabase = auth.sb
  const isAdmin = await isAdminEmail(supabase, auth.user.email)
  // Only the company's billing/contact person (or an admin) may manage the card.
  if (!isAdmin && !(await isBillingAuthority(supabase, auth.user.email))) {
    return res.status(403).json({ error: 'Only your company’s billing contact can manage the payment card.' })
  }
  const tenantId = isAdmin ? (req.body?.tenantId || auth.companyId) : auth.companyId
  const returnTo = req.body?.returnTo
  if (!tenantId) return res.status(400).json({ error: 'No company on this account.' })

  try {
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
