// POST /api/auto-billing  — manual trigger from admin
// GET  /api/auto-billing  — Vercel cron (runs 1st of each month)
//
// Creates invoices for all active leases that don't have one for the current month,
// then emails each tenant their invoice.

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bH2, bSmall, bBtn, bPanel, bTable, SANS, INK, MUTE } from './_brand.js'
import { buildMonthlyInvoiceForLease, lineItemsSubtotal } from '../src/lib/billingEngine.js'
import { selectAllRows } from './_db.js'

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
    bSmall(`Hexa Space Pty Ltd &nbsp;·&nbsp; ABN ${b.abn ?? ''}<br>${b.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'}`)
  return brandFrame(inner, { footerLabel: 'Accounts' })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  // Cron (Bearer CRON_SECRET) or a verified admin only — this runs the bill run.
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey  = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set.' })

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load everything in parallel (paginated — see api/_db.js; never bare selects)
  const [lRows, tRows, iRows, sRes, spRows] = await Promise.all([
    selectAllRows(supabase, 'leases'),
    selectAllRows(supabase, 'tenants'),
    selectAllRows(supabase, 'invoices'),
    supabase.from('settings').select('data').eq('id', 'global').single(),
    selectAllRows(supabase, 'spaces'),
  ])

  const leases   = lRows.map(r => r.data).filter(l => l.status === 'active')
  const tenants  = tRows.map(r => r.data)
  const invoices = iRows.map(r => r.data)
  const settings = sRes.data?.data ?? {}
  const spaces   = spRows.map(r => r.data)

  const now = new Date()
  const { periodStart, periodEnd } = monthBounds(now)
  const issueDate    = now.toISOString().split('T')[0]
  const dueDateDays  = settings.invoicing?.dueDateDays ?? 14
  const dueDate      = addDays(now, dueDateDays)
  const taxRate      = settings.billingRules?.taxEnabled !== false ? (settings.billingRules?.taxRate ?? 10) / 100 : 0
  const numTemplate  = settings.invoicing?.invoiceNumberTemplate ?? 'INV-{{number}}'

  // Invoice numbers live inside the JSONB rows (no DB uniqueness constraint),
  // so allocation is read-max-plus-one. To keep the race window with a
  // concurrent in-app Bill Run as small as possible, re-read the numbers
  // FRESH immediately before each insert instead of trusting the snapshot
  // taken at run start. Residual race + proper fix: see docs/build-notes.md.
  const highestNumber = async () => {
    const rows = await selectAllRows(supabase, 'invoices', 'data->>number')
    return rows
      .map(r => parseInt(String(r.number ?? '').replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n) && n > 0)
      .reduce((max, n) => Math.max(max, n), 0)
  }
  let lastAllocated = 0

  const created = [], skipped = [], errors = []

  for (const lease of leases) {
    const tenant = tenants.find(t => t.id === lease.tenantId)
    if (!tenant) { errors.push({ leaseId: lease.id, reason: 'No tenant found' }); continue }

    // Shared engine: step pricing, office/parking split, proration, dedup,
    // rent-free and prepaid skips — identical to the in-app Bill Run.
    const { invoice: built, reason } = buildMonthlyInvoiceForLease(
      lease, new Date(periodStart + 'T00:00:00'), { invoices, spaces, settings, source: 'auto-bill' }
    )
    if (!built) {
      skipped.push(reason === 'already-billed' ? tenant.businessName : `${tenant.businessName} (${String(reason).replace(/-/g, ' ')})`)
      continue
    }

    // Fresh number allocation, kept monotonic within this run.
    lastAllocated = Math.max(await highestNumber(), lastAllocated) + 1
    const invoiceNum = numTemplate.replace('{{number}}', pad(lastAllocated))
    const invoice = {
      ...built,
      id: `inv_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      number: invoiceNum,
      sentStatus: 'sent',
      createdAt: issueDate,
    }

    let { error: saveErr } = await supabase.from('invoices').insert({
      id: invoice.id,
      data: invoice,
      updated_at: new Date().toISOString(),
    })
    if (saveErr && saveErr.code === '23505') {
      // id collision (same-ms Date.now) — regenerate and retry once
      invoice.id = `inv_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      ;({ error: saveErr } = await supabase.from('invoices').insert({
        id: invoice.id, data: invoice, updated_at: new Date().toISOString(),
      }))
    }
    if (saveErr) { errors.push({ tenant: tenant.businessName, reason: saveErr.message }); continue }

    // Send invoice email
    if (tenant.email && resendKey) {
      const subtotal = lineItemsSubtotal(invoice.lineItems)
      const gst      = invoice.vatEnabled !== false ? subtotal * taxRate : 0
      const total    = subtotal + gst
      const html     = invoiceEmail(invoice, tenant, settings, subtotal, gst, total)

      await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: [tenant.email],
        subject: `Invoice ${invoiceNum} — ${monthLabel(periodStart)}`,
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
      bH1(`${periodStart} → ${periodEnd}`) +
      bH2(`✓ ${created.length} Invoice${created.length !== 1 ? 's' : ''} Created &amp; Emailed`) +
      listPanel(created, i => typeof i === 'string' ? i : `${i.number} — ${i.tenant}`) +
      (skipped.length ? bH2(`— ${skipped.length} Skipped`) + listPanel(skipped, i => i) : '') +
      (errors.length ? bH2(`✗ ${errors.length} Error${errors.length !== 1 ? 's' : ''}`) + listPanel(errors, e => `${e.tenant ?? e.leaseId}: ${e.reason}`) : '') +
      bBtn('View Billing', 'https://portal.hexaspace.com.au/billing')

    await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: ['info@hexaspace.com.au'],
        subject: `Auto Bill Run — ${periodStart} → ${periodEnd}`,
        html: brandFrame(inner, { footerLabel: 'Accounts' }),
    }).catch(() => {})
  }

  return res.status(200).json({
    period: `${periodStart} → ${periodEnd}`,
    created,
    skipped,
    errors,
  })
}
