// GET/POST /api/reconcile — daily lifecycle housekeeping (Vercel cron, ~6:30am
// Melbourne). The admin app only reconciles state when someone loads it; this
// cron closes the gaps in between:
//
//   1. Commencement flips — a paid-up (gate-met) contract whose start date has
//      arrived flips its space reserved → occupied.
//   2. Onboarding catch-up — gate-met leases never onboarded (e.g. the deposit
//      was marked paid via Stripe webhook or Xero pull while no admin had the
//      app open) get the welcome email + portal invite. Salto is skipped
//      entirely (not configured).
//   3. Vacate-date expiry — active leases whose served notice's vacateDate has
//      passed are set to expired with needsOffboard: true; the admin app runs
//      the full offboarding cascade (free spaces, parking, bond refund) on next
//      load. The flag keeps legacy ended leases out of the cascade.
//   4. Bond-refund SLA — approved refunds older than 45 days with no payout
//      recorded are flagged (T&C promises refund within 60 days).
//   4b. Overdue auto-cancellation (opt-in) — a company whose OLDEST unpaid
//      invoice is 90+ days past due gets escalating cancellation warnings, then
//      its memberships are terminated (needsOffboard) and step 5 revokes KS
//      access. Paying off clears the state. OFF unless Settings → Billing Rules.
//   5. Salto sweep — revokes door access for anyone whose company holds no live
//      contract (also the safety net for step 4b terminations, same run).
//
// ?dryRun=1 reports what WOULD happen without writing or emailing anything.
// One admin digest email is sent when anything was done or found.

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { buildDirectoryBoard } from '../src/lib/directoryAuto.js'
import { sendResendEmail, billingEmailFor } from './_email.js'
import { brandFrame, bKicker, bH1, bH2, bP, bSmall, bPanel, bBtn, SANS, INK, MUTE } from './_brand.js'
import {
  requiresAccessGate, accessGateMet, shouldOnboard, requiresCardOnFile,
  renderOnboardingTemplate, resolveOnboardingCopy, onboardingEmailHtml,
} from '../src/lib/onboarding.js'
import { invitePortalUser } from './_invite.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function pickPrimaryContact(tenant, members) {
  const mine = (members ?? []).filter((m) => m.companyId === tenant?.id)
  return mine.find((m) => m.contactPerson) ?? mine.find((m) => m.billingPerson) ?? mine[0] ?? null
}

const money = (n) => `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`

// Outstanding total for an invoice — same computation as the overdue-reminders
// email (subtotal from line items + GST), falling back to a stored total.
function invoiceTotal(inv) {
  const sub = (inv.lineItems ?? []).reduce(
    (s, l) => s + Math.round((l.unitPrice ?? 0) * (l.qty ?? 0) * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
  const gst = inv.vatEnabled !== false ? Math.round(sub * 0.1 * 100) / 100 : 0
  return inv.total ?? Math.round((sub + gst) * 100) / 100
}

// Render an overdue email. Prefers the admin-editable template (Templates →
// emailType 'overdue_final_warning' / 'membership_cancelled'); falls back to a
// built-in. `v` is the placeholder map. Returns { subject, html }.
function renderOverdueEmail(kind, v, templates) {
  const type = kind === 'cancelled' ? 'membership_cancelled'
    : kind === 'pending' ? 'overdue_pending_cancellation' : 'overdue_final_warning'
  const fill = (s) => String(s || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m))
  const tpl = (templates ?? []).find((t) => t.category === 'email' && t.emailType === type && t.content)
  if (tpl) {
    const subject = fill(tpl.subject) || (kind === 'cancelled'
      ? `Membership cancelled — overdue account (${v.company})`
      : `Action required — membership cancels ${v.cancelDate} unless paid (${v.company})`)
    return { subject, html: brandFrame(fill(tpl.content), { footerLabel: 'Accounts' }) }
  }
  if (kind === 'pending') {
    const inner =
      bKicker('Final Notice') +
      bH1('Your membership is pending cancellation') +
      bP(`Hi ${v.tenantName},`) +
      bP(`The outstanding balance of <strong>${v.amountOwing}</strong> on ${v.company}'s account is now <strong>${v.daysOverdue} days overdue</strong>. Your membership has been referred for cancellation in line with your licence agreement.`) +
      bP(`<strong>Immediate payment is required to keep your membership.</strong> If the balance is settled before cancellation is finalised, your membership continues unaffected — pay online from the portal or by bank transfer.`) +
      bP('If you believe this is in error, or you\'d like to discuss a payment arrangement, reply to this email today.') +
      bSmall('Automated account notice from Hexa Space.')
    return { subject: `FINAL NOTICE — membership pending cancellation (${v.company})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }
  }
  if (kind === 'cancelled') {
    const inner =
      bKicker('Membership Cancelled') +
      bH1('Your membership has been cancelled') +
      bP(`Hi ${v.tenantName},`) +
      bP(`As the outstanding balance of <strong>${v.amountOwing}</strong> on ${v.company}'s account remained unpaid for more than ${v.daysOverdue} days, your membership has been cancelled in line with your licence agreement, and your team's door access has been revoked.`) +
      bP('The outstanding balance remains payable. To discuss settling the account or reinstating your membership, please reply to this email.') +
      bSmall('Automated account notice from Hexa Space.')
    return { subject: `Membership cancelled — overdue account (${v.company})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }
  }
  const inner =
    bKicker('Final Notice') +
    bH1('Your membership is at risk') +
    bP(`Hi ${v.tenantName},`) +
    bP(`Our records show ${v.company} has an outstanding balance of <strong>${v.amountOwing}</strong>, with the oldest invoice now <strong>${v.daysOverdue} days</strong> overdue.`) +
    bP(`Under your licence agreement, if this balance isn't cleared your membership will be <strong>cancelled on ${v.cancelDate}</strong> — ${v.daysUntilCancel} day(s) from now — and your team's door access permanently revoked.`) +
    bP('Please pay the outstanding invoice(s) in the member portal, or reply to this email to arrange a payment plan.') +
    bBtn('View & pay in the portal', v.portalUrl) +
    bSmall('Automated account notice from Hexa Space.')
  return { subject: `Action required — membership cancels ${v.cancelDate} unless paid (${v.company})`, html: brandFrame(inner, { footerLabel: 'Accounts' }) }
}

const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '')

// Renewal confirmation email — editable template 'renewal_confirmation' with a
// built-in fallback. `v` is the placeholder map. Returns { subject, html }.
function renderRenewalEmail(v, templates) {
  const fill = (s) => String(s || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m))
  const tpl = (templates ?? []).find((t) => t.category === 'email' && t.emailType === 'renewal_confirmation' && t.content)
  if (tpl) {
    return {
      subject: fill(tpl.subject) || `Your membership has renewed — ${v.contract}`,
      html: brandFrame(fill(tpl.content), { footerLabel: 'Memberships' }),
    }
  }
  const inner =
    bKicker('Membership Renewed') +
    bH1('Your membership has renewed') +
    bP(`Hi ${v.tenantName},`) +
    bP(`As no notice was given, your membership for <strong>${v.unit}</strong> (${v.contract}) has automatically renewed on the same terms — there's nothing you need to do.`) +
    bP(`It now runs through <strong>${v.newEndDate}</strong>${v.monthlyRent ? ` at ${v.monthlyRent}/month + GST` : ''}.`) +
    (v.giveNoticeUrl ? bP(`Not planning to continue? You can <a href="${v.giveNoticeUrl}" style="color:#1a1a1a;font-weight:600;text-decoration:underline">give notice here</a> — your membership runs until the end of your committed term.`) : '') +
    bP('If you\'d like to make any changes or discuss your membership, just reply to this email.') +
    bSmall('Automated renewal confirmation from Hexa Space.')
  return { subject: `Your membership has renewed — ${v.contract} (through ${v.newEndDate})`, html: brandFrame(inner, { footerLabel: 'Memberships' }) }
}

async function loadTable(supabase, table) {
  const { data, error } = await supabase.from(table).select('id, data')
  if (error) throw new Error(`${table}: ${error.message}`)
  return (data ?? []).map((r) => ({ ...r.data, id: r.data?.id ?? r.id }))
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()

  // Cron or verified admin only — mutates lease/space state + sends onboarding.
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const dryRun = req.query?.dryRun === '1' || req.body?.dryRun === true

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set.' })
  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const resendKey = process.env.RESEND_API_KEY

  const saveRow = async (table, id, data) => {
    if (dryRun) return
    const { error } = await supabase.from(table).upsert({ id, data, updated_at: new Date().toISOString() })
    if (error) throw new Error(`${table}/${id}: ${error.message}`)
  }

  try {
    const [leases, invoices, spaces, tenants, members, settRows, tmplRows] = await Promise.all([
      loadTable(supabase, 'leases'),
      loadTable(supabase, 'invoices'),
      loadTable(supabase, 'spaces'),
      loadTable(supabase, 'tenants'),
      loadTable(supabase, 'members'),
      supabase.from('settings').select('data').eq('id', 'global').single(),
      supabase.from('templates').select('data'),
    ])
    const settings = settRows?.data?.data ?? {}
    const templates = (tmplRows?.data ?? []).map((r) => r.data)

    const today = new Date()
    const todayISO = today.toISOString().split('T')[0]
    const out = { occupied: [], onboarded: [], onboardedSuppressed: [], expired: [], bondOverdue: [], errors: [] }

    // ── 1. Commencement flips (reserved → occupied only; never demote) ──────
    const flippedLeaseIds = new Set()
    for (const lease of leases) {
      if (lease.status !== 'active') continue
      if (!requiresAccessGate(lease) || !accessGateMet(lease, invoices, tenants.find((t) => t.id === lease.tenantId))) continue
      if (lease.startDate && lease.startDate > todayISO) continue
      const space = spaces.find((s) => s.id === lease.spaceId)
      if (!space || space.status !== 'reserved') continue
      if (space.occupantTenantId && space.occupantTenantId !== lease.tenantId) continue
      try {
        await saveRow('spaces', space.id, { ...space, status: 'occupied' })
        space.status = 'occupied'
        flippedLeaseIds.add(lease.id)
        out.occupied.push(`${space.unitNumber ?? space.id} → occupied (${lease.contractNumber ?? lease.id})`)
      } catch (e) { out.errors.push(e.message) }
    }

    // ── 2. Onboarding catch-up (gate met, never onboarded) ──────────────────
    for (const lease of leases) {
      const tenant = tenants.find((t) => t.id === lease.tenantId)
      if (!shouldOnboard(lease, invoices, tenant)) continue
      const space = spaces.find((s) => s.id === lease.spaceId)
      const label = `${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id})`
      try {
        // Mirror the in-app rule: a space that was ALREADY occupied before the
        // gate cleared means the tenant moved in long ago — stamp, don't email.
        // (Freshly cron-flipped spaces in step 1 record their leases in
        // out.occupied, so they still onboard normally below.)
        if (space?.status === 'occupied' && !flippedLeaseIds.has(lease.id)) {
          await saveRow('leases', lease.id, { ...lease, onboardedAt: lease.activatedAt ?? new Date().toISOString() })
          out.onboardedSuppressed.push(label)
          continue
        }
        const primary = pickPrimaryContact(tenant, members)
        const email = primary?.email || tenant?.email
        if (!email) continue // retries daily until a contact email exists

        if (!dryRun) {
          // Stamp first so a crash can't double-send tomorrow.
          await saveRow('leases', lease.id, { ...lease, onboardedAt: new Date().toISOString(), activatedAt: lease.activatedAt ?? new Date().toISOString() })

          // Welcome email — editable template first, built-in fallback. No Salto.
          if (resendKey) {
            const onbTpl = templates.find((t) => t.category === 'email' && t.emailType === 'onboarding' && t.content)
            const rendered = onbTpl
              ? renderOnboardingTemplate({ template: onbTpl, lease, tenant, space, settings, saltoLink: null })
              : { subject: resolveOnboardingCopy({ lease, tenant, space, settings }).subject, html: onboardingEmailHtml({ lease, tenant, space, settings, saltoLink: null }) }
            await sendResendEmail({
              from: 'Hexa Space <info@hexaspace.com.au>',
              to: [email], subject: rendered.subject, html: rendered.html,
            }).catch((e) => out.errors.push(`onboarding email ${label}: ${e.message}`))
          }

          // Portal invite (Supabase auth user + set-password email)
          const inv = await invitePortalUser({ email })
          if (!inv.ok) out.errors.push(`portal invite ${label}: ${inv.error}`)
          else if (primary) await saveRow('members', primary.id, { ...primary, portalAccess: true })
        }
        out.onboarded.push(`${label} → ${email}`)
      } catch (e) { out.errors.push(`onboard ${label}: ${e.message}`) }
    }

    // ── 2b. Card-on-file chaser ──────────────────────────────────────────────
    // Card-required memberships (VO/desk) whose client has SIGNED but never
    // completed the Stripe card step: onboarding is held (see accessGateMet),
    // so chase them — first nudge 24h after signing, then every 2 days, up to
    // 5 reminders. The link re-opens their signing page, which shows the
    // "verify your payment card" step until a card is on file.
    out.cardReminders = []
    const H24 = 24 * 3600 * 1000
    for (const lease of leases) {
      if (!requiresCardOnFile(lease)) continue
      if (['expired', 'cancelled', 'terminated'].includes(String(lease.status))) continue
      const signedAt = lease.tenantSignedAt || lease.signedAt
      const hasSigned = signedAt || ['e_signed', 'manually_signed'].includes(String(lease.signatureStatus))
      if (!hasSigned) continue
      const tenant = tenants.find((t) => t.id === lease.tenantId)
      if (!tenant || tenant.stripePaymentMethodId) continue
      if (!lease.eSignMemberLink) continue // no signing page to send them back to
      if (signedAt && Date.now() - new Date(signedAt).getTime() < H24) continue
      if (lease.cardReminderAt && Date.now() - new Date(lease.cardReminderAt).getTime() < 2 * H24) continue
      if ((lease.cardRemindersSent ?? 0) >= 5) continue

      const primary = pickPrimaryContact(tenant, members)
      const email = tenant.email || primary?.email
      const label = `${tenant.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id})`
      if (!email) continue
      try {
        if (!dryRun) {
          await saveRow('leases', lease.id, {
            ...lease,
            cardReminderAt: new Date().toISOString(),
            cardRemindersSent: (lease.cardRemindersSent ?? 0) + 1,
          })
          if (resendKey) {
            const inner =
              bKicker('One Step Left') +
              bH1('Register your payment card 💳') +
              `<p style="font-family:${SANS};font-size:14px;line-height:1.7;color:${MUTE};margin:0 0 12px">Hi ${tenant.contactName ?? primary?.name ?? 'there'}, thanks for signing <strong style="color:${INK}">${lease.contractNumber ?? 'your agreement'}</strong>. As set out in its payment authority, your membership needs a payment card securely on file with Stripe before we can complete your onboarding — it's only ever charged for amounts owing under the agreement (e.g. overdue invoices).</p>` +
              bBtn('Verify your card — takes a minute', lease.eSignMemberLink) +
              `<p style="font-family:${SANS};font-size:12px;color:${MUTE};margin:14px 0 0">Card details are held by Stripe — Hexa Space never sees the number. Your access and welcome pack follow as soon as it's done.</p>`
            await sendResendEmail({
              from: 'Hexa Space <info@hexaspace.com.au>',
              to: [email],
              subject: `One step left — register your card for ${lease.contractNumber ?? 'your membership'}`,
              html: brandFrame(inner, { footerLabel: 'Memberships' }),
            }).catch((e) => out.errors.push(`card reminder ${label}: ${e.message}`))
          }
        }
        out.cardReminders.push(`${label} → ${email} (#${(lease.cardRemindersSent ?? 0) + 1})`)
      } catch (e) { out.errors.push(`card reminder ${label}: ${e.message}`) }
    }

    // ── 3. Vacate-date expiry (notice served, date passed) ──────────────────
    for (const lease of leases) {
      if (lease.status !== 'active' || !lease.noticeGiven || !lease.vacateDate) continue
      if (lease.vacateDate > todayISO) continue
      try {
        await saveRow('leases', lease.id, { ...lease, status: 'expired', needsOffboard: true })
        lease.status = 'expired'; lease.needsOffboard = true // step 5 sweep revokes this run
        const tenant = tenants.find((t) => t.id === lease.tenantId)
        out.expired.push(`${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id}) — vacate date ${lease.vacateDate}`)
      } catch (e) { out.errors.push(e.message) }
    }

    // ── 3b. Term-end expiry (fixed term ended, NOT renewing) ────────────────
    // A lease past its end date that is explicitly non-renewing — autoRenew
    // === false or renewalDeclined — never lapses on its own: the admin app's
    // auto-renew loop skips it, and step 3 only covers served notice. Left as
    // is, the company keeps counting as "live" so the step-5 Salto sweep never
    // revokes. We expire it here (→ needsOffboard → offboard cascade + revoke).
    //
    // RENEWING leases (the default: autoRenew !== false, not declined) are
    // deliberately untouched — the admin app rolls their term forward and bills
    // the new period on load. We don't duplicate that roll-forward server-side
    // because it's coupled to the bill run; mirroring it here risks double
    // renewals / unbilled periods. A renewing membership simply continues.
    for (const lease of leases) {
      if (lease.status !== 'active') continue
      if (!(lease.autoRenew === false || lease.renewalDeclined)) continue // only non-renewing
      if (lease.pendingRenewalApproval || lease.noticeGiven) continue // renewal / notice paths own these
      if (lease.needsOffboard || lease.offboardedAt) continue
      if (!lease.endDate || lease.endDate >= todayISO) continue
      try {
        await saveRow('leases', lease.id, { ...lease, status: 'expired', needsOffboard: true, expiredReason: 'term_ended_no_renewal' })
        lease.status = 'expired'; lease.needsOffboard = true // step 5 sweep revokes this run
        const tenant = tenants.find((t) => t.id === lease.tenantId)
        out.expired.push(`${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id}) — term ended ${lease.endDate}, not renewing`)
      } catch (e) { out.errors.push(e.message) }
    }

    // ── 4. Bond-refund SLA (approved > 45 days, no payout recorded) ─────────
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 45)
    for (const inv of invoices) {
      if (inv.invoiceType !== 'bond_refund' || inv.approvalStatus !== 'approved') continue
      if (inv.status === 'paid' || inv.refundedAt) continue
      if (!inv.approvedAt || new Date(inv.approvedAt) > cutoff) continue
      const tenant = tenants.find((t) => t.id === inv.tenantId)
      out.bondOverdue.push(`${inv.number ?? inv.id} — ${tenant?.businessName ?? inv.tenantId} (approved ${String(inv.approvedAt).split('T')[0]}; T&C promises refund within 60 days)`)
    }

    // ── 4b. Overdue auto-cancellation (opt-in, destructive) ─────────────────
    // Oldest-invoice clock: a company whose OLDEST unpaid past-due invoice is
    // `cancelDays` (default 90) days old gets escalating cancellation warnings,
    // then — if still unpaid — every active/pending lease is terminated with
    // needsOffboard (the admin app runs the full offboard cascade on next load;
    // step 5 below revokes KS access this run). Paying off clears the warning
    // state. Opt-in + per-tenant exemptable (tenant.autoCancelExempt) + dry-run
    // aware because it cancels memberships and revokes access.
    out.overdueWarned = []; out.overdueCancelled = []; out.overduePendingApproval = []
    const acOn = settings?.billingRules?.autoCancelOverdue === true
    if (acOn) {
      const cancelDays = Number(settings?.billingRules?.autoCancelDays) > 0
        ? Number(settings.billingRules.autoCancelDays) : 90
      const warnBefore = (Array.isArray(settings?.billingRules?.autoCancelWarnDaysBefore)
        && settings.billingRules.autoCancelWarnDaysBefore.length
        ? settings.billingRules.autoCancelWarnDaysBefore : [30, 14, 3])
        .map(Number).filter((n) => n > 0 && n < cancelDays)
      // Days-overdue thresholds at which each warning fires, e.g. [60, 76, 87].
      const warnThresholds = [...new Set(warnBefore.map((d) => cancelDays - d))].sort((a, b) => a - b)
      const firstWarn = warnThresholds[0] ?? cancelDays

      const daysSince = (iso) =>
        Math.floor((new Date(`${todayISO}T00:00:00Z`) - new Date(`${iso}T00:00:00Z`)) / 86400000)
      const addDaysISO = (iso, n) => {
        const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]
      }
      // Only debts from the platform-billing era drive cancellation — the
      // migrated pre-July-2026 balances are unreliable as-recorded (Xero is
      // truth for those) and are a manual collections matter, not grounds for
      // an automated final notice. Configurable via billingRules.autoCancelSince.
      const sinceISO = settings?.billingRules?.autoCancelSince || '2026-07-01'
      const isUnpaidDue = (inv) =>
        inv.invoiceType !== 'bond_refund' && inv.voided !== true &&
        !['paid', 'void', 'cancelled', 'draft'].includes(String(inv.status)) &&
        inv.dueDate && inv.dueDate < todayISO && inv.dueDate >= sinceISO

      const fromName = settings?.emails?.fromName || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'info@hexaspace.com.au'
      const from = `${fromName} <${fromEmail}>`
      const portalUrl = 'https://portal.hexaspace.com.au'
      const website = settings?.company?.website || 'hexaspace.com.au'
      // Admin copies of every stage (warnings, final notice, cancellation).
      const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]

      for (const tenant of tenants) {
        if (tenant.autoCancelExempt === true || tenant.overdueCancelledAt) continue
        // Cancellation is about LIVE memberships. Companies with nothing to
        // cancel (former members, migrated historical debts) are a collections
        // matter, not a cancellation workflow — never warn or final-notice them.
        const hasLiveMembership = leases.some((l) => l.tenantId === tenant.id
          && ['active', 'pending'].includes(String(l.status)) && !l.offboardedAt)
        if (!hasLiveMembership) continue
        const overdue = invoices.filter((inv) => inv.tenantId === tenant.id && isUnpaidDue(inv))
        const warned = Array.isArray(tenant.overdueCancelWarned) ? tenant.overdueCancelWarned : []

        // Paid off (or never overdue) → clear warning AND pending state — a
        // settled account is never cancelled, even if approval was requested.
        if (overdue.length === 0) {
          if (warned.length || tenant.overdueCancelPending || tenant.overdueCancelApproved) {
            await saveRow('tenants', tenant.id, { ...tenant, overdueCancelWarned: [], overdueCancelPending: null, overdueCancelApproved: null })
          }
          continue
        }

        const oldestDue = overdue.reduce((min, inv) => (inv.dueDate < min ? inv.dueDate : min), overdue[0].dueDate)
        const daysOverdue = daysSince(oldestDue)
        if (daysOverdue < firstWarn) continue // not yet in warning territory

        const amountOwing = money(Math.round(overdue.reduce((s, inv) => s + invoiceTotal(inv), 0) * 100) / 100)
        const cancelDate = addDaysISO(oldestDue, cancelDays)
        const to = billingEmailFor(tenant, members)
        const label = `${tenant.businessName ?? tenant.id} — ${daysOverdue}d overdue, ${amountOwing}`
        const vars = {
          company: tenant.businessName ?? '', tenantName: tenant.contactName ?? tenant.businessName ?? 'there',
          amountOwing, daysOverdue, daysUntilCancel: Math.max(0, cancelDays - daysOverdue),
          cancelDate, oldestDueDate: oldestDue, portalUrl, website,
        }

        // AT/AFTER the cutoff: cancellation ALWAYS requires an admin's click.
        if (daysOverdue >= cancelDays) {
          // Approved by an admin (company profile → Approve cancellation) →
          // terminate now and notify the client (admin bcc'd).
          if (tenant.overdueCancelApproved) {
            const live = leases.filter((l) => l.tenantId === tenant.id
              && ['active', 'pending'].includes(String(l.status)) && !l.offboardedAt)
            if (!dryRun) {
              for (const l of live) {
                await saveRow('leases', l.id, {
                  ...l, status: 'terminated', needsOffboard: true,
                  terminatedAt: new Date().toISOString(), terminationReason: 'overdue_approved',
                })
                l.status = 'terminated'; l.needsOffboard = true // step 5 must see no live lease
              }
              await saveRow('tenants', tenant.id, { ...tenant, overdueCancelledAt: todayISO, overdueCancelPending: null })
            }
            if (resendKey && to) {
              const em = renderOverdueEmail('cancelled', vars, templates)
              await sendResendEmail({ from, to, bcc: adminTo, subject: em.subject, html: em.html })
                .catch((e) => out.errors.push(`cancel email ${label}: ${e.message}`))
            }
            out.overdueCancelled.push(`${label}${live.length ? '' : ' (no live lease)'}`)
            continue
          }

          // Not yet approved → enter (or remain in) pending-approval: one final
          // notice to the client + an approval request to the admins, then it
          // waits — listed in the daily digest until approved, exempted or paid.
          if (!tenant.overdueCancelPending) {
            if (!dryRun) await saveRow('tenants', tenant.id, { ...tenant, overdueCancelPending: todayISO })
            if (resendKey) {
              if (to) {
                const em = renderOverdueEmail('pending', vars, templates)
                await sendResendEmail({ from, to, bcc: adminTo, subject: em.subject, html: em.html })
                  .catch((e) => out.errors.push(`pending email ${label}: ${e.message}`))
              }
              const adminInner =
                bKicker('Cancellation approval needed') +
                bH1(`${tenant.businessName ?? tenant.id}`) +
                bP(`<strong>${vars.amountOwing}</strong> outstanding · oldest invoice <strong>${daysOverdue} days overdue</strong> (due ${dmy(oldestDue)}).`) +
                bP(`The cut-off has passed and the client has been sent their final notice. <strong>Nothing is cancelled until you approve it</strong> — open the company profile in the admin portal and click “Approve cancellation”, or mark them exempt to stop the process.`) +
                bBtn('Open the admin portal', `${portalUrl}/companies`) +
                bSmall('Sent by the daily reconcile. This company stays listed in the daily digest until actioned.')
              await sendResendEmail({
                from, to: adminTo,
                subject: `Approval needed — cancel ${tenant.businessName ?? tenant.id}? (${daysOverdue}d overdue, ${vars.amountOwing})`,
                html: brandFrame(adminInner, { footerLabel: 'Accounts' }),
              }).catch((e) => out.errors.push(`approval email ${label}: ${e.message}`))
            }
          }
          out.overduePendingApproval.push(`${label} — awaiting admin approval${tenant.overdueCancelPending ? ` since ${dmy(tenant.overdueCancelPending)}` : ''}`)
          continue
        }

        // WARN: fire the highest unsent threshold at or below daysOverdue, and
        // mark every threshold ≤ daysOverdue as sent so a mid-cycle appearance
        // can't backfill a burst of lower-stage warnings.
        const unsent = warnThresholds.filter((t) => t <= daysOverdue && !warned.includes(t))
        if (unsent.length === 0) continue
        if (resendKey && to) {
          const em = renderOverdueEmail('warning', vars, templates)
          await sendResendEmail({ from, to, bcc: adminTo, subject: em.subject, html: em.html })
            .catch((e) => out.errors.push(`warn email ${label}: ${e.message}`))
        }
        if (!dryRun) {
          const nextWarned = [...new Set([...warned, ...warnThresholds.filter((t) => t <= daysOverdue)])]
          await saveRow('tenants', tenant.id, { ...tenant, overdueCancelWarned: nextWarned })
        }
        out.overdueWarned.push(`${label} → cancels in ${vars.daysUntilCancel}d`)
      }
    }

    // ── 4c. Auto-renew roll-forward + confirmation ──────────────────────────
    // Server-side mirror of the admin app's auto-renew (useStore ~L900), so a
    // membership renews on its PREVIOUS terms even if nobody opens the app.
    // Runs AFTER overdue auto-cancel so a company being cancelled for non-payment
    // (its leases flipped 'terminated' in-memory above) is skipped by the
    // status guard — you don't renew a membership you're cancelling.
    //   (a)  roll the term forward for active, non-declining leases past endDate
    //   (a2) auto-approve if Settings → Billing Rules → autoApproveRenewals
    //   (b)  send the tenant a one-time renewal-confirmation email once approved
    // Billing stays with the admin-app bill run (endDate is rolled here so it
    // bills the new period on next load); we don't invoice from the cron.
    out.renewed = []; out.renewalEmailed = []
    const autoApproveRenewals = settings?.billingRules?.autoApproveRenewals === true
    // A SIGNED renewal contract (created via the Renew action, activated at
    // countersign) supersedes its predecessor: the old contract must neither
    // auto-roll (double contract, double billing) nor offboard (the tenant is
    // staying — the successor holds the space). An UNSIGNED renewal (still
    // 'pending') changes nothing: the old contract keeps rolling as usual.
    const hasActiveSuccessor = (lease) =>
      leases.some((x) => x.previousContractId === lease.id && x.status === 'active')
    for (const lease of leases) {
      if (lease.status !== 'active') continue

      // Superseded → hand over at term end: expire quietly, no offboarding.
      if (lease.endDate && lease.endDate < todayISO && hasActiveSuccessor(lease)) {
        if (!dryRun) await saveRow('leases', lease.id, { ...lease, status: 'expired', expiredReason: 'superseded_by_renewal' })
        Object.assign(lease, { status: 'expired', expiredReason: 'superseded_by_renewal' })
        const tenant = tenants.find((t) => t.id === lease.tenantId)
        out.expired.push(`${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id}) — superseded by signed renewal`)
        continue
      }

      // (a) roll-forward when the term has ended and the lease isn't opting out.
      const canRoll = lease.autoRenew !== false && !lease.renewalDeclined
        && !lease.pendingRenewalApproval && !lease.needsOffboard && !lease.offboardedAt
        && lease.endDate && lease.endDate < todayISO && !lease.noticeGiven
        && !hasActiveSuccessor(lease)
      if (canRoll) {
        const end = new Date(`${lease.endDate}T00:00:00Z`)
        const start = new Date(`${lease.startDate ?? lease.endDate}T00:00:00Z`)
        const termMs = end - start
        const newEnd = new Date(end.getTime() + (termMs > 0 ? termMs : 365 * 86400000)).toISOString().split('T')[0]
        const patch = {
          previousEndDate: lease.endDate, endDate: newEnd,
          autoRenewedAt: new Date().toISOString(), renewalCount: (lease.renewalCount ?? 0) + 1,
          pendingRenewalApproval: !autoApproveRenewals,
          ...(autoApproveRenewals ? { renewalApprovedAt: new Date().toISOString() } : {}),
        }
        if (!dryRun) await saveRow('leases', lease.id, { ...lease, ...patch })
        Object.assign(lease, patch)
        const tenant = tenants.find((t) => t.id === lease.tenantId)
        out.renewed.push(`${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id}) → ${newEnd}${autoApproveRenewals ? ' (auto-approved)' : ' (pending approval)'}`)
      }

      // (a2) auto-approve an already-rolled-but-pending lease when the setting is on
      // (e.g. the admin app rolled it before this setting was turned on).
      if (autoApproveRenewals && lease.pendingRenewalApproval && lease.autoRenewedAt) {
        const patch = { pendingRenewalApproval: false, renewalApprovedAt: new Date().toISOString() }
        if (!dryRun) await saveRow('leases', lease.id, { ...lease, ...patch })
        Object.assign(lease, patch)
      }

      // (b) one-time confirmation email once an auto-renewal is approved.
      const approved = lease.autoRenewedAt && !lease.pendingRenewalApproval
      const notYetEmailed = !lease.renewalConfirmSentAt || lease.renewalConfirmSentAt < lease.autoRenewedAt
      if (approved && notYetEmailed) {
        const tenant = tenants.find((t) => t.id === lease.tenantId)
        const to = billingEmailFor(tenant, members)
        if (resendKey && to) {
          const space = spaces.find((s) => s.id === lease.spaceId)
          // Per-lease token behind the self-serve "give notice" link.
          if (!lease.noticeToken) Object.assign(lease, { noticeToken: randomUUID() })
          const em = renderRenewalEmail({
            company: tenant?.businessName ?? '', tenantName: tenant?.contactName ?? tenant?.businessName ?? 'there',
            unit: space?.unitNumber ?? 'your space', contract: lease.contractNumber ?? lease.id,
            newEndDate: dmy(lease.endDate), previousEndDate: dmy(lease.previousEndDate),
            monthlyRent: lease.monthlyRent ? money(lease.monthlyRent) : '',
            giveNoticeUrl: `https://portal.hexaspace.com.au/give-notice/${lease.noticeToken}`,
            portalUrl: 'https://portal.hexaspace.com.au', website: settings?.company?.website || 'hexaspace.com.au',
          }, templates)
          await sendResendEmail({
            from: `${settings?.emails?.fromName || 'Hexa Space'} <${settings?.emails?.fromEmail || 'info@hexaspace.com.au'}>`,
            to, subject: em.subject, html: em.html,
          }).catch((e) => out.errors.push(`renewal email ${lease.contractNumber ?? lease.id}: ${e.message}`))
        }
        if (!dryRun) await saveRow('leases', lease.id, { ...lease, renewalConfirmSentAt: new Date().toISOString() })
        Object.assign(lease, { renewalConfirmSentAt: new Date().toISOString() })
        out.renewalEmailed.push(`${tenant?.businessName ?? lease.tenantId} (${lease.contractNumber ?? lease.id})`)
      }
    }

    // ── 5. Salto access sweep (safety net) ──────────────────────────────────
    // The offboard cascade fires revoke zaps from the ADMIN APP; if nobody
    // opened it (or a zap call failed silently), an ex-member keeps door
    // access. This sweep catches stragglers server-side: any member still
    // flagged saltoAccess whose company holds no live contract — or who is
    // Former/archived — gets the remove_user zap re-fired and the flag
    // cleared. With no webhook configured they're listed for manual removal.
    out.saltoSwept = []
    const liveCompanyIds = new Set(
      leases.filter((l) => ['active', 'pending'].includes(String(l.status))).map((l) => l.tenantId)
    )
    const revokeHook = process.env.SALTO_REVOKE_WEBHOOK
    for (const m of members) {
      if (m.saltoAccess !== true) continue
      const memberGone = ['Former', 'archived'].includes(String(m.status))
      const companyGone = !m.companyId || !liveCompanyIds.has(m.companyId)
      if (!memberGone && !companyGone) continue
      const label = `${m.name ?? m.email ?? m.id} (${tenants.find((t) => t.id === m.companyId)?.businessName ?? 'no company'}) — ${memberGone ? 'member removed' : 'no live contract'}`
      if (!revokeHook) { out.saltoSwept.push(`${label} — NO WEBHOOK, remove manually in KS`); continue }
      try {
        if (!dryRun) {
          const r = await fetch(revokeHook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove_user', email: m.email ?? null, saltoUserId: m.saltoUserId ?? null, source: 'hexaspace-platform-sweep' }),
          })
          if (!r.ok) throw new Error(`revoke hook ${r.status}`)
          await saveRow('members', m.id, { ...m, saltoAccess: false, saltoSweptAt: new Date().toISOString() })
        }
        out.saltoSwept.push(label)
      } catch (e) { out.errors.push(`salto sweep ${label}: ${e.message}`) }
    }

    // ── 6. Directory boards — refresh autoSync boards from live data ────────
    // Boards with autoSync ticked (Directory admin) regenerate here daily:
    // suites from office occupancy, community from VO/desk memberships.
    // Hand-edited display text survives while the occupant is unchanged
    // (see src/lib/directoryAuto.js). TVs poll the table, so they follow.
    out.directorySynced = []
    try {
      const { data: dirRows } = await supabase.from('directory_boards').select('id, data')
      for (const row of dirRows ?? []) {
        if (row.data?.autoSync !== true) continue
        const next = buildDirectoryBoard(row.id, row.data, { tenants, leases, spaces })
        if (JSON.stringify(next) !== JSON.stringify(row.data)) {
          await saveRow('directory_boards', row.id, next) // saveRow no-ops on dryRun
          out.directorySynced.push(`Level ${row.id} board refreshed (${next.suites.length} suites, ${next.community.length} community)`)
        }
      }
    } catch (e) { out.errors.push(`directory sync: ${e.message}`) }

    // ── Admin digest (only when something happened or needs attention) ──────
    const anything = out.occupied.length + out.onboarded.length + out.expired.length + out.bondOverdue.length + out.saltoSwept.length + (out.cardReminders?.length ?? 0) + out.overdueWarned.length + out.overdueCancelled.length + out.overduePendingApproval.length + out.renewed.length + out.renewalEmailed.length + out.directorySynced.length + out.errors.length > 0
    if (anything && resendKey && !dryRun) {
      const list = (items) => bPanel(items.map((i) => `<div style="font-family:${SANS};font-size:13px;color:${INK};padding:4px 0">${i}</div>`).join(''))
      const section = (title, items) => items.length ? bH2(title) + list(items) : ''
      const inner =
        bKicker('Daily Reconcile') +
        bH1(todayISO) +
        section(`✓ ${out.occupied.length} space(s) flipped to occupied`, out.occupied) +
        section(`✓ ${out.onboarded.length} member(s) onboarded`, out.onboarded) +
        section(`— ${out.onboardedSuppressed.length} onboarding(s) suppressed (already moved in)`, out.onboardedSuppressed) +
        section(`⚠ ${out.expired.length} lease(s) expired (notice served or term ended)`, out.expired) +
        section(`🔄 ${out.renewed.length} lease(s) auto-renewed`, out.renewed) +
        section(`⚠ ${out.bondOverdue.length} bond refund(s) overdue`, out.bondOverdue) +
        section(`⏳ ${out.overdueWarned.length} cancellation warning(s) sent`, out.overdueWarned) +
        section(`🖐 ${out.overduePendingApproval.length} cancellation(s) AWAITING YOUR APPROVAL`, out.overduePendingApproval) +
        section(`⛔ ${out.overdueCancelled.length} membership(s) cancelled (admin-approved)`, out.overdueCancelled) +
        section(`🔑 ${out.saltoSwept.length} door access revocation(s) swept`, out.saltoSwept) +
        section(`💳 ${(out.cardReminders ?? []).length} card-on-file reminder(s) sent`, out.cardReminders ?? []) +
        section(`📺 ${out.directorySynced.length} directory board(s) refreshed`, out.directorySynced) +
        section(`✗ ${out.errors.length} error(s)`, out.errors) +
        bBtn('Open the admin portal', 'https://portal.hexaspace.com.au')
      const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
      await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: adminTo,
        subject: `Daily reconcile — ${todayISO}`,
        html: brandFrame(inner, { footerLabel: 'Operations' }),
      }).catch(() => {})
    }

    return res.status(200).json({ dryRun, date: todayISO, ...out })
  } catch (err) {
    console.error('reconcile error:', err)
    return res.status(500).json({ error: err.message })
  }
}
