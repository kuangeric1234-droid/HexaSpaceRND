// POST /api/auth/invite
// Creates a Supabase auth user and sends a branded "set your password" email.
// Core logic lives in api/_invite.js (shared with the daily reconcile cron).
import { invitePortalUser } from '../_invite.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, redirectTo, subject, heading, intro, ctaLabel } = req.body ?? {}
  const r = await invitePortalUser({ email, redirectTo, subject, heading, intro, ctaLabel })
  if (!r.ok) {
    const status = r.error === 'Email is required.' ? 400 : 500
    return res.status(status).json({ error: r.error })
  }
  return res.status(200).json({ success: true, email: r.email })
}
