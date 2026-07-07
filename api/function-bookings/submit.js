// POST /api/function-bookings/submit  { id }
// Called when a client completes their function details in the portal (and by the
// admin "approve" action for member requests that already have details). Finalises
// their company/member, raises the deposit + $300 security invoices, emails the
// deposit, and moves the booking to 'awaiting_deposit'. Balance + calendar happen
// later when the deposit is marked paid.
import { sessionsLabel } from '../../src/lib/functionBooking.js'
import { sendResendEmail } from '../_email.js'
import { brandFrame, bKicker, bH1, bP, bSmall, bPanel, bTable, SANS, INK } from '../_brand.js'
import { invoicePdfBase64 } from '../_invoicePdf.js'
import { requireMember, isAdminEmail } from '../_auth.js'

const money = (v) => `$${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Verify the caller: admins may finalise any booking; a member only their own
  // company's (or one tied to their email). This raises real invoices.
  const auth = await requireMember(req)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })
  const supabase = auth.sb
  const isAdmin = await isAdminEmail(supabase, auth.user.email)

  const { id } = req.body ?? {}
  if (!id) return res.status(400).json({ error: 'Missing id' })

  try {
    const now = new Date().toISOString()
    const [{ data: fbRows }, { data: settRows }, { data: tenantRows }, { data: memberRows }] = await Promise.all([
      supabase.from('function_bookings').select('id, data').eq('id', id),
      supabase.from('settings').select('data').eq('id', 'global'),
      supabase.from('tenants').select('id, data'),
      supabase.from('members').select('id, data'),
    ])
    if (!isAdmin) {
      const b = fbRows?.[0]?.data
      const ownsIt = b && (b.companyId === auth.companyId ||
        (b.email && b.email.toLowerCase() === auth.user.email));
      if (!ownsIt) return res.status(403).json({ error: 'Not your booking.' })
    }
    // Invoice numbers must be computed over ALL invoices — a plain select caps at
    // 1000 rows, which caused duplicate numbers. Page through just the number field.
    const invRows = await (async () => {
      const size = 1000; let from = 0; const all = []
      for (;;) {
        const { data, error } = await supabase.from('invoices').select('data').order('id', { ascending: true }).range(from, from + size - 1)
        if (error || !data?.length) break
        all.push(...data)
        if (data.length < size) break
        from += size
      }
      return all
    })()
    const b = fbRows?.[0]?.data
    if (!b) return res.status(404).json({ error: 'Booking not found' })
    if (b.depositRaisedAt) return res.status(200).json({ success: true, already: true })

    const settings = settRows?.[0]?.data ?? {}
    const q = b.quote || {}

    // ── Finalise company + member from captured info ──
    const ci = b.companyInfo || {}
    const mi = b.memberInfo || {}
    let tenantId = b.companyId
    const tenants = (tenantRows ?? []).map((r) => r.data)
    const existingTenant = tenantId ? tenants.find((t) => t.id === tenantId) : null
    if (tenantId) {
      // Trust the companyId set at approve time even if the tenant row hasn't
      // replicated yet (avoids minting a second tenant → broken billing link).
      const patch = { ...(existingTenant || { id: tenantId, status: 'client', industry: 'Function client', createdAt: now.split('T')[0] }), clientType: 'function' }
      patch.businessName = ci.businessName || existingTenant?.businessName || b.organisation || b.name || 'Function client'
      patch.contactName = ci.contactName || existingTenant?.contactName || b.name || ''
      patch.email = existingTenant?.email || b.email || ''
      if (ci.abn) patch.abn = ci.abn
      if (ci.phone) patch.phone = ci.phone
      else if (!existingTenant?.phone && b.phone) patch.phone = b.phone
      await supabase.from('tenants').upsert({ id: tenantId, data: patch, updated_at: now })
    } else {
      // No companyId — reuse an existing tenant with this email before creating one.
      const email = (b.email || '').toLowerCase()
      const match = email ? tenants.find((t) => (t.email || '').toLowerCase() === email) : null
      if (match) {
        tenantId = match.id
        await supabase.from('tenants').upsert({ id: tenantId, data: { ...match, clientType: 'function' }, updated_at: now })
      } else {
        tenantId = `t${Date.now()}`
        const t = { id: tenantId, businessName: ci.businessName || b.organisation || b.name || 'Function client', contactName: ci.contactName || b.name || '', email: b.email || '', phone: ci.phone || b.phone || '', abn: ci.abn || '', clientType: 'function', status: 'client', industry: 'Function client', createdAt: now.split('T')[0] }
        await supabase.from('tenants').upsert({ id: tenantId, data: t, updated_at: now })
      }
    }
    const members = (memberRows ?? []).map((r) => r.data)
    let memberId = b.memberId
    const email = (b.email || '').toLowerCase()
    // Reuse an existing member with this email — never create a duplicate person.
    if (!memberId && email) memberId = members.find((m) => (m.email || '').toLowerCase() === email)?.id
    if (!memberId && (mi.name || b.name)) {
      memberId = `m${Date.now()}`
      const m = { id: memberId, name: mi.name || b.name, email: mi.email || b.email, phone: mi.phone || b.phone || '', companyId: tenantId, clientType: 'function', role: 'Function contact', status: 'active', createdAt: now.split('T')[0] }
      await supabase.from('members').upsert({ id: memberId, data: m, updated_at: now })
    } else if (memberId) {
      // Make sure the reused member points at this company so the portal resolves it.
      const m = members.find((x) => x.id === memberId)
      if (m && m.companyId !== tenantId) await supabase.from('members').upsert({ id: memberId, data: { ...m, companyId: tenantId }, updated_at: now })
    }

    // ── Raise deposit (50%, GST) + refundable $300 security (no GST) ──
    const invoices = (invRows ?? []).map((r) => r.data)
    const nums = invoices.map((i) => parseInt(String(i.number || '').replace(/\D/g, '') || '0', 10)).filter((n) => !isNaN(n))
    let next = nums.length ? Math.max(...nums) + 1 : 1
    const tmpl = settings?.invoicing?.invoiceNumberTemplate ?? 'INV-{{number}}'
    const numFor = () => tmpl.replace('{{number}}', String(next++).padStart(4, '0'))
    const clientName = b.organisation || ci.businessName || b.name || 'Function client'
    const base = { tenantId, source: 'function', status: 'pending', sentStatus: 'not_sent', functionRef: b.ref, clientName, clientEmail: b.email, issueDate: now.split('T')[0], payments: [], comments: [], createdAt: now.split('T')[0] }

    // One deposit invoice, two lines: 50% of the booking cost (GST applies) and
    // the $300 refundable security deposit (GST-exempt). Due immediately to secure.
    const depId = `inv${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const depInv = { ...base, id: depId, number: numFor(), invoiceType: 'function_deposit', dueDate: now.split('T')[0], vatEnabled: true, lineItems: [
      { description: `50% deposit — function booking · ${b.eventName || 'Function'} (${sessionsLabel(b)})`, revenueAccount: 'Function Space Hire', unitPrice: q.depositHalf ?? 0, qty: 1, discountPct: 0 },
      { description: `Refundable security deposit · ${b.eventName || 'Function'}`, revenueAccount: 'Security Deposit', unitPrice: q.securityDeposit ?? 300, qty: 1, discountPct: 0, vatExempt: true },
    ] }
    await supabase.from('invoices').upsert([{ id: depId, data: depInv, updated_at: now }])

    // ── Update booking ──
    const updated = { ...b, stage: 'awaiting_deposit', depositRaisedAt: now, tenantId, companyId: tenantId, memberId, depositInvoiceId: depId, read: false, updatedAt: now }
    await supabase.from('function_bookings').upsert({ id: b.id, data: updated, updated_at: now })

    // ── Email the deposit-due notice (with the tax-invoice PDF attached) ──
    emailDeposit(settings, updated, q, depInv).catch(() => {})
    return res.status(200).json({ success: true, dueNow: q.dueNow })
  } catch (err) {
    console.error('function submit error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function emailDeposit(settings, b, q, depInv) {
  if (!b.email) return
  const fromName = settings?.emails?.fromName || settings?.company?.name || 'Hexa Space'
  const fromEmail = settings?.emails?.fromEmail || 'noreply@hexaspace.com.au'
  const replyTo = settings?.emails?.replyTo || settings?.emails?.notificationEmail
  const bank = settings?.billing || {}
  const bankBlock = (bank.bankName || bank.bsb || bank.acc)
    ? bPanel(
        `<div style="font-family:${SANS};font-size:11px;font-weight:600;color:${INK};text-transform:uppercase;letter-spacing:.12em;margin:0 0 8px">Payment details</div>` +
        `<div style="font-family:${SANS};font-size:13px;color:#555;line-height:1.7">` +
        (bank.bankName ? `<div>Bank: ${bank.bankName}</div>` : '') +
        (bank.businessName ? `<div>Account name: ${bank.businessName}</div>` : '') +
        (bank.bsb ? `<div>BSB: ${bank.bsb}</div>` : '') +
        (bank.acc ? `<div>Account: ${bank.acc}</div>` : '') +
        `<div style="margin-top:6px">Reference: ${b.ref}</div>` +
        `</div>`
      ) : ''
  const inner =
    bKicker('Deposit due to secure your date') +
    bH1(`Thanks ${b.name || 'there'} — one step to secure your booking`) +
    bP(`Your details are in. To secure <strong>${b.eventDate || 'your date'}</strong> we just need your deposit. Your date isn't held until the deposit is received.`) +
    bTable([
      ['Total (inc GST)', money(q.total)],
      ['Deposit due now', money(q.dueNow), true],
      ['Balance (14 days before event)', money(q.balanceDue)],
    ]) +
    bankBlock +
    bSmall("Your tax invoice is attached. Deposit includes your 50% venue hire and the $300 refundable security deposit. Once received, we'll confirm and lock in your booking.")
  const html = brandFrame(inner, { footerLabel: 'Function Space Hire' })

  // Attach the deposit tax-invoice PDF (best-effort — never block the send).
  let attachments
  try {
    if (depInv) {
      const content = invoicePdfBase64(depInv, settings)
      if (content) attachments = [{ filename: `Invoice ${depInv.number || b.ref}.pdf`, content }]
    }
  } catch (err) { console.error('invoice pdf failed:', err) }

  await sendResendEmail({ from: `${fromName} <${fromEmail}>`, to: b.email, replyTo, subject: `Deposit due to secure your function — ${b.ref}`, html, attachments })
}
