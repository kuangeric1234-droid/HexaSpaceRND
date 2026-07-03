// POST /api/auto-billing  â€” manual trigger from admin
// GET  /api/auto-billing  â€” Vercel cron (runs 1st of each month)
//
// Creates invoices for all active leases that don't have one for the current month,
// then emails each tenant their invoice.

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bH2, bSmall, bBtn, bPanel, bTable, SANS, INK, MUTE } from './_brand.js'
import { isRentFreeMonth } from '../src/lib/paymentSchedule.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function pad(n) { return String(n).padStart(4, '0') }
function fmtAud(n) { return `A$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` }

function monthBounds(date) {
  const y = date.getFullYear()
  const m = date.getMonth()
  const start = new Date(y, m, 1)
  const end   = new Date(y, m + 1, 0)
  const fmt = (d) => d.toISOString().split('T')[0]
  return { periodStart: fmt(start), periodEnd: fmt(end) }
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function monthLabel(periodStart) {
  return new Date(periodStart + 'T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function invoiceEmail(invoice, tenant, settings, subtotal, gst, total) {
  const b = settings.billing ?? {}
  const rows = [
    ...invoice.lineItems.map(li => {
      const net = li.unitPrice * (li.qty ?? 1) * (1 - (li.discountPct ?? 0) / 100)
      return [li.description, fmtAud(net)]
    }),
    ['Subtotal', fmtAud(subtotal)],
    ['GST (10%)', fmtAud(gst)],
    ['Total Due', fmtAud(total), true],
  ]
  const bank = b.bankName ? bPanel(
    `<div style="font-family:${SANS};font-size:11px;font-weight:600;color:${INK};text-transform:uppercase;letter-spacing:.12em;margin:0 0 10px">Payment Details</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:#444;margin:3px 0">Bank: ${b.bankName}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:#444;margin:3px 0">BSB: ${b.bsb}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:#444;margin:3px 0">Account: ${b.acc}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:#444;margin:3px 0">Reference: <strong>${invoice.number}</strong></div>`
  ) : ''
  const inner =
    bKicker('Invoice') +
    bH1(invoice.number) +
    bSmall(`Due ${invoice.dueDate}`) +
    bTable(rows) +
    bank +
    bBtn('View in Member Portal', 'https://portal.hexaspace.com.au/billing') +
    bSmall(`Hexa Space Pty Ltd &nbsp;Â·&nbsp; ABN ${b.abn ?? ''}<br>${b.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'}`)
  return brandFrame(inner, { footerLabel: 'Accounts' })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey  = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set.' })

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load everything in parallel
  const [lRes, tRes, iRes, sRes] = await Promise.all([
    supabase.from('leases').select('data'),
    supabase.from('tenants').select('data'),
    supabase.from('invoices').select('data'),
    supabase.from('settings').select('data').eq('id', 'global').single(),
  ])

  const leases   = (lRes.data ?? []).map(r => r.data).filter(l => l.status === 'active')
  const tenants  = (tRes.data ?? []).map(r => r.data)
  const invoices = (iRes.data ?? []).map(r => r.data)
  const settings = sRes.data?.data ?? {}

  const now = new Date()
  const { periodStart, periodEnd } = monthBounds(now)
  const issueDate    = now.toISOString().split('T')[0]
  const dueDateDays  = settings.invoicing?.dueDateDays ?? 14
  const dueDate      = addDays(now, dueDateDays)
  const taxRate      = settings.billingRules?.taxEnabled !== false ? (settings.billingRules?.taxRate ?? 10) / 100 : 0
  const numTemplate  = settings.invoicing?.invoiceNumberTemplate ?? 'INV-{{number}}'

  // Find highest existing invoice number
  let nextNum = invoices
    .map(i => parseInt((i.number ?? '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n) && n > 0)
    .reduce((max, n) => Math.max(max, n), 0) + 1

  const created = [], skipped = [], errors = []

  for (const lease of leases) {
    const tenant = tenants.find(t => t.id === lease.tenantId)
    if (!tenant) { errors.push({ leaseId: lease.id, reason: 'No tenant found' }); continue }

    // Skip if invoice already exists for this period
    const exists = invoices.some(i =>
      i.leaseId === lease.id &&
      i.periodStart === periodStart &&
      i.status !== 'voided'
    )
    if (exists) { skipped.push(tenant.businessName); continue }

    // Contract says this month is rent-free (step-encoded $0 or the
    // final-N-months new-member offer) → nothing to bill.
    if (isRentFreeMonth(lease, new Date(periodStart + 'T00:00:00'))) {
      skipped.push(`${tenant.businessName} (rent-free month)`)
      continue
    }

    const rent       = Number(lease.monthlyRent ?? 0)
    const discPct    = parseFloat(lease.discount ?? lease.items?.[0]?.steps?.[0]?.discount ?? '') || 0
    const invoiceNum = numTemplate.replace('{{number}}', pad(nextNum++))

    const lineItems = [{
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: `${lease.contractNumber ?? 'Licence'} â€” ${monthLabel(periodStart)}`,
      revenueAccount: 'Membership Fees',
      unitPrice: rent,
      qty: 1,
      discountPct: discPct,
    }]

    const invoice = {
      id: `inv_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      number: invoiceNum,
      tenantId: tenant.id,
      leaseId: lease.id,
      status: 'pending',
      sentStatus: 'sent',
      source: 'auto-bill',
      issueDate, dueDate, periodStart, periodEnd,
      vatEnabled: true,
      xeroSync: false,
      lineItems,
      payments: [],
      comments: [],
      creditNoteForId: null,
      createdAt: issueDate,
      isProrated: false,
    }

    const { error: saveErr } = await supabase.from('invoices').insert({
      id: invoice.id,
      data: invoice,
      updated_at: new Date().toISOString(),
    })
    if (saveErr) { errors.push({ tenant: tenant.businessName, reason: saveErr.message }); continue }

    // Send invoice email
    if (tenant.email && resendKey) {
      const subtotal = rent * (1 - discPct / 100)
      const gst      = subtotal * taxRate
      const total    = subtotal + gst
      const html     = invoiceEmail(invoice, tenant, settings, subtotal, gst, total)

      await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: [tenant.email],
        subject: `Invoice ${invoiceNum} â€” ${monthLabel(periodStart)}`,
        html,
      }).catch(() => {})
    }

    created.push({ number: invoiceNum, tenant: tenant.businessName })
  }

  // Send admin summary email
  if (resendKey) {
    const listPanel = (items, render) => bPanel(
      items.length
        ? items.map(i => `<div style="font-family:${SANS};font-size:13px;color:${INK};padding:4px 0">${render(i)}</div>`).join('')
        : `<div style="font-family:${SANS};font-size:13px;color:${MUTE};font-style:italic;padding:4px 0">None</div>`
    )

    const inner =
      bKicker('Auto Bill Run') +
      bH1(`${periodStart} â†’ ${periodEnd}`) +
      bH2(`âœ“ ${created.length} Invoice${created.length !== 1 ? 's' : ''} Created &amp; Emailed`) +
      listPanel(created, i => typeof i === 'string' ? i : `${i.number} â€” ${i.tenant}`) +
      (skipped.length ? bH2(`â€” ${skipped.length} Skipped (already invoiced)`) + listPanel(skipped, i => i) : '') +
      (errors.length ? bH2(`âœ— ${errors.length} Error${errors.length !== 1 ? 's' : ''}`) + listPanel(errors, e => `${e.tenant ?? e.leaseId}: ${e.reason}`) : '') +
      bBtn('View Billing', 'https://portal.hexaspace.com.au/billing')

    await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: ['info@hexaspace.com.au'],
        subject: `Auto Bill Run â€” ${periodStart} â†’ ${periodEnd}`,
        html: brandFrame(inner, { footerLabel: 'Accounts' }),
    }).catch(() => {})
  }

  return res.status(200).json({
    period: `${periodStart} â†’ ${periodEnd}`,
    created,
    skipped,
    errors,
  })
}
