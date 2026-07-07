// Vercel serverless function — POST /api/event-rsvp
// Public endpoint that saves a website event RSVP/registration into the Hexa Space
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
import { brandFrame, bH2, bP, bSmall, bPanel } from './_brand.js'

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
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'

  const html = brandFrame(
    bH2('New event registration 🎟️') +
    bPanel(
      bP(`<strong>Event:</strong> ${reg.eventName || reg.eventSlug}`) +
      bP(`<strong>Name:</strong> ${reg.name || '—'}${reg.businessName ? ` (${reg.businessName})` : ''}`) +
      bP(`<strong>Email:</strong> ${reg.email || '—'}`) +
      bP(`<strong>Phone:</strong> ${reg.phone || '—'}`) +
      bP(`<strong>Guests:</strong> ${reg.guests}`) +
      (reg.message ? bP(`<strong>Message:</strong><br>${reg.message.replace(/</g, '&lt;')}`) : '')
    ) +
    bSmall('Saved to Event Registrations in Hexa Space.'),
    { footerLabel: 'Events' }
  )

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `New RSVP — ${reg.eventName || reg.eventSlug}`, html })
}
