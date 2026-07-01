import { useState } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { ArrowLeft, Send, RefreshCw, Ban, FileMinus, FileDown, Plus, MessageSquare, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { sendEmail, invoiceEmailHtml, resolveEmailTemplate } from '../lib/sendEmail.js'
import { logAudit } from '../lib/audit.js'
import { locationLabel, lineDescription } from '../lib/billing.js'
import { jsPDF } from 'jspdf'

const STATUS_STYLE = {
  pending: 'bg-orange-100 text-orange-800 border border-orange-300',
  paid: 'bg-green-100 text-green-800 border border-green-300',
  overdue: 'bg-red-100 text-red-800 border border-red-300',
  voided: 'bg-gray-100 text-gray-500 border border-gray-300',
}

function calcLineTotal(item) {
  return Math.round(item.unitPrice * item.qty * (1 - (item.discountPct ?? 0) / 100) * 100) / 100
}

function calcTotals(invoice, taxRate = 0.1) {
  const lines = invoice.lineItems ?? []
  const subtotal = lines.reduce((s, l) => s + calcLineTotal(l), 0)
  const discountAmount = Math.round(subtotal * ((invoice.discountPct ?? 0) / 100) * 100) / 100
  const taxableSubtotal = lines.filter((l) => !l.vatExempt).reduce((s, l) => s + calcLineTotal(l), 0)
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - discountAmount)
  const gst = invoice.vatEnabled !== false ? Math.round(taxableAfterDiscount * taxRate * 100) / 100 : 0
  const total = Math.round((subtotal - discountAmount + gst) * 100) / 100
  const paid = (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  return { subtotal, discountAmount, taxable: taxableAfterDiscount, gst, total, paid, amountDue: Math.max(0, total - paid) }
}

export default function InvoiceDetail({
  invoice,
  tenant,
  space,
  settings,
  onBack,
  onUpdate,
  onVoid,
  onDelete,
  onAddPayment,
  onAddComment,
  isSuperAdmin = false,
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), method: 'Bank Transfer', note: '' })
  const [commentText, setCommentText] = useState('')
  const [showDetach, setShowDetach] = useState(false)
  const [detachSelected, setDetachSelected] = useState([])

  const taxRatePct = settings?.billingRules?.taxRate ?? 10
  const taxRate = taxRatePct / 100
  const totals = calcTotals(invoice, taxRate)
  const today = new Date()
  const daysLeft = invoice.dueDate ? differenceInDays(parseISO(invoice.dueDate), today) : null

  // ── PDF Generation ─────────────────────────────────────────────────────
  async function buildPDFDoc() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const ml = 15
    const mr = W - 15

    const companyName = settings?.company?.name ?? 'Hexa Space Pty Ltd'
    const companyWebsite = settings?.company?.website ?? 'hexaspace.com.au'
    const billingName = settings?.billing?.businessName ?? companyName
    const billingBsb = settings?.billing?.bsb ?? '063-000'
    const billingAcc = settings?.billing?.acc ?? '00000000'
    const billingAddress = settings?.billing?.address ?? 'Level 4, 830 Whitehorse Road, Box Hill VIC 3128'
    const addrComma = billingAddress.indexOf(',')
    const addrLine1 = addrComma > -1 ? billingAddress.slice(0, addrComma).trim() : billingAddress
    const addrLine2 = addrComma > -1 ? billingAddress.slice(addrComma + 1).trim() : ''

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('TAX INVOICE', ml, 24)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(tenant?.businessName ?? '—', ml, 31)

    const logo = settings?.company?.logo
    if (logo && logo.startsWith('data:image')) {
      try {
        const fmt = logo.split(';')[0].split('/')[1]?.toUpperCase() || 'PNG'
        doc.addImage(logo, fmt, mr - 36, 8, 36, 12)
      } catch {
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0)
        doc.text(companyName.toUpperCase(), mr, 18, { align: 'right' })
      }
    } else {
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(companyName.toUpperCase(), mr, 18, { align: 'right' })
    }
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text(billingName, mr, 23, { align: 'right' })
    doc.text(addrLine1, mr, 27.5, { align: 'right' })
    if (addrLine2) doc.text(addrLine2, mr, 32, { align: 'right' })

    const infoX = mr - 60
    let iy = 40
    function infoRow(label, value) {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0)
      doc.text(label, infoX, iy)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      doc.text(String(value), infoX + 28, iy)
      iy += 5
    }
    infoRow('Invoice Date', invoice.issueDate ? format(parseISO(invoice.issueDate), 'dd/MM/yyyy') : '—')
    infoRow('Due Date', invoice.dueDate ? format(parseISO(invoice.dueDate), 'dd/MM/yyyy') : '—')
    infoRow('Invoice Number', invoice.number)
    if (invoice.periodStart) {
      infoRow('Period', `${format(parseISO(invoice.periodStart), 'dd/MM/yyyy')} – ${format(parseISO(invoice.periodEnd), 'dd/MM/yyyy')}`)
    }

    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3)
    doc.line(ml, 56, mr, 56)

    let y = 63
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0)
    doc.text('Description', ml, y)
    doc.text('Qty', 118, y, { align: 'right' })
    doc.text('Unit Price', 141, y, { align: 'right' })
    doc.text('GST', 158, y, { align: 'right' })
    doc.text('Amount AUD', mr, y, { align: 'right' })
    y += 3
    doc.setDrawColor(0); doc.setLineWidth(0.4)
    doc.line(ml, y, mr, y)
    y += 5

    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
    for (const line of (invoice.lineItems ?? [])) {
      const lineTotal = calcLineTotal(line)
      const exempt = line.vatExempt || invoice.vatEnabled === false
      const lineGst = exempt ? 0 : Math.round(lineTotal * taxRate * 100) / 100
      const descLines = doc.splitTextToSize(lineDescription(line, space, invoice) + (exempt ? ' (GST Exempt)' : ''), 95)
      doc.text(descLines, ml, y)
      doc.text(String(line.qty), 118, y, { align: 'right' })
      doc.text(`${lineTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, 141, y, { align: 'right' })
      doc.text(exempt ? '—' : String(taxRatePct), 158, y, { align: 'right' })
      doc.text(`${lineTotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, mr, y, { align: 'right' })
      y += descLines.length * 5 + 2
    }

    y += 2; doc.setLineWidth(0.3); doc.setDrawColor(180)
    doc.line(ml, y, mr, y); y += 6

    const totX = 130
    function totRow(label, value, bold = false) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setTextColor(bold ? 0 : 60, bold ? 0 : 60, bold ? 0 : 60)
      doc.text(label, totX, y); doc.text(value, mr, y, { align: 'right' }); y += 5.5
    }
    totRow('Subtotal', `${totals.subtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
    if (totals.discountAmount > 0)
      totRow('Discount', `${totals.discountAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
    totRow('Taxable Amount', `${totals.taxable.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
    totRow(`Total GST ${taxRatePct.toFixed(2)} %`, `${totals.gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
    y += 1; doc.setLineWidth(0.4); doc.setDrawColor(0)
    doc.line(totX, y, mr, y); y += 4
    totRow('TOTAL AUD', `${totals.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, true)
    totRow('Amount Due AUD', `${totals.amountDue.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`, true)

    y += 8
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text(`Please make payments to ${billingName}`, ml, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text(`Account Name: ${companyName}`, ml, y); y += 5
    doc.text(`BSB: ${billingBsb}`, ml, y); y += 5
    doc.text(`ACC: ${billingAcc}`, ml, y)

    doc.setFontSize(6.5); doc.setTextColor(150)
    doc.text(`${billingName} · ${billingAddress} · ${companyWebsite}`, W / 2, H - 8, { align: 'center' })

    return doc
  }

  async function generatePDF() {
    const doc = await buildPDFDoc()
    const slug = (tenant?.businessName ?? 'invoice').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    doc.save(`${invoice.number}_${slug}.pdf`)
  }

  // ── Handlers ───────────────────────────────────────────────────────────
  async function handleSend() {
    const email = tenant?.email
    if (!email) {
      alert('No email address on file for this tenant.')
      return
    }
    if (!window.confirm(`Send ${invoice.number} to ${email}?`)) return
    try {
      const doc = await buildPDFDoc()
      const pdfDataUri = doc.output('datauristring')
      const pdfBase64 = pdfDataUri.split(',')[1]
      const slug = (tenant?.businessName ?? 'invoice').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
      await sendEmail({
        to: email,
        subject: resolveEmailTemplate('invoice', { number: invoice.number, company: settings?.company?.name ?? 'Hexa Space', dueDate: invoice.dueDate ?? '' }, settings).subject || `Invoice ${invoice.number} from ${settings?.company?.name ?? 'Hexa Space'}`,
        html: invoiceEmailHtml({ invoice, tenant, settings }),
        settings,
        attachments: [{ filename: `${invoice.number}_${slug}.pdf`, content: pdfBase64 }],
        tenantId: invoice.tenantId, emailType: 'invoice',
      })
      onUpdate(invoice.id, { sentStatus: 'sent' })
      logAudit('send', 'invoice', invoice.id, invoice.number, `Sent to ${email}`)
    } catch (err) {
      onUpdate(invoice.id, { sentStatus: 'sent' })
      if (err.message !== 'Failed to fetch') {
        alert(`Note: email may not have been delivered (${err.message}). Invoice marked as sent.`)
      }
    }
  }

  async function handleSendReminder() {
    const email = tenant?.email
    if (!email) { alert('No email address on file for this tenant.'); return }
    if (!window.confirm(`Send overdue payment reminder to ${email}?`)) return
    try {
      const companyName = settings?.company?.name ?? 'Hexa Space'
      const sub = (invoice.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
      const gst = invoice.vatEnabled !== false ? Math.round(sub * (taxRate) * 100) / 100 : 0
      const total = sub + gst
      await sendEmail({
        to: email,
        subject: `Payment reminder — ${invoice.number} overdue`,
        tenantId: invoice.tenantId, emailType: 'reminder',
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
  <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${companyName.toUpperCase()}</span></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 12px;font-size:16px;color:#c00">Payment Reminder</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px">Hi ${tenant?.contactName ?? tenant?.businessName ?? ''},</p>
    <p style="color:#555;font-size:14px;margin:0 0 20px">Invoice <strong>${invoice.number}</strong> for <strong>$${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</strong> was due on <strong>${invoice.dueDate}</strong> and remains unpaid. Please arrange payment at your earliest convenience.</p>
    <p style="font-size:12px;color:#888;margin-top:24px">If you have already made payment, please disregard this message.</p>
  </div>
</div></body></html>`,
        settings,
      })
      alert('Reminder sent.')
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
    }
  }

  async function handleSendReceipt(payment) {
    const email = tenant?.email
    if (!email) { alert('No email address on file for this tenant.'); return }
    const companyName = settings?.company?.name ?? 'Hexa Space'
    const sub = (invoice.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
    const gst = invoice.vatEnabled !== false ? Math.round(sub * taxRate * 100) / 100 : 0
    const total = sub + gst
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const ml = 15, mr = W - 15
      doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
      doc.text('RECEIPT', ml, 24)
      doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text(companyName.toUpperCase(), mr, 18, { align: 'right' })
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      doc.text(tenant?.businessName ?? '', ml, 31)
      doc.setDrawColor(180); doc.setLineWidth(0.3)
      doc.line(ml, 36, mr, 36)
      let y = 44
      const info = (label, val) => {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
        doc.text(label, ml, y)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
        doc.text(String(val), ml + 40, y); y += 6
      }
      info('Invoice Number:', invoice.number)
      info('Payment Date:', payment?.date ?? format(new Date(), 'yyyy-MM-dd'))
      info('Payment Method:', payment?.method ?? invoice.paymentMethod ?? '—')
      info('Amount Paid:', `$${Number(payment?.amount ?? total).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
      info('Invoice Total:', `$${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`)
      y += 4
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 120, 0)
      doc.text('Payment received — thank you.', ml, y)
      const pdfBase64 = doc.output('datauristring').split(',')[1]
      const slug = (tenant?.businessName ?? 'receipt').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
      await sendEmail({
        to: email,
        subject: `Payment receipt — ${invoice.number}`,
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
  <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${companyName.toUpperCase()}</span></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 12px;font-size:16px">Payment Received ✓</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px">Hi ${tenant?.contactName ?? ''},</p>
    <p style="color:#555;font-size:14px;margin:0 0 8px">Thank you — your payment for <strong>${invoice.number}</strong> has been received.</p>
    <p style="color:#555;font-size:14px;margin:0 0 16px">Amount: <strong>$${Number(payment?.amount ?? total).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</strong></p>
    <p style="font-size:12px;color:#888">A receipt is attached for your records.</p>
  </div>
</div></body></html>`,
        settings,
        attachments: [{ filename: `Receipt_${invoice.number}_${slug}.pdf`, content: pdfBase64 }],
        tenantId: invoice.tenantId, emailType: 'receipt',
      })
      alert('Receipt sent.')
    } catch (err) {
      alert(`Failed to send receipt: ${err.message}`)
    }
  }

  function handleDetachConfirm() {
    if (!detachSelected.length) return
    const remaining = (invoice.lineItems ?? []).filter((l) => !detachSelected.includes(l.id))
    if (remaining.length === 0) {
      onVoid(invoice.id)
    } else {
      onUpdate(invoice.id, { lineItems: remaining })
    }
    setShowDetach(false)
    setDetachSelected([])
  }

  function handleVoid() {
    if (window.confirm(`Void invoice ${invoice.number}? This cannot be undone.`)) {
      onVoid(invoice.id)
    }
  }

  function handleCreditNote() {
    if (!window.confirm(`Create a credit note for ${invoice.number}?`)) return
    const creditLines = (invoice.lineItems ?? []).map((l) => ({
      ...l,
      id: `li${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      unitPrice: -Math.abs(l.unitPrice),
    }))
    onUpdate('__create_credit_note__', { originalInvoice: invoice, creditLines })
  }

  function submitPayment() {
    if (!payForm.amount) return
    onAddPayment(invoice.id, { ...payForm, amount: Number(payForm.amount) })
    setShowPaymentForm(false)
    setPayForm({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), method: 'Bank Transfer', note: '' })
  }

  function submitComment() {
    if (!commentText.trim()) return
    onAddComment(invoice.id, commentText.trim())
    setCommentText('')
  }

  return (
    <>
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
              <ArrowLeft size={15} /> Billing &amp; Products
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-800">{invoice.number}</span>
          </div>
          <div className="flex items-center gap-2">
            {invoice.status !== 'voided' && (invoice.lineItems ?? []).length > 0 && (
              <button
                onClick={() => { setDetachSelected([]); setShowDetach(true) }}
                className="flex items-center gap-1.5 text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600 font-medium"
              >
                Detach
              </button>
            )}
            <button
              onClick={() => onUpdate(invoice.id, { xeroSync: !invoice.xeroSync })}
              className="flex items-center gap-1.5 text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600"
            >
              {invoice.xeroSync ? <ToggleRight size={14} className="text-blue-600" /> : <ToggleLeft size={14} />}
              Sync
            </button>
            {invoice.status === 'overdue' && (
              <button onClick={handleSendReminder}
                className="flex items-center gap-1.5 text-xs border border-red-300 rounded px-3 py-1.5 hover:bg-red-50 text-red-700 font-medium">
                <Send size={13} /> Send Reminder
              </button>
            )}
            <button onClick={handleSend}
              className="flex items-center gap-1.5 text-xs border border-blue-300 rounded px-3 py-1.5 hover:bg-blue-50 text-blue-700 font-medium">
              <Send size={13} /> Send
            </button>
            {invoice.status !== 'voided' && (
              <button onClick={handleVoid}
                className="flex items-center gap-1.5 text-xs border border-orange-300 rounded px-3 py-1.5 hover:bg-orange-50 text-orange-700">
                <Ban size={13} /> Void
              </button>
            )}
            {isSuperAdmin && (
              <button
                onClick={() => {
                  if (window.confirm(`Permanently delete ${invoice.number}? This cannot be undone and will remove it from the system entirely.`)) {
                    onDelete?.(invoice.id)
                    onBack?.()
                  }
                }}
                className="flex items-center gap-1.5 text-xs border border-red-300 rounded px-3 py-1.5 hover:bg-red-50 text-red-600 font-medium"
              >
                <Trash2 size={13} /> Delete
              </button>
            )}
            <button onClick={handleCreditNote}
              className="flex items-center gap-1.5 text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 text-gray-600">
              <FileMinus size={13} /> Credit Note
            </button>
            <button onClick={generatePDF}
              className="flex items-center gap-1.5 text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 font-medium">
              <FileDown size={13} /> Generate PDF
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex gap-6">
          {/* Left: Invoice metadata */}
          <div className="w-72 shrink-0 space-y-4">
            <div className="bg-white border border-gray-200 rounded-md p-5">
              <div className="mb-4">
                <div className="text-xl font-bold text-gray-900">{invoice.number}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {invoice.issueDate ? format(parseISO(invoice.issueDate), 'dd MMM yyyy') : '—'}
                  {invoice.createdAt && ` · ${tenant?.contactName ?? ''}`}
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                {[
                  ['TO', tenant?.businessName ?? '—'],
                  ['LOCATION', locationLabel(space)],
                  ['STATUS', null],
                  ['SOURCE', invoice.source === 'bill-run' ? 'Bill Run' : 'Manual'],
                  ['ISSUE DATE', invoice.issueDate ? format(parseISO(invoice.issueDate), 'dd MMM yyyy') : '—'],
                  ['DUE DATE', invoice.dueDate ? `${format(parseISO(invoice.dueDate), 'dd MMM yyyy')}${daysLeft !== null ? ` (${daysLeft >= 0 ? `in ${daysLeft} days` : `${Math.abs(daysLeft)} days ago`})` : ''}` : '—'],
                  ['PERIOD', invoice.periodStart ? `${format(parseISO(invoice.periodStart), 'd MMM yyyy')} – ${format(parseISO(invoice.periodEnd), 'd MMM yyyy')}` : '—'],
                  ['GST', invoice.vatEnabled !== false ? `Included ${taxRatePct}%` : 'Excluded'],
                  ['PAYMENT METHOD', invoice.paymentMethod || '—'],
                  ['SENT', invoice.sentStatus === 'sent' ? 'Yes' : 'No'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
                    {label === 'STATUS' ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${STATUS_STYLE[invoice.status] ?? ''}`}>
                        {invoice.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-800 break-words">{value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Xero sync status */}
            <div className="bg-white border border-gray-200 rounded-md p-4 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Enable Sync</span>
                <button
                  onClick={() => onUpdate(invoice.id, { xeroSync: !invoice.xeroSync })}
                  className={`text-xs px-2 py-0.5 rounded ${invoice.xeroSync ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
                >
                  {invoice.xeroSync ? 'On' : 'Off'}
                </button>
              </div>
              <p className="text-xs text-gray-400">Xero integration coming soon.</p>
            </div>
          </div>

          {/* Right: Lines + Payments + Comments */}
          <div className="flex-1 space-y-4">
            {/* Lines */}
            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-800">Lines</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Description', 'Revenue Account', 'Quantity', 'Discount', 'Price'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(invoice.lineItems ?? []).map((line) => (
                    <tr key={line.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 text-gray-800 text-sm">
                        {lineDescription(line, space, invoice)}
                        {line.vatExempt && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">GST Exempt</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                          {line.revenueAccount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{line.qty}</td>
                      <td className="px-4 py-2.5 text-gray-600">{line.discountPct ?? 0}%</td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">
                        ${calcLineTotal(line).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
                <div className="w-56 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal:</span>
                    <span>${totals.subtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Discount:</span>
                      <span>-${totals.discountAmount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500">
                    <span>Total Tax ({taxRatePct}%):</span>
                    <span>${totals.gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                    <span>Total:</span>
                    <span>${totals.total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 text-base">
                    <span>Amount Due:</span>
                    <span>${totals.amountDue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments */}
            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-800">Payments</span>
                <button
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 font-medium"
                >
                  <Plus size={12} /> Add manual payment
                </button>
              </div>

              {showPaymentForm && (
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount (AUD)</label>
                      <input type="number" value={payForm.amount}
                        onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                        placeholder={totals.amountDue.toFixed(2)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date</label>
                      <input type="date" value={payForm.date}
                        onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Method</label>
                      <select value={payForm.method}
                        onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {['Bank Transfer', 'Credit Card', 'Cash', 'Other'].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <button onClick={submitPayment}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                      Record
                    </button>
                  </div>
                </div>
              )}

              {(invoice.payments ?? []).length === 0 && !showPaymentForm && (
                <div className="px-5 py-6 text-sm text-gray-400 text-center">No payments to show.</div>
              )}
              {(invoice.payments ?? []).map((pay) => (
                <div key={pay.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      ${Number(pay.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD
                    </div>
                    {pay.note && <div className="text-xs text-gray-500">{pay.note}</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-400 text-right">
                      <div>{format(parseISO(pay.date), 'dd/MM/yyyy')}</div>
                      <div>{pay.method}</div>
                    </div>
                    {tenant?.email && (
                      <button
                        onClick={() => handleSendReceipt(pay)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Receipt
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Comments */}
            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-800">Comments</span>
              </div>
              <div className="px-5 py-4">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Add a comment…"
                />
                <button onClick={submitComment}
                  disabled={!commentText.trim()}
                  className="mt-2 flex items-center gap-1.5 text-xs border border-gray-300 rounded px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <MessageSquare size={12} /> Comment
                </button>
              </div>
              {(invoice.comments ?? []).length === 0 && (
                <div className="px-5 pb-5 text-sm text-gray-400 text-center">No comments to show.</div>
              )}
              {(invoice.comments ?? []).map((c) => (
                <div key={c.id} className="px-5 py-3 border-t border-gray-100 text-sm">
                  <div className="text-gray-800">{c.text}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{c.createdAt}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Detach modal */}
    {showDetach && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-md w-full max-w-lg shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Detach Invoice Lines</h2>
            <button onClick={() => setShowDetach(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
          <div className="px-6 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left pb-2 w-6">
                    <input
                      type="checkbox"
                      checked={detachSelected.length === (invoice.lineItems ?? []).length && detachSelected.length > 0}
                      onChange={(e) => setDetachSelected(e.target.checked ? (invoice.lineItems ?? []).map((l) => l.id) : [])}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="text-left pb-2 text-gray-600 font-semibold">Description</th>
                  <th className="text-right pb-2 text-gray-600 font-semibold">Unit Price</th>
                  <th className="text-right pb-2 text-gray-600 font-semibold">Quantity</th>
                  <th className="text-right pb-2 text-gray-600 font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems ?? []).map((line) => {
                  const price = Math.round(line.unitPrice * line.qty * (1 - (line.discountPct ?? 0) / 100) * 100) / 100
                  return (
                    <tr key={line.id} className="border-b border-gray-100">
                      <td className="py-3">
                        <input
                          type="checkbox"
                          checked={detachSelected.includes(line.id)}
                          onChange={(e) => setDetachSelected((s) => e.target.checked ? [...s, line.id] : s.filter((id) => id !== line.id))}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="py-3 text-gray-700">{lineDescription(line, space, invoice)}</td>
                      <td className="py-3 text-right text-gray-700">${Number(line.unitPrice).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 text-right text-gray-700">{line.qty}</td>
                      <td className="py-3 text-right text-gray-700">${price.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {detachSelected.length === 0 && (
              <div className="mt-3 bg-orange-50 border border-orange-200 rounded px-4 py-2.5 text-sm text-orange-700 flex items-center gap-2">
                ⚠ No line items selected.
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
            <button onClick={() => setShowDetach(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
              Close
            </button>
            <button
              onClick={handleDetachConfirm}
              disabled={detachSelected.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40"
            >
              Detach
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
