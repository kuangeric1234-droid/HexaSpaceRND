// Event reminders.
//   GET  (Vercel cron, daily) → email every registrant of an event happening
//        TOMORROW (Melbourne time) who hasn't been reminded yet.
//   POST {eventSlug?|eventName?, force?} → send reminders for one event now.
// Marks each registration with reminderSentAt so the app shows who got it.
// Requires env: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bH1, bP, bSmall, bKicker, OLIVE } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SANITY = 'https://w4zxsbqi.api.sanity.io/v2021-06-07/data/query/production'
const TZ = 'Australia/Melbourne'

const melbDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

async function fetchEvents() {
  const groq = `*[_type=="event" && rsvpEnabled==true]{ _id, title, "slug": slug.current, date, endDate, location, locationAddress, summary }`
  const res = await fetch(`${SANITY}?query=${encodeURIComponent(groq)}`)
  if (!res.ok) return []
  const { result } = await res.json()
  return result ?? []
}

function calendarLinks(ev, baseUrl) {
  const start = ev.date
  const end = ev.endDate || new Date(new Date(start).getTime() + 2 * 3600 * 1000).toISOString()
  const loc = [ev.location, ev.locationAddress].filter(Boolean).join(', ')
  const details = ev.summary || ''
  const e = encodeURIComponent
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${e(ev.title)}&dates=${icsDate(start)}/${icsDate(end)}&details=${e(details)}&location=${e(loc)}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${e(ev.title)}&startdt=${e(start)}&enddt=${e(end)}&body=${e(details)}&location=${e(loc)}`,
    yahoo: `https://calendar.yahoo.com/?v=60&title=${e(ev.title)}&st=${icsDate(start)}&et=${icsDate(end)}&desc=${e(details)}&in_loc=${e(loc)}`,
    ical: `${baseUrl}/api/event-ics?title=${e(ev.title)}&start=${e(start)}&end=${e(end)}&location=${e(loc)}&details=${e(details)}`,
  }
}

function reminderHtml(reg, ev, links, settings) {
  const company = settings?.company?.name || 'Hexa Space'
  const when = new Date(ev.date).toLocaleString('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })
  const loc = [ev.location, ev.locationAddress].filter(Boolean).join('<br>')
  const cal = (label, url) => `<a href="${url}" style="color:${OLIVE};text-decoration:none;font-weight:600">${label}</a>`
  return brandFrame(
    bKicker('Event Reminder') +
    bH1(`Your event <span style="color:${OLIVE}">${ev.title}</span> is coming up soon!`) +
    bP(`${when}<br>Organised by ${company}`) +
    bP(`<strong>Questions about this event?</strong><br><a href="mailto:${settings?.emails?.replyTo || 'info@hexaspace.com.au'}" style="color:${OLIVE}">Contact the organiser</a>`) +
    bP('<strong>About this event</strong>') +
    bP(`🗓 ${when}`) +
    (loc ? bP(`📍 ${loc}`) : '') +
    bP(`Add to my calendar:<br>${cal('Google', links.google)} &nbsp;·&nbsp; ${cal('Outlook', links.outlook)} &nbsp;·&nbsp; ${cal('iCal', links.ical)} &nbsp;·&nbsp; ${cal('Yahoo', links.yahoo)}`) +
    bSmall(`See you there${reg.name ? `, ${reg.name}` : ''}.`),
    { footerLabel: 'Events' }
  )
}

export default async function handler(req, res) {
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
  const baseUrl = `https://${req.headers.host}`

  try {
    const [{ data: settRows }, eventsAll] = await Promise.all([
      supabase.from('settings').select('data').eq('id', 'global'),
      fetchEvents(),
    ])
    const settings = settRows?.[0]?.data ?? {}

    // ── Test / preview: email ONE sample reminder to a chosen address ──────────
    if (req.method === 'POST' && req.body?.testEmail) {
      if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
      let ev = eventsAll.find((e) => e.slug === req.body.eventSlug)
      if (!ev) {
        try {
          const r = await fetch(`${SANITY}?query=${encodeURIComponent('*[_type=="event"]|order(date desc)[0]{_id,title,"slug":slug.current,date,endDate,location,locationAddress,summary}')}`)
          ev = (await r.json()).result
        } catch { /* ignore */ }
      }
      if (!ev) ev = { title: 'Sample Event', date: new Date(Date.now() + 86400000).toISOString(), location: 'The Hub, Hexa Space', locationAddress: '18 Logistic Court, Box Hill VIC 3128', summary: 'Preview of the reminder email.' }
      const links = calendarLinks(ev, baseUrl)
      const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
      const r = await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: req.body.testEmail, subject: `[TEST] Reminder: ${ev.title}`, html: reminderHtml({ name: 'there' }, ev, links, settings) })
      const out = r.data ?? {}
      if (!r.ok) return res.status(r.status || 500).json({ error: out?.message || 'Resend rejected the email', detail: out })
      return res.status(200).json({ test: true, to: req.body.testEmail, event: ev.title, id: out?.id })
    }

    let targets, force = false
    if (req.method === 'POST') {
      const { eventSlug, eventName, force: f } = req.body ?? {}
      force = !!f
      targets = eventsAll.filter((e) => (eventSlug && e.slug === eventSlug) || (eventName && e.title === eventName))
    } else {
      const tomorrow = melbDate(new Date(Date.now() + 24 * 3600 * 1000).toISOString())
      targets = eventsAll.filter((e) => e.date && melbDate(e.date) === tomorrow)
    }
    if (!targets.length) return res.status(200).json({ events: 0, sent: 0, remindedIds: [] })

    const { data: regRows } = await supabase.from('event_registrations').select('data')
    const regs = (regRows ?? []).map((r) => r.data)

    let sent = 0
    const remindedIds = []
    for (const ev of targets) {
      const links = calendarLinks(ev, baseUrl)
      const evRegs = regs.filter((r) => (r.eventSlug && r.eventSlug === ev.slug) || (r.eventName && r.eventName === ev.title))
      for (const reg of evRegs) {
        if (!reg.email) continue
        if (reg.reminderSentAt && !force) continue
        try {
          if (resendKey) {
            const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
            const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
            await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: reg.email, subject: `Reminder: ${ev.title} is coming up`, html: reminderHtml(reg, ev, links, settings) })
          }
          await supabase.from('event_registrations').upsert({ id: reg.id, data: { ...reg, reminderSentAt: new Date().toISOString() }, updated_at: new Date().toISOString() })
          sent++; remindedIds.push(reg.id)
        } catch (e) { console.error('reminder send failed', reg.id, e) }
      }
    }
    return res.status(200).json({ events: targets.length, sent, remindedIds })
  } catch (err) {
    console.error('event-reminders error:', err)
    return res.status(500).json({ error: err.message })
  }
}
