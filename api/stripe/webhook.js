// POST /api/stripe/webhook — Stripe event receiver. On checkout.session.completed
// it marks the platform invoice paid (idempotent). Signature-verified with
// STRIPE_WEBHOOK_SECRET; raw body is required for verification, so the body
// parser is disabled.

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

const SUPABASE_URL = process.env.SUPABASE_URL

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Stripe-Signature: t=<ts>,v1=<hmac>[,v1=…] — HMAC-SHA256 of `${t}.${payload}`.
// Exported for tests.
export function verifySignature(payload, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(
    String(header ?? '').split(',').map((kv) => kv.split('=').map((s) => s.trim())).filter((p) => p.length === 2)
  )
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex')
  const candidates = String(header).split(',').filter((s) => s.trim().startsWith('v1=')).map((s) => s.trim().slice(3))
  return candidates.some((sig) => {
    try { return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')) } catch { return false }
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || !serviceKey) return res.status(500).json({ error: 'Webhook not configured.' })

  const raw = await readRawBody(req)
  if (!verifySignature(raw.toString('utf8'), req.headers['stripe-signature'], secret)) {
    return res.status(400).json({ error: 'Invalid signature.' })
  }

  const event = JSON.parse(raw.toString('utf8'))

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      // Card-setup sessions (mode=setup): save the verified card onto the
      // tenant so overdue invoices can be charged off-session, and the portal
      // can show the card on file.
      if (session.mode === 'setup' && session.metadata?.tenantId) {
        const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
        const { stripeFetch } = await import('../_stripe.js')
        const si = await stripeFetch(`/setup_intents/${session.setup_intent}`)
        const pmId = si.json?.payment_method
        if (pmId) {
          const pm = await stripeFetch(`/payment_methods/${pmId}`)
          const card = pm.json?.card ?? {}
          const { data: tRow } = await supabase.from('tenants').select('data').eq('id', session.metadata.tenantId).single()
          if (tRow?.data) {
            const tenant = {
              ...tRow.data,
              stripeCustomerId: session.customer ?? tRow.data.stripeCustomerId,
              stripePaymentMethodId: pmId,
              cardBrand: card.brand ?? '',
              cardLast4: card.last4 ?? '',
              cardExpMonth: card.exp_month ?? null,
              cardExpYear: card.exp_year ?? null,
              cardVerifiedAt: new Date().toISOString(),
            }
            await supabase.from('tenants').upsert({ id: tenant.id, data: tenant, updated_at: new Date().toISOString() })
          }
        }
        return res.status(200).json({ received: true })
      }

      const invoiceId = session.metadata?.invoiceId
      if (invoiceId && session.payment_status === 'paid') {
        const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
        const { data: row } = await supabase.from('invoices').select('data').eq('id', invoiceId).single()
        const invoice = row?.data
        if (invoice && invoice.status !== 'paid') {
          invoice.payments = [
            ...(invoice.payments ?? []),
            {
              id: `pay_stripe_${session.id.slice(-10)}`,
              amount: (session.amount_total ?? 0) / 100,
              date: new Date().toISOString().split('T')[0],
              method: 'stripe',
              reference: session.payment_intent ?? session.id,
            },
          ]
          invoice.status = 'paid'
          invoice.stripeSessionId = session.id
          await supabase.from('invoices').upsert({ id: invoice.id, data: invoice, updated_at: new Date().toISOString() })
        }
      }
    }
    // Always 200 for handled/ignored events so Stripe doesn't retry forever.
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Stripe webhook error:', err)
    return res.status(500).json({ error: 'Webhook processing failed.' })
  }
}
