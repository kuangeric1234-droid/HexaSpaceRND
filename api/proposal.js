// Vercel serverless — GET /api/proposal?token=...
// Public: returns the proposal (chosen offices + pricing) for the accept page.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  const token = req.query?.token
  if (!token) return res.status(400).json({ error: 'Missing token' })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: leadRows }, { data: settRows }, { data: spaceRows }] = await Promise.all([
      supabase.from('leads').select('id, data'),
      supabase.from('settings').select('data').eq('id', 'global'),
      supabase.from('spaces').select('id, data'),
    ])
    const row = (leadRows ?? []).find((r) => r.data?.proposal?.token === token)
    if (!row) return res.status(404).json({ error: 'Proposal not found' })
    const settings = settRows?.[0]?.data ?? {}
    const spaces = Object.fromEntries((spaceRows ?? []).map((r) => [r.id, r.data]))
    const p = row.data.proposal
    const floorLabel = { l2: 'Level 2', l4: 'Level 4', l5: 'Level 5' }
    const offices = (p.offices || []).map((o) => {
      const s = spaces[o.spaceId] || {}
      return { unit: o.unit || s.unitNumber, price: o.price, note: o.note || '', level: floorLabel[s.floor] || '', pax: s.pax ?? null }
    })
    return res.status(200).json({
      ok: true,
      status: p.status || 'sent',
      company: settings?.company?.name || 'Hexa Space',
      leadName: row.data.name || row.data.businessName || '',
      businessName: row.data.businessName || '',
      email: row.data.email || '',
      offices,
      validityDays: p.validityDays ?? 14,
    })
  } catch (err) {
    console.error('proposal GET error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
