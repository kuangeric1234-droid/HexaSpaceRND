// Vercel serverless function — POST /api/send-email
// Requires env var: RESEND_API_KEY
// Body: { to, subject, html, replyTo?, cc?, bcc?, from? }
// All sends go through the central safe-mode guard in _email.js.
import { sendResendEmail } from './_email.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Admin-only: this is the generic "send as Hexa Space" sender. Preventing an
  // open relay / arbitrary branded email.
  const { requireAdmin } = await import('./_auth.js')
  const _a = await requireAdmin(req)
  if (_a.error) return res.status(_a.status).json({ error: _a.error })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' })
  }

  const {
    to,
    subject,
    html,
    replyTo,
    cc,
    bcc,
    from = 'Hexa Space <noreply@hexaspace.com.au>',
    attachments,
  } = req.body

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
  }

  const result = await sendResendEmail({ from, to, subject, html, replyTo, cc, bcc, attachments })
  if (result.skipped) return res.status(500).json({ error: 'Email service not configured' })
  if (!result.ok) {
    console.error('Resend error:', result.data)
    return res.status(result.status ?? 500).json({ error: result.data?.message ?? 'Failed to send email' })
  }
  return res.status(200).json({ success: true, id: result.data?.id })
}
