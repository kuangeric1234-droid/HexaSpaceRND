// GET /api/auth/adoption — the migration board: every member who should have
// portal access, with invited/registered state. Admin-only.
import { requireAdmin } from '../_auth.js'
import { loadAdoption } from '../_adoption.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  try {
    return res.status(200).json(await loadAdoption(auth.sb))
  } catch (err) {
    console.error('adoption error:', err)
    return res.status(500).json({ error: 'Failed to load adoption data.' })
  }
}
