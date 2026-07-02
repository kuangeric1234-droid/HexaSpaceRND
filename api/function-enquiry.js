// Vercel serverless — POST /api/function-enquiry  (public, CORS *)
// The Function Space Hire form on www.hexaspace.com.au posts here. Creates a
// function_bookings record in the 'enquiry' stage and notifies the events team,
// who then quote + send the digital agreement from the admin hub.
import { createClient } from '@supabase/supabase-js'

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
      name: b.name ?? '', organisation: b.organisation ?? '', email: b.email ?? '', phone: b.phone ?? '',
      eventName: b.eventName ?? '', eventType: b.eventType ?? '',
      eventDate: b.eventDate ?? '', startTime: b.startTime ?? '', endTime: b.endTime ?? '',
      guests: b.guests ?? '', catering: !!b.catering,
      addons: {
        parking: !!(b.addons?.parking), nameTags: !!(b.addons?.nameTags), photographer: !!(b.addons?.photographer),
      },
      additionalRequirements: b.additionalRequirements ?? b.message ?? '',
      createdAt: now.split('T')[0], updatedAt: now,
    }
    const { error } = await supabase.from('function_bookings').upsert({ id, data: record, updated_at: now })
    if (error) { console.error('function-enquiry insert error:', error); return res.status(500).json({ error: 'Could not save enquiry' }) }

    notifyAdmin(supabase, record).catch(() => {})
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
  const to = settings?.emails?.notificationEmail
  if (!to) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${fromName.toUpperCase()}</span></div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:16px">New function space enquiry 🎉</h2>
      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;font-size:13px;color:#555">
        <div><strong>Name:</strong> ${b.name || '—'}${b.organisation ? ` (${b.organisation})` : ''}</div>
        <div><strong>Email:</strong> ${b.email || '—'}</div>
        <div><strong>Phone:</strong> ${b.phone || '—'}</div>
        <div><strong>Event:</strong> ${b.eventName || '—'}${b.eventType ? ` · ${b.eventType}` : ''}</div>
        <div><strong>When:</strong> ${b.eventDate || '—'} ${b.startTime || ''}–${b.endTime || ''}</div>
        <div><strong>Guests:</strong> ${b.guests || '—'}</div>
      </div>
      <p style="font-size:12px;color:#888;margin-top:20px">Open Function Space Bookings to quote and send the agreement.</p>
    </div>
  </div></body></html>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject: `Function enquiry — ${b.name || b.email}`, html }),
  })
}
