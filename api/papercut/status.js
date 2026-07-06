// GET /api/papercut/status
// Admin-facing health of the PaperCut integration for the Settings → Integrations
// tab. Returns aggregate counts only — no PINs, no member PII. Mirrors the
// unauthenticated status pattern of /api/stripe/status.

import { createClient } from '@supabase/supabase-js'
import { selectAllRows } from '../_db.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const tokenSet = !!process.env.PAPERCUT_SYNC_TOKEN
  if (!serviceKey) return res.status(200).json({ configured: false, tokenSet })

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const nowMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

  try {
    const [{ data: pinRows }, feeRows, memberRows] = await Promise.all([
      supabase.from('member_pins').select('updated_at'),
      selectAllRows(supabase, 'fees').then((r) => r.map((x) => x.data)),
      selectAllRows(supabase, 'members').then((r) => r.map((x) => x.data)),
    ])

    const pins = pinRows ?? []
    const lastPinSync = pins.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), '')

    const pcFees = feeRows.filter((f) => f.type === 'PaperCut')
    const monthFees = pcFees.filter((f) => (f.period || f.date || '').startsWith(nowMonth))
    const monthTotal = Math.round(monthFees.reduce((s, f) => s + (Number(f.price) || 0), 0) * 100) / 100
    const lastFeeSync = pcFees.reduce((max, f) => {
      const t = f.createdAt || ''
      return t > max ? t : max
    }, '')

    const activeMembers = memberRows.filter((m) => m?.email && m.portalAccess !== false).length

    return res.status(200).json({
      configured: tokenSet,       // the shared secret exists → integration is wired
      tokenSet,
      pinsSynced: pins.length,
      lastPinSync: lastPinSync || null,
      activeMembers,
      feesThisMonth: monthFees.length,
      feesThisMonthTotal: monthTotal,
      lastFeeSync: lastFeeSync || null,
    })
  } catch (err) {
    console.error('PaperCut status error:', err)
    return res.status(500).json({ error: 'status failed' })
  }
}
