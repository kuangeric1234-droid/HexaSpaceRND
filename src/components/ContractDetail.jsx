import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInDays } from 'date-fns'
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, FileDown, ChevronDown, LayoutGrid, FileText, CheckCircle2 } from 'lucide-react'
import ContractTemplate from './ContractTemplate.jsx'
import SignatureCanvas from './SignatureCanvas.jsx'
import { sendEmail, eSignEmailHtml, renderEsignTemplate, renderSignedTemplate, PORTAL_URL } from '../lib/sendEmail.js'
import { supabase } from '../lib/supabase.js'
import { jsPDF } from 'jspdf'
import DocumentsPanel from './DocumentsPanel.jsx'
import { logAudit } from '../lib/audit.js'
import { buildPaymentSchedule, scheduleAmount } from '../lib/paymentSchedule.js'

const SIG_STATUS = {
  manually_signed: { label: 'Manually Signed', cls: 'bg-green-500 text-white' },
  e_signed:        { label: 'E Signed',          cls: 'bg-green-500 text-white' },
  out_for_signature: { label: 'Out For Signature', cls: 'bg-pink-400 text-white' },
  not_signed:      { label: 'Not Signed',        cls: 'bg-gray-300 text-gray-700' },
}

function getStageBadges(lease) {
  const today = new Date()
  const badges = []
  const sig = lease.signatureStatus
  if (sig === 'manually_signed' || sig === 'e_signed') {
    badges.push({ label: 'Signed', cls: 'bg-green-500 text-white' })
  } else {
    badges.push({ label: 'Not Signed', cls: 'bg-red-400 text-white' })
  }
  badges.push({ label: lease.contractType ?? 'New', cls: 'bg-blue-500 text-white' })
  if (lease.status === 'active' && lease.endDate) {
    const d = differenceInDays(parseISO(lease.endDate), today)
    if (d < 0) badges.push({ label: 'Expired', cls: 'bg-gray-400 text-white' })
    else if (d <= 60) badges.push({ label: 'Not Renewed', cls: 'bg-orange-500 text-white' })
    else badges.push({ label: 'Active', cls: 'bg-green-600 text-white' })
  }
  return badges
}

export default function ContractDetail({
  lease, tenant, space, templates = [], allLeases = [], settings,
  onEdit, onBack, onRenew, onDelete, onUpdateLease,
}) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [showSignMenu, setShowSignMenu] = useState(false)
  const [showNoticeModal, setShowNoticeModal] = useState(false)
  const [noticeForm, setNoticeForm] = useState({ noticeDate: new Date().toISOString().split('T')[0], vacateDate: '', bondRefunded: false, notes: '' })
  const [view, setView] = useState('grid') // 'grid' | 'template' | 'signed'
  const [signedUri, setSignedUri] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const [eSignData, setESignData] = useState(null)
  const [showCountersignModal, setShowCountersignModal] = useState(false)
  const [licensorName, setLicensorName] = useState(settings?.company?.name ?? 'Hexa Space Pty Ltd')
  const [counterskigning, setCountersigning] = useState(false)
  const licensorSigRef = useRef(null)

  // Fetch esign data when contract is out_for_signature or e_signed
  useEffect(() => {
    const relevant = ['out_for_signature', 'e_signed']
    if (!relevant.includes(lease.signatureStatus)) return
    const memberLink = lease.eSignMemberLink ?? ''
    const tokenMatch = memberLink.match(/\/sign\/([^/?]+)/)
    if (!tokenMatch) return
    supabase.from('esign_requests').select('*').eq('token', tokenMatch[1]).single()
      .then(({ data }) => { if (data) setESignData(data) })
  }, [lease.signatureStatus, lease.eSignMemberLink])

  const isSigned = lease.signatureStatus === 'manually_signed' || lease.signatureStatus === 'e_signed'
  const isOutForSign = lease.signatureStatus === 'out_for_signature'

  const eSignAdminLink = lease.eSignAdminLink ?? `${window.location.origin}/sign/${lease.id}?admin=1`
  const eSignMemberLink = lease.eSignMemberLink ?? `${PORTAL_URL}/sign/${lease.id}`

  function copyLink(link, label) {
    navigator.clipboard?.writeText(link).catch(() => {})
    setCopyMsg(`${label} copied`)
    setTimeout(() => setCopyMsg(''), 2000)
  }

  async function handleSendForESign() {
    setShowSignMenu(false)

    // Generate unique signing token
    const token = crypto.randomUUID()
    const memberLink = `${PORTAL_URL}/sign/${token}`          // client-facing signing page
    const adminLink = `${window.location.origin}/sign/${token}?admin=1` // internal admin view

    // Save token to Supabase esign_requests table
    await supabase.from('esign_requests').insert({
      token,
      lease_id: lease.id,
      tenant_id: lease.tenantId,
      status: 'pending',
    })

    const updatedLease = {
      signatureStatus: 'out_for_signature',
      eSignAdminLink: adminLink,
      eSignMemberLink: memberLink,
      eSignSentAt: new Date().toISOString(),
    }
    if (onUpdateLease) onUpdateLease(lease.id, updatedLease)

    // Send eSign email to tenant
    if (tenant?.email) {
      try {
        const mergedLease = { ...lease, ...updatedLease }
        // Prefer the editable Templates → Emails → E-signature request template.
        const esignTpl = (templates ?? []).find((t) => t.category === 'email' && t.emailType === 'esign' && t.content)
        let subject, html
        if (esignTpl) {
          ({ subject, html } = renderEsignTemplate({ template: esignTpl, lease: mergedLease, tenant, settings, signLink: memberLink }))
        } else {
          subject = `Please sign: ${lease.contractNumber ?? 'Licence Agreement'} — ${settings?.contracts?.eSignName ?? settings?.company?.name ?? 'Hexa Space'}`
          html = eSignEmailHtml({ lease: mergedLease, tenant, settings })
        }
        await sendEmail({ to: tenant.email, subject, html, settings, tenantId: tenant?.id, emailType: 'esign' })
      } catch {
        // silently fail — lease status already updated
      }
    }
  }

  function handleMarkAsSigned() {
    setShowSignMenu(false)
    if (onUpdateLease) {
      onUpdateLease(lease.id, {
        signatureStatus: 'manually_signed',
        signedAt: new Date().toISOString(),
      })
      logAudit('sign', 'lease', lease.id, contractNum, 'Manually marked as signed')
    }
  }

  const contractNum = lease.contractNumber ?? `CON-${lease.id.slice(-3).toUpperCase()}`
  const stageBadges = getStageBadges(lease)
  const sigMeta = SIG_STATUS[lease.signatureStatus]
  const annualValue = lease.monthlyRent ? lease.monthlyRent * 12 : null
  const isMonthToMonth = lease.contractType === 'Month-to-month' || lease.documentType === 'Membership Agreement Month-to-month'

  // Find previous contract if this is a renewal
  const prevContract = lease.previousContractId
    ? allLeases.find((l) => l.id === lease.previousContractId)
    : null
  const prevNum = prevContract?.contractNumber ?? (lease.previousContractId ? `CON-${lease.previousContractId.slice(-3).toUpperCase()}` : null)

  // Resources = items from the contract
  const items = lease.items ?? [{
    spaceId: lease.spaceId,
    deposit: lease.bondAmount ?? 0,
    steps: [{ startDate: lease.startDate, endDate: lease.endDate, listPrice: lease.monthlyRent, discount: '' }],
  }]

  // Attached templates
  const attachedTemplates = (lease.contractTerms ?? [])
    .map((ref) => templates.find((t) => t.id === ref) ?? templates.find((t) => `${t.name} - ${t.version}` === ref || t.name === ref))
    .filter(Boolean)
    .filter((t) => (t.category || 'document') !== 'email')

  // The documents shown in the preview AND the generated PDF: the licence
  // agreement is followed by Terms & Conditions then House Rules. Prefer the
  // versions attached to this contract; fall back to the global documents so they
  // always appear (matches the signing flow). Any other attached docs follow.
  const isDocTmpl = (t) => (t.category || 'document') !== 'email'
  const pickDoc = (re) => attachedTemplates.find((t) => re.test(t.name || '')) || templates.find((t) => isDocTmpl(t) && re.test(t.name || ''))
  const contractDocs = (() => {
    const primary = [pickDoc(/terms/i), pickDoc(/house\s*rules|house/i)].filter(Boolean)
    const others = attachedTemplates.filter((t) => !primary.some((p) => p.id === t.id))
    return [...primary, ...others]
  })()

  async function handleCountersign() {
    if (!licensorName.trim()) { alert('Please enter the licensor name.'); return }
    if (licensorSigRef.current?.isEmpty()) { alert('Please draw the licensor signature.'); return }
    setCountersigning(true)
    try {
      const signatureData = licensorSigRef.current.toDataURL()
      const now = new Date().toISOString()
      const memberLink = lease.eSignMemberLink ?? ''
      const tokenMatch = memberLink.match(/\/sign\/([^/?]+)/)
      if (tokenMatch) {
        const { error } = await supabase.from('esign_requests').update({
          status: 'fully_signed',
          licensor_signature_data: signatureData,
          licensor_signer_name: licensorName,
          licensor_signed_at: now,
        }).eq('token', tokenMatch[1])
        if (error) throw error
      }
      // Both parties have now signed → activate the contract. The space is only
      // taken up (reserved → occupied) once the deposit + first invoice are paid
      // and the commencement date is reached (handled by the store reconcile).
      if (onUpdateLease) onUpdateLease(lease.id, { signatureStatus: 'e_signed', signedAt: now, signerName: lease.tenantSignerName ?? tenant?.contactName, status: 'active', activatedAt: now })
      setESignData((prev) => ({ ...prev, status: 'fully_signed', licensor_signature_data: signatureData, licensor_signer_name: licensorName, licensor_signed_at: now }))
      setShowCountersignModal(false)
      logAudit('sign', 'lease', lease.id, contractNum, `Countersigned by ${licensorName}`)

      // Both parties signed → email the fully-signed PDF copy to the client AND us.
      try {
        const fullSig = { ...(eSignData || {}), status: 'fully_signed', licensor_signature_data: signatureData, licensor_signer_name: licensorName, licensor_signed_at: now }
        await emailSignedCopy(fullSig)
      } catch (e) { console.error('Signed copy email failed:', e) }
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setCountersigning(false)
    }
  }

  // sigData = { licensee_signature_data, licensee_signer_name, licensee_signed_at, licensor_signature_data, licensor_signer_name, licensor_signed_at }
  async function buildContractPDF(sigData = null) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const ml = 18, mr = W - 18
    let y = 20

    function checkPage(needed = 14) {
      if (y + needed > H - 15) { doc.addPage(); y = 20 }
    }

      // ── Header: LICENCE AGREEMENT / HEXA SPACE (matches template) ──
      const companyName = settings?.billing?.businessName ?? settings?.company?.name ?? 'Hexa Space Pty Ltd'
      const billingAddress = settings?.billing?.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'
      const addrComma = billingAddress.indexOf(',')
      const addrLine1 = addrComma > -1 ? billingAddress.slice(0, addrComma).trim() : billingAddress
      const addrLine2 = addrComma > -1 ? billingAddress.slice(addrComma + 1).trim() : ''

      doc.setTextColor(0)
      doc.setFontSize(15); doc.setFont('helvetica', 'bold')
      doc.text('LICENCE AGREEMENT', ml, y)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('HEXA SPACE', mr, y, { align: 'right' })
      y += 10

      // ── Agreement info (left) + Business Centre Address (right) ──
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
      const agLabel = 'Agreement ID: '
      doc.text(agLabel, ml, y); doc.setFont('helvetica', 'bold'); doc.text(contractNum, ml + doc.getTextWidth(agLabel), y)
      doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, ml, y + 5)

      doc.setFont('helvetica', 'bold'); doc.text('Business Centre Address', mr, y, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
      doc.text(addrLine1, mr, y + 5, { align: 'right' })
      if (addrLine2) doc.text(addrLine2, mr, y + 10, { align: 'right' })
      doc.text('Australia, Victoria', mr, y + (addrLine2 ? 15 : 10), { align: 'right' })
      y += addrLine2 ? 22 : 17
      doc.setDrawColor(200); doc.setLineWidth(0.3); doc.setTextColor(0)
      doc.line(ml, y, mr, y); y += 8

      // Company + Contact (two columns)
      const colMid = ml + (mr - ml) / 2 + 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('COMPANY', ml, y)
      doc.text('PRIMARY CONTACT', colMid, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      const leftLines = [
        `Company: ${tenant?.businessName ?? '—'}`,
        `Address:`,
        `City/State:`,
        `Post code:`,
        `ABN: ${tenant?.abn ?? ''}`,
      ]
      const rightLines = [
        `Name: ${tenant?.contactName ?? '—'}`,
        `Number: ${tenant?.phone ?? ''}`,
        `Email: ${tenant?.email ?? ''}`,
      ]
      const maxRows = Math.max(leftLines.length, rightLines.length)
      for (let i = 0; i < maxRows; i++) {
        checkPage()
        if (leftLines[i]) doc.text(leftLines[i], ml, y)
        if (rightLines[i]) doc.text(rightLines[i], colMid, y)
        y += 5
      }
      y += 6

      // ── Licence Fee Details ───────────────────────────────────
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(80)
      doc.text('LICENCE FEE DETAILS', ml, y); doc.setTextColor(0)
      doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(ml, y + 2, mr, y + 2)
      y += 7

      const cols = { office: ml, start: ml + 45, end: ml + 95, total: mr }
      doc.setFillColor(20, 20, 20)
      doc.rect(ml, y - 3.5, mr - ml, 7, 'F')
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
      doc.text('OFFICE', cols.office, y + 0.5)
      doc.text('START DATE', cols.start, y + 0.5)
      doc.text('END DATE', cols.end, y + 0.5)
      doc.text('MONTHLY TOTAL', cols.total, y + 0.5, { align: 'right' })
      doc.setTextColor(0)
      y += 7

      const items = lease.items ?? [{
        spaceId: lease.spaceId,
        deposit: lease.bondAmount ?? 0,
        steps: [{ startDate: lease.startDate, endDate: lease.endDate, listPrice: lease.monthlyRent ?? 0, qty: 1 }],
      }]

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      let rowIdx = 0
      for (const item of items) {
        for (const step of (item.steps ?? [])) {
          checkPage()
          const price = Number(step.listPrice ?? 0)
          const qty = Number(step.qty ?? 1)
          if (rowIdx % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(ml, y - 2, mr - ml, 7, 'F') }
          doc.setTextColor(0)
          doc.text(space?.unitNumber ?? '—', cols.office, y + 3)
          doc.text(step.startDate ? format(parseISO(step.startDate), 'dd/MM/yyyy') : '—', cols.start, y + 3)
          doc.text(step.endDate ? format(parseISO(step.endDate), 'dd/MM/yyyy') : '—', cols.end, y + 3)
          doc.setFont('helvetica', 'bold')
          doc.text(`$${(price * qty).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, cols.total, y + 3, { align: 'right' })
          doc.setFont('helvetica', 'normal')
          y += 8; rowIdx++
        }
      }
      doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(ml, y, mr, y)
      y += 6

      // Summary
      const deposit = Number(items[0]?.deposit ?? 0)
      const taxRatePct = settings?.billingRules?.taxRate ?? 10
      const gst = Math.round(deposit * (taxRatePct / 100) * 100) / 100
      const totalInit = Math.round((deposit + gst) * 100) / 100

      // ── Summary: notice/dates (left) + payments (right) ───────
      const sumRows = [
        ['Minimum Notice Period:', `${lease.noticePeriodMonths ?? 1} (M), 0 (W), 0 (D)`],
        ['Start Date:', lease.startDate ? format(parseISO(lease.startDate), 'dd/MM/yyyy') : '—'],
        ['End Date:', lease.endDate ? format(parseISO(lease.endDate), 'dd/MM/yyyy') : '—'],
      ]
      const payRows = [
        ['Initial payment:', `${deposit.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
        [`GST ${taxRatePct} %:`, `${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
        ['Total initial payment:', `${totalInit.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
        ['Deposit', `${deposit.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
      ]
      const maxSumRows = Math.max(sumRows.length, payRows.length)
      doc.setFontSize(8); doc.setTextColor(80)
      for (let i = 0; i < maxSumRows; i++) {
        checkPage()
        if (sumRows[i]) {
          doc.setFont('helvetica', 'bold'); doc.text(sumRows[i][0], ml, y + 3)
          doc.setFont('helvetica', 'normal'); doc.text(sumRows[i][1], colMid - 6, y + 3, { align: 'right' })
          doc.setDrawColor(220); doc.setLineWidth(0.2); doc.line(ml, y + 5, colMid - 4, y + 5)
        }
        if (payRows[i]) {
          doc.setFont('helvetica', 'bold'); doc.text(payRows[i][0], colMid + 2, y + 3)
          doc.setFont('helvetica', 'normal'); doc.text(payRows[i][1], mr, y + 3, { align: 'right' })
          doc.setDrawColor(220); doc.setLineWidth(0.2); doc.line(colMid + 2, y + 5, mr, y + 5)
        }
        y += 7
      }
      doc.setTextColor(0)
      y += 4
      doc.setFontSize(6.5); doc.setTextColor(130)
      doc.text('*Minimum Term is subject to written notice from either party. Minimum notice period as specified above.', ml, y)
      y += 10; doc.setTextColor(0)

      // ── Payment Schedule ──────────────────────────────────────
      const schedule = buildPaymentSchedule(lease, settings)
      if (schedule) {
        checkPage(24)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(80)
        doc.text('PAYMENT SCHEDULE', ml, y); doc.setTextColor(0)
        doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(ml, y + 2, mr, y + 2)
        y += 7

        const sCols = { month: ml, office: ml + 62, services: ml + 92, total: ml + 124, incGst: mr }
        function scheduleHeader() {
          doc.setFillColor(20, 20, 20)
          doc.rect(ml, y - 3.5, mr - ml, 7, 'F')
          doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
          doc.text('MONTH', sCols.month, y + 0.5)
          doc.text('OFFICE', sCols.office, y + 0.5, { align: 'right' })
          doc.text('SERVICES', sCols.services, y + 0.5, { align: 'right' })
          doc.text('MONTH TOTAL', sCols.total, y + 0.5, { align: 'right' })
          doc.text('TOTAL INCL. GST', sCols.incGst, y + 0.5, { align: 'right' })
          doc.setTextColor(0)
          y += 7
        }
        scheduleHeader()

        doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
        schedule.rows.forEach((r, i) => {
          if (y + 8 > H - 15) { doc.addPage(); y = 20; scheduleHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8) }
          if (i % 2 === 0) { doc.setFillColor(248, 248, 248); doc.rect(ml, y - 2, mr - ml, 7, 'F') }
          doc.setTextColor(0)
          doc.text(r.label + (r.free ? '  (rent-free)' : ''), sCols.month, y + 3)
          doc.text(`${scheduleAmount(r.office)} AUD`, sCols.office, y + 3, { align: 'right' })
          doc.text(`${scheduleAmount(r.services)} AUD`, sCols.services, y + 3, { align: 'right' })
          doc.text(`${scheduleAmount(r.total)} AUD`, sCols.total, y + 3, { align: 'right' })
          doc.setFont('helvetica', 'bold')
          doc.text(`${scheduleAmount(r.incGst)} AUD`, sCols.incGst, y + 3, { align: 'right' })
          doc.setFont('helvetica', 'normal')
          y += 8
        })
        // Totals row
        if (y + 8 > H - 15) { doc.addPage(); y = 20 }
        doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(ml, y - 1, mr, y - 1)
        doc.setFont('helvetica', 'bold')
        doc.text('Total', sCols.month, y + 3)
        doc.text(`${scheduleAmount(schedule.totals.office)} AUD`, sCols.office, y + 3, { align: 'right' })
        doc.text(`${scheduleAmount(schedule.totals.services)} AUD`, sCols.services, y + 3, { align: 'right' })
        doc.text(`${scheduleAmount(schedule.totals.total)} AUD`, sCols.total, y + 3, { align: 'right' })
        doc.text(`${scheduleAmount(schedule.totals.incGst)} AUD`, sCols.incGst, y + 3, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 9
        if (schedule.rows.some((r) => r.free)) {
          doc.setFontSize(6.5); doc.setTextColor(130)
          doc.text('*New-member offer — rent-free months are applied to the end of the term as shown above.', ml, y)
          doc.setTextColor(0)
          y += 6
        }
        y += 4
      }

      // ── Signature blocks ──────────────────────────────────────
      checkPage(65)
      doc.setFillColor(0); doc.rect(ml, y, mr - ml, 0.5, 'F')
      y += 8

      const sigColW = (mr - ml - 8) / 2
      const sigLeft = ml
      const sigRight = ml + sigColW + 8

      function drawSigBlock(x, party, name, sName, sTitle, sDate, sImgData) {
        const bx = x, bw = sigColW
        // Header
        doc.setFillColor(20, 20, 20)
        doc.rect(bx, y, bw, 7, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255)
        doc.text(party.toUpperCase(), bx + 3, y + 4.5)
        doc.setTextColor(0)
        // Party name
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80)
        doc.text(`For and on behalf of: ${name}`, bx, y + 11)
        doc.setTextColor(0)
        // Fields
        const fieldY = y + 16
        const fields = [
          { label: 'Full Name', value: sName ?? '' },
          { label: 'Title / Position', value: sTitle ?? '' },
          { label: 'Date', value: sDate ?? '' },
        ]
        let fy = fieldY
        for (const f of fields) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100)
          doc.text(f.label, bx, fy)
          doc.setDrawColor(180); doc.setLineWidth(0.3)
          doc.rect(bx, fy + 1, bw, 6, 'S')
          if (f.value) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(0)
            doc.text(f.value, bx + 2, fy + 5.5)
          }
          fy += 11
        }
        // Signature box
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100)
        doc.text('Signature', bx, fy)
        doc.setDrawColor(180); doc.setLineWidth(0.3)
        doc.rect(bx, fy + 1, bw, 18, 'S')
        if (sImgData) {
          try { doc.addImage(sImgData, 'PNG', bx + 2, fy + 2, bw - 4, 14) } catch {}
        }
      }

      const licenseeDate = sigData?.licensee_date ?? (sigData?.licensee_signed_at ? format(parseISO(sigData.licensee_signed_at), 'dd/MM/yyyy') : '')
      const licensorDate = sigData?.licensor_signed_at ? format(parseISO(sigData.licensor_signed_at), 'dd/MM/yyyy') : ''

      drawSigBlock(sigLeft, 'You The Licensee', tenant?.businessName ?? 'The Licensee',
        sigData?.licensee_signer_name, sigData?.licensee_title, licenseeDate, sigData?.licensee_signature_data)
      drawSigBlock(sigRight, 'Us The Licensor', companyName,
        sigData?.licensor_signer_name, null, licensorDate, sigData?.licensor_signature_data)

      y += 72

      // ── Attached Templates (T&C, House Rules, etc.) ───────────────────
      if (contractDocs.length > 0) {
        function renderHtml(html) {
          const container = document.createElement('div')
          container.innerHTML = html ?? ''
          for (const node of container.childNodes) {
            if (node.nodeType !== 1) continue
            const tag = node.tagName.toLowerCase()
            const text = node.textContent?.trim()
            if (!text) continue
            if (y + 12 > H - 15) { doc.addPage(); y = 20 }
            if (tag === 'h1' || tag === 'h2') {
              doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
              const lines = doc.splitTextToSize(text, mr - ml)
              doc.text(lines, ml, y); y += lines.length * 5.5 + 4
            } else if (tag === 'h3') {
              doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
              const lines = doc.splitTextToSize(text, mr - ml)
              doc.text(lines, ml, y); y += lines.length * 5 + 2
            } else if (tag === 'p') {
              doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50)
              const lines = doc.splitTextToSize(text, mr - ml)
              doc.text(lines, ml, y); y += lines.length * 4.3 + 3
            } else if (tag === 'ul' || tag === 'ol') {
              const items = Array.from(node.querySelectorAll('li'))
              items.forEach((li, idx) => {
                if (y + 8 > H - 15) { doc.addPage(); y = 20 }
                const prefix = tag === 'ol' ? `${idx + 1}.  ` : '•  '
                doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50)
                const lines = doc.splitTextToSize(prefix + li.textContent.trim(), mr - ml - 6)
                doc.text(lines, ml + 5, y); y += lines.length * 4.3 + 2
              })
              y += 2
            }
          }
          doc.setTextColor(0)
        }

        for (const tmpl of contractDocs) {
          doc.addPage(); y = 20
          doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
          doc.text(tmpl.name.toUpperCase(), ml, y); y += 7
          doc.setDrawColor(0); doc.setLineWidth(0.4)
          doc.line(ml, y, mr, y); y += 8
          const html = tmpl.content
            ?? (tmpl.clauses ?? []).map((c) => `<h3>${c.number}. ${c.title}</h3><p>${c.content}</p>`).join('')
          renderHtml(html)
        }
      }

      // ── Footer on every page ──────────────────────────────────
      const pages = doc.getNumberOfPages()
      const footerCompany = settings?.billing?.businessName ?? settings?.company?.name ?? 'Hexa Space Pty Ltd'
      const footerAddr = settings?.billing?.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFillColor(20, 20, 20)
        doc.rect(0, H - 10, W, 10, 'F')
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 160)
        doc.text(`${contractNum} · ${footerCompany} · ${footerAddr}`, W / 2, H - 5, { align: 'center' })
        doc.setTextColor(220, 220, 220); doc.setFont('helvetica', 'bold')
        doc.text(`${i} / ${pages}`, mr, H - 5, { align: 'right' })
      }

      return doc
  }

  async function handleGeneratePDF() {
    setGenerating(true)
    try {
      const doc = await buildContractPDF()
      const slug = (tenant?.businessName ?? 'contract').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
      doc.save(`${contractNum}_${slug}.pdf`)
      const now = new Date().toISOString()
      if (onUpdateLease) onUpdateLease(lease.id, { lastGeneratedAt: now, lastGeneratedFile: `${contractNum}_${slug}.pdf` })
    } finally {
      setGenerating(false)
    }
  }

  async function handleDownloadSignedPDF() {
    setGenerating(true)
    try {
      const doc = await buildContractPDF(eSignData)
      const slug = (tenant?.businessName ?? 'contract').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
      doc.save(`${contractNum}_${slug}_SIGNED.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  // All admins who should be copied on signed contracts / notifications.
  const adminRecipients = () => [...new Set(['eric@hexaspace.com.au', 'info@hexaspace.com.au', settings?.emails?.notificationEmail, settings?.company?.email].filter(Boolean).map((e) => e.toLowerCase()))]

  // Build the signed PDF once and email it (attached) to the client AND to us,
  // using the editable "Signed contract" email template when present.
  async function emailSignedCopy(sigData) {
    const doc = await buildContractPDF(sigData)
    const slug = (tenant?.businessName ?? 'contract').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    const dataUri = doc.output('datauristring')
    const pdfBase64 = dataUri.includes(',') ? dataUri.slice(dataUri.indexOf(',') + 1) : dataUri
    const companyName = settings?.company?.name ?? 'Hexa Space'
    const signedDate = format(new Date(), 'dd MMM yyyy')
    const signedTpl = (templates ?? []).find((t) => t.category === 'email' && t.emailType === 'signedContract' && t.content)
    let subject, html
    if (signedTpl) {
      ({ subject, html } = renderSignedTemplate({ template: signedTpl, lease, tenant, settings, signedDate }))
    } else {
      subject = `Signed copy: ${contractNum} — ${companyName}`
      html = `<div style="font-family:Arial,sans-serif;color:#1a1a1a;padding:32px;max-width:560px"><div style="font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:16px">${companyName.toUpperCase()}</div><p>Hi ${tenant?.contactName ?? ''},</p><p>Please find the fully signed copy of <strong>${contractNum}</strong> attached.</p></div>`
    }
    const recipients = [...new Set([tenant?.email, ...adminRecipients()].filter(Boolean))]
    const attachments = [{ filename: `${contractNum}_${slug}_SIGNED.pdf`, content: pdfBase64 }]
    for (const to of recipients) {
      await sendEmail({ to, subject, html, settings, attachments, tenantId: tenant?.id, emailType: 'signedContract' })
    }
    return recipients
  }

  async function handleSendSignedCopy() {
    const recips = [...new Set([tenant?.email, ...adminRecipients()].filter(Boolean))]
    if (recips.length === 0) { alert('No email address on file.'); return }
    if (!window.confirm(`Send the signed copy of ${contractNum} to: ${recips.join(', ')}?`)) return
    setGenerating(true)
    try {
      await emailSignedCopy(eSignData)
      alert(`Signed copy sent to: ${recips.join(', ')}`)
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // Lazily render the signed PDF into the "Signed Copy" review tab.
  async function openSignedView() {
    setView('signed')
    setSignedUri(null)
    try {
      const doc = await buildContractPDF(eSignData)
      setSignedUri(doc.output('datauristring'))
    } catch { /* leave spinner */ }
  }

  return (
    <div className="flex flex-col h-full bg-muted/50">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-sm">
          <button onClick={onBack} className="text-blue-600 hover:underline flex items-center gap-1">
            Contracts
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-semibold">{contractNum}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Copy feedback toast */}
          {copyMsg && (
            <span className="text-xs text-green-600 font-medium">{copyMsg}</span>
          )}

          {/* [...] menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="w-8 h-8 flex items-center justify-center border border-input rounded hover:bg-muted/50 text-foreground font-bold text-sm"
            >
              ...
            </button>
            {showMenu && (
              <div className="absolute right-0 top-9 bg-card border border-border rounded-xl shadow-lg z-50 w-44 py-1">
                <button
                  onClick={() => { setShowMenu(false); setShowNoticeModal(true) }}
                  className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted/50"
                >
                  Serve Notice to Vacate
                </button>
                <button
                  onClick={() => { setShowMenu(false); onDelete(lease.id) }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Sign dropdown (unsigned) / Renew (signed) */}
          {isSigned ? (
            <button
              onClick={onRenew}
              className="border border-input rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted/50"
            >
              Renew
            </button>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowSignMenu((v) => !v)}
                className="flex items-center gap-1.5 border border-input rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 font-medium"
              >
                Sign <ChevronDown size={13} />
              </button>
              {showSignMenu && (
                <div className="absolute right-0 top-9 bg-card border border-border rounded-xl shadow-lg z-50 w-44 py-1">
                  <button
                    onClick={handleSendForESign}
                    className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted/50"
                  >
                    Send for eSign
                  </button>
                  <button
                    onClick={handleMarkAsSigned}
                    className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted/50"
                  >
                    Mark as Signed
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Signed PDF buttons */}
          {isSigned && lease.signatureStatus === 'e_signed' && eSignData && (
            <>
              <button
                onClick={handleDownloadSignedPDF}
                disabled={generating}
                className="flex items-center gap-1.5 border border-green-300 text-green-700 rounded px-3 py-1.5 text-sm hover:bg-green-50 font-medium"
              >
                <FileDown size={13} /> Signed PDF
              </button>
              <button
                onClick={handleSendSignedCopy}
                disabled={generating}
                className="flex items-center gap-1.5 border border-blue-300 text-blue-700 rounded px-3 py-1.5 text-sm hover:bg-blue-50 font-medium"
              >
                Send Signed Copy
              </button>
            </>
          )}

          {/* Edit */}
          <button
            onClick={onEdit}
            className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm font-semibold hover:bg-blue-700"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Left panel ── */}
        <div className="w-72 shrink-0 border-r border-border bg-card overflow-y-auto p-5">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-foreground">{contractNum}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{lease.documentType ?? 'License Agreement'}</p>
            {lease.createdAt && (
              <p className="text-xs text-muted-foreground mt-2">
                Created: {format(parseISO(lease.createdAt), 'dd/MM/yyyy')}
              </p>
            )}
            {tenant?.contactName && (
              <p className="text-xs text-muted-foreground">Creator: {tenant.contactName}</p>
            )}
          </div>

          {/* Previous contract link */}
          {prevNum && (
            <div className="mb-4 pb-4 border-b border-border">
              <p className="text-xs text-muted-foreground">
                Renewed Contract (Previous):{' '}
                <span className="text-blue-600 font-medium cursor-pointer hover:underline">{prevNum}</span>
              </p>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-4">
            {/* Stage */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <span>▪</span> Stage
              </p>
              <div className="flex flex-wrap gap-1">
                {stageBadges.map((b) => (
                  <span key={b.label} className={`text-xs font-semibold px-2 py-0.5 rounded ${b.cls}`}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Signature Status */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <span>✍</span> Signature Status
              </p>
              {sigMeta ? (
                <>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sigMeta.cls}`}>
                    {sigMeta.label}
                  </span>
                  {/* Tenant signed, waiting for countersign */}
                  {lease.signatureStatus === 'out_for_signature' && eSignData?.status === 'tenant_signed' && (
                    <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <p className="text-xs font-semibold text-orange-700 mb-1">⚠ Tenant has signed</p>
                      <p className="text-xs text-orange-600 mb-2">
                        {eSignData.licensee_signer_name} signed on {eSignData.licensee_signed_at ? format(parseISO(eSignData.licensee_signed_at), 'dd/MM/yyyy HH:mm') : '—'}
                      </p>
                      {eSignData.licensee_signature_data && (
                        <div className="border border-orange-200 rounded bg-card p-1 mb-2 inline-block">
                          <img src={eSignData.licensee_signature_data} alt="Tenant signature" className="h-8 max-w-[140px] object-contain" />
                        </div>
                      )}
                      <button
                        onClick={() => setShowCountersignModal(true)}
                        className="w-full bg-primary text-primary-foreground text-xs py-1.5 rounded font-semibold hover:bg-primary/90"
                      >
                        Countersign Now →
                      </button>
                    </div>
                  )}
                  {/* Fully signed */}
                  {isSigned && (
                    <div className="mt-2 space-y-2">
                      {eSignData?.licensee_signer_name && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Licensee</p>
                          <p className="text-xs text-foreground">{eSignData.licensee_signer_name}</p>
                          {eSignData.licensee_signed_at && <p className="text-xs text-muted-foreground">{format(parseISO(eSignData.licensee_signed_at), 'dd/MM/yyyy HH:mm')}</p>}
                          {eSignData.licensee_signature_data && (
                            <div className="mt-1 border border-border rounded bg-card p-1 inline-block">
                              <img src={eSignData.licensee_signature_data} alt="Licensee sig" className="h-8 max-w-[140px] object-contain" />
                            </div>
                          )}
                        </div>
                      )}
                      {eSignData?.licensor_signer_name && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Licensor</p>
                          <p className="text-xs text-foreground">{eSignData.licensor_signer_name}</p>
                          {eSignData.licensor_signed_at && <p className="text-xs text-muted-foreground">{format(parseISO(eSignData.licensor_signed_at), 'dd/MM/yyyy HH:mm')}</p>}
                          {eSignData.licensor_signature_data && (
                            <div className="mt-1 border border-border rounded bg-card p-1 inline-block">
                              <img src={eSignData.licensor_signature_data} alt="Licensor sig" className="h-8 max-w-[140px] object-contain" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {isOutForSign && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">🔗 eSign Links:</p>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => copyLink(eSignAdminLink, 'Admin link')}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                        >
                          <span>📋</span> Copy Admin Link
                        </button>
                        <button
                          onClick={() => copyLink(eSignMemberLink, 'Member link')}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                        >
                          <span>📋</span> Copy Member Link
                        </button>
                      </div>
                      {lease.eSignSentAt && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Sent {format(new Date(lease.eSignSentAt), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            <div className="border-t border-border pt-4 space-y-2.5">
              {/* Member */}
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs mt-0.5">👤</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Member</p>
                  <p className="text-sm text-foreground">
                    {lease.memberName || tenant?.contactName || '—'}
                    {tenant?.businessName ? ` at ${tenant.businessName}` : ''}
                  </p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs mt-0.5">📍</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Location</p>
                  <p className="text-sm text-foreground">{settings?.billing?.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'}</p>
                </div>
              </div>

              {/* Duration */}
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs mt-0.5">📅</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Duration</p>
                  <p className="text-sm text-foreground">
                    {lease.startDate ? format(parseISO(lease.startDate), 'dd/MM/yyyy') : '—'} –{' '}
                    {isMonthToMonth ? '∞' : lease.endDate ? format(parseISO(lease.endDate), 'dd/MM/yyyy') : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notice: {lease.noticePeriodMonths ?? 1} Month{(lease.noticePeriodMonths ?? 1) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Value */}
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground text-xs mt-0.5">💰</span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Value</p>
                  <p className="text-sm font-semibold text-foreground">
                    {isMonthToMonth ? 'N/A' : annualValue
                      ? `A$${annualValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Last generated badge */}
            {lease.lastGeneratedAt && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-green-700">Document Generated</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(lease.lastGeneratedAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{lease.lastGeneratedFile}</p>
                    <button
                      className="mt-2 text-xs text-blue-500 hover:underline font-medium"
                      onClick={() => alert('E-sign integration coming soon.')}
                    >
                      Send for E-Sign →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Template toolbar */}
          <div className="bg-card border-b border-border px-5 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Template</span>
              <select className="border border-input rounded px-3 py-1.5 text-sm bg-card focus:outline-none w-52">
                <option>{lease.documentType ?? 'License Agreement'}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex border border-input rounded overflow-hidden text-sm">
                <button
                  onClick={() => setView('template')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${view === 'template' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
                >
                  <FileText size={13} /> Template View
                </button>
                <button
                  onClick={() => setView('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-l border-input transition-colors ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
                >
                  <LayoutGrid size={13} /> Grid View
                </button>
                {isSigned && (
                  <button
                    onClick={openSignedView}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border-l border-input transition-colors ${view === 'signed' ? 'bg-green-600 text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
                  >
                    <FileDown size={13} /> Signed Copy
                  </button>
                )}
              </div>
              <button
                onClick={handleGeneratePDF}
                disabled={generating}
                className="flex items-center gap-1.5 bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                <FileDown size={13} /> {generating ? 'Generating…' : 'Generate PDF'} <ChevronDown size={11} />
              </button>
            </div>
          </div>

          {/* ── Signed Copy review ── */}
          {view === 'signed' && (
            <div className="bg-muted flex-1">
              {signedUri ? (
                <iframe title="Signed contract" src={signedUri} className="w-full border-none" style={{ height: 'calc(100vh - 130px)' }} />
              ) : (
                <div className="p-12 text-center text-muted-foreground text-sm">Generating signed PDF…</div>
              )}
            </div>
          )}

          {/* ── Template View ── */}
          {view === 'template' && (
            <div className="overflow-auto bg-muted flex-1">
              <ContractTemplate lease={lease} tenant={tenant} space={space} templates={templates} settings={settings} />
              {contractDocs.map((tmpl) => (
                <div key={tmpl.id} className="bg-card max-w-4xl mx-auto mb-6 px-12 py-10 text-sm text-foreground font-sans shadow-sm">
                  <h2 className="text-base font-bold uppercase tracking-widest text-foreground mb-3">{tmpl.name}</h2>
                  <hr className="border-border mb-6" />
                  <div
                    style={{ lineHeight: 1.6 }}
                    className="template-html-body"
                    dangerouslySetInnerHTML={{ __html: tmpl.content ?? '' }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Grid View ── */}
          {view === 'grid' && (
          <div className="p-5 space-y-5">

            {/* ── Notice to Vacate banner ── */}
            {lease.noticeGiven && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-orange-800">Notice to Vacate Served</p>
                    <div className="mt-1 text-xs text-orange-700 space-y-0.5">
                      <p>Notice date: <span className="font-medium">{lease.noticeDate}</span></p>
                      <p>Expected vacate date: <span className="font-medium">{lease.vacateDate || '—'}</span></p>
                      <p>Bond refunded: <span className="font-medium">{lease.bondRefunded ? 'Yes' : 'Pending'}</span></p>
                      {lease.noticeNotes && <p className="text-orange-600 mt-1">{lease.noticeNotes}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setNoticeForm({ noticeDate: lease.noticeDate ?? '', vacateDate: lease.vacateDate ?? '', bondRefunded: lease.bondRefunded ?? false, notes: lease.noticeNotes ?? '' }); setShowNoticeModal(true) }}
                    className="text-xs border border-orange-300 rounded px-2 py-1 text-orange-700 hover:bg-orange-100"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}

            {/* ── Resources ── */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground">Resources</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    {['Resource', 'List Price', 'Deposit', 'Steps', 'Final Price'].map((h) => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const itemSpace = item.spaceId ? [space, ...[]].find((s) => s?.id === item.spaceId) : null
                    const resourceName = itemSpace?.unitNumber ?? space?.unitNumber ?? `Resource ${idx + 1}`
                    const resourceSub = itemSpace?.size ?? space?.size ?? ''
                    return (
                      <tr key={idx} className="border-b border-border last:border-0">
                        <td className="px-5 py-3">
                          <div className="font-medium text-foreground">{resourceName}</div>
                          {resourceSub && <div className="text-xs text-blue-500 mt-0.5">{resourceSub}</div>}
                        </td>
                        <td className="px-5 py-3">
                          {(item.steps ?? []).map((step, si) => (
                            <div key={si} className="text-foreground">
                              A${Number(step.listPrice ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                            </div>
                          ))}
                        </td>
                        <td className="px-5 py-3 text-foreground">
                          A${Number(item.deposit ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3">
                          {(item.steps ?? []).map((step, si) => (
                            <div key={si} className="text-muted-foreground text-xs">
                              {step.startDate && step.endDate
                                ? `${format(parseISO(step.startDate), 'dd/MM/yyyy')} – ${format(parseISO(step.endDate), 'dd/MM/yyyy')}`
                                : '—'}
                            </div>
                          ))}
                        </td>
                        <td className="px-5 py-3">
                          {(item.steps ?? []).map((step, si) => {
                            const disc = Number(step.discount?.replace('%', '') || 0)
                            const finalPrice = disc > 0
                              ? Number(step.listPrice ?? 0) * (1 - disc / 100)
                              : Number(step.listPrice ?? 0)
                            return (
                              <div key={si} className="text-foreground text-right">
                                A${finalPrice.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                              </div>
                            )
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Setup Fees ── (shown if notes contain fees or as placeholder) */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground">Setup Fees</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    {['Setup Fee', 'List Price', 'Quantity', 'Source Plan', 'Final Price'].map((h) => (
                      <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="px-5 py-5 text-sm text-muted-foreground text-center">
                      No setup fees on this contract.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Terms & Conditions ── */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="font-semibold text-foreground">Terms &amp; Conditions</h3>
              </div>
              <div className="px-5 py-4">
                {attachedTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents attached to this contract.</p>
                ) : (
                  <ul className="space-y-1">
                    {attachedTemplates.map((tmpl) => (
                      <li key={tmpl.id} className="flex items-center gap-2 text-sm text-blue-600 hover:underline cursor-pointer">
                        <span className="text-muted-foreground">📄</span>
                        {tmpl.name}
                        <span className="text-xs text-muted-foreground">{tmpl.version}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Notes (if any) */}
            {lease.notes && (
              <div className="bg-card border border-border rounded-xl shadow-sm p-5">
                <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lease.notes}</p>
              </div>
            )}

            {/* Documents */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <DocumentsPanel leaseId={lease.id} tenantId={lease.tenantId} title="Contract Documents" />
            </div>
          </div>
          )} {/* end grid view */}
        </div>
      </div>

      {/* Click outside overlays */}
      {showMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
      )}
      {showSignMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSignMenu(false)} />
      )}

      {/* Countersign modal */}
      {showCountersignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-foreground">Countersign as Licensor</h2>
              <button onClick={() => setShowCountersignModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Tenant <strong>{eSignData?.licensee_signer_name}</strong> has signed. Sign below to fully execute the agreement.
                </p>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Licensor name</label>
                <input
                  type="text"
                  value={licensorName}
                  onChange={(e) => setLicensorName(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Signature</label>
                  <button onClick={() => licensorSigRef.current?.clear()} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
                </div>
                <SignatureCanvas ref={licensorSigRef} height={120} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
              <button onClick={() => setShowCountersignModal(false)} className="px-4 py-2 text-sm border border-input rounded text-foreground hover:bg-muted/50">Cancel</button>
              <button
                onClick={handleCountersign}
                disabled={counterskigning}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {counterskigning ? 'Signing…' : 'Sign & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notice to Vacate Modal ── */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-foreground">Notice to Vacate</h2>
              <button onClick={() => setShowNoticeModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notice Date</label>
                <input type="date" value={noticeForm.noticeDate}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, noticeDate: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Vacate Date</label>
                <input type="date" value={noticeForm.vacateDate}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, vacateDate: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                <textarea value={noticeForm.notes} rows={3}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Reason for vacating, condition notes, etc."
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={noticeForm.bondRefunded}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, bondRefunded: e.target.checked }))}
                  className="h-4 w-4 rounded border-input" />
                <span className="text-sm text-muted-foreground">Bond / security deposit has been refunded</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
              <button onClick={() => setShowNoticeModal(false)}
                className="px-4 py-2 text-sm border border-input rounded text-foreground hover:bg-muted/50">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onUpdateLease) onUpdateLease(lease.id, {
                    noticeGiven: true,
                    noticeDate: noticeForm.noticeDate,
                    vacateDate: noticeForm.vacateDate,
                    bondRefunded: noticeForm.bondRefunded,
                    noticeNotes: noticeForm.notes,
                  })
                  setShowNoticeModal(false)
                }}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded font-semibold hover:bg-primary/90"
              >
                Save Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
