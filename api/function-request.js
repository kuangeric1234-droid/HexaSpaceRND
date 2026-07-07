// Vercel serverless — POST /api/function-request  (public, CORS *)
// The branded "Book a time" page on www.hexaspace.com.au posts here. Moves an
// existing enquiry (matched by ref = requestToken from the brochure link) — or
// creates a new record — to the 'requested' stage for admin review.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bH2, bTable, bSmall } from './_brand.js'

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
    const { data: rows } = await supabase.from('function_bookings').select('id, data')
    const all = (rows ?? []).map((r) => r.data)
    const existing = b.ref
      ? all.find((x) => x?.requestToken === b.ref)
      : (b.email ? all.find((x) => (x?.email || '').toLowerCase() === String(b.email).toLowerCase() && !['confirmed', 'completed', 'refunded', 'cancelled'].includes(x?.stage)) : null)

    const fields = {
      name: b.name ?? existing?.name ?? '',
      organisation: b.organisation ?? existing?.organisation ?? '',
      email: b.email ?? existing?.email ?? '',
      phone: b.phone ?? existing?.phone ?? '',
      eventName: b.eventName ?? existing?.eventName ?? '',
      eventType: b.eventType ?? existing?.eventType ?? '',
      layout: b.layout ?? existing?.layout ?? 'Cocktail',
      eventDate: b.eventDate ?? existing?.eventDate ?? '',
      startTime: b.startTime ?? existing?.startTime ?? '',
      endTime: b.endTime ?? existing?.endTime ?? '',
      guests: b.guests ?? existing?.guests ?? '',
      additionalRequirements: b.additionalRequirements ?? b.message ?? existing?.additionalRequirements ?? '',
    }

    let record
    if (existing) {
      record = { ...existing, ...fields, stage: 'requested', requestedAt: now, read: false, updatedAt: now }
    } else {
      const id = `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      record = {
        id, ref: `FN-${Math.floor(100000 + Math.random() * 900000)}`, requestToken: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        source: b.source || 'website', stage: 'requested', read: false,
        ...fields, catering: !!b.catering,
        addons: { parking: !!(b.addons?.parking), nameTags: !!(b.addons?.nameTags), photographer: !!(b.addons?.photographer) },
        requestedAt: now, createdAt: now.split('T')[0], updatedAt: now,
      }
    }

    const { error } = await supabase.from('function_bookings').upsert({ id: record.id, data: record, updated_at: now })
    if (error) { console.error('function-request insert error:', error); return res.status(500).json({ error: 'Could not save request' }) }
    notifyAdmin(supabase, record).catch(() => {})
    return res.status(200).json({ success: true, ref: record.ref })
  } catch (err) {
    console.error('function-request error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function notifyAdmin(supabase, b) {
  const { data: settRows } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const html = brandFrame(
    bH2('Function booking request — review needed 🗓️') +
    bTable([
      ['Name', `${b.name || '—'}${b.organisation ? ` (${b.organisation})` : ''}`],
      ['Email', b.email || '—'],
      ['Event', `${b.eventName || '—'}${b.eventType ? ` · ${b.eventType}` : ''}`],
      ['Requested date', `${b.eventDate || '—'} ${b.startTime || ''}${b.endTime ? `–${b.endTime}` : ''}`],
      ['Layout', `${b.layout || '—'} · ${b.guests || '—'} guests`],
    ]) +
    bSmall('Review in Function Bookings — check for clashes, then approve to invite them to the portal.'),
    { footerLabel: 'Function Space Hire' }
  )
  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Function request — ${b.name || b.email} (${b.eventDate || 'no date'})`, html })
}
