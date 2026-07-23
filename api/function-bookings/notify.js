// POST /api/function-bookings/notify
//
// mode='agreement'  — email the Client their agreement/quote signing link  (body: booking, signUrl)
// mode='signed'     — Client signed → notify the events team               (body: booking)
// mode='confirmed'  — booking confirmed → email the Client their confirmation (body: booking)
// mode='amend_date' — requested date unavailable → ask the Client to re-pick (body: booking)
// mode='brochure'   — send the function rate card / indicative quote        (body: booking)
//
// All client-facing copy prefers the saved Templates → Emails entry (pick());
// the built-in fallbacks below are branded to the Hexa Space guidelines
// (olive / greige / ink + brand fonts with web-safe fallbacks, caps logo,
// social footer). Kept self-contained — no imports from src.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from '../_email.js'
import { fillVars, findEmailTemplate, functionBookLink, functionBrochureAttachment } from '../_leads.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// ── Hexa Space branded email kit (self-contained for the serverless runtime) ──
const OLIVE = '#7F8B2F', GREIGE = '#EFEDF2', INK = '#1a1a1a', MUTE = '#6b6b6b', HAIR = '#e3e1e6'
const SERIF = "'HexaBig', Georgia, 'Times New Roman', serif"
const SANS = "'HexaGT', 'Helvetica Neue', Arial, sans-serif"
const CAPS = "'HexaRework', 'Helvetica Neue', Arial, sans-serif"
const FONTS = `
    @font-face{font-family:'HexaBig';src:url('https://admin.hexaspace.com.au/fonts/BigDailyShort-ExtraLight.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaGT';src:url('https://admin.hexaspace.com.au/fonts/GT-America-Standard-Thin.otf') format('opentype');font-weight:400;font-display:swap}
    @font-face{font-family:'HexaRework';src:url('https://admin.hexaspace.com.au/fonts/ReworkMicro-Semibold.otf') format('opentype');font-weight:600;font-display:swap}`
const SOCIAL_ROW = `<div style="margin-top:12px">` +
  `<a href="https://www.instagram.com/hexaspace.coworking" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Instagram</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.linkedin.com/company/hexa-space/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">LinkedIn</a>` +
  `<span style="color:${HAIR};font-size:9px">&nbsp;&nbsp;·&nbsp;&nbsp;</span>` +
  `<a href="https://www.hexaspace.com.au/" style="font-family:${CAPS};font-size:9px;letter-spacing:.2em;color:${MUTE};text-decoration:none;text-transform:uppercase">Website</a>` +
  `</div>`

const bKicker = (t) => `<div style="font-family:${CAPS};font-size:11px;letter-spacing:.28em;color:${OLIVE};text-transform:uppercase;margin:0 0 12px">${t}</div>`
const bH1 = (t) => `<h1 style="font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.14;color:${INK};margin:0 0 16px">${t}</h1>`
const bP = (t) => `<p style="font-family:${SANS};font-size:14px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">${t}</p>`
const bSmall = (t) => `<p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTE};margin:16px 0 0">${t}</p>`
const bBtn = (label, href) => `<div style="text-align:center;margin:26px 0"><a href="${href}" style="display:inline-block;background:${OLIVE};color:#ffffff;text-decoration:none;padding:13px 34px;font-family:${CAPS};font-size:12px;letter-spacing:.14em;text-transform:uppercase;border-radius:6px"><span style="color:#ffffff;text-decoration:none">${label}</span></a></div>`

function money(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function getSettings(supabase) {
  const { data } = await supabase.from('settings').select('data').eq('id', 'global')
  return data?.[0]?.data ?? {}
}

function frame(fromName, inner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${FONTS}</style></head>
<body style="margin:0;padding:0;background:${GREIGE};font-family:${SANS};color:${INK}">
  <div style="max-width:600px;margin:0 auto;padding:30px 16px">
    <div style="text-align:center;padding:6px 0 22px">
      <span style="font-family:${CAPS};font-size:15px;letter-spacing:.34em;color:${INK};text-transform:uppercase">HEXA&nbsp;SPACE</span>
      <span style="font-family:${SANS};font-size:14px;color:${OLIVE};letter-spacing:.12em">&nbsp;&nbsp;六合空间</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${HAIR};border-radius:12px;overflow:hidden">
      <div style="height:3px;background:${OLIVE}"></div>
      <div style="padding:38px 40px">${inner}</div>
    </div>
    <div style="text-align:center;padding:22px 8px 6px">
      <div style="font-family:${CAPS};font-size:10px;letter-spacing:.3em;color:${OLIVE};text-transform:uppercase">Function Space Hire</div>
      ${SOCIAL_ROW}
      <div style="font-family:${SANS};font-size:11px;color:#9a9aa0;margin-top:10px">Hexa Space · 402/830 Whitehorse Road, Box Hill VIC 3128 · hexaspace.com.au</div>
    </div>
  </div>
</body></html>`
}

const sumRow = (l, v, strong) => `<tr>
    <td style="padding:9px 0;font-family:${SANS};font-size:12px;color:${MUTE};width:150px;border-bottom:1px solid ${HAIR}">${l}</td>
    <td style="padding:9px 0;font-family:${SANS};font-size:13px;color:${INK};${strong ? 'font-weight:600;' : ''}border-bottom:1px solid ${HAIR}">${v}</td>
  </tr>`

// dd/mm/yyyy from a YYYY-MM-DD date string.
function dmy(d) { const [y, m, day] = String(d || '').split('-'); return day ? `${day}/${m}/${y}` : '—' }

// Resolve a booking's sessions from the quote (priced) or the raw booking.
function bookingSessionList(b) {
  const q = b.quote || {}
  if (Array.isArray(q.sessions) && q.sessions.length) return q.sessions
  if (Array.isArray(b.sessions) && b.sessions.length) return b.sessions
  return b.eventDate ? [{ date: b.eventDate, startTime: b.startTime, endTime: b.endTime }] : []
}

// The Date / Sessions portion of the summary table — one line for a single
// booking, a full per-session list (with per-session $ when priced) for a series.
function sessionRows(b) {
  const q = b.quote || {}
  const ss = bookingSessionList(b)
  if (ss.length <= 1) {
    const s = ss[0] || {}
    return sumRow('Date', `${dmy(s.date)} · ${s.startTime || ''}–${s.endTime || ''}`)
  }
  const priced = Array.isArray(q.sessions) && q.sessions.length
  let rows = sumRow(`Sessions (${ss.length})`, '', true)
  ss.forEach((s) => { rows += sumRow(`${dmy(s.date)} · ${s.startTime || ''}–${s.endTime || ''}`, priced ? money(s.rental) : '') })
  if (q.cleaning) rows += sumRow(`Cleaning — ${q.sessionCount || ss.length} sessions`, money(q.cleaning))
  return rows
}

function summaryRows(b) {
  const q = b.quote || {}
  return `<table style="width:100%;border-collapse:collapse;margin:4px 0 24px">
    ${sumRow('Event', b.eventName || '—')}
    ${sessionRows(b)}
    ${sumRow('Guests', b.guests || '—')}
    ${q.discount > 0 ? sumRow('Discount' + (q.discountPct ? ` (${q.discountPct}%)` : '') + (q.discountReason ? ` - ${q.discountReason}` : ''), `-${money(q.discount)}`) : ''}
    ${sumRow('Total (inc GST)', money(q.total), true)}
    ${sumRow('Payable now', `${money(q.dueNow)} <span style="color:${MUTE}">(50% deposit + $300 security)</span>`)}
  </table>`
}

async function sendMail(resendKey, { from, to, subject, html, replyTo, attachments }) {
  const r = await sendResendEmail({ from, to: Array.isArray(to) ? to : [to], subject, html, replyTo, attachments })
  return r.ok
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(500).json({ error: 'Email not configured.' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  const { booking: b, signUrl, mode } = req.body ?? {}
  if (!b) return res.status(400).json({ error: 'Missing booking.' })

  try {
    const settings = await getSettings(supabase)
    const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
    const from = `${fromName} <${fromEmail}>`
    const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
    const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]

    // Load editable templates + build placeholder values. Client-facing emails
    // (agreement / confirmed / brochure) use the saved Templates → Emails copy
    // if present, else the built-in branded fallback below.
    const { data: tmplRows } = await supabase.from('templates').select('data')
    const templates = (tmplRows ?? []).map((r) => r.data)
    const q = b.quote || {}
    const vars = {
      company: settings?.company?.name || 'Hexa Space',
      name: b.name || 'there', organisation: b.organisation || '',
      eventName: b.eventName || 'your function', eventType: b.eventType || '',
      eventDate: b.eventDate || '', startTime: b.startTime || '', endTime: b.endTime || '',
      // {{sessions}} → the multi-session-aware Date/Sessions rows (used by the
      // editable function templates in place of a single hardcoded Date line).
      sessions: sessionRows(b),
      guests: b.guests || '', total: money(q.total), dueNow: money(q.dueNow), balanceDue: money(q.balanceDue),
      signLink: signUrl || '', website: settings?.company?.website || 'hexaspace.com.au',
      bookLink: functionBookLink(settings, b.requestToken),
    }
    const pick = (type, fallbackSubject, fallbackHtml) => {
      const tpl = findEmailTemplate(templates, type)
      return tpl ? { subject: fillVars(tpl.subject, vars), html: fillVars(tpl.content, vars) } : { subject: fallbackSubject, html: fallbackHtml }
    }

    if (mode === 'agreement') {
      if (!b.email || !signUrl) return res.status(400).json({ error: 'Missing email or signUrl.' })
      const inner = bKicker('Function Space Hire Agreement') +
        bH1(`Hi ${b.name || 'there'} — your function quote is ready to review &amp; sign`) +
        bP('Please review your event details, add-ons, pricing and our terms, then sign digitally to secure your date.') +
        summaryRows(b) +
        bBtn('Review &amp; sign agreement', signUrl) +
        bSmall(`If the button doesn't work, copy this link:<br><a href="${signUrl}" style="color:${OLIVE};word-break:break-all">${signUrl}</a>`)
      const { subject, html } = pick('function_agreement', `Your Hexa Space function quote — ${b.eventName || 'Function Space Hire'}`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'signed') {
      if (!adminTo.length) return res.status(200).json({ sent: false })
      const inner = bKicker('Agreement Signed') +
        bH1('Function agreement signed ✅') +
        bP(`<strong style="color:${INK}">${b.name || b.email}</strong>${b.organisation ? ` (${b.organisation})` : ''} has signed the function hire agreement.`) +
        summaryRows(b) +
        bP('Open Function Space Bookings to confirm the booking and raise the deposit invoice.')
      const ok = await sendMail(resendKey, { from, to: adminTo, subject: `Function signed: ${b.name || b.email} — ${b.eventName || ''}`, html: frame(fromName, inner) })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'confirmed') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const win = `${b.startTime || ''}–${b.endTime || ''}`
      const inner = bKicker('Booking Confirmed') +
        bH1(`You're booked in, ${b.name || 'there'}! 🎉`) +
        bP("Your function at Hexa Space is confirmed. We've reserved your time (plus a 30-minute setup buffer each side). Your deposit and security invoices are on their way; the balance is due 14 days before your event.") +
        summaryRows(b) +
        bP('Questions? Just reply to this email — we can\'t wait to host you.')
      const { subject, html } = pick('function_confirmed', `Confirmed — your function at Hexa Space (${b.eventDate || ''} ${win})`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'amend_date') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const inner = bKicker('Function Space Hire') +
        bH1(`Hi ${b.name || 'there'} — that date isn't available`) +
        bP(`Thanks for your function request${b.eventDate ? ` for <strong style="color:${INK}">${b.eventDate}</strong>` : ''}. Unfortunately the space is already booked then. Could you pick another date? Just resubmit and we'll get you locked in.`) +
        bBtn('Choose another date', vars.bookLink) +
        bSmall("Or just reply to this email with a couple of dates that suit and we'll check availability for you.")
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject: `A new date for your Hexa Space function`, html: frame(fromName, inner) })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'brochure') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const hasQuote = b.quote && b.quote.total
      const rcRow = (l, v) => `<tr>
        <td style="padding:9px 0;font-family:${SANS};font-size:12px;color:${MUTE};border-bottom:1px solid ${HAIR}">${l}</td>
        <td style="padding:9px 0;font-family:${SANS};font-size:13px;color:${INK};text-align:right;border-bottom:1px solid ${HAIR}">${v}</td>
      </tr>`
      const rateCard = `<table style="width:100%;border-collapse:collapse;margin:4px 0 22px">
        ${rcRow('Venue hire (weekday)', '$250 + GST / hour')}
        ${rcRow('Venue hire (weekend)', '$325 + GST / hour')}
        ${rcRow('Cleaning fee', '$200 + GST')}
        ${rcRow('Refundable security deposit', '$300')}
        ${rcRow('Capacity', '20–100 guests')}
      </table>`
      const inner = bKicker('Function Space Hire') +
        bH1(`Hi ${b.name || 'there'} — thanks for your interest in our function space`) +
        bP(`Our light-filled venue suits launches, dinners, conferences and celebrations. Here's a quick overview${hasQuote ? ' and an indicative quote for your dates' : ''}:`) +
        (hasQuote ? summaryRows(b) : rateCard) +
        bP("<strong>We've attached our full function brochure</strong> — take a look through the space, layouts, what's included and pricing.") +
        bP("Ready to lock it in? Choose your preferred date and layout — we'll review availability and get your booking underway.") +
        bBtn('Book a time', vars.bookLink) +
        bSmall("Questions? Reply any time — we'd love to host you.")
      const { subject, html } = pick('function_brochure', `Hexa Space function space — ${b.eventName || 'your enquiry'}`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html, attachments: functionBrochureAttachment(settings) })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    return res.status(400).json({ error: 'Unknown mode.' })
  } catch (err) {
    console.error('function-bookings/notify error:', err)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
