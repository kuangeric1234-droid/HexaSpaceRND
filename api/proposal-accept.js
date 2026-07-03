// Vercel serverless â€” POST /api/proposal-accept
// Public: the enquirer accepts their proposal and fills in company details. We
// then create the client (tenant + primary contact), create the contract from
// the chosen offices + pricing, reserve those offices, raise an e-signature
// request, and email the licence agreement to sign (client) + notify admin.
import { createClient } from '@supabase/supabase-js'
import { fillVars, findEmailTemplate, sendResend } from './_leads.js'
import { proposalExpired } from './_proposal.js'

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
  const { token, businessName, abn, address, city, state, zip, country, contactName, email, phone, startDate: reqStart, officeIds, parkingIds } = b
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
    // Either signal alone means this proposal already produced a client —
    // requiring both would let a half-recorded accept run twice.
    if (lead.proposal?.status === 'accepted' || lead.tenantId) {
      return res.status(200).json({ ok: true, alreadyAccepted: true, signLink: lead.proposal?.signLink })
    }
    if (proposalExpired(lead.proposal)) {
      return res.status(410).json({ error: 'This proposal has expired — please contact us to refresh it.', expired: true })
    }

    const settings = settRows?.[0]?.data ?? {}
    const templates = (tmplRows ?? []).map((r) => r.data)
    const stages = (stageRows ?? []).map((r) => r.data)
    const allOffices = lead.proposal?.offices || []
    const allParking = lead.proposal?.parking || []
    if (allOffices.length === 0) return res.status(400).json({ error: 'Proposal has no offices' })
    // Offered offices are OPTIONS â€” the client picks which one(s) + optional parking.
    // Submitted ids must be a subset of what was actually offered.
    const offeredOfficeIds = allOffices.map((o) => o.spaceId)
    const offeredParkingIds = allParking.map((o) => o.spaceId)
    if (Array.isArray(officeIds) && officeIds.some((id) => !offeredOfficeIds.includes(id))) {
      return res.status(400).json({ error: 'One of the selected offices is not part of this proposal.' })
    }
    if (Array.isArray(parkingIds) && parkingIds.some((id) => !offeredParkingIds.includes(id))) {
      return res.status(400).json({ error: 'One of the selected parking bays is not part of this proposal.' })
    }
    const offices = (Array.isArray(officeIds) && officeIds.length) ? allOffices.filter((o) => officeIds.includes(o.spaceId)) : allOffices
    const parking = (Array.isArray(parkingIds) && parkingIds.length) ? allParking.filter((o) => parkingIds.includes(o.spaceId)) : []
    if (offices.length === 0) return res.status(400).json({ error: 'Please choose at least one office' })
    const contractItems = [...offices, ...parking]

    // Re-check availability: an office can be taken between proposal and accept
    // (the same unit is often offered to several leads; first accept wins).
    const { data: spaceRows } = await supabase.from('spaces').select('id, data').in('id', contractItems.map((o) => o.spaceId))
    const spacesById = Object.fromEntries((spaceRows ?? []).map((r) => [r.id, r.data]))
    const unavailable = contractItems.filter((o) => {
      const s = spacesById[o.spaceId]
      return !s || s.status === 'occupied' || s.status === 'reserved' || s.occupantTenantId
    })
    if (unavailable.length) {
      const names = unavailable.map((o) => o.unit || spacesById[o.spaceId]?.unitNumber || o.spaceId).join(', ')
      return res.status(409).json({
        error: `${names} ${unavailable.length > 1 ? 'are' : 'is'} no longer available. Please contact us and we'll arrange an alternative.`,
      })
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    // Term + start/end come from the proposal (6/12-month; month-to-month = 12-mo
    // nominal) and the start date the client chose on the accept page.
    const term = lead.proposal?.term || '12mo'
    const termMonths = term === '6mo' ? 6 : 12
    const rentFreeMonths = Number(lead.proposal?.freeMonths || 0)
    if (reqStart && /^\d{4}-\d{2}-\d{2}$/.test(reqStart) && reqStart < today) {
      return res.status(400).json({ error: 'The start date cannot be in the past.' })
    }
    const startDate = (reqStart && /^\d{4}-\d{2}-\d{2}$/.test(reqStart)) ? reqStart : today
    const st = new Date(`${startDate}T00:00:00`)
    const endD = new Date(st); endD.setMonth(endD.getMonth() + termMonths); endD.setDate(endD.getDate() - 1)
    const endDate = endD.toISOString().split('T')[0]

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
    const monthlyRent = contractItems.reduce((s, o) => s + Number(o.price || 0), 0)
    const deposit = monthlyRent // one month's rent as the security deposit
    const items = contractItems.map((o, i) => ({ spaceId: o.spaceId, deposit: i === 0 ? deposit : 0, steps: [{ startDate, endDate, listPrice: Number(o.price || 0), qty: 1, discount: '' }] }))
    const leaseId = contractNumber
    const eToken = rid('sign')
    const portalBase = settings?.portalUrl || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.headers.host}`
    const memberLink = `${portalBase}/sign/${eToken}`
    const lease = {
      id: leaseId, contractNumber, tenantId, memberId, memberName: contactName, companyName: businessName,
      spaceId: contractItems[0].spaceId, resource: contractItems.map((o) => o.unit).filter(Boolean).join(', '),
      membershipType: 'Private Office', documentType: 'License Agreement', contractType: 'New',
      startDate, endDate, monthlyRent, bondAmount: deposit, discount: '',
      termMonths, rentFreeMonths,
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

    // Reserve the chosen offices + parking for this client
    // Failures here must surface: an unreserved space invites double-booking.
    const warnings = []
    await Promise.all(contractItems.map(async (o) => {
      const s = spacesById[o.spaceId]
      if (!s) { warnings.push(`Space ${o.unit || o.spaceId} not found — reserve it manually.`); return }
      const { error } = await supabase.from('spaces').upsert({
        id: o.spaceId,
        data: { ...s, status: 'reserved', occupantTenantId: tenantId },
        updated_at: now.toISOString(),
      })
      if (error) warnings.push(`Could not reserve ${o.unit || o.spaceId}: ${error.message}`)
    }))
    if (warnings.length) console.error('proposal-accept reservation warnings:', warnings)

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
      const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
      const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
      const website = settings?.company?.website || 'hexaspace.com.au'
      const esignTpl = findEmailTemplate(templates, 'esign')
      const vars = {
        company: settings?.company?.name || 'Hexa Space', tenantName: contactName, contract: contractNumber,
        signLink: memberLink, signerName: settings?.contracts?.eSignName || settings?.company?.name || 'Hexa Space', website,
      }
      const subject = fillVars(esignTpl?.subject || 'Please sign: {{contract}} â€” {{company}}', vars)
      const html = esignTpl?.content
        ? fillVars(esignTpl.content, vars)
        : `<div style="font-family:Arial,sans-serif;padding:32px;max-width:560px"><p>Hi ${contactName},</p><p>Thanks for accepting your proposal. Please review and sign your licence agreement ${contractNumber}:</p><p><a href="${memberLink}">Review &amp; sign document</a></p></div>`
      await sendResend(resendKey, { fromName, fromEmail, to: email, subject, html, replyTo }).catch(() => {})

      const adminTo = [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail].filter(Boolean).map((e) => e.toLowerCase()))]
      if (adminTo.length) {
        const adminHtml = `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px"><h2 style="font-size:16px">Proposal accepted ðŸŽ‰</h2><p><strong>${businessName}</strong> (${contactName}, ${email}) accepted their proposal.</p><p>Client created, contract <strong>${contractNumber}</strong> raised for ${offices.map((o) => o.unit).join(', ')} at $${monthlyRent.toLocaleString('en-AU')}/mo (${termMonths}-month term from ${startDate}${rentFreeMonths ? `, ${rentFreeMonths} month${rentFreeMonths > 1 ? 's' : ''} rent-free` : ''}) and sent for e-signature. Countersign it once they've signed.</p>${warnings.length ? `<p style="color:#b45309"><strong>Warning:</strong> ${warnings.join(' ')}</p>` : ''}</div>`
        await sendResend(resendKey, { fromName, fromEmail, to: adminTo, subject: `Proposal accepted â€” ${businessName} (${contractNumber})`, html: adminHtml, replyTo }).catch(() => {})
      }
    }

    return res.status(200).json({ ok: true, contractNumber, signLink: memberLink, ...(warnings.length ? { warnings } : {}) })
  } catch (err) {
    console.error('proposal-accept error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
