// Vercel serverless — POST /api/proposal-decline
// Public: the enquirer declines their proposal. Records the decline on the
// lead, moves it to Lost, and notifies the admin — so "declined" is
// distinguishable from "never responded" in the pipeline.
import { createClient } from '@supabase/supabase-js'
import { sendResend } from './_leads.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, reason } = req.body ?? {}
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: leadRows }, { data: stageRows }, { data: settRows }] = await Promise.all([
      supabase.from('leads').select('id, data'),
      supabase.from('lead_pipeline_stages').select('data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])
    const leadRow = (leadRows ?? []).find((r) => r.data?.proposal?.token === token)
    if (!leadRow) return res.status(404).json({ error: 'Proposal not found' })
    const lead = leadRow.data
    if (lead.proposal?.status === 'accepted' || lead.tenantId) {
      return res.status(400).json({ error: 'This proposal has already been accepted.' })
    }
    if (lead.proposal?.status === 'declined') {
      return res.status(200).json({ ok: true, alreadyDeclined: true })
    }

    const now = new Date()
    const stages = (stageRows ?? []).map((r) => r.data)
    const lost = stages.find((s) => s.category === 'lost') || stages.find((s) => /lost/i.test(s.name || ''))

    lead.proposal = { ...lead.proposal, status: 'declined', declinedAt: now.toISOString(), declineReason: String(reason || '').slice(0, 500) }
    if (lost) { lead.stageId = lost.id; lead.stageEnteredAt = now.toISOString().split('T')[0] }
    lead.activity = [
      ...(lead.activity ?? []),
      { id: `act${Date.now()}`, createdAt: now.toISOString(), type: 'note', text: `Proposal declined by the client${reason ? ` — "${String(reason).slice(0, 200)}"` : ''}` },
    ]
    await supabase.from('leads').upsert({ id: leadRow.id, data: lead, updated_at: now.toISOString() })

    const resendKey = process.env.RESEND_API_KEY
    const settings = settRows?.[0]?.data ?? {}
    if (resendKey) {
      const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
      const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
      const html = `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px"><h2 style="font-size:16px">Proposal declined</h2><p><strong>${lead.businessName || lead.name || 'A lead'}</strong> (${lead.email || 'no email'}) declined their proposal.</p>${reason ? `<p>Reason: "${String(reason).slice(0, 500)}"</p>` : ''}<p>The lead has been moved to Lost.</p></div>`
      await sendResend(resendKey, { fromName, fromEmail, to: adminTo, subject: `Proposal declined — ${lead.businessName || lead.name || 'lead'}`, html }).catch(() => {})
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('proposal-decline error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
