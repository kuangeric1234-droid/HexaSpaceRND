// POST /api/auth/reset-password — PUBLIC self-service password reset.
//
// Mints a recovery link with the Admin API and sends it via Resend (the same
// reliable pipeline as invites/invoices), instead of Supabase's built-in Auth
// email — which is rate-limited and often undelivered. ALWAYS returns success
// (no user enumeration): if the email has no account, nothing is sent.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH2, bP, bBtn, bSmall, OLIVE } from '../_brand.js'
import { applyCors } from '../_cors.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const PORTAL = 'https://portal.hexaspace.com.au'

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured.' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address.' })

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    // generateLink(recovery) errors for an unknown email — we swallow that and
    // still return success so the response never reveals who has an account.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: PORTAL } })
    const link = data?.properties?.action_link
    if (!error && link && process.env.RESEND_API_KEY) {
      const inner = bKicker('Member Portal') + bH2('Reset your password') +
        bP('We received a request to reset your Hexa Space portal password. Click below to choose a new one.') +
        bBtn('Reset your password', link) +
        bSmall(`This link expires in 24 hours. If you didn't request this, you can safely ignore this email.<br><br>Trouble with the button? Copy this link:<br><a href="${link}" style="color:${OLIVE};word-break:break-all">${link}</a>`)
      await sendResendEmail({
        from: 'Hexa Space <info@hexaspace.com.au>',
        to: [email],
        subject: 'Reset your Hexa Space portal password',
        html: brandFrame(inner, { footerLabel: 'Member Portal' }),
      })
    }
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('reset-password error:', err)
    return res.status(200).json({ success: true }) // never leak existence
  }
}
