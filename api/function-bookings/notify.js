// POST /api/function-bookings/notify
//
// mode='agreement'  — email the Client their agreement/quote signing link  (body: booking, signUrl)
// mode='signed'     — Client signed → notify the events team               (body: booking)
// mode='confirmed'  — booking confirmed → email the Client their confirmation (body: booking)
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from '../_email.js'
import { fillVars, findEmailTemplate } from '../_leads.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function money(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function getSettings(supabase) {
  const { data } = await supabase.from('settings').select('data').eq('id', 'global')
  return data?.[0]?.data ?? {}
}

function frame(fromName, inner) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;background:#f5f5f5">
<div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
  <div style="background:#000;padding:24px 32px"><span style="color:#fff;font-size:18px;font-weight:900;letter-spacing:3px">${(fromName || 'HEXA SPACE').toUpperCase()}</span>
    <span style="color:#888;font-size:12px;margin-left:12px">Function Space Hire</span></div>
  <div style="padding:32px">${inner}</div>
  <div style="background:#f5f5f5;padding:16px 32px;border-top:1px solid #eee">
    <p style="color:#999;font-size:11px;margin:0;text-align:center">Hexa Space · 402/830 Whitehorse Road, Box Hill VIC 3128 · hexaspace.com.au</p>
  </div>
</div></body></html>`
}

function summaryRows(b) {
  const q = b.quote || {}
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:13px">
    <tr><td style="padding:6px 0;color:#888;width:150px">Event</td><td style="padding:6px 0;color:#111">${b.eventName || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Date</td><td style="padding:6px 0;color:#111">${b.eventDate || '—'} · ${b.startTime || ''}–${b.endTime || ''}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Guests</td><td style="padding:6px 0;color:#111">${b.guests || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Total (inc GST)</td><td style="padding:6px 0;font-weight:700;color:#111">${money(q.total)}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Payable now</td><td style="padding:6px 0;color:#111">${money(q.dueNow)} <span style="color:#888">(50% deposit + $300 security)</span></td></tr>
  </table>`
}

async function sendMail(resendKey, { from, to, subject, html, replyTo }) {
  const r = await sendResendEmail({ from, to: Array.isArray(to) ? to : [to], subject, html, replyTo })
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
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
    const from = `${fromName} <${fromEmail}>`
    const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
    const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]

    // Load editable templates + build placeholder values. Client-facing emails
    // (agreement / confirmed / brochure) use the saved Templates → Emails copy
    // if present, else the built-in fallback below.
    const { data: tmplRows } = await supabase.from('templates').select('data')
    const templates = (tmplRows ?? []).map((r) => r.data)
    const q = b.quote || {}
    const vars = {
      company: settings?.company?.name || 'Hexa Space',
      name: b.name || 'there', organisation: b.organisation || '',
      eventName: b.eventName || 'your function', eventType: b.eventType || '',
      eventDate: b.eventDate || '', startTime: b.startTime || '', endTime: b.endTime || '',
      guests: b.guests || '', total: money(q.total), dueNow: money(q.dueNow), balanceDue: money(q.balanceDue),
      signLink: signUrl || '', website: settings?.company?.website || 'hexaspace.com.au',
      bookLink: `${settings?.functionBookingUrl || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/book-function` : 'https://www.hexaspace.com.au/book-function')}${b.requestToken ? `?ref=${b.requestToken}` : ''}`,
    }
    const pick = (type, fallbackSubject, fallbackHtml) => {
      const tpl = findEmailTemplate(templates, type)
      return tpl ? { subject: fillVars(tpl.subject, vars), html: fillVars(tpl.content, vars) } : { subject: fallbackSubject, html: fallbackHtml }
    }

    if (mode === 'agreement') {
      if (!b.email || !signUrl) return res.status(400).json({ error: 'Missing email or signUrl.' })
      const inner = `
        <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Function Space Hire Agreement</p>
        <h2 style="font-size:20px;color:#111;margin:0 0 18px">Hi ${b.name || 'there'} — your function quote is ready to review &amp; sign</h2>
        <p style="font-size:14px;color:#555;margin:0 0 20px">Please review your event details, add-ons, pricing and our terms, then sign digitally to secure your date.</p>
        ${summaryRows(b)}
        <div style="text-align:center;margin:28px 0">
          <a href="${signUrl}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:700;border-radius:6px">Review &amp; Sign Agreement</a>
        </div>
        <p style="font-size:12px;color:#999;margin:0">If the button doesn’t work, copy this link:<br><a href="${signUrl}" style="color:#888;word-break:break-all">${signUrl}</a></p>`
      const { subject, html } = pick('function_agreement', `Your Hexa Space function quote — ${b.eventName || 'Function Space Hire'}`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'signed') {
      if (!adminTo.length) return res.status(200).json({ sent: false })
      const inner = `
        <h2 style="font-size:18px;color:#111;margin:0 0 16px">Function agreement signed ✅</h2>
        <p style="font-size:14px;color:#555;margin:0 0 18px"><strong>${b.name || b.email}</strong>${b.organisation ? ` (${b.organisation})` : ''} has signed the function hire agreement.</p>
        ${summaryRows(b)}
        <p style="font-size:13px;color:#555;margin:0">Open Function Space Bookings to confirm the booking and raise the deposit invoice.</p>`
      const ok = await sendMail(resendKey, { from, to: adminTo, subject: `Function signed: ${b.name || b.email} — ${b.eventName || ''}`, html: frame(fromName, inner) })
      return res.status(200).json({ sent: ok })
    }

    if (mode === 'confirmed') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const win = `${b.startTime || ''}–${b.endTime || ''}`
      const inner = `
        <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Booking Confirmed</p>
        <h2 style="font-size:20px;color:#111;margin:0 0 18px">You're booked in, ${b.name || 'there'}! 🎉</h2>
        <p style="font-size:14px;color:#555;margin:0 0 20px">Your function at Hexa Space is confirmed. We've reserved your time (plus a 30-minute setup buffer each side). Your deposit and security invoices are on their way; the balance is due 14 days before your event.</p>
        ${summaryRows(b)}
        <p style="font-size:13px;color:#555;margin:0">Questions? Just reply to this email — we can’t wait to host you.</p>`
      const { subject, html } = pick('function_confirmed', `Confirmed — your function at Hexa Space (${b.eventDate || ''} ${win})`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'amend_date') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const inner = `
        <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Function Space Hire</p>
        <h2 style="font-size:20px;color:#111;margin:0 0 18px">Hi ${b.name || 'there'} — that date isn't available</h2>
        <p style="font-size:14px;color:#555;margin:0 0 20px">Thanks for your function request${b.eventDate ? ` for <strong>${b.eventDate}</strong>` : ''}. Unfortunately the space is already booked then. Could you pick another date? Just resubmit and we'll get you locked in.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${vars.bookLink}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:700;border-radius:6px">Choose another date</a>
        </div>
        <p style="font-size:12px;color:#999;margin:0">Or just reply to this email with a couple of dates that suit and we'll check availability for you.</p>`
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject: `A new date for your Hexa Space function`, html: frame(fromName, inner) })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    if (mode === 'brochure') {
      if (!b.email) return res.status(400).json({ error: 'No client email.' })
      const hasQuote = b.quote && b.quote.total
      const rateCard = `
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13px">
          <tr><td style="padding:6px 0;color:#888">Venue hire (weekday)</td><td style="padding:6px 0;text-align:right;color:#111">$250 + GST / hour</td></tr>
          <tr><td style="padding:6px 0;color:#888">Venue hire (weekend)</td><td style="padding:6px 0;text-align:right;color:#111">$325 + GST / hour</td></tr>
          <tr><td style="padding:6px 0;color:#888">Cleaning fee</td><td style="padding:6px 0;text-align:right;color:#111">$200 + GST</td></tr>
          <tr><td style="padding:6px 0;color:#888">Refundable security deposit</td><td style="padding:6px 0;text-align:right;color:#111">$300</td></tr>
          <tr><td style="padding:6px 0;color:#888">Capacity</td><td style="padding:6px 0;text-align:right;color:#111">20–100 guests</td></tr>
        </table>`
      const inner = `
        <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Function Space Hire</p>
        <h2 style="font-size:20px;color:#111;margin:0 0 16px">Hi ${b.name || 'there'} — thanks for your interest in our function space</h2>
        <p style="font-size:14px;color:#555;margin:0 0 18px">Our light-filled venue suits launches, dinners, conferences and celebrations. Here’s a quick overview${hasQuote ? ' and an indicative quote for your dates' : ''}:</p>
        ${hasQuote ? summaryRows(b) : rateCard}
        <p style="font-size:13px;color:#555;margin:0 0 18px">Ready to lock it in? Choose your preferred date and layout — we’ll review availability and get your booking underway.</p>
        <div style="text-align:center;margin:24px 0"><a href="${vars.bookLink}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 36px;font-size:14px;font-weight:700;border-radius:6px">Book a time</a></div>
        <p style="font-size:12px;color:#999;margin:16px 0 0">Questions? Reply any time — we’d love to host you.</p>`
      const { subject, html } = pick('function_brochure', `Hexa Space function space — ${b.eventName || 'your enquiry'}`, frame(fromName, inner))
      const ok = await sendMail(resendKey, { from, to: b.email, replyTo, subject, html })
      return res.status(ok ? 200 : 500).json({ sent: ok })
    }

    return res.status(400).json({ error: 'Unknown mode.' })
  } catch (err) {
    console.error('function-bookings/notify error:', err)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
