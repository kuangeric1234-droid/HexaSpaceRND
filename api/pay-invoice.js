// POST /api/pay-invoice — the PUBLIC pay-this-invoice flow behind emailed
// links (Xero-style online invoice). No login: the secret is the per-invoice
// payToken carried in the link (portal.hexaspace.com.au/pay/<id>?t=<token>),
// generated when an invoice/reminder email is sent and stored on the invoice.
//
// Body: { action: 'load' | 'checkout', invoiceId, token }
//  - load     → minimal invoice + tenant name + public settings for the page
//  - checkout → Stripe Checkout session URL (same gate + shape as
//               api/stripe/checkout.js; the webhook marks the invoice paid)
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { applyCors } from './_cors.js'
import { publicSettings } from './_publicSettings.js'

const SUPABASE_URL = process.env.SUPABASE_URL

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

const tokenMatches = (a, b) => {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' })

  const { action = 'load', invoiceId, token } = req.body ?? {}
  if (!invoiceId || !token || String(token).length < 12) {
    return res.status(400).json({ error: 'Invalid link.' })
  }

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const { data: invRow } = await supabase.from('invoices').select('data').eq('id', invoiceId).single()
    const invoice = invRow?.data
    // Same response for missing invoice and wrong token — no oracle.
    if (!invoice || !tokenMatches(token, invoice.payToken)) {
      return res.status(404).json({ error: 'This payment link is not valid.' })
    }

    const [{ data: tRow }, { data: settRow }] = await Promise.all([
      supabase.from('tenants').select('data').eq('id', invoice.tenantId).single(),
      supabase.from('settings').select('data').eq('id', 'global').single(),
    ])
    const tenant = tRow?.data
    const settings = settRow?.data ?? {}
    const paymentsEnabled = settings.stripe?.paymentsEnabled === true && !!process.env.STRIPE_SECRET_KEY

    if (action === 'load') {
      // Minimal public subset — exactly what the printed invoice already shows.
      return res.status(200).json({
        invoice: {
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          reference: invoice.reference ?? '',
          vatEnabled: invoice.vatEnabled !== false,
          lineItems: (invoice.lineItems ?? []).map((li) => ({
            description: li.description,
            qty: li.qty,
            unitPrice: li.unitPrice,
            discountPct: li.discountPct ?? 0,
            vatExempt: !!li.vatExempt,
          })),
        },
        tenantName: tenant?.businessName ?? '',
        settings: publicSettings(settings),
        paymentsEnabled,
      })
    }

    if (action !== 'checkout') return res.status(400).json({ error: 'Unknown action.' })

    if (invoice.status === 'paid') return res.status(400).json({ error: 'This invoice is already paid.' })
    if (invoice.status === 'voided') return res.status(400).json({ error: 'This invoice has been voided.' })
    if (!paymentsEnabled) {
      return res.status(403).json({ error: 'Online payments are not enabled — please pay by bank transfer using the details shown.' })
    }
    const total = totalsIncGst(invoice)
    if (total <= 0) return res.status(400).json({ error: 'Invoice total must be positive to pay online.' })

    const base = `https://${req.headers.host}`
    const back = `/pay/${encodeURIComponent(invoice.id)}?t=${encodeURIComponent(token)}`
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
      success_url: `${base}${back}&paid=1`,
      cancel_url: `${base}${back}`,
    })
    // Public link — never attach the Stripe customer here (that would offer
    // the saved card to anyone holding the link). Email prefill only.
    if (tenant?.email) params.set('customer_email', tenant.email)

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    const session = await r.json()
    if (!r.ok || !session.url) {
      console.error('Public pay checkout create failed:', session)
      return res.status(500).json({ error: session.error?.message ?? 'Could not start the payment.' })
    }
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('pay-invoice error:', err)
    return res.status(500).json({ error: 'Something went wrong.' })
  }
}
