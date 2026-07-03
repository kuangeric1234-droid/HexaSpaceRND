// Vercel serverless function — POST /api/popup-booking
// Public endpoint for the Lonsdale 369 pop-up booking page on hexahub.com.au.
// Creates an `event_bookings` row (status 'draft') so it lands in the Pop-up
// Bookings admin view, where staff review availability and send the licence to
// sign (reusing the existing /sign/event/<token> flow). No signing token is
// issued here — that happens when an admin clicks "Send" after reviewing.
// Requires env vars: SUPABASE_SERVICE_ROLE_KEY, (optional) RESEND_API_KEY.
//
// Body: { name, businessName, email, phone, startDate, endDate, days, dailyRate, message, website }

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const VENUE = 'Lonsdale 369'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, businessName, email, phone, startDate, endDate, days, dailyRate, message, website } = req.body ?? {}

  // Honeypot
  if (website) return res.status(200).json({ success: true })

  if (!name || !email) return res.status(400).json({ error: 'Name and email required' })
  if (!startDate || !endDate) return res.status(400).json({ error: 'Please choose your booking dates' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  const dayCount = Number(days) || 0
  const rate = Number(dailyRate) || 0
  const fee = dayCount * rate
  const now = new Date().toISOString()
  const id = `eb${Date.now()}`

  const booking = {
    id,
    ref: `PB-${String(Date.now()).slice(-6)}`,
    type: 'popup',
    status: 'draft',           // staff review → "Send" issues the signing link
    source: 'popup-booking',
    // Licensee / customer
    vendorName: String(name).trim(),
    vendorBusiness: String(businessName ?? '').trim(),
    vendorEmail: String(email).trim(),
    vendorPhone: String(phone ?? '').trim(),
    vendorDescription: String(message ?? '').trim(),
    // Pop-up booking specifics
    venue: VENUE,
    allocatedSpace: `${VENUE} — pop-up space`,
    bookingStartDate: startDate,
    bookingEndDate: endDate,
    bookingDays: dayCount,
    dailyRate: rate,
    participationFee: fee,
    detailsCompleted: true,
    createdAt: now,
    updatedAt: now,
  }

  const { error } = await supabase.from('event_bookings').upsert({ id, data: booking, updated_at: now })
  if (error) {
    console.error('popup-booking insert error:', error)
    return res.status(500).json({ error: 'Could not save your booking' })
  }

  notifyAdmin(supabase, booking).catch(() => {})
  return res.status(200).json({ success: true })
}

async function notifyAdmin(supabase, b) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = data?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'HexaHub'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
  const fee = b.participationFee ? `$${Number(b.participationFee).toLocaleString('en-AU')}` : '—'

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
    <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
      <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${fromName.toUpperCase()}</span></div>
      <div style="padding:32px;font-size:13px;color:#555">
        <h2 style="margin:0 0 12px;font-size:16px;color:#1a1a1a">New ${b.venue} pop-up booking 🛍️</h2>
        <div><strong>Name:</strong> ${b.vendorName}${b.vendorBusiness ? ` (${b.vendorBusiness})` : ''}</div>
        <div><strong>Email:</strong> ${b.vendorEmail}</div>
        <div><strong>Phone:</strong> ${b.vendorPhone || '—'}</div>
        <div><strong>Dates:</strong> ${b.bookingStartDate} → ${b.bookingEndDate} (${b.bookingDays} day${b.bookingDays === 1 ? '' : 's'})</div>
        <div><strong>Estimated fee:</strong> ${fee}</div>
        ${b.vendorDescription ? `<div style="margin-top:8px"><strong>Note:</strong><br>${String(b.vendorDescription).replace(/</g, '&lt;')}</div>` : ''}
        <p style="margin-top:16px">Review availability in Pop-up Bookings, then send the licence to sign.</p>
      </div>
    </div></body></html>`

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `New ${b.venue} pop-up booking — ${b.vendorName}`, html })
}
