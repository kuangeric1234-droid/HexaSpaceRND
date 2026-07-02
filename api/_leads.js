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

export function renderLead(template, { lead, membershipType, settings, tourLink, officeOptions }) {
  const name = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const vars = {
    company: name,
    name: lead?.name || lead?.contactName || 'there',
    membershipType: membershipType || lead?.enquiryType || lead?.interest || 'membership',
    tourLink: tourLink || settings?.leads?.tourUrl || `https://${website}/book-a-tour`,
    officeOptions: officeOptions || '',
    website,
  }
  return { subject: fillVars(template?.subject || '', vars), html: fillVars(template?.content || '', vars) }
}

export async function sendResend(resendKey, { fromName, fromEmail, to, subject, html, replyTo }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  })
}

// Days between two yyyy-mm-dd (or ISO) dates.
export function daysBetween(fromDate, toDate = new Date()) {
  const a = new Date(fromDate); const b = new Date(toDate)
  if (isNaN(a) || isNaN(b)) return 0
  return Math.floor((b - a) / 86400000)
}
