// POST /api/auth/revoke — disables portal login for an email (offboarding).
// Bans the Supabase auth user rather than deleting them, so history and the
// account can be restored if the tenant comes back.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' })

  const { email } = req.body ?? {}
  if (!email) return res.status(400).json({ error: 'Email is required.' })

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Admin API has no direct email lookup — page through users (bounded).
    const target = String(email).toLowerCase()
    let user = null
    for (let page = 1; page <= 20 && !user; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return res.status(500).json({ error: error.message })
      user = (data?.users ?? []).find((u) => u.email?.toLowerCase() === target) ?? null
      if ((data?.users ?? []).length < 200) break
    }
    // No auth user was ever created (invite never sent/claimed) — nothing to revoke.
    if (!user) return res.status(200).json({ success: true, email, note: 'No auth user found' })

    const { error: banErr } = await admin.auth.admin.updateUserById(user.id, { ban_duration: '87600h' }) // ~10 years
    if (banErr) return res.status(500).json({ error: banErr.message })

    return res.status(200).json({ success: true, email })
  } catch (err) {
    console.error('auth revoke error:', err)
    return res.status(500).json({ error: err.message })
  }
}
