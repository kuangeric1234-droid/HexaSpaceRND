// Onboarding & access state machine helpers.
//
// A signed contract (lease) only "takes up" its office and grants access once the
// money has landed: the security deposit AND the first recurring invoice are paid.
// This module centralises that gating rule, the schedule-aware space status, the
// onboarding email, and the Salto access-provisioning calls so the store, the
// contract flow and the portal all agree on one definition of "activated".

import { authHeaders } from './apiFetch.js'

const PORTAL_URL = 'https://portal.hexaspace.com.au'

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

// Licence agreement clause 13(b): a departing Private Office member is
// auto-enrolled in a 3-month Virtual Office starting the day after their
// office contract ends (or tomorrow, when the end date has already passed).
export function exitVirtualOfficeTerm(officeEndDate, todayISO) {
  const anchor = officeEndDate && officeEndDate > todayISO ? officeEndDate : todayISO
  const start = new Date(`${anchor}T00:00:00`)
  start.setDate(start.getDate() + 1)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 3)
  end.setDate(end.getDate() - 1)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: fmt(start), endDate: fmt(end) }
}

// Memberships that must keep a verified card on file (captured via Stripe
// during signing): Virtual Office, Flexible Desk and Dedicated Desk — they
// bill monthly with no office bond behind them, so overdue amounts are
// recovered by charging the stored card per the agreement's payment authority.
export function requiresCardOnFile(lease) {
  const label = `${lease?.membershipType ?? ''} ${lease?.documentType ?? ''}`
  return /virtual|desk/i.test(label)
}

// Does clause 13(b) apply to this contract? Private Office agreements only —
// never virtual/desk/parking memberships, and never when explicitly opted out.
export function exitVirtualOfficeApplies(lease) {
  if (!lease || lease.skipVirtualOfficeEnrol) return false
  const label = `${lease.membershipType ?? ''} ${lease.documentType ?? ''}`
  if (/virtual/i.test(label)) return false
  return /office/i.test(label) || lease.documentType === 'License Agreement'
}

// ── Salto access provisioning (client → serverless) ─────────────────────────────

// Provision a Salto credential for a member on the office door. Returns
// { accessLink, saltoUserId } (mocked server-side until real Salto creds exist).
export async function provisionSaltoAccess({ member, space, lease }) {
  const res = await fetch('/api/salto/provision', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      memberEmail: member?.email ?? null,
      memberName: member?.name ?? null,
      // Office→door link comes from the office form's "Salto doors" field.
      doorId: space?.saltoDoors ?? space?.saltoDoorId ?? null,
      spaceLabel: space?.unitNumber ?? null,
      membershipType: lease?.membershipType ?? space?.type ?? null,
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

// mode 'remove_user' (default) deletes the KS user; 'remove_from_group'
// strips only this space's access group (company keeps other space(s)).
export async function revokeSaltoAccess({ member, space, mode = 'remove_user' }) {
  const res = await fetch('/api/salto/revoke', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      memberEmail: member?.email ?? null,
      saltoUserId: member?.saltoUserId ?? null,
      doorId: space?.saltoDoors ?? space?.saltoDoorId ?? null,
      spaceLabel: space?.unitNumber ?? null,
      membershipType: space?.type ?? null,
      mode,
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

// ── Hexa Space email branding (local, import-free) ──────────────────────────────
const _OLIVE = '#7F8B2F', _GREIGE = '#EFEDF2', _INK = '#1a1a1a', _MUTE = '#6b6b6b', _HAIR = '#e3e1e6'
const _SERIF = "'HexaBig', Georgia, 'Times New Roman', serif"
const _SANS = "'HexaGT', 'Helvetica Neue', Arial, sans-serif"
const _CAPS = "'HexaRework', 'Helvetica Neue', Arial, sans-serif"
// Social channels footer row (inline — this module is import-free).
const _SOCIAL_ROW = `<div style="margin-top:12px">` +
  `<a href="https://www.instagram.com/hexaspace.coworking" style="font-family:${_CAPS};font-size:9px;letter-spacing:.2em;color:${_MUTE};text-decoration:none;text-transform:uppercase">Instagram</a>` +
  `<span style="color:${_HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.linkedin.com/company/hexa-space/" style="font-family:${_CAPS};font-size:9px;letter-spacing:.2em;color:${_MUTE};text-decoration:none;text-transform:uppercase">LinkedIn</a>` +
  `<span style="color:${_HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.hexaspace.com.au/" style="font-family:${_CAPS};font-size:9px;letter-spacing:.2em;color:${_MUTE};text-decoration:none;text-transform:uppercase">Website</a>` +
  `</div>`
const _FONTS = `
    @font-face{font-family:'HexaBig';src:url('https://admin.hexaspace.com.au/fonts/BigDailyShort-ExtraLight.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaGT';src:url('https://admin.hexaspace.com.au/fonts/GT-America-Standard-Thin.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaRework';src:url('https://admin.hexaspace.com.au/fonts/ReworkMicro-Semibold.otf') format('opentype');font-weight:600;font-display:swap}`
function oShell(inner, { company = '{{company}}', website = '{{website}}' } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${_FONTS}</style></head>
<body style="margin:0;padding:0;background:${_GREIGE};font-family:${_SANS};color:${_INK}">
  <div style="max-width:600px;margin:0 auto;padding:30px 16px">
    <div style="text-align:center;padding:6px 0 22px">
      <span style="font-family:${_CAPS};font-size:15px;letter-spacing:.34em;color:${_INK};text-transform:uppercase">HEXA&nbsp;SPACE</span>
      <span style="font-family:${_SANS};font-size:14px;color:${_OLIVE};letter-spacing:.12em">&nbsp;&nbsp;六合空间</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${_HAIR};border-radius:12px;overflow:hidden">
      <div style="height:3px;background:${_OLIVE}"></div>
      <div style="padding:38px 40px">${inner}</div>
    </div>
    <div style="text-align:center;padding:22px 8px 6px">
      <div style="font-family:${_CAPS};font-size:10px;letter-spacing:.3em;color:${_OLIVE};text-transform:uppercase">HEXA SPACE &nbsp;·&nbsp; 六合空间</div>
      ${_SOCIAL_ROW}
      <div style="font-family:${_SANS};font-size:11px;color:#9a9aa0;margin-top:10px">${company} &middot; <a href="https://${website}" style="color:#9a9aa0;text-decoration:none">${website}</a></div>
    </div>
  </div>
</body></html>`
}
const _k = (t) => `<div style="font-family:${_CAPS};font-size:11px;letter-spacing:.28em;color:${_OLIVE};text-transform:uppercase;margin:0 0 12px">${t}</div>`
const _h = (t) => `<h1 style="font-family:${_SERIF};font-weight:400;font-size:30px;line-height:1.12;margin:0 0 18px;color:${_INK}">${t}</h1>`
const _p = (t) => `<p style="font-family:${_SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">${t}</p>`
const _small = (t) => `<p style="font-family:${_SANS};font-size:12px;line-height:1.6;color:${_MUTE};margin:8px 0 0">${t}</p>`
const _btn = (label, href) => `<a href="${href}" style="display:inline-block;background:${_OLIVE};color:#fff;padding:11px 26px;border-radius:6px;text-decoration:none;font-family:${_CAPS};font-size:11px;letter-spacing:.14em;text-transform:uppercase">${label}</a>`
const _box = (title, body) => `<div style="background:${_GREIGE};border-radius:8px;padding:18px 20px;margin:0 0 20px"><div style="font-family:${_CAPS};font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${_OLIVE};margin-bottom:8px">${title}</div>${body}</div>`
const _startList = `<div style="margin:4px 0 18px"><div style="font-family:${_CAPS};font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${_OLIVE};margin-bottom:10px">Getting started</div><ul style="margin:0;padding-left:18px;font-family:${_SANS};color:#3a3a3a;font-size:13px;line-height:1.85"><li>Access is 24/7 via your mobile key or access card.</li><li>Add your team members from the portal — each gets their own access.</li><li>Loading, parking and waste follow the House Rules attached to your agreement.</li><li>Report any maintenance or questions through the portal messages.</li></ul></div>`

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
    ? _box('Door access', `<p style="font-family:${_SANS};font-size:13px;color:#3a3a3a;line-height:1.6;margin:0 0 12px">Set up your mobile key for ${unit} with Salto. Access is valid from your commencement date.</p>${_btn('Activate door access', saltoLink)}`)
    : ''

  const inner = _k('Welcome') + _h(`Welcome to ${name}.`) + _p(`Hi ${greeting},`) + _p(intro) +
    _box('Your client portal', `<p style="font-family:${_SANS};font-size:13px;color:#3a3a3a;line-height:1.6;margin:0 0 12px">View invoices, manage your team, book meeting rooms and message our team. You'll receive a separate email to set your password.</p>${_btn('Open the portal', settings?.portalUrl || PORTAL_URL)}`) +
    saltoBlock + _startList + _small(`${name} · ${address || website}`)
  return oShell(inner, { company: name, website })
}

// ── Editable onboarding email TEMPLATE (Templates → Emails) ─────────────────────
// The admin can edit this in the Templates section. It's full HTML so the design
// (branded header, styled portal button) is preserved; {{placeholders}} are filled
// at send time. Supported: {{company}} {{tenantName}} {{unit}} {{startDate}}
// {{contract}} {{portalUrl}} {{website}} {{address}} {{saltoBlock}}.
export const DEFAULT_ONBOARDING_EMAIL_SUBJECT = 'Welcome to {{company}} — your space is ready'
export const DEFAULT_ONBOARDING_EMAIL_HTML = oShell(
  _k('Welcome') +
  _h('Welcome to {{company}}.') +
  _p('Hi {{tenantName}},') +
  _p("Your agreement for {{unit}} is signed and settled — welcome aboard. Here's everything you need to get started from {{startDate}}.") +
  _box('Your member portal', `<p style="font-family:${_SANS};font-size:13px;color:#3a3a3a;line-height:1.6;margin:0 0 12px">Log in to view invoices, manage your team, book meeting rooms and message our team. You'll receive a separate email to set your password.</p>${_btn('Log in to the portal', '{{portalUrl}}')}`) +
  '{{saltoBlock}}' +
  _box('Getting connected', `<ul style="margin:0;padding-left:18px;font-family:${_SANS};color:#3a3a3a;font-size:13px;line-height:1.9"><li><strong>Wi-Fi</strong> — network “Hexa Space”; password available at reception or in the portal</li><li><strong>Printing</strong> — reception will set up your print account ($30/mo · $0.30 B&amp;W · $0.60 colour)</li><li><strong>Business address &amp; mail</strong> — your registered address is active; collect mail from reception</li></ul>`) +
  _box('Your space &amp; amenities', `<ul style="margin:0;padding-left:18px;font-family:${_SANS};color:#3a3a3a;font-size:13px;line-height:1.9"><li>Book meeting &amp; consulting rooms from the portal — your plan includes monthly credits</li><li>Barista coffee, tea &amp; filtered water in the lounge</li><li>End-of-trip facilities (showers, bike storage) · onsite &amp; Box Hill Central parking</li><li>24/7 secure access from your commencement date</li></ul>`) +
  _box('Who to contact', `<ul style="margin:0;padding-left:18px;font-family:${_SANS};color:#3a3a3a;font-size:13px;line-height:1.9"><li>Community &amp; support — info@hexaspace.com.au</li><li>Billing &amp; accounts — info@hexaspace.com.au</li><li>Keep an eye out for community event invitations</li></ul>`) +
  _startList +
  _small('{{address}}'))

export function saltoBlockHtml(unit, saltoLink) {
  if (!saltoLink) return ''
  return _box('Door access', `<p style="font-family:${_SANS};font-size:13px;color:#3a3a3a;line-height:1.6;margin:0 0 12px">Set up your mobile key for ${unit} with Salto. Access is valid from your commencement date.</p>${_btn('Activate door access', saltoLink)}`)
}

// Fill an editable email template (subject + full-HTML body) with live values.
export function renderOnboardingTemplate({ template, lease, tenant, space, settings, saltoLink }) {
  const vars = onboardingVars({ lease, tenant, space, settings })
  vars.portalUrl = settings?.portalUrl || PORTAL_URL
  vars.portalLink = settings?.portalUrl || PORTAL_URL
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

  const cell = `padding:11px 15px;font-family:${_SANS};font-size:14px`
  const inner = _k('Bond refund') + _h('Your deposit is on its way.') + _p(`Hi ${greeting},`) + _p(intro) +
    `<table style="width:100%;border-collapse:collapse;margin:6px 0 20px">
        <tr style="background:${_GREIGE}"><td style="${cell};font-weight:600;color:${_INK}">Credit note</td><td style="${cell}">${invoice?.number ?? '—'}</td></tr>
        <tr><td style="${cell};font-weight:600;color:${_INK}">Refund amount</td><td style="${cell};font-family:${_SERIF};font-size:22px;color:${_OLIVE}">${amountStr} AUD</td></tr>
      </table>` +
    _p('The refund will be processed to your nominated account. Please allow a few business days for it to appear.')
  return oShell(inner, { company: name, website })
}

export { PORTAL_URL }
