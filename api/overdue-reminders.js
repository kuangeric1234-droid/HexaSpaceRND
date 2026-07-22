// Vercel cron job — runs daily at 9am AEST (11pm UTC)
// Marks overdue invoices and sends reminder emails
// Schedule set in vercel.json

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { sendResendEmail, billingEmailFor } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bTable, bBtn } from './_brand.js'
import { selectAllRows } from './_db.js'
import { stripeConfigured, chargeInvoiceOffSession } from './_stripe.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// Add N business days (weekends excluded) to a yyyy-mm-dd date. NOTE: public
// holidays are NOT excluded — the window may be 1 day short if a VIC public
// holiday falls in it; acceptable for a "at least" notice, revisit if needed.
function addBusinessDays(fromStr, n) {
  const d = new Date(`${fromStr}T00:00:00Z`)
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay() // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) added++
  }
  return d.toISOString().split('T')[0]
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Cron or verified admin only — marks overdue + charges cards on file.
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const supabase = createClient(SUPABASE_URL, serviceKey)
  const todayStr = new Date().toISOString().split('T')[0]

  try {
    // 1. Load all pending/overdue invoices and tenants (paginated — 1000-row cap)
    const [invRows, tenantRows, memberRows, { data: settRows }] = await Promise.all([
      selectAllRows(supabase, 'invoices', 'id, data'),
      selectAllRows(supabase, 'tenants', 'id, data'),
      selectAllRows(supabase, 'members', 'id, data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])

    const invoices = (invRows ?? []).map((r) => ({ id: r.id, ...r.data }))
    const tenants = (tenantRows ?? []).map((r) => ({ id: r.id, ...r.data }))
    const members = (memberRows ?? []).map((r) => ({ id: r.id, ...r.data }))
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
    // (authorised by clause 7(i) of the T&C). A grace period applies after the
    // due date (default 7 days, per the clause) before any charge is made.
    // Charged invoices drop out of the reminder list; the tenant gets a receipt.
    const charged = [], chargeFailed = [], chargeNotified = []
    const graceDays = Number(settings?.stripe?.chargeGraceDays ?? 7)
    const NOTICE_BUSINESS_DAYS = 2 // clause 7(i): ≥2 business days' notice before charging
    // UTC-anchored so the day arithmetic can't drift across timezones.
    const chargeCutoff = (() => { const d = new Date(`${todayStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - graceDays); return d.toISOString().split('T')[0] })()
    if (settings?.stripe?.autoChargeOverdue === true && stripeConfigured()) {
      for (const inv of [...allOverdue]) {
        const tenant = tenants.find((t) => t.id === inv.tenantId)
        if (!tenant?.stripePaymentMethodId) continue
        // Unattended charging needs a RECORDED payment authority (the opt-in
        // ticked at card setup, or stamped by new-contract onboarding). Members
        // on pre-authority contracts who merely saved a card are never
        // auto-charged — see src/lib/cardAuthority.js.
        if (tenant.cardAuthorityAccepted !== true) continue
        // Grace period: only proceed once the due date is graceDays behind us.
        if (!inv.dueDate || inv.dueDate > chargeCutoff) continue

        // Clause 7(i): give at least 2 business days' written notice by email
        // BEFORE charging. The first eligible pass sends that notice and records
        // the scheduled charge date; the charge only fires on/after that date, so
        // a member always has time to pay first or query it.
        if (!inv.chargeNoticeSentAt) {
          const chargeOn = addBusinessDays(todayStr, NOTICE_BUSINESS_DAYS)
          const to = billingEmailFor(tenant, members)
          if (resendKey && to) {
            const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
            const amt = inv.vatEnabled !== false ? Math.round(sub * 1.1 * 100) / 100 : sub
            const inner =
              bKicker('Upcoming payment') +
              bH1(`$${amt.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`) +
              bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
              bP(`This is advance notice that, as authorised in your membership agreement, we intend to charge your saved ${(tenant.cardBrand || 'card').toUpperCase()} •••• ${tenant.cardLast4} for overdue invoice <strong>${inv.number}</strong> on or after <strong>${chargeOn}</strong>.`) +
              bP('To avoid this charge, you can pay the invoice in the member portal before that date. If anything looks incorrect, just reply to this email.') +
              bSmall(`Automated notice from ${fromName}. Sent at least 2 business days before any charge, per clause 7(i) of your agreement.`)
            await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Upcoming card payment — ${inv.number} (${fromName})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }).catch(() => {})
          }
          await supabase.from('invoices').update({ data: { ...inv, chargeNoticeSentAt: todayStr, chargeScheduledFor: chargeOn } }).eq('id', inv.id)
          chargeNotified.push({ number: inv.number, tenant: tenant.businessName, chargeOn })
          continue // don't charge yet — notice period must elapse
        }
        // Still inside the notice period — wait until the scheduled charge date.
        if (inv.chargeScheduledFor && todayStr < inv.chargeScheduledFor) continue
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
          const receiptEmail = billingEmailFor(c.tenant, members)
          if (!receiptEmail) continue
          const inner =
            bKicker('Payment Receipt') +
            bH1(`$${c.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`) +
            bP(`Hi ${c.tenant.contactName ?? c.tenant.businessName},`) +
            bP(`As authorised in your membership agreement, we've charged your saved ${(c.tenant.cardBrand || 'card').toUpperCase()} •••• ${c.tenant.cardLast4} for overdue invoice <strong>${c.inv.number}</strong>. No further action is needed.`) +
            bSmall(`This is an automated receipt from ${fromName}. Questions? Just reply to this email.`)
          await sendResendEmail({
            from: `${fromName} <${fromEmail}>`,
            to: receiptEmail,
            subject: `Payment receipt — ${c.inv.number} (${fromName})`,
            html: brandFrame(inner, { footerLabel: 'Accounts' }),
          }).catch(() => {})
        }
      }
    }

    // 3c. Door-access enforcement (licence clause 7(d)): a company with any
    // invoice overdue past the grace period gets every member's Salto access
    // BLOCKED via the Zapier hook, with a suspension notice emailed; access is
    // restored (and notified) automatically once no overdue invoices remain.
    // OFF unless Settings → Billing Rules → "Suspend door access" is enabled.
    const blocked = [], unblocked = []
    const enforceOn = settings?.billingRules?.blockOverdueAccess === true
    const blockGraceDays = Number(settings?.billingRules?.blockGraceDays ?? 14)
    const blockHook = process.env.SALTO_BLOCK_WEBHOOK
    const unblockHook = process.env.SALTO_UNBLOCK_WEBHOOK
    if (enforceOn && blockHook && unblockHook) {
      const blockCutoff = (() => { const d = new Date(`${todayStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - blockGraceDays); return d.toISOString().split('T')[0] })()
      const overdueByTenant = {}
      for (const inv of allOverdue) (overdueByTenant[inv.tenantId] ??= []).push(inv)

      const hookPost = (url, payload) => fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).catch(() => {})

      for (const tenant of tenants) {
        const over = overdueByTenant[tenant.id] ?? []
        const pastGrace = over.some((i) => i.dueDate <= blockCutoff)
        const coMembers = members.filter((m) => m.companyId === tenant.id && m.email)

        if (pastGrace && !tenant.saltoBlockedAt) {
          for (const m of coMembers) {
            await hookPost(blockHook, { action: 'block_user', email: m.email, memberName: m.name ?? '', company: tenant.businessName ?? '', reason: 'overdue_invoices', source: 'hexaspace-platform' })
          }
          await supabase.from('tenants').update({ data: { ...tenant, saltoBlockedAt: todayStr } }).eq('id', tenant.id)
          tenant.saltoBlockedAt = todayStr
          blocked.push(tenant.businessName ?? tenant.id)
          const to = billingEmailFor(tenant, members)
          if (resendKey && to) {
            const inner =
              bKicker('Account Notice') +
              bH1('Door access suspended') +
              bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
              bP(`As your account has invoices more than ${blockGraceDays} days overdue, door access for your team has been suspended, in line with clause 7(d) of your licence agreement. Access is restored automatically as soon as the outstanding balance is paid — a $100 re-activation fee may apply.`) +
              bP('You can view and pay your invoices any time in the member portal.') +
              bSmall(`Questions or need a hand sorting this out? Just reply to this email.`)
            await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Door access suspended — overdue account (${fromName})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }).catch(() => {})
          }
        } else if (over.length === 0 && tenant.saltoBlockedAt) {
          for (const m of coMembers) {
            await hookPost(unblockHook, { action: 'unblock_user', email: m.email, memberName: m.name ?? '', company: tenant.businessName ?? '', source: 'hexaspace-platform' })
          }
          const cleared = { ...tenant }
          delete cleared.saltoBlockedAt
          await supabase.from('tenants').update({ data: cleared }).eq('id', tenant.id)
          unblocked.push(tenant.businessName ?? tenant.id)
          const to = billingEmailFor(tenant, members)
          if (resendKey && to) {
            const inner =
              bKicker('Account Notice') +
              bH1('Door access restored') +
              bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
              bP('Thank you — your outstanding balance has been cleared and door access for your team has been restored.') +
              bSmall(`Automated notice from ${fromName}.`)
            await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Door access restored (${fromName})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }).catch(() => {})
          }
        }
      }

      // Admin heads-up whenever enforcement acted.
      if (resendKey && (blocked.length || unblocked.length)) {
        const notif = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
        const inner =
          bKicker('Access Enforcement') +
          bH1(`${blocked.length} suspended · ${unblocked.length} restored`) +
          (blocked.length ? bP(`<strong>Suspended:</strong> ${blocked.join(', ')}`) : '') +
          (unblocked.length ? bP(`<strong>Restored:</strong> ${unblocked.join(', ')}`) : '') +
          bSmall('Daily overdue cron — door-access enforcement (clause 7(d)).')
        await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: notif, subject: `Door access: ${blocked.length} suspended, ${unblocked.length} restored`, html: brandFrame(inner, { footerLabel: 'Operations' }) }).catch(() => {})
      }
    }

    if (!resendKey || allOverdue.length === 0) {
      return res.status(200).json({ marked: nowOverdue.length, reminded: 0, charged: charged.length, notified: chargeNotified.length, chargeFailed, blocked, unblocked })
    }

    // 4. Send reminder emails (one per tenant, listing all overdue invoices).
    // Throttled: an invoice triggers a reminder the day it goes overdue, then
    // every REMIND_EVERY_DAYS, and never more than MAX_REMINDERS times — so
    // nobody gets dunned daily forever. A newly-overdue invoice restarts the
    // cycle for its company; the email still lists ALL their overdue invoices.
    const REMIND_EVERY_DAYS = 3
    const MAX_REMINDERS = 6
    const remindCutoff = (() => { const d = new Date(`${todayStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - REMIND_EVERY_DAYS); return d.toISOString().split('T')[0] })()
    const dueForReminder = (inv) =>
      (inv.remindersSent ?? 0) < MAX_REMINDERS &&
      (!inv.lastReminderAt || inv.lastReminderAt <= remindCutoff)

    const byTenant = {}
    for (const inv of allOverdue) {
      if (!byTenant[inv.tenantId]) byTenant[inv.tenantId] = []
      byTenant[inv.tenantId].push(inv)
    }

    let reminded = 0
    for (const [tenantId, invs] of Object.entries(byTenant)) {
      if (!invs.some(dueForReminder)) continue
      const tenant = tenants.find((t) => t.id === tenantId)
      const reminderEmail = billingEmailFor(tenant, members)
      if (!reminderEmail) continue

      // Every listed invoice gets a public pay link (minted once, persisted in
      // the reminder stamp below so re-sends keep the same link).
      for (const inv of invs) {
        if (!inv.payToken) inv.payToken = randomBytes(18).toString('base64url')
      }
      const payLink = (inv) => `https://portal.hexaspace.com.au/pay/${inv.id}?t=${inv.payToken}`

      const invoiceRows = invs.map((inv) => {
        const sub = (inv.lineItems ?? []).reduce((s, l) => {
          return s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100
        }, 0)
        const gst = inv.vatEnabled !== false ? Math.round(sub * 0.1 * 100) / 100 : 0
        const total = sub + gst
        return [inv.number, `Due ${inv.dueDate} · $${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD · <a href="${payLink(inv)}" style="color:#7F8B2F">Pay online</a>`, true]
      })

      const inner =
        bKicker('Payment Reminder') +
        bH1(`${invs.length} overdue invoice${invs.length > 1 ? 's' : ''}`) +
        bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
        bP('The following invoice(s) are overdue. Please arrange payment at your earliest convenience.') +
        bTable(invoiceRows) +
        (invs.length === 1 ? bBtn('Pay this invoice online', payLink(invs[0])) : '') +
        (settings?.billingRules?.blockOverdueAccess === true
          ? bP(`<strong>Please note:</strong> if payment isn't received within ${Number(settings?.billingRules?.blockGraceDays ?? 14)} days of the due date, door access for your team will be suspended until the balance is cleared, per clause 7(d) of your licence agreement (a $100 re-activation fee may apply).`)
          : '') +
        bP('Please contact us if you have any questions regarding your account.') +
        bSmall(`This is an automated reminder from ${fromName}.`)
      const html = brandFrame(inner, { footerLabel: 'Accounts' })

      await sendResendEmail({
        from: `${fromName} <${fromEmail}>`,
        to: reminderEmail,
        subject: `Payment reminder — ${invs.length} overdue invoice${invs.length > 1 ? 's' : ''} from ${fromName}`,
        html,
      })
      reminded++
      // Stamp every invoice the email listed so the whole set shares one
      // reminder cycle (and each invoice's cap counts down together).
      for (const inv of invs) {
        await supabase.from('invoices').update({
          data: { ...inv, lastReminderAt: todayStr, remindersSent: (inv.remindersSent ?? 0) + 1 },
        }).eq('id', inv.id)
      }
    }

    return res.status(200).json({ marked: nowOverdue.length, reminded, charged: charged.length, notified: chargeNotified.length, chargeFailed, blocked, unblocked })
  } catch (err) {
    console.error('Overdue reminders error:', err)
    return res.status(500).json({ error: err.message })
  }
}
