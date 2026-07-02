// Onboarding & access state machine helpers.
//
// A signed contract (lease) only "takes up" its office and grants access once the
// money has landed: the security deposit AND the first recurring invoice are paid.
// This module centralises that gating rule, the schedule-aware space status, the
// onboarding email, and the Salto access-provisioning calls so the store, the
// contract flow and the portal all agree on one definition of "activated".

const PORTAL_URL = 'https://members.hexaspace.com.au'

const SIGNED = ['e_signed', 'manually_signed']

// ── Gating ────────────────────────────────────────────────────────────────────

export function isSigned(lease) {
  return SIGNED.includes(lease?.signatureStatus)
}

export function isEnded(lease) {
  return ['expired', 'terminated'].includes(lease?.status)
}

export function depositAmount(lease) {
  return lease?.items?.[0]?.deposit ?? lease?.bondAmount ?? 0
}

// Does this lease go through the signed-and-paid access gate? Real contracts do
// (they have a signature workflow, a deposit, or contract line items). Bare
// quick-assignments (a desk/park/virtual dropped onto a member) do not — they
// take up their space immediately, exactly as before.
export function requiresAccessGate(lease) {
  if (!lease) return false
  if (lease.signatureStatus) return true
  if (depositAmount(lease) > 0) return true
  if (Array.isArray(lease.items) && lease.items.length > 0) return true
  return false
}

// Invoices raised against this lease that still count (not voided).
export function leaseInvoices(lease, invoices) {
  return (invoices ?? []).filter((i) => i.leaseId === lease?.id && i.status !== 'voided')
}

export function depositInvoice(lease, invoices) {
  return leaseInvoices(lease, invoices).find((i) => i.invoiceType === 'deposit') ?? null
}

// First recurring (membership) invoice for the lease, earliest issue date first.
export function firstRecurringInvoice(lease, invoices) {
  return leaseInvoices(lease, invoices)
    .filter((i) => i.invoiceType !== 'deposit')
    .sort((a, b) => String(a.issueDate ?? '').localeCompare(String(b.issueDate ?? '')))[0] ?? null
}

// The access gate: contract signed, deposit paid (if one is owed), and the first
// recurring invoice paid. Returns false until every required payment has landed.
export function accessGateMet(lease, invoices) {
  if (!isSigned(lease) || isEnded(lease)) return false

  const depositOwed = depositAmount(lease) > 0
  if (depositOwed) {
    const dep = depositInvoice(lease, invoices)
    if (!dep || dep.status !== 'paid') return false
  }

  const first = firstRecurringInvoice(lease, invoices)
  if (!first || first.status !== 'paid') return false

  return true
}

// Schedule-aware desired status for the space this lease occupies:
//   ended            → vacant
//   gate not met     → reserved (contract exists / awaiting payment)
//   gate met, before start date → reserved (held until commencement)
//   gate met, on/after start date → occupied
export function desiredSpaceStatus(lease, invoices, today = new Date()) {
  if (isEnded(lease)) return 'vacant'
  // Quick-assignments (no gate) occupy immediately.
  if (!requiresAccessGate(lease)) return 'occupied'
  if (!accessGateMet(lease, invoices)) return 'reserved'
  const start = lease?.startDate ? new Date(lease.startDate) : null
  if (start && start > today) return 'reserved'
  return 'occupied'
}

// Should onboarding (portal invite + how-tos + Salto access) fire for this lease?
// Fires once the gate is met and it has not been onboarded yet.
export function shouldOnboard(lease, invoices) {
  return accessGateMet(lease, invoices) && !lease?.onboardedAt
}

// ── Salto access provisioning (client → serverless) ─────────────────────────────

// Provision a Salto credential for a member on the office door. Returns
// { accessLink, saltoUserId } (mocked server-side until real Salto creds exist).
export async function provisionSaltoAccess({ member, space, lease }) {
  const res = await fetch('/api/salto/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberEmail: member?.email ?? null,
      memberName: member?.name ?? null,
      // Office→door link comes from the office form's "Salto doors" field.
      doorId: space?.saltoDoors ?? space?.saltoDoorId ?? null,
      spaceLabel: space?.unitNumber ?? null,
      accessFrom: lease?.startDate ?? null,
      accessUntil: lease?.endDate ?? null,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Salto provisioning failed')
  }
  return res.json()
}

export async function revokeSaltoAccess({ member, space }) {
  const res = await fetch('/api/salto/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberEmail: member?.email ?? null,
      saltoUserId: member?.saltoUserId ?? null,
      doorId: space?.saltoDoors ?? space?.saltoDoorId ?? null,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Salto revoke failed')
  }
  return res.json()
}

// ── Onboarding email (editable template + fixed structure) ──────────────────────

// Placeholders the onboarding subject/intro support in Settings → Email Templates.
function fillVars(str, vars) {
  return String(str ?? '')
    .replace(/\{\{company\}\}/g, vars.company ?? '')
    .replace(/\{\{unit\}\}/g, vars.unit ?? '')
    .replace(/\{\{startDate\}\}/g, vars.startDate ?? '')
    .replace(/\{\{contract\}\}/g, vars.contract ?? '')
    .replace(/\{\{tenantName\}\}/g, vars.tenantName ?? '')
}

export function onboardingVars({ lease, tenant, space, settings }) {
  return {
    company: settings?.company?.name || 'Hexa Space',
    unit: space?.unitNumber || 'your space',
    startDate: lease?.startDate
      ? new Date(lease.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : '',
    contract: lease?.contractNumber || lease?.id || '',
    tenantName: tenant?.contactName || tenant?.businessName || '',
  }
}

// Resolve the editable subject + opening paragraph from settings.emailTemplates.onboarding.
export function resolveOnboardingCopy({ lease, tenant, space, settings }) {
  const tpl = settings?.emailTemplates?.onboarding ?? {}
  const vars = onboardingVars({ lease, tenant, space, settings })
  const subject = fillVars(tpl.subject || 'Welcome to {{company}} — your space is ready', vars)
  const intro = fillVars(
    tpl.intro || `Your agreement is signed and settled — {{unit}} is officially yours. Here's everything you need to get started.`,
    vars,
  )
  return { subject, intro }
}

export function onboardingEmailHtml({ lease, tenant, space, settings, saltoLink }) {
  const company = settings?.company ?? {}
  const name = company.name || 'Hexa Space'
  const website = company.website || 'hexaspace.com.au'
  const unit = space?.unitNumber ?? 'your space'
  const address = space?.address ?? settings?.billing?.address ?? ''
  const greeting = tenant?.contactName || tenant?.businessName || 'there'
  // Opening paragraph comes from the editable template so it stays in sync with
  // whatever the admin reads/edits in Settings → Email Templates.
  const { intro } = resolveOnboardingCopy({ lease, tenant, space, settings })

  const saltoBlock = saltoLink
    ? `<div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin:0 0 24px">
         <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Door access</p>
         <p style="margin:0 0 12px;color:#555;font-size:13px">Set up your mobile key for ${unit} with Salto. Access is valid from your commencement date.</p>
         <a href="${saltoLink}" style="background:#000;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">Activate door access</a>
       </div>`
    : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">${name.toUpperCase()}</span>
    </div>
    <div style="padding:32px">
      <h2 style="font-size:20px;margin:0 0 16px">Welcome to ${name} 🎉</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi ${greeting},</p>
      <p style="margin:0 0 20px;font-size:14px">${intro}</p>

      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin:0 0 24px">
        <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Your client portal</p>
        <p style="margin:0 0 12px;color:#555;font-size:13px">View invoices, manage your team, book meeting rooms and message our team. You'll receive a separate email to set your password.</p>
        <a href="${PORTAL_URL}" style="background:#000;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">Open the portal</a>
      </div>

      ${saltoBlock}

      <div style="margin:0 0 24px">
        <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Getting started</p>
        <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:1.7">
          <li>Access is 24/7 via your mobile key or access card.</li>
          <li>Add your team members from the portal — each gets their own access.</li>
          <li>Loading, parking and waste follow the House Rules attached to your agreement.</li>
          <li>Report any maintenance or questions through the portal messages.</li>
        </ul>
      </div>

      <p style="font-size:12px;color:#888;margin:0">
        ${name} &middot; ${address || website} &middot; <a href="https://${website}" style="color:#888">${website}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Editable onboarding email TEMPLATE (Templates → Emails) ─────────────────────
// The admin can edit this in the Templates section. It's full HTML so the design
// (branded header, styled portal button) is preserved; {{placeholders}} are filled
// at send time. Supported: {{company}} {{tenantName}} {{unit}} {{startDate}}
// {{contract}} {{portalUrl}} {{website}} {{address}} {{saltoBlock}}.
export const DEFAULT_ONBOARDING_EMAIL_SUBJECT = 'Welcome to {{company}} — your space is ready'
export const DEFAULT_ONBOARDING_EMAIL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">{{company}}</span>
    </div>
    <div style="padding:32px">
      <h2 style="font-size:20px;margin:0 0 16px">Welcome to {{company}} 🎉</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{tenantName}},</p>
      <p style="margin:0 0 20px;font-size:14px">Your agreement for {{unit}} is signed and settled — welcome aboard. Here's everything you need to get started from {{startDate}}.</p>

      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin:0 0 24px">
        <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Your member portal</p>
        <p style="margin:0 0 12px;color:#555;font-size:13px">Log in to view invoices, manage your team, book meeting rooms and message our team. You'll receive a separate email to set your password.</p>
        <a href="{{portalUrl}}" style="background:#000;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">Log in to the portal</a>
      </div>

      {{saltoBlock}}

      <div style="margin:0 0 24px">
        <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Getting started</p>
        <ul style="margin:0;padding-left:18px;color:#555;font-size:13px;line-height:1.7">
          <li>Access is 24/7 via your mobile key or access card.</li>
          <li>Add your team members from the portal — each gets their own login.</li>
          <li>Loading, parking and waste follow the House Rules attached to your agreement.</li>
          <li>Report maintenance or questions through the portal messages.</li>
        </ul>
      </div>

      <p style="font-size:12px;color:#888;margin:0">{{company}} &middot; {{address}} &middot; <a href="https://{{website}}" style="color:#888">{{website}}</a></p>
    </div>
  </div>
</body>
</html>`

export function saltoBlockHtml(unit, saltoLink) {
  if (!saltoLink) return ''
  return `<div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin:0 0 24px">
         <p style="margin:0 0 8px;font-weight:bold;font-size:14px">Door access</p>
         <p style="margin:0 0 12px;color:#555;font-size:13px">Set up your mobile key for ${unit} with Salto. Access is valid from your commencement date.</p>
         <a href="${saltoLink}" style="background:#000;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:13px;display:inline-block">Activate door access</a>
       </div>`
}

// Fill an editable email template (subject + full-HTML body) with live values.
export function renderOnboardingTemplate({ template, lease, tenant, space, settings, saltoLink }) {
  const vars = onboardingVars({ lease, tenant, space, settings })
  vars.portalUrl = PORTAL_URL
  vars.portalLink = PORTAL_URL
  vars.website = settings?.company?.website || 'hexaspace.com.au'
  vars.address = space?.address ?? settings?.billing?.address ?? ''
  vars.saltoBlock = saltoBlockHtml(space?.unitNumber ?? 'your space', saltoLink)
  return {
    subject: fillVars(template?.subject || DEFAULT_ONBOARDING_EMAIL_SUBJECT, vars),
    html: fillVars(template?.content || DEFAULT_ONBOARDING_EMAIL_HTML, vars),
  }
}

// ── Bond refund (offboarding) email ─────────────────────────────────────────────

export function resolveBondRefundCopy({ invoice, tenant, space, settings, amount }) {
  const tpl = settings?.emailTemplates?.bondRefund ?? {}
  const vars = {
    company: settings?.company?.name || 'Hexa Space',
    amount: `$${Number(amount ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`,
    unit: space?.unitNumber || 'your space',
    number: invoice?.number || '',
    tenantName: tenant?.contactName || tenant?.businessName || '',
  }
  const subject = fillVars(tpl.subject || 'Bond refund approved — {{number}}', vars)
  const intro = fillVars(
    tpl.intro || 'Good news — your security deposit refund of {{amount}} for {{unit}} has been approved and a credit note ({{number}}) has been issued.',
    vars,
  )
  return { subject, intro }
}

export function bondRefundEmailHtml({ invoice, tenant, space, settings, amount }) {
  const company = settings?.company ?? {}
  const name = company.name || 'Hexa Space'
  const website = company.website || 'hexaspace.com.au'
  const greeting = tenant?.contactName || tenant?.businessName || 'there'
  const { intro } = resolveBondRefundCopy({ invoice, tenant, space, settings, amount })
  const amountStr = `$${Number(amount ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">${name.toUpperCase()}</span>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:14px">Hi ${greeting},</p>
      <p style="margin:0 0 20px;font-size:14px">${intro}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
        <tr style="background:#f5f5f5"><td style="padding:10px 14px;font-weight:bold">Credit note</td><td style="padding:10px 14px">${invoice?.number ?? '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:bold">Refund amount</td><td style="padding:10px 14px;font-size:18px;font-weight:bold">${amountStr} AUD</td></tr>
      </table>
      <p style="font-size:13px;color:#555;margin:0 0 20px">The refund will be processed to your nominated account. Please allow a few business days for it to appear.</p>
      <p style="font-size:12px;color:#888;margin:0">${name} &middot; <a href="https://${website}" style="color:#888">${website}</a></p>
    </div>
  </div>
</body>
</html>`
}

export { PORTAL_URL }
