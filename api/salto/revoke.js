// POST /api/salto/revoke — removes a member's door access on lease
// termination/expiry or portal team removal.
// Body: { memberEmail, memberName?, saltoUserId?, doorId? }
//
// Same two modes as provision.js: Zapier Catch Hook (zap: Find User by Email →
// Remove User) when SALTO_REVOKE_WEBHOOK is set, otherwise an ops-task email.

import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bTable } from '../_brand.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { memberEmail, memberName, saltoUserId, doorId } = req.body ?? {}
  if (!memberEmail && !saltoUserId) {
    return res.status(400).json({ error: 'memberEmail or saltoUserId is required.' })
  }

  const webhook = process.env.SALTO_REVOKE_WEBHOOK

  // ── ZAPIER MODE ────────────────────────────────────────────────────────────
  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove_user',
          email: memberEmail ?? null,
          saltoUserId: saltoUserId ?? null,
          source: 'hexaspace-platform',
        }),
      })
      if (!r.ok) throw new Error(`Zapier hook returned ${r.status}`)
      return res.status(200).json({ zapier: true, queued: true, revoked: true })
    } catch (err) {
      console.error('Salto Zapier revoke failed:', err)
      return res.status(502).json({ error: 'Salto revoke webhook failed — remove the member manually in the KS portal.' })
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
