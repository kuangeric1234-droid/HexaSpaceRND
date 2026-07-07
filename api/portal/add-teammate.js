// POST /api/portal/add-teammate  { companyId, name, email }
// A member invites a teammate from the portal: creates their member record under
// the same company and emails them a portal set-password link.
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH2, bP, bBtn, bSmall, OLIVE } from '../_brand.js'
import { requireMember, isAdminEmail } from '../_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify the caller and confirm they may add to THIS company. Members may only
  // invite teammates into their own company; admins may target any company.
  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const supabase = auth.sb
  const isAdmin = await isAdminEmail(supabase, auth.user.email)

  const { companyId, name, email } = req.body ?? {}
  if (!companyId || !name || !email) return res.status(400).json({ error: 'Company, name and email are required' })
  if (!isAdmin && companyId !== auth.companyId) {
    return res.status(403).json({ error: 'You can only add teammates to your own company.' })
  }

  try {
    const [{ data: tRows }, { data: sRows }, { data: mRows }] = await Promise.all([
      supabase.from('tenants').select('id, data').eq('id', companyId),
      supabase.from('settings').select('data').eq('id', 'global'),
      supabase.from('members').select('id, data'),
    ])
    const tenant = tRows?.[0]?.data
    if (!tenant) return res.status(404).json({ error: 'Company not found' })
    const settings = sRows?.[0]?.data ?? {}
    const now = new Date().toISOString()
    const today = now.split('T')[0]

    const already = (mRows ?? []).map((r) => r.data).some((m) => m.companyId === companyId && (m.email || '').toLowerCase() === email.toLowerCase())
    if (!already) {
      const memberId = `m${Date.now()}${Math.random().toString(36).slice(2, 5)}`
      const member = { id: memberId, companyId, name, email, phone: '', contactPerson: false, billingPerson: false, portalAccess: true, status: 'Active', clientType: tenant.clientType, source: 'portal-invite', createdAt: today }
      await supabase.from('members').upsert({ id: memberId, data: member, updated_at: now })
    }

    // Create the auth user + a set-password link to the portal.
    await supabase.auth.admin.createUser({ email, email_confirm: true }).catch((e) => {
      if (!String(e?.message || '').toLowerCase().includes('already')) throw e
    })
    const redirectTo = settings?.portalUrl || `https://${req.headers.host}`
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    if (linkErr) return res.status(400).json({ error: linkErr.message })
    const actionLink = linkData?.properties?.action_link

    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && actionLink) {
      const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
      const html = brandFrame(
        bKicker('Member Portal') +
        bH2(`You've been added to ${tenant.businessName || 'your company'}`) +
        bP(`Hi ${name}, you've been given access to the Hexa Space member portal — book meeting rooms, view your company's details and message our team.`) +
        bBtn('Set up your password', actionLink) +
        bSmall(`This link expires in 24 hours. Questions? <a href="mailto:info@hexaspace.com.au" style="color:${OLIVE};text-decoration:none">info@hexaspace.com.au</a>`),
        { footerLabel: 'Member Portal' }
      )
      await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: email, subject: `You've been added to ${tenant.businessName || 'Hexa Space'} on the member portal`, html })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('add-teammate error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
