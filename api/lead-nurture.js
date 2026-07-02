// Vercel cron — daily lead nurture. Advances website-enquiry leads through the
// follow-up sequence and moves cold ones to the Lost stage. Runs while a lead is
// still in a "new" stage and hasn't booked a tour; stops the moment the team
// moves it forward or the lead books/replies.
import { createClient } from '@supabase/supabase-js'
import { findEmailTemplate, renderLead, sendResend, daysBetween } from './_leads.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// Cadence (days since enquiry). Each step sends once; Lost after LOST_AFTER days.
const STEPS = [
  { afterDays: 2, type: 'lead_followup' },
  { afterDays: 5, type: 'lead_followup' },
  { afterDays: 9, type: 'lead_final' },
]
const LOST_AFTER = 14

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: leadRows }, { data: stageRows }, { data: tmplRows }, { data: settRows }] = await Promise.all([
      supabase.from('leads').select('id, data'),
      supabase.from('lead_pipeline_stages').select('data'),
      supabase.from('templates').select('data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])
    const stages = (stageRows ?? []).map((r) => r.data)
    const templates = (tmplRows ?? []).map((r) => r.data)
    const settings = settRows?.[0]?.data ?? {}
    const newStageIds = new Set(stages.filter((s) => s.category === 'new').map((s) => s.id))
    const lostStage = stages.find((s) => s.category === 'lost') || stages.find((s) => /lost/i.test(s.name || ''))

    const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
    const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
    const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
    const today = new Date().toISOString().split('T')[0]

    let sent = 0, lost = 0
    for (const row of (leadRows ?? [])) {
      const lead = row.data
      const n = lead?.nurture
      if (!n || n.done) continue
      if (!lead.email) continue
      if (lead.tourBookedAt || lead.source === 'book-tour') continue
      // Only nurture while the lead is still sitting in a "new" stage untouched.
      if (newStageIds.size && !newStageIds.has(lead.stageId)) continue

      const age = daysBetween(lead.createdAt || n.lastAt, today)
      let changed = false

      if (age >= LOST_AFTER) {
        if (lostStage && lead.stageId !== lostStage.id) { lead.stageId = lostStage.id; lead.stageEnteredAt = today; lost++ }
        lead.nurture = { ...n, done: true, lastAt: today }
        changed = true
      } else {
        // Next unsent step whose day threshold has passed.
        const stepIdx = STEPS.findIndex((s, i) => i >= (n.step || 0) && age >= s.afterDays)
        if (stepIdx >= 0) {
          const template = findEmailTemplate(templates, STEPS[stepIdx].type)
          if (template && resendKey) {
            const { subject, html } = renderLead(template, { lead, membershipType: lead.enquiryType, settings })
            const r = await sendResend(resendKey, { fromName, fromEmail, to: lead.email, subject, html, replyTo })
            if (r.ok) { lead.nurture = { ...n, step: stepIdx + 1, lastAt: today }; sent++; changed = true }
          }
        }
      }

      if (changed) await supabase.from('leads').upsert({ id: row.id, data: lead, updated_at: new Date().toISOString() })
    }

    return res.status(200).json({ ok: true, sent, movedToLost: lost })
  } catch (err) {
    console.error('lead-nurture error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
