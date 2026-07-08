import { useState, useEffect } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { FileDown, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { discountPct } from '../lib/leasePricing.js'

const TYPE_LABEL = {
  warehouse: 'Warehouse Unit',
  desk: 'Coworking Desk',
  office: 'Private Office',
  popup: 'Pop-up / Retail Bay',
}

const LOCATION_LABEL = {
  huntingdale: '402/830 Whitehorse Road, Box Hill VIC 3128',
  lonsdale: 'Lonsdale Street, Melbourne VIC',
  whitehorse: 'Whitehorse Road, Mitcham VIC',
}

export default function AgreementGenerator() {
  const { leases, tenants, spaces, templates = [] } = useOutletContext()
  const [searchParams] = useSearchParams()
  const preselectedLeaseId = searchParams.get('leaseId')

  const [selectedLeaseId, setSelectedLeaseId] = useState(preselectedLeaseId || '')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    if (preselectedLeaseId) setSelectedLeaseId(preselectedLeaseId)
  }, [preselectedLeaseId])

  const selectedLease = leases.find((l) => l.id === selectedLeaseId)
  const selectedTenant = selectedLease ? tenants.find((t) => t.id === selectedLease.tenantId) : null
  const selectedSpace = selectedLease ? spaces.find((s) => s.id === selectedLease.spaceId) : null

  async function generatePDF() {
    if (!selectedLease || !selectedTenant || !selectedSpace) return
    setGenerating(true)
    setGenerated(false)

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 20

    const agreementDate = format(new Date(), 'dd/MM/yyyy')
    const refNumber = `HH-${selectedLease.id.toUpperCase()}-${format(new Date(), 'yyyyMM')}`

    // --- Header ---
    doc.setFillColor(0, 0, 0)
    doc.rect(0, 0, pageW, 30, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('HEXA SPACE', margin, 14)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('build locally, scale sustainably', margin, 20)
    doc.setFontSize(8)
    doc.text('hexaspace.com.au', pageW - margin, 14, { align: 'right' })
    doc.text('402/830 Whitehorse Road, Box Hill VIC 3128', pageW - margin, 20, { align: 'right' })

    // --- Title ---
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('LICENCE AGREEMENT', pageW / 2, 44, { align: 'center' })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Agreement Date: ${agreementDate}   |   Reference: ${refNumber}`, pageW / 2, 50, { align: 'center' })

    // Divider
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(margin, 54, pageW - margin, 54)

    let y = 62

    function sectionTitle(title) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(title.toUpperCase(), margin, y)
      y += 1
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.line(margin, y + 1, pageW - margin, y + 1)
      y += 6
    }

    function row(label, value) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(80, 80, 80)
      doc.text(label, margin, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0)
      doc.text(String(value), margin + 50, y)
      y += 6
    }

    // --- Parties ---
    sectionTitle('1. Parties')

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 80)
    doc.text('LICENSOR', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text('Hexa Space Pty Ltd', margin + 50, y)
    y += 5
    doc.text('ABN: 00 000 000 000', margin + 50, y)
    y += 5
    doc.text('402/830 Whitehorse Road, Box Hill VIC 3128', margin + 50, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 80)
    doc.text('LICENSEE', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text(selectedTenant.businessName, margin + 50, y)
    y += 5
    if (selectedTenant.abn) { doc.text(`ABN: ${selectedTenant.abn}`, margin + 50, y); y += 5 }
    if (selectedTenant.contactName) { doc.text(`Attention: ${selectedTenant.contactName}`, margin + 50, y); y += 5 }
    if (selectedTenant.email) { doc.text(`Email: ${selectedTenant.email}`, margin + 50, y); y += 5 }
    if (selectedTenant.phone) { doc.text(`Phone: ${selectedTenant.phone}`, margin + 50, y); y += 5 }
    y += 4

    // --- Premises ---
    sectionTitle('2. Premises')
    row('Unit / Space', selectedSpace.unitNumber)
    row('Type', TYPE_LABEL[selectedSpace.type] || selectedSpace.type)
    row('Size', selectedSpace.size)
    row('Location', LOCATION_LABEL[selectedSpace.location] || selectedSpace.location)
    y += 2

    // --- Term ---
    sectionTitle('3. Term & Rent')
    row('Commencement Date', format(parseISO(selectedLease.startDate), 'dd MMMM yyyy'))
    row('Expiry Date', selectedLease.endDate ? format(parseISO(selectedLease.endDate), 'dd MMMM yyyy') : 'Month-to-month (until notice is given)')
    row('Monthly Licence Fee', `AUD $${Number(selectedLease.monthlyRent).toLocaleString('en-AU')} (incl. GST)${
      discountPct(selectedLease.discount) > 0 && Number(selectedLease.listPrice) > Number(selectedLease.monthlyRent)
        ? ` — incl. ${selectedLease.discount} discount off list AUD $${Number(selectedLease.listPrice).toLocaleString('en-AU')}`
        : ''}`)
    row('Bond / Security Deposit', `AUD $${Number(selectedLease.bondAmount).toLocaleString('en-AU')}`)
    y += 2

    // --- Attached template documents (Terms, House Rules, etc.) ---
    const attachedTemplates = (selectedLease.contractTerms ?? [])
      .map((ref) => {
        const byId = templates.find((t) => t.id === ref)
        if (byId) return byId
        return templates.find(
          (t) => `${t.name} · ${t.version}` === ref || `${t.name} - ${t.version}` === ref || t.name === ref
        )
      })
      .filter(Boolean)
      // Never render email templates into the agreement — documents only.
      .filter((t) => (t.category || 'document') !== 'email')

    const fallbackHtml = `<h3>1. Permitted Use</h3><p>The Licensee shall use the Premises solely for lawful commercial operations.</p><h3>2. Payment Terms</h3><p>The monthly licence fee is payable in advance on the 1st of each month.</p><h3>3. Termination</h3><p>Either party may terminate by providing 30 days' written notice.</p><h3>4. Governing Law</h3><p>This agreement is governed by the laws of the State of Victoria, Australia.</p>`

    const docsToRender =
      attachedTemplates.length > 0
        ? attachedTemplates
        : [{ name: 'Terms & Conditions', version: '', content: fallbackHtml }]

    // Helper: parse template HTML and render each block into jsPDF
    function renderTemplateHtml(html) {
      const container = document.createElement('div')
      // Support legacy clause-array format
      if (!html && typeof html !== 'string') return
      container.innerHTML = html

      for (const node of container.childNodes) {
        if (node.nodeType !== 1) continue
        const tag = node.tagName.toLowerCase()
        const text = node.textContent?.trim()
        if (!text) continue

        if (y > pageH - 18) { doc.addPage(); y = margin }

        if (tag === 'h1') {
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(0, 0, 0)
          const lines = doc.splitTextToSize(text, pageW - margin * 2)
          doc.text(lines, margin, y)
          y += lines.length * 6 + 4
        } else if (tag === 'h2') {
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(0, 0, 0)
          const lines = doc.splitTextToSize(text, pageW - margin * 2)
          doc.text(lines, margin, y)
          y += lines.length * 5.5 + 3
        } else if (tag === 'h3') {
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(0, 0, 0)
          const lines = doc.splitTextToSize(text, pageW - margin * 2)
          doc.text(lines, margin, y)
          y += lines.length * 5 + 2
        } else if (tag === 'p') {
          doc.setFontSize(8.5)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(50, 50, 50)
          const lines = doc.splitTextToSize(text, pageW - margin * 2)
          doc.text(lines, margin, y)
          y += lines.length * 4.8 + 4
        } else if (tag === 'ul' || tag === 'ol') {
          const items = Array.from(node.querySelectorAll('li'))
          items.forEach((li, i) => {
            if (y > pageH - 12) { doc.addPage(); y = margin }
            const prefix = tag === 'ol' ? `${i + 1}.  ` : '•  '
            doc.setFontSize(8.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(50, 50, 50)
            const lines = doc.splitTextToSize(prefix + li.textContent.trim(), pageW - margin * 2 - 5)
            doc.text(lines, margin + 4, y)
            y += lines.length * 4.8 + 2
          })
          y += 2
        } else if (tag === 'blockquote') {
          doc.setFontSize(8.5)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(100, 100, 100)
          const lines = doc.splitTextToSize(text, pageW - margin * 2 - 8)
          doc.text(lines, margin + 6, y)
          y += lines.length * 4.8 + 4
        }
      }
      doc.setTextColor(0, 0, 0)
    }

    let sectionNum = 4
    for (const tmpl of docsToRender) {
      if (y > pageH - 50) { doc.addPage(); y = margin }
      const tmplHeading = tmpl.version
        ? `${sectionNum}. ${tmpl.name} — ${tmpl.version}`
        : `${sectionNum}. ${tmpl.name}`
      sectionTitle(tmplHeading)

      // Get HTML content — new format (content) or legacy (clauses)
      const html = tmpl.content
        ?? (tmpl.clauses ?? []).map((c) => `<h3>${c.number}. ${c.title}</h3><p>${c.content}</p>`).join('')

      renderTemplateHtml(html)
      sectionNum++
    }

    // --- Signature Block ---
    if (y > pageH - 60) { doc.addPage(); y = margin }
    y += 4

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += 6

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text(`${sectionNum}. EXECUTION`, margin, y)
    y += 8

    const colW = (pageW - margin * 2 - 10) / 2

    // Licensor block
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('SIGNED by LICENSOR', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text('Hexa Space Pty Ltd', margin, y)
    y += 12
    doc.setDrawColor(0, 0, 0)
    doc.line(margin, y, margin + colW, y)
    y += 5
    doc.setFontSize(7.5)
    doc.text('Authorised Signatory / Director', margin, y)
    y += 5
    doc.line(margin, y, margin + colW, y)
    y += 5
    doc.text('Date', margin, y)
    y += 10

    // Licensee block — reset y to after execution header
    const sigY = y - 37
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('SIGNED by LICENSEE', margin + colW + 10, sigY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(selectedTenant.businessName, margin + colW + 10, sigY + 6)
    doc.setDrawColor(0, 0, 0)
    doc.line(margin + colW + 10, sigY + 18, pageW - margin, sigY + 18)
    doc.setFontSize(7.5)
    doc.text('Authorised Signatory / Director', margin + colW + 10, sigY + 23)
    doc.line(margin + colW + 10, sigY + 28, pageW - margin, sigY + 28)
    doc.text('Date', margin + colW + 10, sigY + 33)

    // --- Footer with page numbers ---
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(
        `Hexa Space Licence Agreement · ${refNumber} · Page ${i} of ${pageCount}`,
        pageW / 2,
        pageH - 8,
        { align: 'center' }
      )
    }

    const tenantSlug = selectedTenant.businessName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    const dateSlug = format(new Date(), 'yyyyMMdd')
    doc.save(`Hexa Space_Agreement_${tenantSlug}_${dateSlug}.pdf`)

    setGenerating(false)
    setGenerated(true)
  }

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Agreement Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate a branded PDF licence agreement for any lease.
        </p>
      </div>

      <div className="max-w-2xl">
        {/* Lease selector */}
        <div className="bg-white border border-gray-200 rounded-md p-6 mb-5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Select Lease
          </label>
          <select
            value={selectedLeaseId}
            onChange={(e) => { setSelectedLeaseId(e.target.value); setGenerated(false) }}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
          >
            <option value="">Choose a lease…</option>
            {leases.map((l) => {
              const t = tenants.find((t) => t.id === l.tenantId)
              const s = spaces.find((s) => s.id === l.spaceId)
              return (
                <option key={l.id} value={l.id}>
                  {t?.businessName ?? '?'} — {s?.unitNumber ?? '?'} (
                  {format(parseISO(l.startDate), 'dd/MM/yyyy')} to{' '}
                  {l.endDate ? format(parseISO(l.endDate), 'dd/MM/yyyy') : 'ongoing'})
                </option>
              )
            })}
          </select>
        </div>

        {/* Preview card */}
        {selectedLease && selectedTenant && selectedSpace && (
          <div className="bg-gray-50 border border-gray-200 rounded-md p-5 mb-5 text-sm space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-gray-500" />
              <span className="font-semibold text-gray-800">Agreement Preview</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <span className="text-gray-400">Licensor</span>
              <span>Hexa Space Pty Ltd</span>
              <span className="text-gray-400">Licensee</span>
              <span className="font-medium">{selectedTenant.businessName}</span>
              <span className="text-gray-400">ABN</span>
              <span>{selectedTenant.abn || '—'}</span>
              <span className="text-gray-400">Space</span>
              <span>{selectedSpace.unitNumber} · {TYPE_LABEL[selectedSpace.type]}</span>
              <span className="text-gray-400">Size</span>
              <span>{selectedSpace.size}</span>
              <span className="text-gray-400">Location</span>
              <span className="capitalize">{selectedSpace.location}</span>
              <span className="text-gray-400">Term</span>
              <span>
                {format(parseISO(selectedLease.startDate), 'dd/MM/yyyy')} →{' '}
                {selectedLease.endDate ? format(parseISO(selectedLease.endDate), 'dd/MM/yyyy') : 'month-to-month'}
              </span>
              <span className="text-gray-400">Monthly Rent</span>
              <span className="font-semibold">
                ${Number(selectedLease.monthlyRent).toLocaleString('en-AU')} AUD
                {discountPct(selectedLease.discount) > 0 && Number(selectedLease.listPrice) > Number(selectedLease.monthlyRent) && (
                  <span className="font-normal text-gray-400"> · {selectedLease.discount} off list ${Number(selectedLease.listPrice).toLocaleString('en-AU')}</span>
                )}
              </span>
              <span className="text-gray-400">Bond</span>
              <span>${Number(selectedLease.bondAmount).toLocaleString('en-AU')} AUD</span>
            </div>
          </div>
        )}

        <button
          onClick={generatePDF}
          disabled={!selectedLease || generating}
          className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileDown size={15} />
          {generating ? 'Generating…' : 'Download PDF Agreement'}
        </button>

        {generated && (
          <p className="mt-3 text-sm text-green-700 font-medium">
            PDF downloaded successfully.
          </p>
        )}
      </div>
    </div>
  )
}
