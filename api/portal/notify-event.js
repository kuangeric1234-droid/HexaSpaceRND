// POST /api/portal/notify-event
//
// Called in two ways:
//   1. From admin panel (adding a portal-only event): body = { event: { title, date, ... } }
//   2. From Sanity webhook (publishing on hexaspace.com.au): body = raw Sanity document
//
// Only sends on Sanity "create" operations (not edits/deletes).

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bBtn, bTable } from '../_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function fmtDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return dateStr }
}

function extractEvent(body, headers) {
  // Sanity webhook — raw document in body
  if (body?._type === 'event') {
    const doc = body
    return {
      title: doc.title,
      date: doc.date ?? null,
      time: doc.date
        ? new Date(doc.date).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
        : null,
      location: [doc.location, doc.locationAddress].filter(Boolean).join(' — '),
      description: doc.summary ?? doc.tagline ?? '',
      link: doc.slug?.current
        ? `https://www.hexaspace.com.au/events/${doc.slug.current}`
        : 'https://www.hexaspace.com.au/events',
    }
  }
  // Admin panel call
  return body?.event ?? null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Two callers: the admin panel (body.event) must be an authenticated admin;
  // the Sanity publish webhook (raw doc) is verified by SANITY_WEBHOOK_SECRET
  // when configured. Either way, a random request can't blast every member.
  if (req.body?.event !== undefined) {
    const { requireAdmin } = await import('../_auth.js')
    const _a = await requireAdmin(req)
    if (_a.error) return res.status(_a.status).json({ error: _a.error })
  } else {
    const secret = process.env.SANITY_WEBHOOK_SECRET
    if (secret && req.headers['sanity-webhook-secret'] !== secret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey  = process.env.RESEND_API_KEY
  if (!serviceKey || !resendKey) return res.status(500).json({ error: 'Not configured.' })

  // For Sanity webhooks, only notify on NEW events (not edits or deletes)
  const operation = req.headers['sanity-operation']
  if (operation && operation !== 'create') {
    return res.status(200).json({ skipped: true, reason: `operation=${operation}` })
  }

  const event = extractEvent(req.body, req.headers)
  if (!event?.title) return res.status(400).json({ error: 'No event data.' })

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get all tenants with emails
  const { data: tenantsData } = await admin.from('tenants').select('data')
  const tenants = (tenantsData ?? []).map(r => r.data).filter(t => t.email)

  // Only email active portal members (have signed in at least once)
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const activeEmails = new Set(
    users.filter(u => u.last_sign_in_at).map(u => u.email?.toLowerCase())
  )
  const recipients = tenants.filter(t => activeEmails.has(t.email?.toLowerCase()))

  if (!recipients.length) return res.status(200).json({ sent: 0, reason: 'No active portal members.' })

  const eventRows = []
  if (event.date) eventRows.push(['Date', `${fmtDate(event.date)}${event.time ? ` · ${event.time}` : ''}`, true])
  if (event.location) eventRows.push(['Location', event.location])

  const html = brandFrame(
    bKicker("You're invited") +
    bH1(event.title) +
    (eventRows.length ? bTable(eventRows) : '') +
    (event.description ? bP(event.description) : '') +
    bBtn('Find Out More', event.link || 'https://www.hexaspace.com.au/events'),
    { footerLabel: 'Member Portal' }
  )

  let sent = 0
  for (const tenant of recipients) {
    const ok = await sendResendEmail({
      from: 'Hexa Space <info@hexaspace.com.au>',
      to: [tenant.email],
      subject: `New Event: ${event.title}`,
      html,
    }).then(r => r.ok).catch(() => false)
    if (ok) sent++
  }

  return res.status(200).json({ sent, total: recipients.length })
}
