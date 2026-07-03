// Vercel serverless function — POST /api/form-submit
// Public endpoint that turns a website enquiry into a HexaHub lead (replaces
// HubSpot for hexahub.com.au form capture). Uses the service-role key to write
// past RLS, like the other server endpoints.
// Requires env vars: SUPABASE_SERVICE_ROLE_KEY, (optional) RESEND_API_KEY.
//
// Body (matches the website EnquiryForm fields):
//   { name, email, phone, businessName, message, unitId, source, website }
//   `website` is a honeypot — if filled, we treat it as a bot and no-op.

import { createClient } from '@supabase/supabase-js'
import { leadTypeFor, findEmailTemplate, renderLead, sendResend } from './_leads.js'
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

  const { name, email, phone, businessName, message, unitId, source, website, ref, intent } = req.body ?? {}

  // Honeypot — pretend success so bots don't retry.
  if (website) return res.status(200).json({ success: true })

  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  // Function-space enquiries belong in the Function Space Bookings funnel
  // (function_bookings table → CRM "Function Enquiries" tab), not the general
  // lead pipeline.
  if (isFunctionEnquiry(req.body)) {
    return handleFunctionEnquiry(req, res, supabase)
  }

  try {
    const [{ data: spaceRows }, { data: stageRows }, { data: refRows }, { data: tmplRows }, { data: settRows }] = await Promise.all([
      supabase.from('spaces').select('id, data'),
      supabase.from('lead_pipeline_stages').select('data'),
      supabase.from('referrers').select('data'),
      supabase.from('templates').select('data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])
    const templates = (tmplRows ?? []).map((r) => r.data)
    const settings = settRows?.[0]?.data ?? {}

    // Resolve the unit (by unitNumber) the enquiry is about.
    const spaces = (spaceRows ?? []).map((r) => ({ id: r.id, ...r.data }))
    const space = unitId
      ? spaces.find((s) => String(s.unitNumber).toLowerCase() === String(unitId).toLowerCase())
      : null

    // Resolve the referrer (by code) if the enquiry came via a referral link.
    const referrer = ref
      ? (refRows ?? []).map((r) => r.data).find((rr) => String(rr.code).toUpperCase() === String(ref).toUpperCase() && rr.status !== 'paused')
      : null

    // First "new" stage, else fall back to the default id.
    const stages = (stageRows ?? []).map((r) => r.data)
    const newStage = stages.find((s) => s.category === 'new')
    const stageId = newStage?.id ?? 'stage_new'

    const today = new Date().toISOString().split('T')[0]
    const id = `lead${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const leadType = leadTypeFor({ enquiryType: req.body?.enquiryType, interest: req.body?.interest }, space)
    const lead = {
      id,
      name: name ?? '',
      businessName: businessName ?? '',
      email: email ?? '',
      phone: phone ?? '',
      spaceId: space?.id ?? '',
      source: source || 'website',
      stageId,
      value: typeof space?.monthlyRate === 'number' ? space.monthlyRate : 0,
      notes: message ?? '',
      tenantId: null,
      type: 'enquiry',
      read: false, // surfaces as unread in the Enquiries inbox
      referrerId: referrer?.id ?? null,
      referralCode: referrer ? referrer.code : (ref || null),
      referralIntent: ref ? (intent || 'lease') : null,
      enquiryType: req.body?.enquiryType ?? req.body?.interest ?? null,
      createdAt: today,
      stageEnteredAt: today,
      // Nurture sequence state — advanced by the lead-nurture cron.
      nurture: { step: 0, type: leadType, lastAt: today },
    }

    const { error } = await supabase.from('leads').upsert({ id, data: lead, updated_at: new Date().toISOString() })
    if (error) {
      console.error('form-submit insert error:', error)
      return res.status(500).json({ error: 'Could not save enquiry' })
    }

    // Best-effort admin notification — never blocks the response.
    notifyAdmin(supabase, lead, space).catch(() => {})
    // Best-effort brochure email to the enquirer (Day 0 of the nurture flow).
    sendBrochure(lead, space, leadType, templates, settings).catch(() => {})

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('form-submit error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Detect a function-space enquiry from the website form's selector fields.
function isFunctionEnquiry(body = {}) {
  const hay = `${body.enquiryType || ''} ${body.interest || ''} ${body.unitId || ''} ${body.spaceType || ''} ${body.service || ''} ${body.subject || ''}`.toLowerCase()
  return /function/.test(hay)
}

// Create a function_bookings record in the 'enquiry' stage (mirrors
// /api/function-enquiry) and notify the events team.
async function handleFunctionEnquiry(req, res, supabase) {
  const b = req.body ?? {}
  try {
    const now = new Date().toISOString()
    const id = `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const ref = `FN-${Math.floor(100000 + Math.random() * 900000)}`
    const record = {
      id, ref, source: b.source || 'website', stage: 'enquiry', read: false,
      name: b.name ?? '', organisation: b.businessName ?? b.organisation ?? '', email: b.email ?? '', phone: b.phone ?? '',
      eventName: b.eventName ?? '', eventType: b.eventType ?? '',
      eventDate: b.eventDate ?? '', startTime: b.startTime ?? '', endTime: b.endTime ?? '',
      guests: b.guests ?? '', catering: !!b.catering,
      addons: { parking: !!(b.addons?.parking), nameTags: !!(b.addons?.nameTags), photographer: !!(b.addons?.photographer) },
      additionalRequirements: b.additionalRequirements ?? b.message ?? '',
      createdAt: now.split('T')[0], updatedAt: now,
    }
    const { error } = await supabase.from('function_bookings').upsert({ id, data: record, updated_at: now })
    if (error) { console.error('form-submit function insert error:', error); return res.status(500).json({ error: 'Could not save enquiry' }) }
    notifyFunctionAdmin(supabase, record).catch(() => {})
    return res.status(200).json({ success: true, ref })
  } catch (err) {
    console.error('handleFunctionEnquiry error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function notifyFunctionAdmin(supabase, b) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data: settRows } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
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
        ${b.eventDate ? `<div><strong>When:</strong> ${b.eventDate} ${b.startTime || ''}–${b.endTime || ''}</div>` : ''}
        ${b.additionalRequirements ? `<div style="margin-top:8px"><strong>Message:</strong><br>${String(b.additionalRequirements).replace(/</g, '&lt;')}</div>` : ''}
      </div>
      <p style="font-size:12px;color:#888;margin-top:20px">Added to CRM → Function Enquiries.</p>
    </div>
  </div></body></html>`
  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `Function enquiry — ${b.name || b.email}`, html })
}

async function notifyAdmin(supabase, lead, space) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const { data: settRows } = await supabase.from('settings').select('data').eq('id', 'global')
  const settings = settRows?.[0]?.data ?? {}
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return

  const fromName = settings?.emails?.fromName || settings?.company?.name || 'HexaHub'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
  const unit = space ? `${space.unitNumber}${space.address ? ` — ${space.address}` : ''}` : 'General enquiry'

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
    <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${fromName.toUpperCase()}</span></div>
    <div style="padding:32px">
      <h2 style="margin:0 0 12px;font-size:16px">New website enquiry 📩</h2>
      <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;padding:16px;font-size:13px;color:#555">
        <div><strong>Name:</strong> ${lead.name || '—'}${lead.businessName ? ` (${lead.businessName})` : ''}</div>
        <div><strong>Email:</strong> ${lead.email || '—'}</div>
        <div><strong>Phone:</strong> ${lead.phone || '—'}</div>
        <div><strong>Unit:</strong> ${unit}</div>
        <div style="margin-top:8px"><strong>Message:</strong><br>${(lead.notes || '—').replace(/</g, '&lt;')}</div>
      </div>
      <p style="font-size:12px;color:#888;margin-top:20px">This enquiry has been added to your Leads pipeline in HexaHub.</p>
    </div>
  </div></body></html>`

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `New enquiry — ${unit}`, html })
}

// Sends the membership-specific brochure email to the enquirer on Day 0.
async function sendBrochure(lead, space, leadType, templates, settings) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !lead.email) return
  const template = findEmailTemplate(templates, leadType)
  if (!template) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
  const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
  const membershipType = lead.enquiryType || (space?.type === 'office' ? 'Private Office' : 'membership')
  const { subject, html } = renderLead(template, { lead, membershipType, settings })
  await sendResend(resendKey, { fromName, fromEmail, to: lead.email, subject, html, replyTo })
}
