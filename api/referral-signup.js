// Vercel serverless function — POST /api/referral-signup
// Public, no-auth endpoint that lets anyone self-enrol as a referrer from
// www.hexaspace.com.au/refer. Idempotent by email: the same email always maps to
// the same referrer code/token (no duplicates, no admin step). Optionally also
// creates a direct lead when the referrer hands us a friend's details.
// Requires env vars: SUPABASE_SERVICE_ROLE_KEY, (optional) RESEND_API_KEY.
//
// Body: {
//   name, email, phone,                    // the referrer
//   referral?: { name, email, phone, message }  // optional friend to refer directly
// }

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bBtn, bPanel, bTable, SANS, MUTE, OLIVE } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SITE = 'https://www.hexaspace.com.au'
const APP = 'https://portal.hexaspace.com.au'
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const rand = (n) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, phone, referral, website } = req.body ?? {}

  // Honeypot
  if (website) return res.status(200).json({ success: true })

  const cleanEmail = String(email ?? '').trim().toLowerCase()
  if (!name || !cleanEmail) return res.status(400).json({ error: 'Name and email are required' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Valid email required' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    // ── Idempotent by email — reuse an existing referrer if one matches. ──
    const { data: refRows } = await supabase.from('referrers').select('id, data')
    const existing = (refRows ?? [])
      .map((r) => ({ id: r.id, ...r.data }))
      .find((rr) => String(rr.email ?? '').trim().toLowerCase() === cleanEmail)

    let referrer = existing
    let alreadyEnrolled = !!existing

    if (!referrer) {
      const letters = String(name).replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() || 'REF'
      const today = new Date().toISOString().split('T')[0]
      referrer = {
        id: `ref${Date.now()}`,
        name: String(name).trim(),
        email: cleanEmail,
        phone: String(phone ?? '').trim(),
        code: `${letters}${rand(3)}`,
        token: rand(12),
        commissionRate: 5,        // internal default — set per referrer in the CRM
        status: 'active',         // auto-active
        selfEnrolled: true,       // surfaced with a badge in the Referrals tab
        notes: 'Self-enrolled via website',
        createdAt: today,
      }
      const { error } = await supabase.from('referrers').upsert({ id: referrer.id, data: referrer, updated_at: new Date().toISOString() })
      if (error) { console.error('referral-signup referrer error:', error); return res.status(500).json({ error: 'Could not enrol' }) }
    }

    // ── Optional: direct referral — create a lead attributed to this referrer. ──
    let directLeadCreated = false
    const fName = String(referral?.name ?? '').trim()
    const fEmail = String(referral?.email ?? '').trim()
    const fPhone = String(referral?.phone ?? '').trim()
    if (fName && (fEmail || fPhone)) {
      const { data: stageRows } = await supabase.from('lead_pipeline_stages').select('data')
      const stages = (stageRows ?? []).map((r) => r.data)
      const stageId = stages.find((s) => s.category === 'new')?.id ?? 'stage_new'
      const today = new Date().toISOString().split('T')[0]
      const id = `lead${Date.now()}_${rand(4).toLowerCase()}`
      const lead = {
        id,
        name: fName,
        businessName: '',
        email: fEmail,
        phone: fPhone,
        spaceId: '',
        source: 'referral-direct',
        stageId,
        value: 0,
        notes: referral?.message ? String(referral.message).trim() : `Referred directly by ${referrer.name}.`,
        tenantId: null,
        type: 'enquiry',
        read: false,
        referrerId: referrer.id,
        referralCode: referrer.code,
        referralIntent: 'lease',
        createdAt: today,
        stageEnteredAt: today,
      }
      const { error } = await supabase.from('leads').upsert({ id, data: lead, updated_at: new Date().toISOString() })
      if (!error) directLeadCreated = true
      else console.error('referral-signup lead error:', error)
    }

    // Best-effort emails — never block the response.
    emailReferrer(supabase, referrer).catch(() => {})
    notifyAdmin(supabase, referrer, { alreadyEnrolled, directLeadCreated, referralName: fName }).catch(() => {})

    return res.status(200).json({
      success: true,
      alreadyEnrolled,
      directLeadCreated,
      code: referrer.code,
      token: referrer.token,
      shareUrl: `${SITE}/?ref=${referrer.code}`,
      sellerUrl: `${SITE}/list-your-property?ref=${referrer.code}&intent=list`,
      dashboardUrl: `${APP}/refer/${referrer.token}`,
    })
  } catch (err) {
    console.error('referral-signup error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function settingsOf(supabase) {
  const { data } = await supabase.from('settings').select('data').eq('id', 'global')
  return data?.[0]?.data ?? {}
}

async function emailReferrer(supabase, referrer) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !referrer.email) return
  const settings = await settingsOf(supabase)
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const shareUrl = `${SITE}/?ref=${referrer.code}`
  const dashUrl = `${APP}/refer/${referrer.token}`

  const inner =
    bKicker('Referral Partners') +
    bH1(`Welcome to the ${fromName} referral program`) +
    bP(`Hi ${referrer.name},`) +
    bP(`Thanks for joining the ${fromName} referral program! Here are your links.`) +
    bPanel(
      `<div style="font-family:${SANS};font-size:11px;color:${MUTE};text-transform:uppercase;letter-spacing:.12em;margin:0 0 7px">Your referral link — share this</div>` +
      `<a href="${shareUrl}" style="font-family:${SANS};font-size:13px;color:${OLIVE};word-break:break-all;text-decoration:none">${shareUrl}</a>`
    ) +
    bPanel(
      `<div style="font-family:${SANS};font-size:11px;color:${MUTE};text-transform:uppercase;letter-spacing:.12em;margin:0 0 7px">Track your referrals &amp; rewards</div>` +
      `<a href="${dashUrl}" style="font-family:${SANS};font-size:13px;color:${OLIVE};word-break:break-all;text-decoration:none">${dashUrl}</a>`
    ) +
    bBtn('Open Your Dashboard', dashUrl) +
    bSmall(`When someone enquires through your link and a deal closes, you earn a reward. Keep this email — your dashboard link is your private access (no password needed).`)
  const html = brandFrame(inner, { footerLabel: 'Referral Partners' })

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: referrer.email, subject: `Your ${fromName} referral link`, html })
}

async function notifyAdmin(supabase, referrer, { alreadyEnrolled, directLeadCreated, referralName }) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return
  const settings = await settingsOf(supabase)
  const to = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
  if (!to.length) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'

  const headline = alreadyEnrolled ? 'Returning referrer activity' : 'New referrer self-enrolled 🎉'
  const inner =
    bKicker('Referral Partners') +
    bH1(headline) +
    bTable([
      ['Name', referrer.name],
      ['Email', referrer.email],
      ['Code', referrer.code],
      ...(directLeadCreated ? [['Direct referral submitted', referralName]] : []),
    ]) +
    bP('Set their commission rate in Marketing → Referrals.')
  const html = brandFrame(inner, { footerLabel: 'Referral Partners' })

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to, subject: `${headline} — ${referrer.name}`, html })
}
