// POST /api/auth/bulk-invite — the migration blast. Admin-only.
// Body: { mode: 'invite' | 'remind', limit? = 60 }
//
//   invite → active members never invited and never signed in
//   remind → invited ≥3 days ago, still never signed in, not yet reminded
//
// Sends the branded set-password email (same core as single invites), stamps
// portalInvitedAt / portalRemindedAt on the member so batches never double-
// send, and returns a summary. Copy is editable in Settings → email templates
// (portal_invite / portal_invite_reminder) with {{firstName}} / {{businessName}}
// placeholders; sensible defaults below.
import { requireAdmin } from '../_auth.js'
import { loadAdoption } from '../_adoption.js'
import { invitePortalUser } from '../_invite.js'

const DEFAULTS = {
  portal_invite: {
    subject: 'Your new Hexa Space member portal & app is ready',
    heading: 'Everything about your membership, in one place',
    intro: `Hi {{firstName}} — from August, your Hexa Space membership lives in the new member portal and mobile app: book meeting rooms and studios with live availability, see and pay invoices, get mail & parcel alerts the moment something arrives, order fresh coffee and pastries from Seoul Bakery to your door, find your print PIN and message our team.<br><br><strong>On your phone:</strong> Android members can get the Hexa Space app on Google Play; iPhone members — open portal.hexaspace.com.au/app in Safari and tap Share → Add to Home Screen (App Store version coming soon).<br><br>Nothing else changes: your membership, pricing and access stay exactly as they are. The old member site switches off on 31 July.`,
    ctaLabel: 'Set my password & sign in',
  },
  portal_invite_reminder: {
    subject: 'Reminder: your Hexa Space portal invite is waiting',
    heading: 'One minute to set up',
    intro: `Hi {{firstName}} — just a nudge: from 1 August your invoices and bookings live in the new Hexa Space portal. Setting up takes a minute. Need a hand? Reply to this email or see us at reception.`,
    ctaLabel: 'Set my password & sign in',
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const sb = auth.sb

  const { mode = 'invite', limit = 60 } = req.body ?? {}
  if (!['invite', 'remind'].includes(mode)) return res.status(400).json({ error: "mode must be 'invite' or 'remind'." })
  const cap = Math.max(1, Math.min(200, Number(limit) || 60))

  try {
    const { rows } = await loadAdoption(sb)
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    const targets = rows.filter((r) => !r.signedInAt && (
      mode === 'invite' ? !r.invitedAt : (r.invitedAt && r.invitedAt < threeDaysAgo && !r.remindedAt)
    )).slice(0, cap)

    const { data: settRows } = await sb.from('settings').select('data').eq('id', 'global')
    const settings = settRows?.[0]?.data ?? {}
    const tplKey = mode === 'invite' ? 'portal_invite' : 'portal_invite_reminder'
    const tpl = { ...DEFAULTS[tplKey], ...(settings.emailTemplates?.[tplKey] ?? {}) }

    const sent = [], failed = []
    const nowIso = new Date().toISOString()
    for (const t of targets) {
      const first = (t.name || '').split(' ')[0] || 'there'
      const fill = (s) => String(s || '').replaceAll('{{firstName}}', first).replaceAll('{{businessName}}', t.company || 'your company')
      const r = await invitePortalUser({
        email: t.email,
        subject: fill(tpl.subject), heading: fill(tpl.heading),
        intro: fill(tpl.intro), ctaLabel: fill(tpl.ctaLabel),
      })
      if (!r.ok) { failed.push({ email: t.email, error: r.error }); continue }
      // Stamp the member so the next batch skips them.
      const { data: mRow } = await sb.from('members').select('data').eq('id', t.id).single()
      if (mRow?.data) {
        const stamped = { ...mRow.data, [mode === 'invite' ? 'portalInvitedAt' : 'portalRemindedAt']: nowIso }
        await sb.from('members').upsert({ id: t.id, data: stamped, updated_at: nowIso })
      }
      sent.push(t.email)
    }

    return res.status(200).json({ mode, sent: sent.length, failed, remaining: Math.max(0, rows.filter((r) => !r.signedInAt && (mode === 'invite' ? !r.invitedAt : (r.invitedAt && !r.remindedAt))).length - targets.length), emails: sent })
  } catch (err) {
    console.error('bulk-invite error:', err)
    return res.status(500).json({ error: 'Bulk invite failed.' })
  }
}
