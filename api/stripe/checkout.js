// POST /api/stripe/checkout — creates a Stripe Checkout session for a pending
// invoice and returns { url }. Body: { invoiceId, returnTo? } — returnTo is the
// path Stripe bounces back to (default /billing; the member app passes /app).
//
// HARD GATE: returns 403 unless Settings → Integrations → Stripe has
// "Enable online payments" turned ON (settings.stripe.paymentsEnabled).
// Amounts are charged inc. GST, matching the invoice PDF/email total.

import { applyCors } from '../_cors.js'
import { requireMember, isAdminEmail, isBillingAuthority } from '../_auth.js'

function totalsIncGst(invoice) {
  let taxable = 0, exempt = 0
  for (const li of invoice.lineItems ?? []) {
    const price = Number(li.unitPrice ?? 0) * Number(li.qty ?? 1)
    const net = price * (1 - Number(li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += net; else taxable += net
  }
  const gst = invoice.vatEnabled !== false ? taxable * 0.1 : 0
  return taxable + exempt + gst
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured.' })

  // Verify the caller owns the invoice (or is an admin).
  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const supabase = auth.sb
  const isAdmin = await isAdminEmail(supabase, auth.user.email)
  // Only the company's billing/contact person (or an admin) may pay invoices.
  if (!isAdmin && !(await isBillingAuthority(supabase, auth.user.email))) {
    return res.status(403).json({ error: 'Only your company’s billing contact can pay invoices.' })
  }

  const { invoiceId, returnTo } = req.body ?? {}
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required.' })
  // Same-site path only — reject anything that could redirect off-domain.
  const backPath = typeof returnTo === 'string' && /^\/[a-zA-Z0-9\-_/]*$/.test(returnTo) ? returnTo : '/billing'

  try {
    const [{ data: settRow }, { data: invRow }] = await Promise.all([
      supabase.from('settings').select('data').eq('id', 'global').single(),
      supabase.from('invoices').select('data').eq('id', invoiceId).single(),
    ])
    const settings = settRow?.data ?? {}
    if (settings.stripe?.paymentsEnabled !== true) {
      return res.status(403).json({ error: 'Online payments are not enabled yet — please pay by bank transfer using the details on your invoice.' })
    }

    const invoice = invRow?.data
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })
    if (!isAdmin && invoice.tenantId !== auth.companyId) return res.status(403).json({ error: 'Not your invoice.' })
    if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' })
    if (invoice.status === 'voided') return res.status(400).json({ error: 'This invoice has been voided.' })

    const { data: tRow } = await supabase.from('tenants').select('data').eq('id', invoice.tenantId).single()
    const tenant = tRow?.data

    const total = totalsIncGst(invoice)
    if (total <= 0) return res.status(400).json({ error: 'Invoice total must be positive to pay online.' })

    const base = `https://${req.headers.host}`
    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'aud',
      'line_items[0][price_data][product_data][name]': `Invoice ${invoice.number}`,
      'line_items[0][price_data][product_data][description]': (invoice.lineItems?.[0]?.description ?? '').slice(0, 200) || `Hexa Space invoice ${invoice.number}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(total * 100)),
      'line_items[0][quantity]': '1',
      'metadata[invoiceId]': invoice.id,
      'metadata[invoiceNumber]': invoice.number ?? '',
      'payment_intent_data[metadata][invoiceId]': invoice.id,
      success_url: `${base}${backPath}?paid=${encodeURIComponent(invoice.number ?? '1')}`,
      cancel_url: `${base}${backPath}`,
    })
    // Receipt email for Stripe Checkout: company email, else billing person.
    let payerEmail = tenant?.email
    if (!payerEmail && tenant?.id) {
      const { data: mRows } = await supabase.from('members').select('data').eq('data->>companyId', tenant.id)
      const mine = (mRows ?? []).map((r) => r.data).filter((m) => m?.email)
      payerEmail = (mine.find((m) => m.billingPerson) ?? mine.find((m) => m.contactPerson) ?? mine[0])?.email
    }
    if (payerEmail) params.set('customer_email', payerEmail)

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    const session = await r.json()
    if (!r.ok || !session.url) {
      console.error('Stripe checkout create failed:', session)
      return res.status(500).json({ error: session.error?.message ?? 'Could not start the payment.' })
    }

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return res.status(500).json({ error: 'Could not start the payment.' })
  }
}
