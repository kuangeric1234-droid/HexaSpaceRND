// Vercel cron job â€” runs daily at 9am AEST (11pm UTC)
// Marks overdue invoices and sends reminder emails
// Schedule set in vercel.json

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bTable } from './_brand.js'
import { selectAllRows } from './_db.js'
import { stripeConfigured, chargeInvoiceOffSession } from './_stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const supabase = createClient(SUPABASE_URL, serviceKey)
  const todayStr = new Date().toISOString().split('T')[0]

  try {
    // 1. Load all pending/overdue invoices and tenants (paginated — 1000-row cap)
    const [invRows, tenantRows, { data: settRows }] = await Promise.all([
      selectAllRows(supabase, 'invoices', 'id, data'),
      selectAllRows(supabase, 'tenants', 'id, data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])

    const invoices = (invRows ?? []).map((r) => ({ id: r.id, ...r.data }))
    const tenants = (tenantRows ?? []).map((r) => ({ id: r.id, ...r.data }))
    const settings = settRows?.[0]?.data ?? {}

    const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'

    // 2. Find invoices that should be overdue
    const nowOverdue = invoices.filter(
      (inv) => inv.status === 'pending' && inv.dueDate && inv.dueDate < todayStr
    )

    // Mark overdue in Supabase
    for (const inv of nowOverdue) {
      await supabase.from('invoices').update({ data: { ...inv, status: 'overdue' } }).eq('id', inv.id)
    }

    // 3. Find all overdue invoices (including freshly marked ones)
    let allOverdue = invoices
      .map((inv) => nowOverdue.find((o) => o.id === inv.id) ? { ...inv, status: 'overdue' } : inv)
      .filter((inv) => inv.status === 'overdue' && inv.dueDate)

    // 3b. Card-on-file collection: when enabled in Settings → Stripe, overdue
    // invoices for tenants with a verified saved card are charged directly
    // (authorised by the payment authority in their signed agreement). Charged
    // invoices drop out of the reminder list; the tenant gets a receipt email.
    const charged = [], chargeFailed = []
    if (settings?.stripe?.autoChargeOverdue === true && stripeConfigured()) {
      for (const inv of [...allOverdue]) {
        const tenant = tenants.find((t) => t.id === inv.tenantId)
        if (!tenant?.stripePaymentMethodId) continue
        // One attempt per day per invoice; skip if today's attempt already failed.
        if (inv.lastChargeAttempt === todayStr) continue
        const result = await chargeInvoiceOffSession(supabase, inv, tenant)
        if (result.ok) {
          charged.push({ inv: result.invoice, tenant, amount: result.amount })
          allOverdue = allOverdue.filter((i) => i.id !== inv.id)
        } else {
          chargeFailed.push({ number: inv.number, tenant: tenant.businessName, error: result.error })
          await supabase.from('invoices').update({
            data: { ...inv, lastChargeAttempt: todayStr, lastChargeError: result.error },
          }).eq('id', inv.id)
        }
      }
      // Receipt email per charged tenant.
      if (resendKey) {
        for (const c of charged) {
          if (!c.tenant.email) continue
          const inner =
            bKicker('Payment Receipt') +
            bH1(`$${c.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`) +
            bP(`Hi ${c.tenant.contactName ?? c.tenant.businessName},`) +
            bP(`As authorised in your membership agreement, we've charged your saved ${(c.tenant.cardBrand || 'card').toUpperCase()} •••• ${c.tenant.cardLast4} for overdue invoice <strong>${c.inv.number}</strong>. No further action is needed.`) +
            bSmall(`This is an automated receipt from ${fromName}. Questions? Just reply to this email.`)
          await sendResendEmail({
            from: `${fromName} <${fromEmail}>`,
            to: c.tenant.email,
            subject: `Payment receipt — ${c.inv.number} (${fromName})`,
            html: brandFrame(inner, { footerLabel: 'Accounts' }),
          }).catch(() => {})
        }
      }
    }

    if (!resendKey || allOverdue.length === 0) {
      return res.status(200).json({ marked: nowOverdue.length, reminded: 0, charged: charged.length, chargeFailed })
    }

    // 4. Send reminder emails (one per tenant, listing all overdue invoices)
    const byTenant = {}
    for (const inv of allOverdue) {
      if (!byTenant[inv.tenantId]) byTenant[inv.tenantId] = []
      byTenant[inv.tenantId].push(inv)
    }

    let reminded = 0
    for (const [tenantId, invs] of Object.entries(byTenant)) {
      const tenant = tenants.find((t) => t.id === tenantId)
      if (!tenant?.email) continue

      const invoiceRows = invs.map((inv) => {
        const sub = (inv.lineItems ?? []).reduce((s, l) => {
          return s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100
        }, 0)
        const gst = inv.vatEnabled !== false ? Math.round(sub * 0.1 * 100) / 100 : 0
        const total = sub + gst
        return [inv.number, `Due ${inv.dueDate} Â· $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, true]
      })

      const inner =
        bKicker('Payment Reminder') +
        bH1(`${invs.length} overdue invoice${invs.length > 1 ? 's' : ''}`) +
        bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
        bP('The following invoice(s) are overdue. Please arrange payment at your earliest convenience.') +
        bTable(invoiceRows) +
        bP('Please contact us if you have any questions regarding your account.') +
        bSmall(`This is an automated reminder from ${fromName}.`)
      const html = brandFrame(inner, { footerLabel: 'Accounts' })

      await sendResendEmail({
        from: `${fromName} <${fromEmail}>`,
        to: tenant.email,
        subject: `Payment reminder â€” ${invs.length} overdue invoice${invs.length > 1 ? 's' : ''} from ${fromName}`,
        html,
      })
      reminded++
    }

    return res.status(200).json({ marked: nowOverdue.length, reminded, charged: charged.length, chargeFailed })
  } catch (err) {
    console.error('Overdue reminders error:', err)
    return res.status(500).json({ error: err.message })
  }
}
