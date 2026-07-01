import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO, startOfMonth, endOfMonth, getDaysInMonth, isAfter, isBefore, addMonths, differenceInDays } from 'date-fns'
import { Plus, Search, X, Check, Download, Send, Ban } from 'lucide-react'
import InvoiceDetail from './InvoiceDetail.jsx'
import InvoiceForm from './InvoiceForm.jsx'
import { sendEmail, invoiceEmailHtml } from '../lib/sendEmail.js'
import { invoiceLease, invoiceSpace, locationLabel } from '../lib/billing.js'
import { jsPDF } from 'jspdf'

const STATUS_STYLE = {
  pending: 'bg-orange-100 text-orange-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  voided: 'bg-gray-100 text-gray-500',
}

function calcInvoiceTotal(invoice, taxRate = 0.1) {
  const sub = (invoice.lineItems ?? []).reduce((s, l) => {
    return s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100
  }, 0)
  const disc = Math.round(sub * ((invoice.discountPct ?? 0) / 100) * 100) / 100
  const taxable = sub - disc
  const gst = invoice.vatEnabled !== false ? Math.round(taxable * taxRate * 100) / 100 : 0
  return taxable + gst
}

function calcAmountDue(invoice, taxRate = 0.1) {
  const total = calcInvoiceTotal(invoice, taxRate)
  const paid = (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  return Math.max(0, total - paid)
}

export default function Billing() {
  const {
    invoices, addInvoice, updateInvoice, voidInvoice, deleteInvoice, addPaymentToInvoice, addCommentToInvoice, approveBondRefund,
    discounts, addDiscount, updateDiscount, deleteDiscount,
    tenants, leases, spaces, settings, currentUserRole,
  } = useOutletContext()

  // Bond-refund credit notes awaiting an admin's approval before the tenant is notified.
  const pendingBondRefunds = invoices.filter((i) => i.invoiceType === 'bond_refund' && i.approvalStatus === 'pending')

  const [subTab, setSubTab] = useState('invoices')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState(new Set()) // bulk selection
  const [bulkWorking, setBulkWorking] = useState(false)

  // Discount form state
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [editDiscountId, setEditDiscountId] = useState(null)
  const [discountForm, setDiscountForm] = useState({ name: '', type: 'pct', value: '', description: '' })

  const today = new Date()
  const taxRate = (settings?.billingRules?.taxRate ?? 10) / 100

  // ── Computed overdue status ─────────────────────────────────────────────
  function effectiveStatus(inv) {
    if (inv.status === 'paid' || inv.status === 'voided') return inv.status
    if (inv.dueDate && isBefore(parseISO(inv.dueDate), today) && inv.status !== 'paid') return 'overdue'
    return inv.status
  }

  // ── Bill Run ────────────────────────────────────────────────────────────
  function handleBillRun() {
    const currentMonthStart = startOfMonth(today)
    const currentMonthEnd = endOfMonth(today)

    const activeLeases = leases.filter((l) => {
      if (l.status !== 'active') return false
      const start = parseISO(l.startDate)
      const end = parseISO(l.endDate)
      return !isAfter(start, currentMonthEnd) && !isBefore(end, currentMonthStart)
    })

    let generated = 0
    const newInvoices = []

    for (const lease of activeLeases) {
      // Already billed this month?
      const alreadyBilled = invoices.some(
        (inv) =>
          inv.leaseId === lease.id &&
          inv.status !== 'voided' &&
          inv.periodStart &&
          format(parseISO(inv.periodStart), 'yyyy-MM') === format(currentMonthStart, 'yyyy-MM')
      )
      if (alreadyBilled) continue

      const leaseStart = parseISO(lease.startDate)
      const leaseEnd = parseISO(lease.endDate)
      const space = spaces.find((s) => s.id === lease.spaceId)
      const tenant = tenants.find((t) => t.id === lease.tenantId)

      // Proration: first month
      const daysInMonth = getDaysInMonth(currentMonthStart)
      const periodStart = isAfter(leaseStart, currentMonthStart) ? leaseStart : currentMonthStart
      const periodEnd = isBefore(leaseEnd, currentMonthEnd) ? leaseEnd : currentMonthEnd
      const daysOccupied = differenceInDays(periodEnd, periodStart) + 1
      const isProrated = daysOccupied < daysInMonth
      const amount = isProrated
        ? Math.round((lease.monthlyRent * daysOccupied / daysInMonth) * 100) / 100
        : lease.monthlyRent

      const periodLabel = `${format(periodStart, 'd MMM')} – ${format(periodEnd, 'd MMM yyyy')}${isProrated ? ' (prorated)' : ''}`
      const desc = `${space?.unitNumber ?? ''}${space?.address ? ` – ${space.address}` : ''} · ${periodLabel}`

      newInvoices.push({
        tenantId: lease.tenantId,
        leaseId: lease.id,
        status: 'pending',
        sentStatus: 'not_sent',
        source: 'bill-run',
        issueDate: format(currentMonthStart, 'yyyy-MM-dd'),
        dueDate: format(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth(), 14), 'yyyy-MM-dd'),
        periodStart: format(periodStart, 'yyyy-MM-dd'),
        periodEnd: format(periodEnd, 'yyyy-MM-dd'),
        reference: '',
        paymentMethod: '',
        discountPct: 0,
        vatEnabled: true,
        xeroSync: false,
        isProrated,
        lineItems: [{
          id: `li${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          description: desc,
          revenueAccount: 'Membership Fees',
          unitPrice: amount,
          qty: 1,
          discountPct: 0,
        }],
        payments: [],
        comments: [],
        creditNoteForId: null,
      })
      generated++
    }

    if (generated === 0) {
      alert('All active leases are already billed for this month.')
      return
    }

    if (window.confirm(`Bill Run: generate ${generated} invoice${generated !== 1 ? 's' : ''} for ${format(currentMonthStart, 'MMMM yyyy')}?`)) {
      newInvoices.forEach((inv) => addInvoice(inv))
      alert(`${generated} invoice${generated !== 1 ? 's' : ''} generated.`)
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [['Number', 'Tenant', 'Status', 'Sent', 'Issue Date', 'Due Date', 'Period', 'Subtotal', 'GST', 'Total', 'Paid', 'Amount Due']]
    for (const inv of filtered) {
      const tenant = tenants.find((t) => t.id === inv.tenantId)
      const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
      const gst = inv.vatEnabled !== false ? Math.round(sub * taxRate * 100) / 100 : 0
      const total = sub + gst
      const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      rows.push([
        inv.number ?? '', tenant?.businessName ?? '', inv.status ?? '', inv.sentStatus ?? '',
        inv.issueDate ?? '', inv.dueDate ?? '',
        inv.periodStart ? `${inv.periodStart} to ${inv.periodEnd}` : (inv.invoiceType === 'deposit' ? 'Deposit' : ''),
        sub.toFixed(2), gst.toFixed(2), total.toFixed(2), paid.toFixed(2), Math.max(0, total - paid).toFixed(2),
      ])
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `invoices_${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() {
    setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)))
  }
  async function bulkVoid() {
    if (!window.confirm(`Void ${selected.size} invoice(s)?`)) return
    selected.forEach((id) => voidInvoice(id))
    setSelected(new Set())
  }
  async function bulkMarkPaid() {
    if (!window.confirm(`Mark ${selected.size} invoice(s) as paid?`)) return
    const today = format(new Date(), 'yyyy-MM-dd')
    selected.forEach((id) => {
      const inv = invoices.find((i) => i.id === id)
      if (!inv || inv.status === 'voided') return
      const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
      const gst = inv.vatEnabled !== false ? Math.round(sub * taxRate * 100) / 100 : 0
      const total = sub + gst
      const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.max(0, total - paid)
      if (remaining > 0) {
        addPaymentToInvoice(id, { amount: remaining, date: today, method: 'Bank Transfer', note: 'Bulk mark paid' })
      }
      updateInvoice(id, { status: 'paid' })
    })
    setSelected(new Set())
  }
  async function bulkSend() {
    setBulkWorking(true)
    let sent = 0
    for (const id of selected) {
      const inv = invoices.find((i) => i.id === id)
      if (!inv) continue
      const tenant = tenants.find((t) => t.id === inv.tenantId)
      if (!tenant?.email) continue
      try {
        await sendEmail({
          to: tenant.email,
          subject: `Invoice ${inv.number} from ${settings?.company?.name ?? 'Hexa Space'}`,
          html: invoiceEmailHtml({ invoice: inv, tenant, settings }),
          settings,
          tenantId: inv.tenantId, emailType: 'invoice',
        })
        updateInvoice(id, { sentStatus: 'sent' })
        sent++
      } catch { /* silently skip failed sends */ }
    }
    setBulkWorking(false)
    setSelected(new Set())
    alert(`Sent ${sent} of ${selected.size} invoice(s).`)
  }

  // ── Invoice update handler (handles credit note creation) ───────────────
  function handleInvoiceUpdate(id, updates) {
    if (id === '__create_credit_note__') {
      const orig = updates.originalInvoice
      addInvoice({
        tenantId: orig.tenantId,
        leaseId: orig.leaseId,
        status: 'pending',
        sentStatus: 'not_sent',
        source: 'manual',
        issueDate: format(today, 'yyyy-MM-dd'),
        dueDate: format(today, 'yyyy-MM-dd'),
        periodStart: orig.periodStart,
        periodEnd: orig.periodEnd,
        reference: `Credit note for ${orig.number}`,
        paymentMethod: orig.paymentMethod,
        discountPct: orig.discountPct ?? 0,
        vatEnabled: orig.vatEnabled !== false,
        xeroSync: false,
        isProrated: false,
        lineItems: updates.creditLines,
        payments: [],
        comments: [],
        creditNoteForId: orig.id,
      })
      setSelectedInvoice(null)
      return
    }
    updateInvoice(id, updates)
    // Refresh selectedInvoice so detail panel reflects changes
    setSelectedInvoice((prev) => prev ? { ...prev, ...updates } : prev)
  }

  // ── Filtering ─────────────────────────────────────────────────────────
  const filtered = invoices
    .map((inv) => ({ ...inv, _status: effectiveStatus(inv) }))
    .filter((inv) => {
      if (filterStatus !== 'all' && inv._status !== filterStatus) return false
      if (search) {
        const tenant = tenants.find((t) => t.id === inv.tenantId)
        const q = search.toLowerCase()
        return (
          inv.number?.toLowerCase().includes(q) ||
          tenant?.businessName?.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''))

  // Counts for filter badges
  const counts = {
    all: invoices.length,
    paid: invoices.filter((i) => effectiveStatus(i) === 'paid').length,
    overdue: invoices.filter((i) => effectiveStatus(i) === 'overdue').length,
    voided: invoices.filter((i) => effectiveStatus(i) === 'voided').length,
  }

  // ── If invoice detail is open ──────────────────────────────────────────
  if (selectedInvoice) {
    const inv = invoices.find((i) => i.id === selectedInvoice.id) ?? selectedInvoice
    const tenant = tenants.find((t) => t.id === inv.tenantId)
    const lease = invoiceLease(inv, leases)
    const space = invoiceSpace(inv, leases, spaces)
    return (
      <InvoiceDetail
        invoice={inv}
        tenant={tenant}
        lease={lease}
        space={space}
        settings={settings}
        onBack={() => setSelectedInvoice(null)}
        onUpdate={handleInvoiceUpdate}
        onVoid={voidInvoice}
        onDelete={deleteInvoice}
        isSuperAdmin={currentUserRole === 'super_admin'}
        onAddPayment={addPaymentToInvoice}
        onAddComment={addCommentToInvoice}
      />
    )
  }

  // ── Discount form helpers ──────────────────────────────────────────────
  function openNewDiscount() {
    setEditDiscountId(null)
    setDiscountForm({ name: '', type: 'pct', value: '', description: '' })
    setShowDiscountForm(true)
  }
  function openEditDiscount(d) {
    setEditDiscountId(d.id)
    setDiscountForm({ name: d.name, type: d.type, value: d.value, description: d.description ?? '' })
    setShowDiscountForm(true)
  }
  function saveDiscount() {
    const data = { ...discountForm, value: Number(discountForm.value) }
    if (editDiscountId) updateDiscount(editDiscountId, data)
    else addDiscount(data)
    setShowDiscountForm(false)
  }

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {[
          { id: 'invoices', label: 'Invoices' },
          { id: 'discounts', label: 'Discounts' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Invoices ── */}
      {subTab === 'invoices' && (
        <>
          {/* Bond refunds pending approval */}
          {pendingBondRefunds.length > 0 && (
            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-md p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">
                Bond refunds pending approval ({pendingBondRefunds.length})
              </h3>
              <div className="space-y-2">
                {pendingBondRefunds.map((inv) => {
                  const tenant = tenants.find((t) => t.id === inv.tenantId)
                  const amount = Math.abs((inv.lineItems ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0))
                  return (
                    <div key={inv.id} className="flex items-center justify-between bg-white border border-amber-200 rounded px-3 py-2">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{inv.number}</span> · {tenant?.businessName ?? '—'} ·{' '}
                        <span className="font-semibold">${amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</span>
                        <span className="text-gray-400"> · {inv.reference}</span>
                      </div>
                      <button
                        onClick={() => approveBondRefund(inv.id)}
                        className="flex items-center gap-1.5 text-xs bg-black text-white rounded px-3 py-1.5 font-medium hover:bg-gray-800"
                      >
                        <Check size={13} /> Approve &amp; notify
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Filter tabs + actions */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'paid', label: 'Paid' },
                { key: 'overdue', label: 'Overdue' },
                { key: 'voided', label: 'Voided' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    filterStatus === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                  <span className={`ml-1.5 text-xs ${filterStatus === key ? 'text-gray-500' : 'text-gray-400'}`}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search invoices…"
                  className="pl-8 pr-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
                />
              </div>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-600 hover:bg-gray-50 font-medium">
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={handleBillRun}
                className="flex items-center gap-1.5 text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-600 hover:bg-gray-50 font-medium"
              >
                Bill Run
              </button>
              <AutoBillRunButton />
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 font-medium"
              >
                <Plus size={14} /> Add Invoice
              </button>
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-md px-4 py-2.5">
              <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
              <button onClick={bulkSend} disabled={bulkWorking}
                className="flex items-center gap-1.5 text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50">
                <Send size={12} /> {bulkWorking ? 'Sending…' : 'Send All'}
              </button>
              <button onClick={bulkMarkPaid}
                className="flex items-center gap-1.5 text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700">
                <Check size={12} /> Mark Paid
              </button>
              <button onClick={bulkVoid}
                className="flex items-center gap-1.5 text-xs border border-red-300 text-red-600 rounded px-3 py-1.5 hover:bg-red-50">
                <Ban size={12} /> Void
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-blue-500 hover:text-blue-800">
                Clear
              </button>
            </div>
          )}

          {/* Invoice table */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="pl-4 py-3 w-8">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={selectAll} />
                  </th>
                  {['Number', 'To', 'Status', 'Issue Date', 'Due Date', 'Amount Due', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No invoices found.{' '}
                      <button onClick={() => setShowForm(true)} className="text-blue-600 hover:underline">
                        Add the first invoice
                      </button>
                    </td>
                  </tr>
                )}
                {filtered.map((inv) => {
                  const tenant = tenants.find((t) => t.id === inv.tenantId)
                  const amountDue = calcAmountDue(inv, taxRate)
                  const total = calcInvoiceTotal(inv, taxRate)
                  const dueDate = inv.dueDate ? parseISO(inv.dueDate) : null
                  const daysLeft = dueDate ? differenceInDays(dueDate, today) : null

                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="pl-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)} />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                        <div className="font-mono text-xs font-semibold text-blue-700">{inv.number}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {inv.isProrated ? 'Prorated · ' : ''}{inv.source === 'bill-run' ? 'Bill Run' : 'Manual'}
                        </div>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                        <div className="font-medium text-gray-900">{tenant?.businessName ?? '—'}</div>
                        <div className="text-xs text-gray-400">{locationLabel(invoiceLease(inv, leases), invoiceSpace(inv, leases, spaces))}</div>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize w-fit ${STATUS_STYLE[inv._status]}`}>
                            {inv._status}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded w-fit ${inv.sentStatus === 'sent' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-50 text-yellow-700'}`}>
                            {inv.sentStatus === 'sent' ? 'Sent' : 'Not Sent'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {inv.issueDate ? format(parseISO(inv.issueDate), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-600 text-sm">
                          {inv.dueDate ? format(parseISO(inv.dueDate), 'dd/MM/yyyy') : '—'}
                        </div>
                        {daysLeft !== null && inv._status !== 'paid' && (
                          <div className={`text-xs mt-0.5 ${daysLeft < 0 ? 'text-red-600 font-medium' : daysLeft <= 7 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {daysLeft >= 0 ? `in ${daysLeft} days` : `${Math.abs(daysLeft)} days ago`}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`font-semibold text-sm ${amountDue > 0 && inv._status !== 'paid' ? 'text-red-600' : 'text-gray-900'}`}>
                          ${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                        </div>
                        {amountDue > 0 && inv._status !== 'paid' && (
                          <div className="text-xs text-red-500">
                            ${amountDue.toLocaleString('en-AU', { minimumFractionDigits: 2 })} due
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {inv._status === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); addPaymentToInvoice(inv.id, { amount: calcAmountDue(inv, taxRate), date: format(today, 'yyyy-MM-dd'), method: 'Bank Transfer', note: 'Marked paid' }) }}
                            className="text-xs border border-green-300 text-green-700 rounded px-2 py-1 hover:bg-green-50 whitespace-nowrap"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div className="mt-3 text-xs text-gray-400">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} shown
          </div>
        </>
      )}

      {/* ── Discounts ── */}
      {subTab === 'discounts' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{discounts.length} discount{discounts.length !== 1 ? 's' : ''}</p>
            <button
              onClick={openNewDiscount}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 font-medium"
            >
              <Plus size={14} /> Add Discount
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Type', 'Value', 'Description', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {discounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No discounts. <button onClick={openNewDiscount} className="text-blue-600 hover:underline">Add one</button>
                    </td>
                  </tr>
                )}
                {discounts.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{d.type === 'pct' ? 'Percentage' : 'Fixed'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {d.type === 'pct' ? `${d.value}%` : `$${d.value}`}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.description || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => openEditDiscount(d)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteDiscount(d.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Discount form modal */}
          {showDiscountForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-md w-full max-w-sm shadow-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{editDiscountId ? 'Edit Discount' : 'Add Discount'}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input value={discountForm.name} onChange={(e) => setDiscountForm({ ...discountForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                      <select value={discountForm.type} onChange={(e) => setDiscountForm({ ...discountForm, type: e.target.value })}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="pct">Percentage (%)</option>
                        <option value="fixed">Fixed ($)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                      <input type="number" value={discountForm.value} onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setShowDiscountForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={saveDiscount} disabled={!discountForm.name}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40">
                    {editDiscountId ? 'Save' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Invoice modal */}
      {showForm && (
        <InvoiceForm
          invoices={invoices}
          tenants={tenants}
          leases={leases}
          spaces={spaces}
          settings={settings}
          taxRatePct={settings?.billingRules?.taxRate ?? 10}
          onSave={(data) => { addInvoice(data); setShowForm(false) }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function AutoBillRunButton() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  async function run() {
    if (!window.confirm(
      'Run auto-billing for this month?\n\nThis will create invoices for all active leases that don\'t already have one for the current month, and email each tenant.'
    )) return

    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/auto-billing', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: err.message })
    }
    setRunning(false)
  }

  return (
    <>
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-1.5 text-sm border border-blue-300 bg-blue-50 text-blue-700 rounded px-3 py-1.5 hover:bg-blue-100 font-medium disabled:opacity-50"
      >
        {running ? 'Running…' : '⚡ Auto Bill Run'}
      </button>

      {result && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 mb-1">Auto Bill Run Complete</h3>
            <p className="text-xs text-gray-400 mb-4">{result.period}</p>

            {result.error ? (
              <p className="text-sm text-red-600">{result.error}</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium text-green-700 mb-1">
                    ✓ {result.created?.length ?? 0} invoice{result.created?.length !== 1 ? 's' : ''} created &amp; emailed
                  </div>
                  {result.created?.map(c => (
                    <div key={c.number} className="text-gray-600 pl-3">{c.number} — {c.tenant}</div>
                  ))}
                </div>
                {result.skipped?.length > 0 && (
                  <div>
                    <div className="font-medium text-gray-500 mb-1">
                      — {result.skipped.length} skipped (already invoiced)
                    </div>
                    {result.skipped.map((s, i) => (
                      <div key={i} className="text-gray-400 pl-3">{s}</div>
                    ))}
                  </div>
                )}
                {result.errors?.length > 0 && (
                  <div>
                    <div className="font-medium text-red-600 mb-1">✗ {result.errors.length} errors</div>
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-red-500 pl-3">{e.tenant ?? e.leaseId}: {e.reason}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => { setResult(null); window.location.reload() }}
              className="mt-5 w-full bg-black text-white text-sm font-semibold py-2 rounded hover:bg-gray-800"
            >
              Close &amp; Refresh
            </button>
          </div>
        </div>
      )}
    </>
  )
}
