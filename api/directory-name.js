// POST /api/directory-name — public, token-gated (lease.welcomeToken from the
// getting-started email). Lets a new member confirm exactly how their business
// should appear on the lobby digital directory.
//
// Body: { token, action: 'load' | 'save', name? }
//  - load → { businessName, directoryName, confirmed }
//  - save → stores tenant.directoryName (1–2 lines) + directoryNameConfirmedAt,
//           and emails ops so the printed board gets updated too. The digital
//           boards pick the name up via the directory auto-sync.
import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' })

  const { token, action = 'load', name } = req.body ?? {}
  if (!token || String(token).length < 12) return res.status(404).json({ error: 'This link is not valid.' })

  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const { data: lRows } = await supabase.from('leases').select('data').eq('data->>welcomeToken', String(token)).limit(1)
    const lease = lRows?.[0]?.data
    if (!lease) return res.status(404).json({ error: 'This link is not valid.' })

    const { data: tRow } = await supabase.from('tenants').select('data').eq('id', lease.tenantId).single()
    const tenant = tRow?.data
    if (!tenant) return res.status(404).json({ error: 'This link is not valid.' })

    if (action === 'load') {
      return res.status(200).json({
        businessName: tenant.businessName ?? '',
        directoryName: tenant.directoryName ?? '',
        confirmed: !!tenant.directoryNameConfirmedAt,
      })
    }
    if (action !== 'save') return res.status(400).json({ error: 'Unknown action.' })

    // 1–2 lines, each trimmed and bounded — this renders on a lobby TV.
    const lines = String(name ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((l) => l.slice(0, 80))
    if (!lines.length) return res.status(400).json({ error: 'Please enter the name to display.' })
    const cleaned = lines.join('\n')

    const next = { ...tenant, directoryName: cleaned, directoryNameConfirmedAt: new Date().toISOString() }
    const { error } = await supabase.from('tenants').upsert({ id: tenant.id, data: next, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)

    // Ops heads-up — the digital boards follow automatically (auto-sync);
    // the PRINTED board needs a human.
    const inner =
      bKicker('Directory listing') +
      bH1('A member confirmed their directory name') +
      bP(`<strong>${tenant.businessName ?? tenant.id}</strong> would like to appear on the directory as:`) +
      bP(`<strong>${lines.join('<br>')}</strong>`) +
      bSmall('The digital boards update automatically (directory auto-sync / next morning). Update the printed board if applicable.')
    for (const to of ['info@hexaspace.com.au', 'eric@hexaspace.com.au']) {
      await sendResendEmail({
        from: 'Hexa Space <noreply@hexaspace.com.au>',
        to,
        subject: `Directory listing confirmed — ${tenant.businessName ?? tenant.id}`,
        html: brandFrame(inner, { footerLabel: 'Operations' }),
      }).catch(() => {})
    }

    return res.status(200).json({ saved: true, directoryName: cleaned })
  } catch (err) {
    console.error('directory-name error:', err)
    return res.status(500).json({ error: 'Something went wrong.' })
  }
}
