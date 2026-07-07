// Shared server-side helpers for lead-nurture emails (used by form-submit.js and
// lead-nurture.js). Underscore prefix = not exposed as an API route.
// NOTE: never import ../src/lib/sendEmail.js here — it pulls in the browser
// Supabase client (import.meta.env) and breaks in the serverless runtime.

export function fillVars(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? (vars[k] ?? '') : m))
}

// Which brochure applies: private office vs desk/virtual office.
export function leadTypeFor(lead, space) {
  const t = `${lead?.enquiryType || ''} ${lead?.interest || ''} ${space?.type || ''} ${space?.unitNumber || ''}`.toLowerCase()
  if (/\boffice\b|private/.test(t) && !/virtual/.test(t)) return 'lead_office'
  return 'lead_desk'
}

export function findEmailTemplate(templates, emailType) {
  return (templates || []).find((t) => t?.category === 'email' && t?.emailType === emailType && t?.content) || null
}

// The book-a-tour form lives on the marketing website (www.hexaspace.com.au).
// Default the tour link there; override with settings.leads.tourUrl.
export function tourUrlFor(settings) {
  if (settings?.leads?.tourUrl) return settings.leads.tourUrl
  let site = (settings?.company?.website || 'hexaspace.com.au').replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!site.startsWith('www.')) site = `www.${site}`
  return `https://${site}/book-a-tour`
}

export function renderLead(template, { lead, membershipType, settings, tourLink, officeOptions }) {
  const name = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const vars = {
    company: name,
    name: lead?.name || lead?.contactName || 'there',
    membershipType: membershipType || lead?.enquiryType || lead?.interest || 'membership',
    tourLink: tourLink || tourUrlFor(settings),
    officeOptions: officeOptions || '',
    website,
  }
  return { subject: fillVars(template?.subject || '', vars), html: fillVars(template?.content || '', vars) }
}

// Routes through the central safe-mode guard. `resendKey` is kept for signature
// compatibility but the guard reads RESEND_API_KEY itself. Returns a fetch-like
// object exposing `.ok`.
export async function sendResend(resendKey, { fromName, fromEmail, to, subject, html, replyTo, attachments }) {
  const { sendResendEmail } = await import('./_email.js')
  const r = await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject, html, replyTo, attachments })
  return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500) }
}

// The portal base (single sign-in domain). Everything — members, admin,
// onboarding and the function "Book a time" page — lives here.
export function portalBase(settings) {
  return (settings?.portalUrl || 'https://portal.hexaspace.com.au').replace(/\/+$/, '')
}

// The "Book a time" page URL for the function funnel. Lives on the portal domain
// (single sign-in). `settings.functionBookingUrl` can override; else portal base.
export function functionBookLink(settings, requestToken) {
  const base = settings?.functionBookingUrl || `${portalBase(settings)}/book-function`
  return `${base}${requestToken ? `?ref=${requestToken}` : ''}`
}

// The hosted function brochure PDF (in /public). Attached to brochure emails so
// the client can review the space, inclusions and pricing offline.
export function functionBrochureAttachment(settings) {
  const path = `${portalBase(settings)}/hexa-space-function-brochure.pdf`
  return [{ filename: 'Hexa Space — Function Space Brochure.pdf', path }]
}

// Vars for the function nurture/brochure emails.
export function functionEmailVars(booking, settings) {
  return {
    company: settings?.company?.name || 'Hexa Space',
    name: booking.name || 'there',
    organisation: booking.organisation || '',
    eventName: booking.eventName || 'your event',
    eventDate: booking.eventDate || '', startTime: booking.startTime || '', endTime: booking.endTime || '', guests: booking.guests || '',
    total: '', dueNow: '', balanceDue: '',
    bookLink: functionBookLink(settings, booking.requestToken),
    website: settings?.company?.website || 'hexaspace.com.au',
  }
}

// Auto-send the function brochure (with the Book-a-time link) on enquiry.
export async function sendFunctionBrochure(supabase, booking) {
  if (!booking?.email) return
  const [{ data: settRows }, { data: tmplRows }] = await Promise.all([
    supabase.from('settings').select('data').eq('id', 'global'),
    supabase.from('templates').select('data'),
  ])
  const settings = settRows?.[0]?.data ?? {}
  const tpl = findEmailTemplate((tmplRows ?? []).map((r) => r.data), 'function_brochure')
  if (!tpl) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
  const vars = functionEmailVars(booking, settings)
  await sendResend(process.env.RESEND_API_KEY, { fromName, fromEmail, to: booking.email, subject: fillVars(tpl.subject, vars), html: fillVars(tpl.content, vars), replyTo, attachments: functionBrochureAttachment(settings) })
}

// Days between two yyyy-mm-dd (or ISO) dates.
export function daysBetween(fromDate, toDate = new Date()) {
  const a = new Date(fromDate); const b = new Date(toDate)
  if (isNaN(a) || isNaN(b)) return 0
  return Math.floor((b - a) / 86400000)
}
