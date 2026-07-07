// Vercel cron — daily function-enquiry nurture. Follows up website function
// enquiries that haven't yet requested a booking time, then cools off. Stops the
// moment the enquirer requests a time (stage advances) or the team acts.
import { createClient } from '@supabase/supabase-js'
import { findEmailTemplate, fillVars, sendResend, daysBetween, functionEmailVars } from './_leads.js'
import { brandFrame, bKicker, bH1, bP, bBtn, bSmall } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL

const STEPS = [
  { afterDays: 2, type: 'function_followup' },
  { afterDays: 5, type: 'function_followup' },
  { afterDays: 9, type: 'function_final' },
]
const LOST_AFTER = 14

// Inline branded fallback if the editable template row is missing.
function fallback(type, vars) {
  const final = type === 'function_final'
  const inner =
    bKicker('Function Space Hire') +
    bH1(final ? `Here whenever you need us, ${vars.name}.` : `Still thinking about your event, ${vars.name}?`) +
    bP(final
      ? "We haven't heard back, so we'll leave things here for now. If your event is still on the horizon, our function space is ready when you are — just pick a time and we'll take care of the rest."
      : "Just following up on your function space enquiry. Whenever you're ready, pick a preferred date and layout and we'll check availability and get your booking underway.") +
    bBtn('Book a time', vars.bookLink) +
    bSmall('Reply to this email any time — happy to help with dates, catering or a walkthrough.')
  return {
    subject: final ? 'One last note about your Hexa Space function' : `Still planning ${vars.eventName}? Book your Hexa Space time`,
    html: brandFrame(inner, { footerLabel: 'Function Space Hire' }),
  }
}

export default async function handler(req, res) {
  const { requireCronOrAdmin } = await import('./_auth.js')
  const _g = await requireCronOrAdmin(req)
  if (!_g.ok) return res.status(_g.status).json({ error: _g.error })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: rows }, { data: settRows }, { data: tmplRows }] = await Promise.all([
      supabase.from('function_bookings').select('id, data'),
      supabase.from('settings').select('data').eq('id', 'global'),
      supabase.from('templates').select('data'),
    ])
    const settings = settRows?.[0]?.data ?? {}
    const templates = (tmplRows ?? []).map((r) => r.data)
    const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
    const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
    const today = new Date().toISOString().split('T')[0]

    let sent = 0, closed = 0
    for (const row of (rows ?? [])) {
      const b = row.data
      const n = b?.nurture
      if (!n || n.done) continue
      if (!b.email) continue
      // Only nurture while it's still an untouched enquiry that hasn't requested a time.
      if (!['enquiry', 'quoted'].includes(b.stage)) continue
      if (b.requestedAt) continue

      const age = daysBetween(b.createdAt || n.lastAt, today)
      let changed = false

      if (age >= LOST_AFTER) {
        b.nurture = { ...n, done: true, coldAt: today, lastAt: today }
        closed++; changed = true
      } else {
        const idx = STEPS.findIndex((s, i) => i >= (n.step || 0) && age >= s.afterDays)
        if (idx >= 0) {
          const vars = functionEmailVars(b, settings)
          const tpl = findEmailTemplate(templates, STEPS[idx].type)
          const { subject, html } = tpl ? { subject: fillVars(tpl.subject, vars), html: fillVars(tpl.content, vars) } : fallback(STEPS[idx].type, vars)
          const r = await sendResend(process.env.RESEND_API_KEY, { fromName, fromEmail, to: b.email, subject, html, replyTo })
          if (r.ok) { b.nurture = { ...n, step: idx + 1, lastAt: today }; sent++; changed = true }
        }
      }
      if (changed) await supabase.from('function_bookings').upsert({ id: row.id, data: b, updated_at: new Date().toISOString() })
    }
    return res.status(200).json({ ok: true, sent, cooled: closed })
  } catch (err) {
    console.error('function-nurture error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
