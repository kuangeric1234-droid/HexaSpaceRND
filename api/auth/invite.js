// POST /api/auth/invite
// Creates a Supabase auth user and sends a branded "set your password" email.
// Core logic lives in api/_invite.js (shared with the daily reconcile cron).
import { invitePortalUser } from '../_invite.js'
import { requireAdmin } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Admin-only: creating an auth account for an arbitrary email is a
  // privileged action (member team-invites go through /api/portal/add-teammate).
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  // redirectTo is pinned server-side (never accept a caller-supplied redirect).
  // extraHtml is an admin-composed content block (e.g. the function booking's
  // session list + quote) rendered between the intro and the CTA button.
  const { email, subject, heading, intro, extraHtml, ctaLabel, footerLabel } = req.body ?? {}
  const r = await invitePortalUser({ email, subject, heading, intro, extraHtml, ctaLabel, footerLabel })
  if (!r.ok) {
    const status = r.error === 'Email is required.' ? 400 : 500
    return res.status(status).json({ error: r.error })
  }
  return res.status(200).json({ success: true, email: r.email })
}
