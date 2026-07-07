// Vercel serverless function — GET /api/referrer-dashboard?token=XXX
// Public, no-auth endpoint backing the magic-link referrer dashboard
// (portal.hexaspace.com.au/refer/<token>). Uses the service-role key to read past
// RLS, then returns a SANITISED payload — referral status + commissions only,
// never the leads' email/phone.
// Requires env var: SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = String(req.query?.token ?? '').trim()
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const { data: refRows } = await supabase.from('referrers').select('data')
    const referrer = (refRows ?? []).map((r) => r.data).find((rr) => rr.token === token)
    if (!referrer) return res.status(404).json({ error: 'Not found' })

    const [{ data: leadRows }, { data: commRows }, { data: stageRows }] = await Promise.all([
      supabase.from('leads').select('data'),
      supabase.from('commissions').select('data'),
      supabase.from('lead_pipeline_stages').select('data'),
    ])

    const stages = (stageRows ?? []).map((r) => r.data)
    const stageOf = (id) => stages.find((s) => s.id === id)

    // Their referred leads — status only, no contact details (no email/phone).
    const leads = (leadRows ?? [])
      .map((r) => r.data)
      .filter((l) => l.referrerId === referrer.id)
      .map((l) => {
        const st = stageOf(l.stageId)
        return {
          id: l.id,
          label: l.businessName || l.name || 'Referral',
          intent: l.referralIntent || 'lease',
          stageName: st?.name ?? '—',
          stageCategory: st?.category ?? 'new',
          dealClosed: !!l.dealClosed,
          createdAt: l.createdAt ?? null,
        }
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    const commissions = (commRows ?? [])
      .map((r) => r.data)
      .filter((c) => c.referrerId === referrer.id)
      .map((c) => ({
        id: c.id,
        leadName: c.leadName || '',
        dealType: c.dealType || '',
        dealValue: c.dealValue || 0,
        rate: c.rate || 0,
        amount: c.amount || 0,
        status: c.status || 'pending',
        createdAt: c.createdAt ?? null,
        paidAt: c.paidAt ?? null,
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    const pendingTotal = commissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + Number(c.amount || 0), 0)
    const paidTotal = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount || 0), 0)
    const wonCount = leads.filter((l) => l.stageCategory === 'won').length

    return res.status(200).json({
      referrer: {
        name: referrer.name,
        code: referrer.code,
        commissionRate: referrer.commissionRate ?? 0,
        status: referrer.status ?? 'active',
      },
      leads,
      commissions,
      totals: { leads: leads.length, won: wonCount, pending: pendingTotal, paid: paidTotal },
    })
  } catch (err) {
    console.error('referrer-dashboard error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
