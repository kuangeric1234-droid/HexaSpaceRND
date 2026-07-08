// POST /api/salto/revoke — removes a member's door access on lease
// termination/expiry or portal team removal.
// Body: { memberEmail, memberName?, saltoUserId?, doorId?, spaceLabel?,
//         membershipType?, mode? }
//
// mode 'remove_from_group' — the company keeps other space(s): strip only the
//   vacated space's access group (SALTO_GROUP_REMOVE_WEBHOOK zap).
// mode 'remove_user' (default) — full departure: delete the KS user entirely
//   (SALTO_REVOKE_WEBHOOK zap). Falls back to an ops-task email when the
//   relevant hook isn't configured.

import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bTable } from '../_brand.js'
import { requireAdmin } from '../_auth.js'
import { resolveAccessGroup } from './_groups.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Admin-only: revoking door access is an offboarding action.
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { memberEmail, memberName, saltoUserId, doorId, spaceLabel, membershipType, mode } = req.body ?? {}
  if (!memberEmail && !saltoUserId) {
    return res.status(400).json({ error: 'memberEmail or saltoUserId is required.' })
  }

  const groupOnly = mode === 'remove_from_group'
  const webhook = groupOnly ? process.env.SALTO_GROUP_REMOVE_WEBHOOK : process.env.SALTO_REVOKE_WEBHOOK

  // ── ZAPIER MODE ────────────────────────────────────────────────────────────
  if (webhook) {
    try {
      const accessGroup = resolveAccessGroup(doorId, spaceLabel, membershipType)
      let accessGroupId = null
      if (groupOnly) {
        try {
          const { data: settRow } = await auth.sb.from('settings').select('data').eq('id', 'global').single()
          accessGroupId = settRow?.data?.salto?.accessGroupIds?.[accessGroup] ?? null
        } catch { /* map optional */ }
      }
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupOnly ? {
          action: 'remove_from_group',
          email: memberEmail ?? null,
          memberName: memberName ?? '',
          accessGroup,
          accessGroupId,
          source: 'hexaspace-platform',
        } : {
          action: 'remove_user',
          email: memberEmail ?? null,
          saltoUserId: saltoUserId ?? null,
          source: 'hexaspace-platform',
        }),
      })
      if (!r.ok) throw new Error(`Zapier hook returned ${r.status}`)
      return res.status(200).json({ zapier: true, queued: true, revoked: !groupOnly, groupRemoved: groupOnly ? accessGroup : undefined })
    } catch (err) {
      console.error('Salto Zapier revoke failed:', err)
      return res.status(502).json({ error: 'Salto revoke webhook failed — update the member manually in the KS portal.' })
    }
  }

  // ── OPS TASK MODE ──────────────────────────────────────────────────────────
  const inner =
    bKicker('Door Access Task') +
    bH1('Remove member from Salto KS') +
    bP('A member was offboarded on the platform and their door access must be removed. In the Salto KS portal: Users → find the user → remove (or block).') +
    bTable([
      ['Name', memberName ?? '—', true],
      ['Email', memberEmail ?? '—', true],
      ['Door / access group', doorId ?? '—', true],
    ]) +
    bSmall('Automated task from the member platform. This step goes away once the Salto KS Zapier connector is live.')

  await sendResendEmail({
    from: 'Hexa Space <noreply@hexaspace.com.au>',
    to: 'info@hexaspace.com.au',
    subject: `Salto task — REMOVE ${memberName ?? memberEmail ?? saltoUserId}`,
    html: brandFrame(inner, { footerLabel: 'Operations' }),
  }).catch(() => {})

  return res.status(200).json({ mock: true, opsTasked: true, revoked: true })
}
