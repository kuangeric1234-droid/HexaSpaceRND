// POST /api/stripe/charge — charges the amount owing on an invoice against the
// tenant's saved card (off-session). Used by the admin "Charge saved card"
// action; the daily overdue cron calls chargeInvoiceOffSession directly.
// Body: { invoiceId }
import { createClient } from '@supabase/supabase-js'
import { stripeConfigured, chargeInvoiceOffSession } from '../_stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!stripeConfigured() || !serviceKey) return res.status(500).json({ error: 'Stripe not configured.' })

  const { invoiceId } = req.body ?? {}
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required.' })

  try {
    const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
    const { data: invRow } = await supabase.from('invoices').select('data').eq('id', invoiceId).single()
    const invoice = invRow?.data
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })

    const { data: tRow } = await supabase.from('tenants').select('data').eq('id', invoice.tenantId).single()
    const tenant = tRow?.data
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' })

    const result = await chargeInvoiceOffSession(supabase, invoice, tenant)
    if (!result.ok) return res.status(402).json({ error: result.error, code: result.code })

    return res.status(200).json({ success: true, amount: result.amount, invoice: result.invoice })
  } catch (err) {
    console.error('Stripe charge error:', err)
    return res.status(500).json({ error: err.message })
  }
}
