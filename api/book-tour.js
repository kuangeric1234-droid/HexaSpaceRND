// Vercel serverless — POST /api/book-tour
// Public endpoint for the "Book a private tour" page. Creates (or updates an
// existing) lead in the CRM with source 'book-tour', which also stops the
// nurture sequence. Requires SUPABASE_SERVICE_ROLE_KEY; RESEND_API_KEY optional.
import { createClient } from '@supabase/supabase-js'
import { LEAD_NOTIFY, fillVars, findEmailTemplate, sendResend } from './_leads.js'
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

    // Awaited — Vercel kills unawaited sends once the response goes out.
    const sends = await Promise.allSettled([
      notifyAdmin(supabase, lead),
      sendTourConfirmation(supabase, lead),
    ])
    sends.forEach((r) => { if (r.status === 'rejected') console.error('book-tour email:', r.reason) })
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
  const to = [...new Set([...LEAD_NOTIFY, settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const html = brandFrame(
    bH2('New tour request 🗓️') +
    bTable([
      ['Name', `${lead.name || '—'}${lead.businessName ? ` (${lead.businessName})` : ''}`],
      ['Email', lead.email || '—'],
      ['Phone', lead.phone || '—'],
      ['Interested in', lead.enquiryType || '—'],
      ['Preferred', `${lead.tourDate || '—'} ${lead.tourTime || ''}`],
    ]) +
    bSmall('Added to your Leads pipeline. Confirm a time with them to lock in the inspection.'),
    { footerLabel: 'Book a Tour' }
  )
  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Tour request — ${lead.name || lead.email}`, html })
}

// Branded confirmation to the enquirer (editable "Tour confirmation" template).
async function sendTourConfirmation(supabase, lead) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !lead.email) return
  const [{ data: settRows }, { data: tmplRows }] = await Promise.all([
    supabase.from('settings').select('data').eq('id', 'global'),
    supabase.from('templates').select('data'),
  ])
  const settings = settRows?.[0]?.data ?? {}
  const templates = (tmplRows ?? []).map((r) => r.data)
  const tpl = findEmailTemplate(templates, 'tour_confirmation')
  if (!tpl) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
  const tourWhen = lead.tourDate ? ` for ${lead.tourDate}${lead.tourTime ? ` at ${lead.tourTime}` : ''}` : ''
  const vars = {
    company: settings?.company?.name || 'Hexa Space',
    name: lead.name || 'there',
    tourWhen, tourDate: lead.tourDate || '', tourTime: lead.tourTime || '',
    website: settings?.company?.website || 'hexaspace.com.au',
  }
  await sendResend(resendKey, { fromName, fromEmail, to: lead.email, subject: fillVars(tpl.subject, vars), html: fillVars(tpl.content, vars), replyTo })
}
