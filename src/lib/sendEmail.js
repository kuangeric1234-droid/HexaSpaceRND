// Client-side helper — calls the /api/send-email serverless function.
// Pass settings from useStore to provide from/replyTo/cc/bcc values.
// NOTE: supabase is imported lazily (inside sendEmail) so this module stays
// import-safe for Node scripts that reuse the branded email defaults below.

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

  // /api/send-email is admin-gated — attach the caller's JWT. Lazy import so
  // this module stays importable from Node scripts (apiFetch pulls in the
  // browser supabase client).
  const { authHeaders } = await import('./apiFetch.js')
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to send email')
  }

  const result = await res.json()

  // Log to Supabase (fire-and-forget — never block the email send). Lazy import
  // keeps this module Node-importable for reuse of the branded defaults.
  const logId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  import('./supabase.js').then(({ supabase }) => supabase.from('email_log').insert({
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
  })).then(() => {}).catch(() => {})

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

// ── Hexa Space email brand kit ───────────────────────────────────────────────
// Brand fonts served from the RND (/public/fonts), with web-safe fallbacks for
// clients that ignore @font-face (Gmail, Outlook). Palette: olive #7F8B2F,
// greige #EFEDF2, near-black ink — per the Hexa brand guidelines.
const FONT_HOST = 'https://admin.hexaspace.com.au/fonts'
const BRAND_FONTS = `
    @font-face{font-family:'HexaBig';src:url('${FONT_HOST}/BigDailyShort-ExtraLight.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaGT';src:url('${FONT_HOST}/GT-America-Standard-Thin.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaRework';src:url('${FONT_HOST}/ReworkMicro-Semibold.otf') format('opentype');font-weight:600;font-display:swap}`
const SERIF = "'HexaBig', Georgia, 'Times New Roman', serif"
const SANS = "'HexaGT', 'Helvetica Neue', Arial, sans-serif"
const CAPS = "'HexaRework', 'Helvetica Neue', Arial, sans-serif"
const OLIVE = '#7F8B2F', GREIGE = '#EFEDF2', INK = '#1a1a1a', MUTE = '#6b6b6b', HAIR = '#e3e1e6'

// Public, client-facing portal (proposal acceptance, e-signature, event signing).
// Distinct from the admin app (admin.hexaspace.com.au) the team logs into.
export const PORTAL_URL = 'https://portal.hexaspace.com.au'

// Hexa Space social channels — shown in every email footer.
export const SOCIALS = {
  instagram: 'https://www.instagram.com/hexaspace.coworking',
  linkedin: 'https://www.linkedin.com/company/hexa-space/',
  website: 'https://www.hexaspace.com.au/',
}
// Shared branded footer social row (used by brandShell + self-contained modules).
export function socialFooterRow({ olive = OLIVE, caps = CAPS, hair = HAIR, mute = MUTE } = {}) {
  const link = (href, label) => `<a href="${href}" style="font-family:${caps};font-size:9px;letter-spacing:.2em;color:${mute};text-decoration:none;text-transform:uppercase">${label}</a>`
  const dot = `<span style="color:${hair};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`
  return `<div style="margin-top:12px">${link(SOCIALS.instagram, 'Instagram')}${dot}${link(SOCIALS.linkedin, 'LinkedIn')}${dot}${link(SOCIALS.website, 'Website')}</div>`
}

// Full branded HTML wrapper. `company`/`website` default to {{placeholders}} so
// editable templates keep working; pass real values from the *EmailHtml builders.
export function brandShell(inner, { company = '{{company}}', website = '{{website}}' } = {}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BRAND_FONTS}</style></head>
<body style="margin:0;padding:0;background:${GREIGE};font-family:${SANS};color:${INK}">
  <div style="max-width:600px;margin:0 auto;padding:30px 16px">
    <div style="text-align:center;padding:6px 0 22px">
      <span style="font-family:${CAPS};font-size:15px;letter-spacing:.34em;color:${INK};text-transform:uppercase">HEXA&nbsp;SPACE</span>
      <span style="font-family:${SANS};font-size:14px;color:${OLIVE};letter-spacing:.12em">&nbsp;&nbsp;六合空间</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;overflow:hidden">
      <div style="height:3px;background:${OLIVE}"></div>
      <div style="padding:38px 40px">
${inner}
      </div>
    </div>
    <div style="text-align:center;padding:22px 8px 6px">
      <div style="font-family:${CAPS};font-size:10px;letter-spacing:.3em;color:${OLIVE};text-transform:uppercase">HEXA SPACE &nbsp;·&nbsp; 六合空间</div>
      ${socialFooterRow()}
      <div style="font-family:${SANS};font-size:11px;color:#9a9aa0;margin-top:10px">${company} &middot; <a href="https://${website}" style="color:#9a9aa0;text-decoration:none">${website}</a></div>
    </div>
  </div>
</body>
</html>`
}
export const bKicker = (t) => `      <div style="font-family:${CAPS};font-size:11px;letter-spacing:.28em;color:${OLIVE};text-transform:uppercase;margin:0 0 14px">${t}</div>`
export const bH1 = (t) => `      <h1 style="font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.12;margin:0 0 18px;color:${INK}">${t}</h1>`
export const bP = (t) => `      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">${t}</p>`
export const bSmall = (t) => `      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTE};margin:0 0 16px">${t}</p>`
export const bBtn = (label, href) => `      <div style="margin:26px 0;text-align:center"><a href="${href}" style="background:${OLIVE};color:#ffffff;padding:13px 34px;border-radius:6px;text-decoration:none;font-family:${CAPS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;display:inline-block">${label}</a></div>`
// Shared brand tokens for other modules (onboarding, function emails).
export const BRAND = { SERIF, SANS, CAPS, OLIVE, GREIGE, INK, MUTE, HAIR }

// Wrap a plain-text message (from the ad-hoc Email tab) in the branded shell.
export function messageEmailHtml({ body, company, website }) {
  const safe = String(body || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')
  return brandShell(bP(safe), { company: company || 'Hexa Space', website: website || 'hexaspace.com.au' })
}

// Signature block for the proposal cover email, built from Settings → Company/Emails.
export function buildSignature(settings) {
  const c = settings?.company || {}, e = settings?.emails || {}
  const name = e.signName || c.salesContact || c.name || 'The Hexa Space Team'
  const title = c.salesTitle || ''
  const phone = c.phone || ''
  const email = e.replyTo || c.email || e.fromEmail || ''
  const website = c.website || 'hexaspace.com.au'
  const address = c.address || ''
  const line = (label, val, href) => val
    ? `<div style="margin-top:4px"><span style="color:${OLIVE};font-family:${CAPS};font-size:10px;letter-spacing:.16em">${label}</span>&nbsp;&nbsp;${href ? `<a href="${href}" style="color:#3a3a3a;text-decoration:none">${val}</a>` : val}</div>`
    : ''
  return `<div style="margin:28px 0 0;border-top:1px solid ${HAIR};padding-top:22px">
      <div style="font-family:${SERIF};font-size:19px;color:${INK}">${name}</div>
      ${title ? `<div style="font-family:${CAPS};font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${OLIVE};margin-top:5px">${title}</div>` : ''}
      <div style="font-family:${SANS};font-size:13px;color:#3a3a3a;margin-top:12px">
        ${line('CALL', phone)}${line('EMAIL', email, 'mailto:' + email)}${line('WEB', website, 'https://' + website)}${line('VISIT', address)}
      </div>
      <p style="font-family:${SANS};font-size:11px;line-height:1.6;color:#9a9aa0;margin:20px 0 0">${c.name || 'Hexa Space'} presents a considered approach to work — members-only workspaces blending architecturally-designed amenities and bespoke private offices with genuine community and first-class service.</p>
    </div>`
}

// ── Email templates ────────────────────────────────────────────────────────────

// One random URL-safe pay token per invoice — the only secret behind the
// public /pay/<id>?t=<token> page. Persist it on the invoice before emailing.
export function makePayToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => chars[b % chars.length]).join('')
}

export const invoicePayLink = (invoice) =>
  invoice?.payToken ? `${PORTAL_URL}/pay/${invoice.id}?t=${invoice.payToken}` : null

export function invoiceEmailHtml({ invoice, tenant, settings, payLink }) {
  const company = settings?.company ?? {}
  const billing = settings?.billing ?? {}
  const name = billing.businessName || company.name || 'Hexa Space'
  const address = billing.address || '402/830 Whitehorse Road, Box Hill VIC 3128'
  const website = company.website || 'hexaspace.com.au'
  const bsb = billing.bsb || '—'
  const acc = billing.acc || '—'

  const total = (invoice.lineItems ?? []).reduce((s, l) => {
    const lineTotal = Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100
    return s + lineTotal
  }, 0)
  const gst = invoice.vatEnabled !== false ? Math.round(total * 0.1 * 100) / 100 : 0
  const grandTotal = total + gst

  const intro = settings?.emailTemplates?.invoice?.intro?.replace(/\{\{number\}\}/g, invoice.number ?? '').replace(/\{\{dueDate\}\}/g, invoice.dueDate ?? '') ?? 'Please find your invoice details below.'
  const cell = `padding:11px 15px;font-family:${SANS};font-size:14px`
  const inner = `${bKicker('Invoice')}${bH1('Your invoice from ' + name + '.')}` +
    bP(`Hi ${tenant?.contactName ?? tenant?.businessName ?? 'there'},`) +
    bP(intro) +
    `      <table style="width:100%;border-collapse:collapse;margin:6px 0 22px">
        <tr style="background:${GREIGE}"><td style="${cell};font-weight:600;color:${INK}">Invoice Number</td><td style="${cell}">${invoice.number}</td></tr>
        <tr><td style="${cell};font-weight:600;color:${INK}">Period</td><td style="${cell}">${invoice.periodStart ?? ''} – ${invoice.periodEnd ?? ''}</td></tr>
        <tr style="background:${GREIGE}"><td style="${cell};font-weight:600;color:${INK}">Due Date</td><td style="${cell}">${invoice.dueDate ?? '—'}</td></tr>
        <tr><td style="${cell};font-weight:600;color:${INK}">Amount Due</td><td style="${cell};font-family:${SERIF};font-size:22px;color:${OLIVE}">$${grandTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</td></tr>
      </table>
      ${payLink ? bBtn('Pay this invoice online', payLink) + bSmall(`Card payments are processed securely by Stripe. If the button doesn't work, copy this link: <a href="${payLink}" style="color:${OLIVE}">${payLink}</a>`) : ''}
      <div style="background:${GREIGE};border-radius:8px;padding:16px 18px;margin:0 0 8px">
        <div style="font-family:${CAPS};font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${OLIVE};margin-bottom:8px">${payLink ? 'Or pay by bank transfer' : 'Payment details'}</div>
        <div style="font-family:${SANS};font-size:13px;color:#3a3a3a;line-height:1.7">Account Name: ${name}<br>BSB: ${bsb}<br>ACC: ${acc}</div>
      </div>
      ${bSmall(`${name} · ${address}`)}`
  return brandShell(inner, { company: name, website })
}

export function eSignEmailHtml({ lease, tenant, settings }) {
  const company = settings?.company ?? {}
  const contracts = settings?.contracts ?? {}
  const name = company.name || 'Hexa Space'
  const signerName = contracts.eSignName || name
  const memberLink = lease.eSignMemberLink ?? `${PORTAL_URL}/sign/${lease.id}`
  const contractNum = lease.contractNumber ?? lease.id

  const website = company.website || 'hexaspace.com.au'
  const inner = `${bKicker('Agreement')}${bH1('Your agreement is ready to sign.')}` +
    bP(`Hi ${tenant?.contactName ?? tenant?.businessName ?? 'there'},`) +
    bP(`<strong style="color:${INK}">${signerName}</strong> has sent you a licence agreement to review and sign electronically.`) +
    bSmall(`Contract: <strong style="color:${INK}">${contractNum}</strong>`) +
    bBtn('Review &amp; sign document', memberLink) +
    bSmall(`If the button doesn't work, copy this link: <a href="${memberLink}" style="color:${OLIVE}">${memberLink}</a>`)
  return brandShell(inner, { company: name, website })
}

// ── Editable e-signature request TEMPLATE (Templates → Emails) ──────────────────
// Full HTML so the design is preserved; {{placeholders}} filled at send time.
// Supported: {{company}} {{tenantName}} {{contract}} {{signLink}} {{signerName}} {{website}}.
export const DEFAULT_ESIGN_EMAIL_SUBJECT = 'Please sign: {{contract}} — {{company}}'
export const DEFAULT_ESIGN_EMAIL_HTML = brandShell(
  bKicker('Agreement') +
  bH1('Your agreement is ready to sign.') +
  bP('Hi {{tenantName}},') +
  bP(`<strong style="color:${INK}">{{signerName}}</strong> has sent you a licence agreement to review and sign electronically.`) +
  bSmall(`Contract: <strong style="color:${INK}">{{contract}}</strong>`) +
  bBtn('Review &amp; sign document', '{{signLink}}') +
  bSmall('The link is unique to you. Please review the terms carefully before signing — reply to this email if you have any questions.') +
  bSmall(`If the button doesn't work, copy this link: <a href="{{signLink}}" style="color:${OLIVE}">{{signLink}}</a>`)
)

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
export const DEFAULT_SIGNED_EMAIL_HTML = brandShell(
  bKicker('Fully executed') +
  bH1('Your agreement is signed.') +
  bP('Hi {{tenantName}},') +
  bP(`Licence agreement <strong style="color:${INK}">{{contract}}</strong> has been signed by all parties as of {{signedDate}}. A PDF copy of the fully signed contract is attached to this email for your records.`) +
  bSmall('Please keep this copy safe — you can also view it any time from your member portal. Welcome aboard.')
)

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
const _emailShell = (inner) => brandShell(inner)
const _tourBtn = bBtn('Book a tour', '{{tourLink}}')

export const DEFAULT_LEAD_DESK_SUBJECT = "Your {{membershipType}} at {{company}} — what's included"
export const DEFAULT_LEAD_DESK_HTML = _emailShell(
  bKicker('Welcome') +
  bH1('Thanks for your interest.') +
  bP('Hi {{name}},') +
  bP("Thanks for enquiring about a {{membershipType}} at {{company}}. Here's what's included — a considered community, architecturally-designed amenities, meeting-room credits and flexible month-to-month terms.") +
  bP('The best way to get a feel for it is to see the space in person. Book a quick tour and we\'ll show you around.') +
  _tourBtn +
  bSmall('Prefer to chat first? Just reply to this email.'))

export const DEFAULT_LEAD_OFFICE_SUBJECT = 'Private offices at {{company}} — availability & tour'
export const DEFAULT_LEAD_OFFICE_HTML = _emailShell(
  bKicker('Private Offices') +
  bH1('Room to grow at {{company}}.') +
  bP('Hi {{name}},') +
  bP('Thanks for enquiring about a private office. Based on your team size, here are the options currently available — with a closer look at each suite.') +
  '      {{officeOptions}}' +
  bP('Come see them in person — book a tour and we\'ll walk you through the available offices.') +
  _tourBtn +
  bSmall('Happy to answer any questions — just reply to this email.'))

export const DEFAULT_LEAD_FOLLOWUP_SUBJECT = "Still keen to see {{company}}? Let's book your tour"
export const DEFAULT_LEAD_FOLLOWUP_HTML = _emailShell(
  bKicker('Following up') +
  bH1('Still keen to see {{company}}?') +
  bP('Hi {{name}},') +
  bP("Just following up on your enquiry about a {{membershipType}}. The easiest next step is a quick tour so you can see if it's the right fit.") +
  _tourBtn +
  bSmall("If now isn't the right time, no problem — reply and let us know."))

export const DEFAULT_LEAD_FINAL_SUBJECT = 'One last check-in from {{company}}'
export const DEFAULT_LEAD_FINAL_HTML = _emailShell(
  bKicker('Keeping in touch') +
  bH1('One last check-in.') +
  bP('Hi {{name}},') +
  bP("We haven't heard back, so we'll pause things here for now. If a {{membershipType}} at {{company}} is still on your radar, we'd love to show you around — the door's always open.") +
  _tourBtn +
  bSmall("Reach out any time — we'll be here."))

const LEAD_DEFAULTS = {
  lead_desk: { subject: DEFAULT_LEAD_DESK_SUBJECT, html: DEFAULT_LEAD_DESK_HTML },
  lead_office: { subject: DEFAULT_LEAD_OFFICE_SUBJECT, html: DEFAULT_LEAD_OFFICE_HTML },
  lead_followup: { subject: DEFAULT_LEAD_FOLLOWUP_SUBJECT, html: DEFAULT_LEAD_FOLLOWUP_HTML },
  lead_final: { subject: DEFAULT_LEAD_FINAL_SUBJECT, html: DEFAULT_LEAD_FINAL_HTML },
}

// ── Editable TOUR-CONFIRMATION email TEMPLATE (Templates → Emails) ───────────────
// Sent to the enquirer when they book a tour on the website. To be rebranded to
// match www.hexaspace.com.au later. {{company}} {{name}} {{tourDate}} {{tourTime}} {{website}}.
export const DEFAULT_TOUR_CONFIRMATION_SUBJECT = 'Your tour request — {{company}}'
export const DEFAULT_TOUR_CONFIRMATION_HTML = brandShell(
  bKicker('Tour request received') +
  bH1('Thanks for booking in.') +
  bP('Hi {{name}},') +
  bP("We've received your tour request{{tourWhen}} and will be in touch shortly to confirm a time.") +
  bP('Looking forward to showing you around Hexa Space.'))

// ── Editable PROPOSAL email TEMPLATE (Templates → Emails) ───────────────────────
// Cover email for the proposal PDF (attached). {{company}} {{name}} {{website}}.
export const DEFAULT_PROPOSAL_EMAIL_SUBJECT = 'Your office suites & pricing — {{company}}'
export const DEFAULT_PROPOSAL_EMAIL_HTML = brandShell(
  bKicker('Your Proposal') +
  bH1('Great to have you in.') +
  bP('Hi {{name}},') +
  bP('Hope you\'re well 😊') +
  bP("Thanks so much for coming in to tour with us at {{company}} — we hope you enjoyed seeing the space and getting a feel for what we're all about.") +
  bP('As discussed, please find attached our available office suites along with pricing details.') +
  '{{offer}}' +
  bP("If you're happy to go ahead, you can review and accept online using the button below — your licence agreement follows straight after to e-sign. Any questions at all, feel free to give me a call.") +
  bBtn('Review &amp; accept proposal', '{{acceptLink}}') +
  bP('Look forward to hearing from you.') +
  bP('Thanks so much,') +
  '      {{signature}}')

export function renderProposalTemplate({ template, lead, settings, acceptLink, offer }) {
  const name = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const vars = {
    company: name,
    name: lead?.name || lead?.contactName || 'there',
    website,
    acceptLink: acceptLink || '#',
    offer: offer || '',
    signature: buildSignature(settings),
  }
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
