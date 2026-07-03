// Vercel serverless function — POST /api/event-rsvp
// Public endpoint that saves a website event RSVP/registration into the HexaHub
// CRM (replaces the HubSpot event form). One row per registration, grouped by
// event in the app. Uses the service-role key to write past RLS.
// Requires env vars: SUPABASE_SERVICE_ROLE_KEY, (optional) RESEND_API_KEY.
//
// Body (from the website EventRsvpForm):
//   { name, email, phone, businessName, message, guests,
//     eventSlug, eventName, source, website }
//   `website` is a honeypot.

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, phone, businessName, message, guests, eventSlug, eventName, source, website } = req.body ?? {}

  if (website) return res.status(200).json({ success: true }) // honeypot
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' })
  if (!eventSlug && !eventName) return res.status(400).json({ error: 'Missing event' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const id = `reg${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const registration = {
      id,
      eventSlug: eventSlug ?? '',
      eventName: eventName ?? '',
      name: name ?? '',
      businessName: businessName ?? '',
      email: email ?? '',
      phone: phone ?? '',
      guests: Number.isFinite(Number(guests)) ? Number(guests) : 1,
      message: message ?? '',
      source: source || 'event',
      read: false,
      createdAt: new Date().toISOString(),
    }

    const { error } = await supabase.from('event_registrations')
      .upsert({ id, data: registration, updated_at: new Date().toISOString() })
    if (error) {
      console.error('event-rsvp insert error:', error)
      return res.status(500).json({ error: 'Could not save registration' })
    }

    notifyAdmin(supabase, registration).catch(() => {})
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('event-rsvp error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function notifyAdmin(supabase, reg) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data: settRows } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'HexaHub'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${fromName.toUpperCase()}</span></div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:16px">New event registration 🎟️</h2>
      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;font-size:13px;color:#555">
        <div><strong>Event:</strong> ${reg.eventName || reg.eventSlug}</div>
        <div><strong>Name:</strong> ${reg.name || '—'}${reg.businessName ? ` (${reg.businessName})` : ''}</div>
        <div><strong>Email:</strong> ${reg.email || '—'}</div>
        <div><strong>Phone:</strong> ${reg.phone || '—'}</div>
        <div><strong>Guests:</strong> ${reg.guests}</div>
        ${reg.message ? `<div style="margin-top:8px"><strong>Message:</strong><br>${reg.message.replace(/</g, '&lt;')}</div>` : ''}
      </div>
      <p style="font-size:12px;color:#888;margin-top:20px">Saved to Event Registrations in HexaHub.</p>
    </div>
  </div></body></html>`

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `New RSVP — ${reg.eventName || reg.eventSlug}`, html })
}
