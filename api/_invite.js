// Portal-invite core: creates the Supabase auth user and sends the branded
// "set your password" email. Shared by POST /api/auth/invite and the daily
// reconcile cron so both paths grant portal access identically.
import { createClient } from '@supabase/supabase-js'
import { sendResendEmail } from './_email.js'
import { brandFrame, bKicker, bH2, bP, bBtn, bSmall, OLIVE } from './_brand.js'

const SUPABASE_URL = process.env.SUPABASE_URL

// Returns { ok: true, email } or { ok: false, error }.
export async function invitePortalUser({ email, redirectTo, subject, heading, intro, ctaLabel }) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!serviceKey) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' }
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not configured.' }
  if (!email) return { ok: false, error: 'Email is required.' }

  const REDIRECT = redirectTo || 'https://portal.hexaspace.com.au'
  const SUBJECT = subject || "You've been invited to the Hexa Space Member Portal"
  const HEADING = heading || "You've been invited"
  const INTRO = intro || "You've been given access to the Hexa Space Member Portal — your home for bookings, invoices, membership, events and messaging our team."
  const CTA = ctaLabel || 'Set up your password'

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Create the user if they don't already exist
  const { error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (createErr && !createErr.message.toLowerCase().includes('already been registered')) {
    return { ok: false, error: createErr.message }
  }

  // Recovery-type link — fires PASSWORD_RECOVERY on the portal client so it
  // shows the SetPassword screen on arrival.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: REDIRECT },
  })
  if (linkErr) return { ok: false, error: linkErr.message }

  const r = await sendResendEmail({
    from: 'Hexa Space <info@hexaspace.com.au>',
    to: [email],
    subject: SUBJECT,
    html: brandFrame(
      bKicker('Member Portal') +
      bH2(HEADING) +
      bP('Welcome to Hexa Space.') +
      bP(INTRO) +
      bBtn(CTA, linkData.properties.action_link) +
      bSmall(`This link expires in 24 hours.<br><br>Questions? Contact us at <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE};text-decoration:none">info@hexaspace.com.au</a>`),
      { footerLabel: 'Team Access' }
    ),
  })
  if (!r.ok) return { ok: false, error: 'Email send failed' }

  return { ok: true, email }
}
