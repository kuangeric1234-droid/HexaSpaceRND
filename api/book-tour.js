// Vercel serverless — POST /api/book-tour
// Public endpoint for the "Book a private tour" page. Creates (or updates an
// existing) lead in the CRM with source 'book-tour', which also stops the
// nurture sequence. Requires SUPABASE_SERVICE_ROLE_KEY; RESEND_API_KEY optional.
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

  const { name, email, phone, businessName, enquiryType, preferredDate, preferredTime, message, website } = req.body ?? {}
  if (website) return res.status(200).json({ success: true }) // honeypot
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: stageRows }, { data: leadRows }] = await Promise.all([
      supabase.from('lead_pipeline_stages').select('data'),
      supabase.from('leads').select('id, data'),
    ])
    const stages = (stageRows ?? []).map((r) => r.data)
    const newStage = stages.find((s) => s.category === 'new')
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    const tourNote = `Tour requested${preferredDate ? ` for ${preferredDate}${preferredTime ? ` ${preferredTime}` : ''}` : ''}${message ? ` — ${message}` : ''}`

    // Update an existing lead with the same email (so we don't duplicate and the
    // nurture flow stops), otherwise create a fresh one.
    const existing = email ? (leadRows ?? []).find((r) => (r.data?.email || '').toLowerCase() === email.toLowerCase()) : null

    let id, lead
    if (existing) {
      id = existing.id
      lead = {
        ...existing.data,
        phone: existing.data.phone || phone || '',
        businessName: existing.data.businessName || businessName || '',
        enquiryType: enquiryType || existing.data.enquiryType || null,
        source: 'book-tour',
        tourBookedAt: now,
        tourDate: preferredDate || existing.data.tourDate || '',
        tourTime: preferredTime || existing.data.tourTime || '',
        notes: [existing.data.notes, tourNote].filter(Boolean).join('\n'),
        read: false,
        nurture: { ...(existing.data.nurture || {}), done: true, lastAt: today },
      }
    } else {
      id = `lead${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      lead = {
        id, name: name ?? '', businessName: businessName ?? '', email: email ?? '', phone: phone ?? '',
        spaceId: '', source: 'book-tour', stageId: newStage?.id ?? 'stage_new', value: 0,
        notes: tourNote, tenantId: null, type: 'enquiry', read: false,
        enquiryType: enquiryType ?? null, tourBookedAt: now, tourDate: preferredDate ?? '', tourTime: preferredTime ?? '',
        createdAt: today, stageEnteredAt: today,
        nurture: { step: 99, done: true, lastAt: today }, // booked → no nurture
      }
    }

    const { error } = await supabase.from('leads').upsert({ id, data: lead, updated_at: now })
    if (error) { console.error('book-tour insert error:', error); return res.status(500).json({ error: 'Could not save request' }) }

    notifyAdmin(supabase, lead).catch(() => {})
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('book-tour error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function notifyAdmin(supabase, lead) {
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
      <h2 style="margin:0 0 12px;font-size:16px">New tour request 🗓️</h2>
      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;font-size:13px;color:#555">
        <div><strong>Name:</strong> ${lead.name || '—'}${lead.businessName ? ` (${lead.businessName})` : ''}</div>
        <div><strong>Email:</strong> ${lead.email || '—'}</div>
        <div><strong>Phone:</strong> ${lead.phone || '—'}</div>
        <div><strong>Interested in:</strong> ${lead.enquiryType || '—'}</div>
        <div><strong>Preferred:</strong> ${lead.tourDate || '—'} ${lead.tourTime || ''}</div>
      </div>
      <p style="font-size:12px;color:#888;margin-top:20px">Added to your Leads pipeline. Confirm a time with them to lock in the inspection.</p>
    </div>
  </div></body></html>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject: `Tour request — ${lead.name || lead.email}`, html }),
  })
}
