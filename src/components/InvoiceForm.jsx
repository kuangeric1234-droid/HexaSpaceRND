import { useState, useEffect } from 'react'
import { format, addDays, parseISO, startOfMonth, endOfMonth, addMonths, getDaysInMonth } from 'date-fns'
import { X, Plus } from 'lucide-react'

const PAYMENT_METHODS = ['Bank Transfer', 'Credit Card', 'Direct Debit', 'Cash', 'Other']
const REVENUE_ACCOUNTS = ['Membership Fees', 'Security Deposit', 'Additional Services', 'Late Fee', 'Other']
const PAY_FOR_OPTIONS = [
  { label: '1 month',  months: 1 },
  { label: '2 months', months: 2 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '12 months', months: 12 },
]

function calcLineTotal(item) {
  return Math.round(item.unitPrice * item.qty * (1 - (item.discountPct ?? 0) / 100) * 100) / 100
}

function calcTotals(lineItems, discountPct, taxRate = 0.1) {
  const lineSubtotal = lineItems.reduce((s, l) => s + calcLineTotal(l), 0)
  const invoiceDiscount = Math.round(lineSubtotal * (discountPct / 100) * 100) / 100
  const taxableSubtotal = lineItems
    .filter((l) => !l.vatExempt)
    .reduce((s, l) => s + calcLineTotal(l), 0)
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - invoiceDiscount)
  const gst = Math.round(taxableAfterDiscount * taxRate * 100) / 100
  const total = Math.round((lineSubtotal - invoiceDiscount + gst) * 100) / 100
  return { lineSubtotal, invoiceDiscount, taxable: taxableAfterDiscount, gst, total }
}

function newLine() {
  return { id: `li${Date.now()}`, description: '', revenueAccount: 'Membership Fees', unitPrice: 0, qty: 1, discountPct: 0 }
}

function nextInvNumber(invoices, settings) {
  const template = settings?.invoicing?.numberTemplate ?? 'INV-{{number}}'
  const nums = invoices
    .map((i) => parseInt(i.number?.replace(/\D/g, '') || '0', 10))
    .filter((n) => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return template.replace('{{number}}', String(max + 1).padStart(4, '0'))
}

// Build month dropdown options: current month + 11 future months
function buildMonthOptions() {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = addMonths(startOfMonth(now), i)
    const start = startOfMonth(d)
    const end = endOfMonth(d)
    options.push({
      value: format(start, 'yyyy-MM-dd'),
      label: `${format(d, 'MMM yyyy')} (${format(start, 'MMM dd')} - ${format(end, 'MMM dd')})`,
      end: format(end, 'yyyy-MM-dd'),
    })
  }
  return options
}

const MONTH_OPTIONS = buildMonthOptions()

function FormRow({ label, required, error, children, half }) {
  return (
    <div className={`grid items-start gap-x-4 ${half ? 'grid-cols-[110px_1fr]' : 'grid-cols-[110px_1fr]'}`}>
      <label className="text-sm text-muted-foreground pt-2 text-right leading-tight">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div>
        {children}
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
    </div>
  )
}

export default function InvoiceForm({ invoices, tenants, leases, spaces, settings, taxRatePct = 10, defaultTenantId = '', defaultLineItems = null, defaultInvoiceType = null, onSave, onClose }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultPeriod = MONTH_OPTIONS[0]

  const [form, setForm] = useState({
    tenantId: defaultTenantId,
    issueDate: today,
    dueDate: '',
    reference: '',
    number: nextInvNumber(invoices, settings),
    paymentMethod: '',
    discountPct: 0,
    periodStart: defaultPeriod.value,
    periodEnd: defaultPeriod.end,
    payForMonths: 1,
    lineItems: defaultLineItems ?? [newLine()],
    invoiceType: defaultInvoiceType ?? null,
    vatEnabled: true,
  })
  const [errors, setErrors] = useState({})

  const fromName = settings?.billing?.businessName ?? settings?.company?.name ?? 'Hexa Space Pty Ltd'

  // When tenant changes, jump to the first uninvoiced month
  useEffect(() => {
    if (!form.tenantId || isDepositForm) return
    const takenMonths = new Set(
      invoices
        .filter((inv) => inv.tenantId === form.tenantId && inv.status !== 'voided' && inv.periodStart)
        .map((inv) => inv.periodStart.slice(0, 7))
    )
    const firstAvail = MONTH_OPTIONS.find((o) => !takenMonths.has(o.value.slice(0, 7)))
    if (firstAvail && firstAvail.value !== form.periodStart) {
      setForm((f) => ({ ...f, periodStart: firstAvail.value, periodEnd: firstAvail.end }))
    }
  }, [form.tenantId]) // eslint-disable-line

  // Auto-fill line items when tenant/period changes (skip if deposit lines were pre-filled)
  useEffect(() => {
    if (!form.tenantId) return
    if (defaultLineItems) return  // don't overwrite pre-filled deposit lines
    const activeLease = leases.find((l) => l.tenantId === form.tenantId && l.status === 'active')
    if (!activeLease) return
    const space = spaces.find((s) => s.id === activeLease.spaceId)
    const periodStart = parseISO(form.periodStart)
    const leaseStart = parseISO(activeLease.startDate)
    const daysInMonth = getDaysInMonth(periodStart)
    const isFirstMonth =
      format(leaseStart, 'yyyy-MM') === format(periodStart, 'yyyy-MM') && leaseStart.getDate() > 1
    let amount = activeLease.monthlyRent * form.payForMonths
    let isProrated = false
    if (isFirstMonth && form.payForMonths === 1) {
      const daysOccupied = daysInMonth - leaseStart.getDate() + 1
      amount = Math.round((activeLease.monthlyRent * daysOccupied / daysInMonth) * 100) / 100
      isProrated = true
    }
    const periodLabel = `${format(periodStart, 'd MMM')} – ${format(parseISO(form.periodEnd), 'd MMM yyyy')}`
    const desc = `${space?.unitNumber ?? ''}${space?.address ? ` – ${space.address}` : ''} · ${periodLabel}${isProrated ? ' (prorated)' : ''}${form.payForMonths > 1 ? ` (${form.payForMonths} months)` : ''}`

    // Also add deposit lines for any signed leases with uninvoiced deposits
    const depositLines = leases
      .filter((l) => l.tenantId === form.tenantId && ['manually_signed', 'e_signed'].includes(l.signatureStatus))
      .filter((l) => {
        const bond = l.items?.[0]?.deposit ?? l.bondAmount ?? 0
        if (!bond) return false
        return !invoices.some((inv) => inv.leaseId === l.id && inv.invoiceType === 'deposit' && inv.status !== 'voided')
      })
      .map((l) => {
        const bond = l.items?.[0]?.deposit ?? l.bondAmount ?? 0
        const sp = spaces.find((s) => s.id === l.spaceId)
        return {
          id: `li${Date.now()}_dep_${l.id}`,
          description: `Security Deposit — ${sp?.unitNumber ?? l.spaceId} (${l.contractNumber ?? `CON-${l.id.slice(-3).toUpperCase()}`})`,
          revenueAccount: 'Security Deposit',
          unitPrice: bond,
          qty: 1,
          discountPct: 0,
          vatExempt: true,
        }
      })

    setForm((f) => ({
      ...f,
      lineItems: [
        { id: `li${Date.now()}`, description: desc, revenueAccount: 'Membership Fees', unitPrice: amount, qty: 1, discountPct: 0 },
        ...depositLines,
      ],
    }))
  }, [form.tenantId, form.periodStart, form.payForMonths]) // eslint-disable-line

  function setPeriod(value) {
    const opt = MONTH_OPTIONS.find((o) => o.value === value)
    if (!opt) return
    // For multi-month, extend end date
    const endDate = form.payForMonths > 1
      ? format(endOfMonth(addMonths(parseISO(opt.value), form.payForMonths - 1)), 'yyyy-MM-dd')
      : opt.end
    setForm((f) => ({ ...f, periodStart: opt.value, periodEnd: endDate }))
  }

  function setPayFor(months) {
    const start = parseISO(form.periodStart)
    const endDate = format(endOfMonth(addMonths(start, months - 1)), 'yyyy-MM-dd')
    setForm((f) => ({ ...f, payForMonths: months, periodEnd: endDate }))
  }

  function addLine() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, newLine()] }))
  }

  function removeLine(id) {
    setForm((f) => ({ ...f, lineItems: f.lineItems.filter((l) => l.id !== id) }))
  }

  function updateLine(id, field, value) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((l) =>
        l.id === id ? { ...l, [field]: ['description', 'revenueAccount'].includes(field) ? value : Number(value) } : l
      ),
    }))
  }

  const isDepositForm = defaultInvoiceType === 'deposit'

  // Months already invoiced for this tenant (exclude from dropdown)
  const invoicedMonths = new Set(
    !isDepositForm && form.tenantId
      ? invoices
          .filter((inv) => inv.tenantId === form.tenantId && inv.status !== 'voided' && inv.periodStart)
          .map((inv) => inv.periodStart.slice(0, 7))
      : []
  )
  const availableMonths = MONTH_OPTIONS.filter((o) => !invoicedMonths.has(o.value.slice(0, 7)))

  function validate() {
    const e = {}
    if (!form.tenantId) e.tenantId = 'Company is required.'
    if (!form.dueDate) e.dueDate = 'The Due Date field is required.'
    return e
  }

  function handleSave(sendNow) {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      ...form,
      status: 'pending',
      sentStatus: sendNow ? 'sent' : 'not_sent',
      source: 'manual',
      xeroSync: false,
      isProrated: false,
    })
  }

  const { lineSubtotal, invoiceDiscount, taxable, gst, total } = calcTotals(form.lineItems, form.discountPct, taxRatePct / 100)

  const inputCls = 'w-full border border-input rounded px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-blue-500'
  const errorInputCls = 'w-full border border-red-400 rounded px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-red-400'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-foreground">Add Invoice</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-8 py-5 space-y-3.5">

          {/* To */}
          <FormRow label="To" required error={errors.tenantId}>
            {defaultTenantId ? (
              <input
                value={tenants.find((t) => t.id === defaultTenantId)?.businessName ?? defaultTenantId}
                readOnly
                className="w-full border border-border rounded px-3 py-2 text-sm bg-muted/50 text-foreground cursor-default"
              />
            ) : (
              <select
                value={form.tenantId}
                onChange={(e) => { setForm({ ...form, tenantId: e.target.value }); setErrors((er) => ({ ...er, tenantId: '' })) }}
                className={errors.tenantId ? errorInputCls : inputCls}
              >
                <option value="">Select company</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.businessName}</option>)}
              </select>
            )}
          </FormRow>

          {/* From */}
          <FormRow label="From">
            <input value={fromName} readOnly className="w-full border border-border rounded px-3 py-2 text-sm bg-muted/50 text-muted-foreground cursor-default" />
          </FormRow>

          {/* Issue + Due */}
          <div className="grid grid-cols-2 gap-6">
            <FormRow label="Issue Date" required>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className={inputCls}
              />
            </FormRow>
            <FormRow label="Due Date" required error={errors.dueDate}>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => { setForm({ ...form, dueDate: e.target.value }); setErrors((er) => ({ ...er, dueDate: '' })) }}
                className={errors.dueDate ? errorInputCls : inputCls}
              />
            </FormRow>
          </div>

          {/* Reference + Number */}
          <div className="grid grid-cols-2 gap-6">
            <FormRow label="Reference">
              <input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className={inputCls}
              />
            </FormRow>
            <FormRow label="Number">
              <input
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className={inputCls}
              />
            </FormRow>
          </div>

          {/* Payment Method */}
          <FormRow label="Payment Method">
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              className={inputCls}
            >
              <option value=""></option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">The preferred payment method will be used to define whether to automatically charge the member's invoices or not.</p>
          </FormRow>

          {/* Discount */}
          <FormRow label="Discount">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={form.discountPct}
                onChange={(e) => setForm({ ...form, discountPct: Number(e.target.value) })}
                className="w-24 border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </FormRow>

          {/* Period Start + Pay For */}
          {!isDepositForm && availableMonths.length === 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded px-4 py-2.5 text-sm text-orange-700">
              ⚠ All available months have been invoiced for this company. Detach an invoice's line items to re-invoice a period.
            </div>
          )}
          <div className="grid grid-cols-2 gap-6">
            <FormRow label="Period Start">
              <select
                value={form.periodStart}
                onChange={(e) => setPeriod(e.target.value)}
                className={inputCls}
              >
                {availableMonths.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="Pay For">
              <select
                value={form.payForMonths}
                onChange={(e) => setPayFor(Number(e.target.value))}
                className={inputCls}
              >
                {PAY_FOR_OPTIONS.map((o) => <option key={o.months} value={o.months}>{o.label}</option>)}
              </select>
            </FormRow>
          </div>

          {/* Line items */}
          <div className="border-t border-border pt-4 mt-2">
            <div
              className="grid gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 border-b border-border pb-1.5"
              style={{ gridTemplateColumns: '2.5fr 1.2fr 70px 50px 60px 65px 20px' }}
            >
              <span>Description</span>
              <span>Revenue Account</span>
              <span>Unit Price</span>
              <span>Qty</span>
              <span>Disc %</span>
              <span className="text-right">Price</span>
              <span />
            </div>

            {form.lineItems.map((line) => (
              <div key={line.id} className="grid gap-2 items-center mb-2"
                style={{ gridTemplateColumns: '2.5fr 1.2fr 70px 50px 60px 65px 20px' }}>
                <input
                  value={line.description}
                  onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                  placeholder="Description"
                  className="border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <select
                  value={line.revenueAccount}
                  onChange={(e) => updateLine(line.id, 'revenueAccount', e.target.value)}
                  className="border border-input rounded px-2 py-1.5 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {REVENUE_ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  type="number"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.id, 'unitPrice', e.target.value)}
                  className="border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="1"
                  value={line.qty}
                  onChange={(e) => updateLine(line.id, 'qty', e.target.value)}
                  className="border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={line.discountPct}
                  onChange={(e) => updateLine(line.id, 'discountPct', e.target.value)}
                  className="border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-right text-foreground font-medium pr-1">
                  ${calcLineTotal(line).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                </span>
                <button type="button" onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-red-400">
                  <X size={13} />
                </button>
              </div>
            ))}

            <button type="button" onClick={addLine}
              className="mt-2 text-xs border border-input rounded px-3 py-1.5 text-foreground hover:bg-muted/50 flex items-center gap-1">
              <Plus size={12} /> Add new line item
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end pt-2 border-t border-border">
            <div className="w-56 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal:</span>
                <span>${lineSubtotal.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </div>
              {form.discountPct > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount ({form.discountPct}%):</span>
                  <span>-${invoiceDiscount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {form.vatEnabled && (
                <div className="flex justify-between text-muted-foreground">
                  <span>GST ({taxRatePct}%):</span>
                  <span>${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground border-t border-border pt-1.5 text-base">
                <span>Total:</span>
                <span>${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-foreground border border-input rounded hover:bg-muted/50">
            Close
          </button>
          <button
            onClick={() => handleSave(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            Add
          </button>
          <button
            onClick={() => handleSave(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded hover:bg-blue-800"
          >
            Add &amp; Send
          </button>
        </div>
      </div>
    </div>
  )
}
