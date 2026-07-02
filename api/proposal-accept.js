// Vercel serverless — POST /api/proposal-accept
// Public: the enquirer accepts their proposal and fills in company details. We
// then create the client (tenant + primary contact), create the contract from
// the chosen offices + pricing, reserve those offices, raise an e-signature
// request, and email the licence agreement to sign (client) + notify admin.
import { createClient } from '@supabase/supabase-js'
import { fillVars, findEmailTemplate, sendResend } from './_leads.js'

const SUPABASE_URL = process.env.SUPABASE_URL

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const rid = (p) => `${p}${Date.now()}${Math.random().toString(36).slice(2, 6)}`

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const b = req.body ?? {}
  const { token, businessName, abn, address, city, state, zip, country, contactName, email, phone } = b
  if (!token) return res.status(400).json({ error: 'Missing token' })
  if (!businessName || !contactName || !email) return res.status(400).json({ error: 'Company name, contact name and email are required' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Not configured' })
  const supabase = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } })

  try {
    const [{ data: leadRows }, { data: leaseRows }, { data: stageRows }, { data: tmplRows }, { data: settRows }] = await Promise.all([
      supabase.from('leads').select('id, data'),
      supabase.from('leases').select('id, data'),
      supabase.from('lead_pipeline_stages').select('data'),
      supabase.from('templates').select('data'),
      supabase.from('settings').select('data').eq('id', 'global'),
    ])
    const leadRow = (leadRows ?? []).find((r) => r.data?.proposal?.token === token)
    if (!leadRow) return res.status(404).json({ error: 'Proposal not found' })
    const lead = leadRow.data
    if (lead.proposal?.status === 'accepted' && lead.tenantId) {
      return res.status(200).json({ ok: true, alreadyAccepted: true, signLink: lead.proposal?.signLink })
    }

    const settings = settRows?.[0]?.data ?? {}
    const templates = (tmplRows ?? []).map((r) => r.data)
    const stages = (stageRows ?? []).map((r) => r.data)
    const offices = lead.proposal?.offices || []
    if (offices.length === 0) return res.status(400).json({ error: 'Proposal has no offices' })

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const end = new Date(now); end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1)
    const endDate = end.toISOString().split('T')[0]

    // 1. Tenant (company)
    const tenantId = rid('t')
    const tenant = {
      id: tenantId, businessName, billBusinessName: businessName, abn: abn || '', email,
      contactName, phone: phone || '', address: address || '', city: city || '', state: state || '',
      zip: zip || '', country: country || 'Australia', status: 'Active', currency: 'AUD', taxRate: 'GST 10%',
      paymentMethod: '', billingPeriodStart: '1', source: 'proposal', startDate: today, createdAt: today,
    }

    // 2. Primary contact (member)
    const memberId = rid('m')
    const member = {
      id: memberId, companyId: tenantId, name: contactName, email, phone: phone || '',
      contactPerson: true, billingPerson: true, portalAccess: true, status: 'Active',
      startDate: today, createdAt: today,
    }

    // 3. Contract (lease) from the chosen offices + pricing
    const nums = (leaseRows ?? []).map((r) => parseInt(String(r.data?.contractNumber || '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n) && n < 100000)
    const contractNumber = `CON-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
    const monthlyRent = offices.reduce((s, o) => s + Number(o.price || 0), 0)
    const items = offices.map((o) => ({ spaceId: o.spaceId, deposit: 0, steps: [{ startDate: today, endDate, listPrice: Number(o.price || 0), qty: 1, discount: '' }] }))
    const leaseId = contractNumber
    const eToken = rid('sign')
    const appHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host
    const memberLink = `https://${appHost}/sign/${eToken}`
    const lease = {
      id: leaseId, contractNumber, tenantId, memberId, memberName: contactName, companyName: businessName,
      spaceId: offices[0].spaceId, resource: offices.map((o) => o.unit).filter(Boolean).join(', '),
      membershipType: 'Private Office', documentType: 'License Agreement', contractType: 'New',
      startDate: today, endDate, monthlyRent, bondAmount: 0, discount: '',
      status: 'pending', signatureStatus: 'out_for_signature',
      items, noticePeriodMonths: 1, source: 'proposal',
      eSignMemberLink: memberLink, eSignAdminLink: `${memberLink}?admin=1`, eSignSentAt: now.toISOString(),
      createdAt: today,
    }

    // Persist tenant, member, lease, esign request
    await supabase.from('tenants').upsert({ id: tenantId, data: tenant, updated_at: now.toISOString() })
    await supabase.from('members').upsert({ id: memberId, data: member, updated_at: now.toISOString() })
    await supabase.from('leases').upsert({ id: leaseId, data: lease, updated_at: now.toISOString() })
    await supabase.from('esign_requests').insert({ token: eToken, lease_id: leaseId, tenant_id: tenantId, status: 'pending' })

    // Reserve the chosen offices for this client
    const spaceUpdates = offices.map((o) => supabase.from('spaces').select('id, data').eq('id', o.spaceId).single().then(async ({ data }) => {
      if (!data) return
      await supabase.from('spaces').upsert({ id: o.spaceId, data: { ...data.data, status: 'reserved', occupantTenantId: tenantId }, updated_at: now.toISOString() })
    }))
    await Promise.all(spaceUpdates).catch(() => {})

    // Update the lead: accepted + converted + moved to Won
    const won = stages.find((s) => s.category === 'won') || stages.find((s) => /won/i.test(s.name || ''))
    lead.proposal = { ...lead.proposal, status: 'accepted', acceptedAt: now.toISOString(), signLink: memberLink }
    lead.tenantId = tenantId
    if (won) { lead.stageId = won.id; lead.stageEnteredAt = today }
    await supabase.from('leads').upsert({ id: leadRow.id, data: lead, updated_at: now.toISOString() })

    // Email the licence agreement to sign (client) + notify admin.
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexahub.com.au'
      const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
      const website = settings?.company?.website || 'hexaspace.com.au'
      const esignTpl = findEmailTemplate(templates, 'esign')
      const vars = {
        company: settings?.company?.name || 'Hexa Space', tenantName: contactName, contract: contractNumber,
        signLink: memberLink, signerName: settings?.contracts?.eSignName || settings?.company?.name || 'Hexa Space', website,
      }
      const subject = fillVars(esignTpl?.subject || 'Please sign: {{contract}} — {{company}}', vars)
      const html = esignTpl?.content
        ? fillVars(esignTpl.content, vars)
        : `<div style="font-family:Arial,sans-serif;padding:32px;max-width:560px"><p>Hi ${contactName},</p><p>Thanks for accepting your proposal. Please review and sign your licence agreement ${contractNumber}:</p><p><a href="${memberLink}">Review &amp; sign document</a></p></div>`
      await sendResend(resendKey, { fromName, fromEmail, to: email, subject, html, replyTo }).catch(() => {})

      const adminTo = settings?.emails?.notificationEmail
      if (adminTo) {
        const adminHtml = `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px"><h2 style="font-size:16px">Proposal accepted 🎉</h2><p><strong>${businessName}</strong> (${contactName}, ${email}) accepted their proposal.</p><p>Client created, contract <strong>${contractNumber}</strong> raised for ${offices.map((o) => o.unit).join(', ')} at $${monthlyRent.toLocaleString('en-AU')}/mo and sent for e-signature. Countersign it in HexaHub once they've signed.</p></div>`
        await sendResend(resendKey, { fromName, fromEmail, to: adminTo, subject: `Proposal accepted — ${businessName} (${contractNumber})`, html: adminHtml, replyTo }).catch(() => {})
      }
    }

    return res.status(200).json({ ok: true, contractNumber, signLink: memberLink })
  } catch (err) {
    console.error('proposal-accept error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
