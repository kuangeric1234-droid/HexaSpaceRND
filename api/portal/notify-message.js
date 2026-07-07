// POST /api/portal/notify-message
// Sends an email to the admin when a portal member sends a message.
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH2, bP, bBtn, bPanel, INK, OLIVE } from '../_brand.js'
import { applyCors } from '../_cors.js'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  // Members only: notifies admin that a member sent a portal message.
  const { requireMember } = await import('../_auth.js')
  const _m = await requireMember(req)
  if (_m.error) return res.status(_m.status).json({ error: _m.error })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured.' })

  const { tenantName, tenantEmail, message } = req.body ?? {}
  if (!tenantName || !message) return res.status(400).json({ error: 'Missing fields.' })

  const adminUrl = 'https://portal.hexaspace.com.au/messages'

  const html = brandFrame(
    bKicker('New message from member') +
    bH2(tenantName) +
    (tenantEmail ? bP(`<a href="mailto:${tenantEmail}" style="color:${OLIVE};text-decoration:none">${tenantEmail}</a>`) : '') +
    bPanel(`<p style="font-family:'HexaGT','Helvetica Neue',Arial,sans-serif;color:${INK};font-size:15px;line-height:1.6;margin:0;white-space:pre-wrap">${message}</p>`) +
    bBtn('View &amp; Reply', adminUrl),
    { footerLabel: 'Member Portal' }
  )

  const r = await sendResendEmail({
    from: 'Hexa Space Portal <info@hexaspace.com.au>',
    to: ['info@hexaspace.com.au'],
    replyTo: tenantEmail || undefined,
    subject: `New message from ${tenantName} — Hexa Space Portal`,
    html,
  })

  if (!r.ok) {
    return res.status(500).json({ error: 'Email send failed' })
  }

  return res.status(200).json({ success: true })
}
