// Shared Stripe REST helpers — form-encoded fetch, no SDK dependency.
// Used by api/stripe/* (checkout, setup, charge, webhook) and the overdue cron.
import { sendInvoiceReceipt } from './_receipt.js'

const API = 'https://api.stripe.com/v1'

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY
}

// Stripe's form encoding: nested objects become bracketed keys.
function flatten(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

export async function stripeFetch(path, params = null, method = params ? 'POST' : 'GET') {
  const key = process.env.STRIPE_SECRET_KEY
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? flatten(params) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, json }
}

// Find-or-create the Stripe Customer for a tenant; caches the id on the row.
export async function ensureStripeCustomer(supabase, tenant) {
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId
  const r = await stripeFetch('/customers', {
    name: tenant.businessName || tenant.contactName || tenant.email || tenant.id,
    email: tenant.email || undefined,
    metadata: { tenantId: tenant.id },
  })
  if (!r.ok) throw new Error(r.json.error?.message || 'Stripe customer create failed')
  const updated = { ...tenant, stripeCustomerId: r.json.id }
  await supabase.from('tenants').upsert({ id: tenant.id, data: updated, updated_at: new Date().toISOString() })
  return r.json.id
}

// Invoice total inc. GST after line discounts (mirrors the checkout endpoint).
export function invoiceTotalIncGst(invoice) {
  let taxable = 0, exempt = 0
  for (const li of invoice.lineItems ?? []) {
    const net = Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += net; else taxable += net
  }
  const gst = invoice.vatEnabled !== false ? taxable * 0.1 : 0
  return Math.round((taxable + exempt + gst) * 100) / 100
}

// Charge the amount still owing on an invoice against the tenant's saved card
// (off-session — authorised by the payment authority in their agreement).
// On success the invoice is marked paid in Supabase and returned.
export async function chargeInvoiceOffSession(supabase, invoice, tenant) {
  if (!stripeConfigured()) return { ok: false, error: 'Stripe not configured' }
  if (!tenant?.stripeCustomerId || !tenant?.stripePaymentMethodId) return { ok: false, error: 'No saved card on file' }
  if (['paid', 'voided'].includes(invoice.status)) return { ok: false, error: `Invoice is ${invoice.status}` }

  const total = invoiceTotalIncGst(invoice)
  const paid = (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const due = Math.round((total - paid) * 100) / 100
  if (due <= 0) return { ok: false, error: 'Nothing owing on this invoice' }

  const r = await stripeFetch('/payment_intents', {
    amount: Math.round(due * 100),
    currency: 'aud',
    customer: tenant.stripeCustomerId,
    payment_method: tenant.stripePaymentMethodId,
    off_session: 'true',
    confirm: 'true',
    description: `Invoice ${invoice.number ?? invoice.id} — ${tenant.businessName ?? ''}`.trim(),
    metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number ?? '', tenantId: tenant.id },
  })
  if (!r.ok || r.json.status !== 'succeeded') {
    return { ok: false, error: r.json.error?.message || `Payment ${r.json.status || 'failed'}`, code: r.json.error?.code }
  }

  const updated = {
    ...invoice,
    status: 'paid',
    payments: [...(invoice.payments ?? []), {
      id: `pay_card_${r.json.id.slice(-10)}`,
      amount: due,
      date: new Date().toISOString().split('T')[0],
      method: 'Card on file (Stripe)',
      reference: r.json.id,
    }],
  }
  await supabase.from('invoices').upsert({ id: invoice.id, data: updated, updated_at: new Date().toISOString() })
  await sendInvoiceReceipt(supabase, updated, tenant, due)
  return { ok: true, amount: due, paymentIntentId: r.json.id, invoice: updated }
}
