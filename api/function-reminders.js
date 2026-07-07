// Vercel cron — GET/POST /api/function-reminders (daily).
// Emails confirmed function clients 1 week and 1 day before their event.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bTable } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default async function handler(req, res) {
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: rows }, { data: settRows }] = await Promise.all([
      supabase.from('function_bookings').select('id, data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])
    const settings = settRows?.[0]?.data ?? {}
    const in7 = addDays(7)
    const in1 = addDays(1)
    const bookings = (rows ?? []).map((r) => r.data).filter((b) => b?.stage === 'confirmed' && b?.eventDate)

    let sent = 0
    for (const b of bookings) {
      let flag = null
      if (b.eventDate === in7 && !b.reminded7) flag = 'reminded7'
      else if (b.eventDate === in1 && !b.reminded1) flag = 'reminded1'
      if (!flag) continue
      const when = flag === 'reminded7' ? 'in one week' : 'tomorrow'
      await emailReminder(settings, b, when)
      const now = new Date().toISOString()
      await supabase.from('function_bookings').upsert({ id: b.id, data: { ...b, [flag]: now, updatedAt: now }, updated_at: now })
      sent++
    }
    return res.status(200).json({ ok: true, sent })
  } catch (err) {
    console.error('function-reminders error:', err)
    return res.status(500).json({ error: 'Internal error' })
  }
}

async function emailReminder(settings, b, when) {
  if (!b.email) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
  const inner =
    bKicker('Event reminder') +
    bH1(`Your function is ${when}, ${b.name || 'there'}!`) +
    bTable([
      ['Event', b.eventName || '—'],
      ['Date', `${b.eventDate} · ${b.startTime || ''}–${b.endTime || ''}`],
      ['Guests', b.guests || '—'],
      ['Layout', b.layout || '—'],
    ]) +
    bP('You have 1 hour of complimentary bump-in and bump-out either side of your booking. If you have any final questions, just reply to this email.') +
    bP('See you soon!')
  const html = brandFrame(inner, { footerLabel: 'Function Space Hire' })
  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: b.email, replyTo, subject: `Reminder: your Hexa Space function is ${when}`, html })
}
