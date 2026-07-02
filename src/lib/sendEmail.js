// Client-side helper — calls the /api/send-email serverless function.
// Pass settings from useStore to provide from/replyTo/cc/bcc values.

import { supabase } from './supabase.js'

export async function sendEmail({ to, subject, html, settings, attachments, tenantId, emailType }) {
  const emails = settings?.emails ?? {}
  const billing = settings?.billing ?? {}
  const company = settings?.company ?? {}

  const fromName = emails.fromName || company.name || 'Hexa Space'
  const fromEmail = emails.fromEmail || 'noreply@hexaspace.com.au'

  const body = {
    to,
    subject,
    html,
    from: `${fromName} <${fromEmail}>`,
    ...(emails.replyTo ? { replyTo: emails.replyTo } : {}),
    ...(emails.cc ? { cc: emails.cc } : {}),
    ...(emails.bcc ? { bcc: emails.bcc } : {}),
    ...(attachments?.length ? { attachments } : {}),
  }

  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to send email')
  }

  const result = await res.json()

  // Log to Supabase (fire-and-forget — never block the email send)
  const logId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  supabase.from('email_log').insert({
    id: logId,
    data: {
      id: logId,
      tenantId: tenantId ?? null,
      emailType: emailType ?? 'general',
      to,
      subject,
      sentAt: new Date().toISOString(),
      hasAttachment: !!(attachments?.length),
    },
  }).then(() => {}).catch(() => {})

  return result
}

// ── Template helper ────────────────────────────────────────────────────────────
export function resolveEmailTemplate(type, vars, settings) {
  const tpl = settings?.emailTemplates?.[type]
  const sub = tpl?.subject ?? ''
  const intro = tpl?.intro ?? ''
  const replace = (str) => str
    .replace(/\{\{number\}\}/g, vars.number ?? '')
    .replace(/\{\{company\}\}/g, vars.company ?? '')
    .replace(/\{\{dueDate\}\}/g, vars.dueDate ?? '')
    .replace(/\{\{amount\}\}/g, vars.amount ?? '')
    .replace(/\{\{contract\}\}/g, vars.contract ?? '')
    .replace(/\{\{expiryDate\}\}/g, vars.expiryDate ?? '')
    .replace(/\{\{tenantName\}\}/g, vars.tenantName ?? '')
  return { subject: replace(sub), intro: replace(intro) }
}

// ── Email templates ────────────────────────────────────────────────────────────

export function invoiceEmailHtml({ invoice, tenant, settings }) {
  const company = settings?.company ?? {}
  const billing = settings?.billing ?? {}
  const name = billing.businessName || company.name || 'Hexa Space'
  const address = billing.address || 'Level 4, 830 Whitehorse Road, Box Hill VIC 3128'
  const website = company.website || 'hexaspace.com.au'
  const bsb = billing.bsb || '—'
  const acc = billing.acc || '—'

  const total = (invoice.lineItems ?? []).reduce((s, l) => {
    const lineTotal = Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100
    return s + lineTotal
  }, 0)
  const gst = invoice.vatEnabled !== false ? Math.round(total * 0.1 * 100) / 100 : 0
  const grandTotal = total + gst

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
      <p style="margin:0 0 8px;color:#555;font-size:14px">Hi ${tenant?.contactName ?? tenant?.businessName ?? 'there'},</p>
      <p style="margin:0 0 24px;font-size:14px">${settings?.emailTemplates?.invoice?.intro?.replace(/\{\{number\}\}/g, invoice.number ?? '').replace(/\{\{dueDate\}\}/g, invoice.dueDate ?? '') ?? 'Please find your invoice details below.'}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
        <tr style="background:#f5f5f5">
          <td style="padding:10px 14px;font-weight:bold">Invoice Number</td>
          <td style="padding:10px 14px">${invoice.number}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:bold">Period</td>
          <td style="padding:10px 14px">${invoice.periodStart ?? ''} – ${invoice.periodEnd ?? ''}</td>
        </tr>
        <tr style="background:#f5f5f5">
          <td style="padding:10px 14px;font-weight:bold">Due Date</td>
          <td style="padding:10px 14px">${invoice.dueDate ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:bold">Amount Due</td>
          <td style="padding:10px 14px;font-size:18px;font-weight:bold">$${grandTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</td>
        </tr>
      </table>

      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;margin-bottom:24px;font-size:13px">
        <p style="margin:0 0 4px;font-weight:bold">Payment Details</p>
        <p style="margin:0;color:#555">Account Name: ${name}<br>BSB: ${bsb}<br>ACC: ${acc}</p>
      </div>

      <p style="font-size:12px;color:#888;margin:0">
        ${name} &middot; ${address} &middot; <a href="https://${website}" style="color:#888">${website}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export function eSignEmailHtml({ lease, tenant, settings }) {
  const company = settings?.company ?? {}
  const contracts = settings?.contracts ?? {}
  const name = company.name || 'Hexa Space'
  const signerName = contracts.eSignName || name
  const memberLink = lease.eSignMemberLink ?? `https://esign.hexaspace.com.au/member/${lease.id}`
  const contractNum = lease.contractNumber ?? lease.id

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">${name.toUpperCase()}</span>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:14px">Hi ${tenant?.contactName ?? tenant?.businessName ?? 'there'},</p>
      <p style="margin:0 0 16px;font-size:14px">
        <strong>${signerName}</strong> has sent you a licence agreement to review and sign.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">Contract: ${contractNum}</p>
      <div style="margin:24px 0;text-align:center">
        <a href="${memberLink}"
           style="background:#000;color:#fff;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">
          Review &amp; Sign Document
        </a>
      </div>
      <p style="font-size:12px;color:#888;margin:0">
        If the button doesn't work, copy this link: <a href="${memberLink}" style="color:#888">${memberLink}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Editable e-signature request TEMPLATE (Templates → Emails) ──────────────────
// Full HTML so the design is preserved; {{placeholders}} filled at send time.
// Supported: {{company}} {{tenantName}} {{contract}} {{signLink}} {{signerName}} {{website}}.
export const DEFAULT_ESIGN_EMAIL_SUBJECT = 'Please sign: {{contract}} — {{company}}'
export const DEFAULT_ESIGN_EMAIL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">{{company}}</span>
    </div>
    <div style="padding:32px">
      <h2 style="font-size:20px;margin:0 0 16px">Your agreement is ready to sign</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{tenantName}},</p>
      <p style="margin:0 0 16px;font-size:14px"><strong>{{signerName}}</strong> has sent you a licence agreement to review and sign electronically.</p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">Contract: <strong>{{contract}}</strong></p>
      <div style="margin:24px 0;text-align:center">
        <a href="{{signLink}}" style="background:#000;color:#fff;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">Review &amp; sign document</a>
      </div>
      <p style="margin:0 0 16px;font-size:13px;color:#555">The link is unique to you. Please review the terms carefully before signing — reply to this email if you have any questions.</p>
      <p style="font-size:12px;color:#888;margin:0">If the button doesn't work, copy this link: <a href="{{signLink}}" style="color:#888">{{signLink}}</a></p>
      <p style="font-size:12px;color:#888;margin:16px 0 0">{{company}} &middot; <a href="https://{{website}}" style="color:#888">{{website}}</a></p>
    </div>
  </div>
</body>
</html>`

function fillEmailVars(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? (vars[k] ?? '') : m))
}

export function renderEsignTemplate({ template, lease, tenant, settings, signLink }) {
  const name = settings?.company?.name || 'Hexa Space'
  const vars = {
    company: name,
    tenantName: tenant?.contactName || tenant?.businessName || 'there',
    contract: lease?.contractNumber || lease?.id || '',
    signLink: signLink || lease?.eSignMemberLink || '',
    signerName: settings?.contracts?.eSignName || name,
    website: settings?.company?.website || 'hexaspace.com.au',
  }
  return {
    subject: fillEmailVars(template?.subject || DEFAULT_ESIGN_EMAIL_SUBJECT, vars),
    html: fillEmailVars(template?.content || DEFAULT_ESIGN_EMAIL_HTML, vars),
  }
}

// ── Editable signed-contract copy TEMPLATE (Templates → Emails) ─────────────────
// Sent (with the signed PDF attached) to both the client and us once fully signed.
// Supported: {{company}} {{tenantName}} {{contract}} {{signedDate}} {{website}}.
export const DEFAULT_SIGNED_EMAIL_SUBJECT = 'Signed copy: {{contract}} — {{company}}'
export const DEFAULT_SIGNED_EMAIL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px">
      <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">{{company}}</span>
    </div>
    <div style="padding:32px">
      <h2 style="font-size:20px;margin:0 0 16px">Your agreement is fully executed ✅</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{tenantName}},</p>
      <p style="margin:0 0 16px;font-size:14px">Licence agreement <strong>{{contract}}</strong> has been signed by all parties as of {{signedDate}}. A PDF copy of the fully signed contract is attached to this email for your records.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555">Please keep this copy for your records — you can also view it any time from your member portal.</p>
      <p style="font-size:12px;color:#888;margin:16px 0 0">{{company}} &middot; <a href="https://{{website}}" style="color:#888">{{website}}</a></p>
    </div>
  </div>
</body>
</html>`

export function renderSignedTemplate({ template, lease, tenant, settings, signedDate }) {
  const name = settings?.company?.name || 'Hexa Space'
  const vars = {
    company: name,
    tenantName: tenant?.contactName || tenant?.businessName || 'there',
    contract: lease?.contractNumber || lease?.id || '',
    signedDate: signedDate || '',
    website: settings?.company?.website || 'hexaspace.com.au',
  }
  return {
    subject: fillEmailVars(template?.subject || DEFAULT_SIGNED_EMAIL_SUBJECT, vars),
    html: fillEmailVars(template?.content || DEFAULT_SIGNED_EMAIL_HTML, vars),
  }
}

// ── Editable LEAD-NURTURE email TEMPLATES (Templates → Emails) ───────────────────
// Sent automatically after a website enquiry. {{company}} = our venue name;
// {{name}} = the lead's contact; {{membershipType}} = what they enquired about;
// {{tourLink}} = book-a-tour URL; {{officeOptions}} = available offices (private
// office only, filled later); {{website}}. Brochure content is designed into the
// template body itself.
const _emailShell = (inner) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px"><span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">{{company}}</span></div>
    <div style="padding:32px">
${inner}
      <p style="font-size:12px;color:#888;margin:16px 0 0">{{company}} &middot; <a href="https://{{website}}" style="color:#888">{{website}}</a></p>
    </div>
  </div>
</body>
</html>`
const _tourBtn = `      <div style="margin:24px 0;text-align:center"><a href="{{tourLink}}" style="background:#000;color:#fff;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">Book a tour</a></div>`

export const DEFAULT_LEAD_DESK_SUBJECT = "Your {{membershipType}} at {{company}} — what's included"
export const DEFAULT_LEAD_DESK_HTML = _emailShell(`      <h2 style="font-size:20px;margin:0 0 16px">Thanks for your interest in a {{membershipType}} 👋</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{name}},</p>
      <p style="margin:0 0 16px;font-size:14px">Thanks for enquiring about a {{membershipType}} at {{company}}. Here's a rundown of what's included — the community, amenities, meeting-room credits and flexible month-to-month terms.</p>
      <!-- BROCHURE: design your "what's included" section here -->
      <p style="margin:0 0 16px;font-size:14px">The best way to get a feel for it is to come see the space. Book a quick tour and we'll show you around.</p>
${_tourBtn}
      <p style="margin:0;font-size:13px;color:#555">Prefer to chat first? Just reply to this email.</p>`)

export const DEFAULT_LEAD_OFFICE_SUBJECT = 'Private offices at {{company}} — availability & tour'
export const DEFAULT_LEAD_OFFICE_HTML = _emailShell(`      <h2 style="font-size:20px;margin:0 0 16px">Private offices at {{company}} 🏢</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{name}},</p>
      <p style="margin:0 0 16px;font-size:14px">Thanks for enquiring about a private office. Based on your team size, here are the options currently available — with the floorplan and a closer look at each suite.</p>
      {{officeOptions}}
      <!-- BROCHURE: availability, floorplan + suite zoom + terms (design later) -->
      <p style="margin:0 0 16px;font-size:14px">Come see them in person — book a tour and we'll walk you through the available offices.</p>
${_tourBtn}
      <p style="margin:0;font-size:13px;color:#555">Happy to answer any questions — just reply to this email.</p>`)

export const DEFAULT_LEAD_FOLLOWUP_SUBJECT = "Still keen to see {{company}}? Let's book your tour"
export const DEFAULT_LEAD_FOLLOWUP_HTML = _emailShell(`      <h2 style="font-size:20px;margin:0 0 16px">Still keen to see {{company}}?</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{name}},</p>
      <p style="margin:0 0 16px;font-size:14px">Just following up on your enquiry about a {{membershipType}}. The easiest next step is a quick tour so you can see if it's the right fit.</p>
${_tourBtn}
      <p style="margin:0;font-size:13px;color:#555">If now isn't the right time, no problem — reply and let us know.</p>`)

export const DEFAULT_LEAD_FINAL_SUBJECT = 'One last check-in from {{company}}'
export const DEFAULT_LEAD_FINAL_HTML = _emailShell(`      <h2 style="font-size:20px;margin:0 0 16px">One last check-in</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{name}},</p>
      <p style="margin:0 0 16px;font-size:14px">We haven't heard back, so we'll pause things here for now. If a {{membershipType}} at {{company}} is still on your radar, we'd love to show you around — the door's always open.</p>
${_tourBtn}
      <p style="margin:0;font-size:13px;color:#555">Reach out any time — we'll be here.</p>`)

const LEAD_DEFAULTS = {
  lead_desk: { subject: DEFAULT_LEAD_DESK_SUBJECT, html: DEFAULT_LEAD_DESK_HTML },
  lead_office: { subject: DEFAULT_LEAD_OFFICE_SUBJECT, html: DEFAULT_LEAD_OFFICE_HTML },
  lead_followup: { subject: DEFAULT_LEAD_FOLLOWUP_SUBJECT, html: DEFAULT_LEAD_FOLLOWUP_HTML },
  lead_final: { subject: DEFAULT_LEAD_FINAL_SUBJECT, html: DEFAULT_LEAD_FINAL_HTML },
}

// ── Editable PROPOSAL email TEMPLATE (Templates → Emails) ───────────────────────
// Cover email for the proposal PDF (attached). {{company}} {{name}} {{website}}.
export const DEFAULT_PROPOSAL_EMAIL_SUBJECT = 'Your proposal from {{company}}'
export const DEFAULT_PROPOSAL_EMAIL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:24px 32px"><span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">{{company}}</span></div>
    <div style="padding:32px">
      <h2 style="font-size:20px;margin:0 0 16px">Your proposal is ready 📄</h2>
      <p style="margin:0 0 16px;font-size:14px">Hi {{name}},</p>
      <p style="margin:0 0 16px;font-size:14px">Thanks for coming in to see us. Please find your proposal attached — it covers the option(s) we discussed along with pricing and terms.</p>
      <p style="margin:0 0 16px;font-size:14px">Happy with it? Accept online and we'll set everything up for you — you'll get your licence agreement to e-sign straight after.</p>
      <div style="margin:24px 0;text-align:center"><a href="{{acceptLink}}" style="background:#000;color:#fff;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block">Review &amp; accept proposal</a></div>
      <p style="margin:0 0 16px;font-size:13px;color:#555">Prefer to chat first? Just reply to this email.</p>
      <p style="font-size:12px;color:#888;margin:16px 0 0">{{company}} &middot; <a href="https://{{website}}" style="color:#888">{{website}}</a></p>
    </div>
  </div>
</body>
</html>`

export function renderProposalTemplate({ template, lead, settings, acceptLink }) {
  const name = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const vars = { company: name, name: lead?.name || lead?.contactName || 'there', website, acceptLink: acceptLink || '#' }
  return {
    subject: fillEmailVars(template?.subject || DEFAULT_PROPOSAL_EMAIL_SUBJECT, vars),
    html: fillEmailVars(template?.content || DEFAULT_PROPOSAL_EMAIL_HTML, vars),
  }
}

export function renderLeadTemplate({ template, lead, membershipType, settings, tourLink, officeOptions }) {
  const name = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const fallback = LEAD_DEFAULTS[template?.emailType] || {}
  const vars = {
    company: name,
    name: lead?.name || lead?.contactName || 'there',
    membershipType: membershipType || lead?.enquiryType || lead?.interest || 'membership',
    tourLink: tourLink || `https://${website}/book-a-tour`,
    officeOptions: officeOptions || '',
    website,
  }
  return {
    subject: fillEmailVars(template?.subject || fallback.subject || '', vars),
    html: fillEmailVars(template?.content || fallback.html || '', vars),
  }
}
