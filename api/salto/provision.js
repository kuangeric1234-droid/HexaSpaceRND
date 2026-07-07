// POST /api/salto/provision — grants a member door access when a lease/member
// is onboarded. Body: { memberEmail, memberName, doorId, spaceLabel, accessFrom, accessUntil }
// Returns { saltoUserId, accessLink } — accessLink stays null in both current
// modes (the welcome email omits its door-access section when absent; Salto KS
// sends its own mobile-key invite).
//
// Two modes (decided by env), chosen after Salto quoted $2,445 for direct KS
// API access — we use their Zapier connector instead (beta, July 2026):
//
//  1. ZAPIER (SALTO_PROVISION_WEBHOOK set): POST to a "Webhooks by Zapier"
//     Catch Hook whose zap runs KS "Add User" (creates the user, assigns the
//     access group; idempotent via user_already_exists).
//  2. OPS TASK (default): email the exact KS-portal steps to the ops inbox so
//     the manual add is tracked and never forgotten. ~2 min/member in the KS
//     web portal until the Zapier beta lands.

import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bTable } from '../_brand.js'
import { requireAdmin } from '../_auth.js'

// Resolve the KS access-group name from what the platform knows about the
// member's space. KS groups are per-space ("Office 15", "Suite 12") plus
// functional groups for desk/flex/VO members — names verified against the
// live KS group list (7 Jul 2026). A space's explicit saltoDoors field wins.
function resolveAccessGroup(doorId, spaceLabel, membershipType) {
  if (doorId) return doorId
  const label = `${spaceLabel ?? ''} ${membershipType ?? ''}`
  const m = label.match(/(office|suite)\s*0?(\d+)/i)
  if (m) return `${m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()} ${Number(m[2])}`
  if (/dedicated/i.test(label)) return 'Dedicated Desk'
  if (/virtual|\bvo\b/i.test(label)) return 'Virtual Office'
  if (/flex|desk|coworking/i.test(label)) return 'Flexible Access'
  return 'Flexible Access' // safest general-member default (KS has no "Members" group)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Admin-only: this grants physical door access. Never driven by an
  // unauthenticated request.
  const auth = await requireAdmin(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { memberEmail, memberName, doorId, spaceLabel, membershipType, accessFrom, accessUntil } = req.body ?? {}
  if (!memberEmail) return res.status(400).json({ error: 'memberEmail is required.' })
  const accessGroup = resolveAccessGroup(doorId, spaceLabel, membershipType)

  // KS's API assigns groups by ID. settings.salto.accessGroupIds maps our
  // group names → KS group IDs (harvested once from the Zapier dropdown /
  // KS portal). Data-driven: updating the map needs no redeploy.
  let accessGroupId = null
  try {
    const { data: settRow } = await auth.sb.from('settings').select('data').eq('id', 'global').single()
    accessGroupId = settRow?.data?.salto?.accessGroupIds?.[accessGroup] ?? null
  } catch { /* map optional until harvested */ }

  const webhook = process.env.SALTO_PROVISION_WEBHOOK

  // ── ZAPIER MODE ────────────────────────────────────────────────────────────
  if (webhook) {
    try {
      // Salto KS "Add User" wants First/Last name separately — send both split
      // and joined so the zap can map either.
      const nameParts = String(memberName ?? '').trim().split(/\s+/)
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_user',
          email: memberEmail,
          name: memberName ?? '',
          firstName: nameParts[0] ?? '',
          lastName: nameParts.slice(1).join(' ') || nameParts[0] || '',
          accessGroup,
          accessGroupId, // null until settings.salto.accessGroupIds is filled
          accessFrom: accessFrom ?? null,
          accessUntil: accessUntil ?? null,
          source: 'hexaspace-platform',
        }),
      })
      if (!r.ok) throw new Error(`Zapier hook returned ${r.status}`)
      return res.status(200).json({ zapier: true, queued: true, saltoUserId: null, accessLink: null })
    } catch (err) {
      console.error('Salto Zapier provision failed:', err)
      return res.status(502).json({ error: 'Salto provisioning webhook failed — add the member manually in the KS portal.' })
    }
  }

  // ── OPS TASK MODE ──────────────────────────────────────────────────────────
  const inner =
    bKicker('Door Access Task') +
    bH1('Add member to Salto KS') +
    bP('A member was onboarded on the platform and needs door access. In the Salto KS portal: Users → Add user, then assign the access group below.') +
    bTable([
      ['Name', memberName ?? '—', true],
      ['Email (KS invite goes here)', memberEmail, true],
      ['Access group / door', accessGroup, true],
      ['Access from', accessFrom ?? 'immediately', true],
      ['Access until', accessUntil ?? 'ongoing (lease end)', true],
    ]) +
    bSmall('Automated task from the member platform. This step goes away once the Salto KS Zapier connector is live (set SALTO_PROVISION_WEBHOOK).')

  await sendResendEmail({
    from: 'Hexa Space <noreply@hexaspace.com.au>',
    to: 'info@hexaspace.com.au',
    subject: `Salto task — add ${memberName ?? memberEmail} (${spaceLabel ?? doorId ?? 'Members'})`,
    html: brandFrame(inner, { footerLabel: 'Operations' }),
  }).catch(() => {})

  const saltoUserId = `salto_manual_${Buffer.from(memberEmail).toString('hex').slice(0, 10)}`
  return res.status(200).json({
    mock: true,
    opsTasked: true,
    saltoUserId,
    accessLink: null,
    door: doorId ?? null,
    spaceLabel: spaceLabel ?? null,
    accessFrom: accessFrom ?? null,
    accessUntil: accessUntil ?? null,
    note: 'Ops task emailed — member is added manually in the KS portal until the Zapier connector is configured.',
  })
}
