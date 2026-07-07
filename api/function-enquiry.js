// Vercel serverless — POST /api/function-enquiry  (public, CORS *)
// The Function Space Hire form on www.hexaspace.com.au posts here. Creates a
// function_bookings record in the 'enquiry' stage and notifies the events team,
// who then quote + send the digital agreement from the admin hub.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bH2, bTable, bSmall } from './_brand.js'
import { sendFunctionBrochure } from './_leads.js'

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

  const b = req.body ?? {}
  if (b.website) return res.status(200).json({ success: true }) // honeypot
  if (!b.email && !b.phone) return res.status(400).json({ error: 'Email or phone required' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const now = new Date().toISOString()
    const id = `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const ref = `FN-${Math.floor(100000 + Math.random() * 900000)}`
    const record = {
      id, ref, source: 'website', stage: 'enquiry', read: false,
      requestToken: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
      name: b.name ?? '', organisation: b.organisation ?? '', email: b.email ?? '', phone: b.phone ?? '',
      eventName: b.eventName ?? '', eventType: b.eventType ?? '',
      eventDate: b.eventDate ?? '', startTime: b.startTime ?? '', endTime: b.endTime ?? '',
      guests: b.guests ?? '', catering: !!b.catering,
      addons: {
        parking: !!(b.addons?.parking), nameTags: !!(b.addons?.nameTags), photographer: !!(b.addons?.photographer),
      },
      additionalRequirements: b.additionalRequirements ?? b.message ?? '',
      nurture: { step: 0, lastAt: now.split('T')[0] }, brochureSentAt: now,
      createdAt: now.split('T')[0], updatedAt: now,
    }
    const { error } = await supabase.from('function_bookings').upsert({ id, data: record, updated_at: now })
    if (error) { console.error('function-enquiry insert error:', error); return res.status(500).json({ error: 'Could not save enquiry' }) }

    notifyAdmin(supabase, record).catch(() => {})
    sendFunctionBrochure(supabase, record).catch(() => {}) // auto-brochure + book-a-time link
    return res.status(200).json({ success: true, ref })
  } catch (err) {
    console.error('function-enquiry error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function notifyAdmin(supabase, b) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data: settRows } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const html = brandFrame(
    bH2('New function space enquiry 🎉') +
    bTable([
      ['Name', `${b.name || '—'}${b.organisation ? ` (${b.organisation})` : ''}`],
      ['Email', b.email || '—'],
      ['Phone', b.phone || '—'],
      ['Event', `${b.eventName || '—'}${b.eventType ? ` · ${b.eventType}` : ''}`],
      ['When', `${b.eventDate || '—'} ${b.startTime || ''}–${b.endTime || ''}`],
      ['Guests', b.guests || '—'],
    ]) +
    bSmall('Open Function Space Bookings to quote and send the agreement.'),
    { footerLabel: 'Function Space Hire' }
  )
  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Function enquiry — ${b.name || b.email}`, html })
}
