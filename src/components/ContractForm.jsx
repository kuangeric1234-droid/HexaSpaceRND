import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Minus, ChevronDown, X, AlertCircle } from 'lucide-react'
import { discountedPrice, discountPct } from '../lib/leasePricing.js'

const FORM_SECTIONS = [
  { id: 'company', label: 'Company Information' },
  { id: 'duration', label: 'Duration' },
  { id: 'items', label: 'Items' },
  { id: 'terms', label: 'Terms & Conditions' },
  { id: 'messages', label: 'System Messages (0)' },
]

const CONTRACT_TYPES = ['New', 'Renewal', 'Transfer', 'Amendment', 'Month-to-month']
const DOCUMENT_TYPES = [
  'License Agreement',
  'Virtual Office Membership Agreement',
  'Membership Agreement Month-to-month',
  'Service Agreement',
]
// Which space types each document type may book. Anything not listed (e.g.
// Service Agreement) is unrestricted.
const DOC_TYPE_SPACES = {
  'License Agreement': ['office'], // private offices
  'Virtual Office Membership Agreement': ['virtual'],
  'Membership Agreement Month-to-month': ['desk'], // flexible or dedicated desk
}
const SIGNATURE_STATUSES = [
  { value: 'not_signed',        label: 'Not Signed' },
  { value: 'out_for_signature', label: 'Out For Signature' },
  { value: 'manually_signed',   label: 'Manually Signed' },
  { value: 'e_signed',          label: 'E Signed' },
]
const DISCOUNT_OPTIONS = ['5%', '10%', '15%', '20%', '25%', '30%', '50%', '75%', '100%']

const fmtDate = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
// 1-year term ending the day before the anniversary (e.g. 1 Jul 2026 → 30 Jun 2027)
function oneYearTerm(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  dt.setFullYear(dt.getFullYear() + 1)
  dt.setDate(dt.getDate() - 1)
  return fmtDate(dt)
}
function dayAfter(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + 1)
  return fmtDate(dt)
}
// AVAILABLE_TERMS is now driven by the templates store — see Terms tab render

function generateContractNumber(leases) {
  let template = 'CON-{{number}}'
  try {
    const s = JSON.parse(localStorage.getItem('hexaspace_settings') || '{}')
    template = s.contracts?.numberTemplate ?? template
  } catch { /* use default */ }
  const nums = leases
    .map((l) => l.contractNumber)
    .filter(Boolean)
    // Only clean sequential numbers count (CON-262). Concatenating ALL digits
    // (the old approach) read compound imports like CON-140-OFFICE11 as 14011
    // and blew the sequence out; letter/compound numbers don't advance it.
    .map((n) => parseInt(String(n).match(/^[A-Za-z]*-?(\d+)$/)?.[1], 10))
    // ignore blanks and any implausibly large value (e.g. a stray timestamp)
    .filter((n) => !isNaN(n) && n > 0 && n < 100000)
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return template.replace('{{number}}', String(max + 1).padStart(3, '0'))
}

function initForm(editLease, leases) {
  if (editLease) {
    return {
      tenantId: editLease.tenantId ?? '',
      memberName: editLease.memberName ?? '',
      contractType: editLease.contractType ?? 'New',
      documentType: editLease.documentType ?? 'License Agreement',
      requireCardOnFile: editLease.requireCardOnFile, // undefined = follow document type

      signatureStatus: editLease.signatureStatus ?? 'not_signed',
      contractNumber: editLease.contractNumber ?? generateContractNumber(leases),
      startDate: editLease.startDate ?? '',
      endDate: editLease.endDate ?? '',
      noticePeriodMonths: editLease.noticePeriodMonths ?? 2,
      status: editLease.status ?? 'active',
      notes: editLease.notes ?? '',
      inclusions: editLease.inclusions ?? '',
      contractTerms: editLease.contractTerms ?? ['tmpl1', 'tmpl2'],
      items: editLease.items ?? [
        {
          spaceId: editLease.spaceId ?? '',
          deposit: editLease.bondAmount ?? 0,
          steps: [
            {
              startDate: editLease.startDate ?? '',
              endDate: editLease.endDate ?? '',
              // monthlyRent is the discounted charge — restore the RRP for the form.
              listPrice: editLease.listPrice ?? editLease.monthlyRent ?? 0,
              discount: editLease.discount ?? '',
            },
          ],
        },
      ],
    }
  }
  return {
    tenantId: '',
    memberName: '',
    contractType: 'New',
    documentType: 'License Agreement',
    signatureStatus: 'not_signed',
    contractNumber: generateContractNumber(leases),
    startDate: '',
    endDate: '',
    noticePeriodMonths: 2,
    status: 'active',
    notes: '',
    inclusions: '',
    contractTerms: ['tmpl1', 'tmpl2'],
    items: [
      {
        spaceId: '',
        deposit: 0,
        steps: [{ startDate: '', endDate: '', listPrice: 0, discount: '' }],
      },
    ],
  }
}

// ── Small reusable controls ───────────────────────────────────────────────────

function NumberStepper({ value, onChange, min = 0, step = 1 }) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Number(value) - step))}
        className="w-8 h-8 flex items-center justify-center border border-input rounded-l bg-card hover:bg-muted/50 text-muted-foreground"
      >
        <Minus size={11} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 h-8 border-t border-b border-input text-center text-sm focus:outline-none [appearance:textfield]"
      />
      <button
        type="button"
        onClick={() => onChange(Number(value) + step)}
        className="w-8 h-8 flex items-center justify-center border border-input rounded-r bg-card hover:bg-muted/50 text-muted-foreground"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/50">
        <ChevronDown size={13} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  )
}

function Field({ label, required, error, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

const inputCls = (err) =>
  `w-full border ${err ? 'border-red-400' : 'border-input'} rounded px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`

const selectCls = (err) =>
  `w-full border ${err ? 'border-red-400' : 'border-input'} rounded px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractForm({ editLease, leases, tenants, spaces, templates = [], members = [], onSave, onDiscard, lockTenant = false }) {
  const [form, setForm] = useState(() => initForm(editLease, leases))
  const [errors, setErrors] = useState({})

  const sectionRefs = {
    company: useRef(null),
    duration: useRef(null),
    items: useRef(null),
    terms: useRef(null),
    messages: useRef(null),
  }

  function scrollTo(id) {
    sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isEdit = !!editLease

  // Sync first step dates when top-level dates change (mirrors OfficeRND behaviour)
  useEffect(() => {
    setForm((f) => ({
      ...f,
      items: f.items.map((item) => ({
        ...item,
        steps: item.steps.map((step, i) =>
          i === 0
            ? {
                ...step,
                startDate: f.startDate || step.startDate,
                // single-step contracts mirror the top-level term; multi-step keep their own
                endDate: item.steps.length === 1 ? (f.endDate || step.endDate) : step.endDate,
              }
            : step
        ),
      })),
    }))
  }, [form.startDate, form.endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Item helpers ─────────────────────────────────────────────────────────

  function handleSpaceSelect(itemIdx, spaceId) {
    const space = spaces.find((s) => s.id === spaceId)
    setForm((f) => {
      // Month-to-month terms: no bond; virtual offices default to $150/mo
      // when the space record carries no rate.
      const mtm = f.contractType === 'Month-to-month'
      const defaultPrice = space
        ? (space.type === 'virtual' ? (Number(space.monthlyRate) || 150) : space.monthlyRate)
        : null
      return {
      ...f,
      items: f.items.map((item, i) =>
        i !== itemIdx
          ? item
          : {
              ...item,
              spaceId,
              deposit: space ? (mtm ? 0 : space.monthlyRate * 2) : item.deposit,
              steps: item.steps.map((step, si) =>
                si === 0 ? { ...step, listPrice: space ? defaultPrice : step.listPrice } : step
              ),
            }
      ),
    }})
  }

  function updateItem(idx, updates) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === idx ? { ...item, ...updates } : item)),
    }))
  }

  function removeItem(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  function addItem() {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          spaceId: '',
          deposit: 0,
          steps: [{ startDate: f.startDate, endDate: f.endDate, listPrice: 0, discount: '' }],
        },
      ],
    }))
  }

  function updateStep(itemIdx, stepIdx, updates) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) =>
        i !== itemIdx
          ? item
          : {
              ...item,
              steps: item.steps.map((step, si) => (si === stepIdx ? { ...step, ...updates } : step)),
            }
      ),
    }))
  }

  function addStep(itemIdx) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => {
        if (i !== itemIdx) return item
        const last = item.steps[item.steps.length - 1]
        const nextStart = last?.endDate ? dayAfter(last.endDate) : f.startDate
        // Only add when the last step doesn't already fill the whole duration.
        if (f.endDate && nextStart && nextStart > f.endDate) return item
        return {
          ...item,
          steps: [
            ...item.steps,
            { startDate: nextStart, endDate: f.endDate, listPrice: last?.listPrice ?? 0, discount: '' },
          ],
        }
      }),
    }))
  }

  function removeStep(itemIdx, stepIdx) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) =>
        i !== itemIdx
          ? item
          : { ...item, steps: item.steps.filter((_, si) => si !== stepIdx) }
      ),
    }))
  }

  // ── Terms helpers ────────────────────────────────────────────────────────

  function removeTerm(term) {
    setForm((f) => ({ ...f, contractTerms: f.contractTerms.filter((t) => t !== term) }))
  }

  function addTerm(term) {
    if (!form.contractTerms.includes(term)) {
      setForm((f) => ({ ...f, contractTerms: [...f.contractTerms, term] }))
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  function validate() {
    const errs = {}
    if (!form.tenantId) errs.tenantId = 'Company is required'
    if (!form.startDate) errs.startDate = 'Start date is required'
    // Month-to-month contracts may leave the end date blank — they run until
    // notice is given (billing treats no end date as open-ended).
    if (!form.endDate && form.contractType !== 'Month-to-month') errs.endDate = 'End date is required'
    if (form.items.some((item) => !item.spaceId)) errs.items = 'All items need a space selected'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) {
      if (errors.tenantId) scrollTo('company')
      else if (errors.startDate || errors.endDate) scrollTo('duration')
      else if (errors.items) scrollTo('items')
      return
    }
    const firstItem = form.items[0] ?? {}
    const firstStep = firstItem.steps?.[0] ?? {}
    onSave({
      tenantId: form.tenantId,
      spaceId: firstItem.spaceId,
      startDate: form.startDate,
      endDate: form.endDate,
      // What we actually charge: list price less the step's discount. The RRP is
      // kept alongside so documents can show "list $X — discount → $Y".
      monthlyRent: discountedPrice(firstStep.listPrice, firstStep.discount),
      listPrice: Number(firstStep.listPrice ?? 0),
      bondAmount: Number(firstItem.deposit ?? 0),
      status: form.status,
      notes: form.notes,
      inclusions: form.inclusions,
      contractNumber: form.contractNumber,
      contractType: form.contractType,
      documentType: form.documentType,
      // Explicit card decision: default follows the document type (VO/desk
      // require it) but stores whatever the tick-box shows so the agreement,
      // signing page and onboarding gate all agree.
      requireCardOnFile: form.requireCardOnFile ?? /virtual|desk/i.test(form.documentType),
      signatureStatus: form.signatureStatus,
      memberName: form.memberName,
      noticePeriodMonths: form.noticePeriodMonths,
      contractTerms: form.contractTerms,
      discount: firstStep.discount ?? '',
      items: form.items,
    })
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedTenant = tenants.find((t) => t.id === form.tenantId)
  const depositHeld = leases
    .filter(
      (l) =>
        l.tenantId === form.tenantId && l.status === 'active' && l.id !== editLease?.id
    )
    .reduce((sum, l) => sum + Number(l.bondAmount ?? 0), 0)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-muted/50">
      {/* ── Header with section anchors ── */}
      <div className="bg-card border-b border-border px-8 pt-6 pb-0 shrink-0">
        <h1 className="text-lg font-semibold text-foreground mb-4">
          {isEdit ? `Edit Contract · ${form.contractNumber}` : 'New Contract'}
        </h1>
        <div className="flex">
          {FORM_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-input transition-colors whitespace-nowrap"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* ─── Company Information ─── */}
        <div ref={sectionRefs.company}>
          <Section title="Company Information">
            <div className="grid grid-cols-2 gap-6">
              <Field label="Company" required error={errors.tenantId}>
                <select
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value, memberName: '' })}
                  className={selectCls(errors.tenantId)}
                  disabled={lockTenant}
                >
                  <option value="">Select company…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.businessName}
                    </option>
                  ))}
                </select>
                {selectedTenant && depositHeld > 0 && (
                  <div className="mt-2">
                    <span className="inline-block bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-1 rounded">
                      Deposit held: A${depositHeld.toLocaleString('en-AU')}
                    </span>
                  </div>
                )}
              </Field>

              <Field label="Member">
                <select
                  value={form.memberName}
                  onChange={(e) => setForm({ ...form, memberName: e.target.value })}
                  className={selectCls()}
                >
                  <option value="">—</option>
                  {(() => {
                    // The company's members (billing person first), plus the
                    // tenant's contactName if it isn't already one of them.
                    const mine = members
                      .filter((m) => m.companyId === selectedTenant?.id && m.name)
                      .sort((a, b) => (b.billingPerson === true) - (a.billingPerson === true) || (a.name || '').localeCompare(b.name || ''))
                    const names = mine.map((m) => m.name)
                    if (selectedTenant?.contactName && !names.includes(selectedTenant.contactName)) names.push(selectedTenant.contactName)
                    // Keep a saved memberName selectable even if that member was removed.
                    if (form.memberName && !names.includes(form.memberName)) names.unshift(form.memberName)
                    return names.map((n) => {
                      const m = mine.find((x) => x.name === n)
                      return <option key={n} value={n}>{n}{m?.billingPerson ? ' · billing person' : ''}</option>
                    })
                  })()}
                </select>
              </Field>
            </div>
          </Section>
        </div>

        {/* ─── Duration ─── */}
        <div ref={sectionRefs.duration}>
          <Section title="Duration">
            <div className="grid grid-cols-2 gap-6">
              <Field label="Document Type">
                <select
                  value={form.documentType}
                  onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                  className={selectCls()}
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requireCardOnFile ?? /virtual|desk/i.test(form.documentType)}
                    onChange={(e) => setForm({ ...form, requireCardOnFile: e.target.checked })}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Require payment card on file</span> — the client must
                    verify a card with Stripe right after signing (payment authority applies). Untick for trusted payers.
                  </span>
                </label>
              </Field>

              <Field label="Contract Type" required>
                <select
                  value={form.contractType}
                  onChange={(e) => setForm({ ...form, contractType: e.target.value })}
                  className={selectCls()}
                >
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Signature Status">
                <select
                  value={form.signatureStatus}
                  onChange={(e) => setForm({ ...form, signatureStatus: e.target.value })}
                  className={selectCls()}
                >
                  {SIGNATURE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Number" required>
                <input
                  value={form.contractNumber}
                  onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
                  className={inputCls()}
                />
              </Field>

              <Field label="Start Date" required error={errors.startDate}>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value
                    // Auto-fill a 1-year term when the start date is set/changed —
                    // except month-to-month, which runs open-ended by default.
                    setForm((f) => ({
                      ...f, startDate,
                      endDate: startDate && f.contractType !== 'Month-to-month' ? oneYearTerm(startDate) : f.endDate,
                    }))
                  }}
                  className={inputCls(errors.startDate)}
                />
              </Field>

              <Field label="End Date" required={form.contractType !== 'Month-to-month'} error={errors.endDate}>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate || undefined}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className={inputCls(errors.endDate)}
                />
                {form.endDate ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Earliest leave date for the tenant company
                  </p>
                ) : form.contractType === 'Month-to-month' ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank — runs month-to-month until notice is given
                  </p>
                ) : null}
              </Field>

              <Field label="Notice Period" required>
                <div className="flex items-center gap-2">
                  <NumberStepper
                    value={form.noticePeriodMonths}
                    onChange={(v) => setForm({ ...form, noticePeriodMonths: v })}
                    min={0}
                  />
                  <span className="text-sm text-muted-foreground border border-input px-3 py-1.5 rounded bg-muted/50">
                    Months
                  </span>
                </div>
              </Field>

              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={selectCls()}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="expired">Expired</option>
                </select>
              </Field>
            </div>
          </Section>
        </div>

        {/* ─── Items ─── */}
        <div ref={sectionRefs.items}>
          <Section title="Items">
            {errors.items && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                <AlertCircle size={14} /> {errors.items}
              </div>
            )}

            <div className="space-y-4">
              {form.items.map((item, itemIdx) => {
                const itemSpace = spaces.find((s) => s.id === item.spaceId)
                const allowedTypes = DOC_TYPE_SPACES[form.documentType] || null
                const typeLabel = itemSpace
                  ? itemSpace.type.charAt(0).toUpperCase() + itemSpace.type.slice(1)
                  : 'Space'

                return (
                  <div
                    key={itemIdx}
                    className="border border-border rounded-xl bg-card overflow-hidden"
                  >
                    {/* Item header row */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 border-b border-border flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground whitespace-nowrap">
                          {typeLabel} *
                        </span>
                        <select
                          value={item.spaceId}
                          onChange={(e) => handleSpaceSelect(itemIdx, e.target.value)}
                          className="border border-input rounded px-3 py-1.5 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 min-w-[200px]"
                        >
                          <option value="">Select Resource</option>
                          {spaces
                            .filter((s) => {
                              if (s.id === item.spaceId) return true // keep current selection
                              // Restrict to the space types this document type may book.
                              if (allowedTypes && !allowedTypes.includes(s.type)) return false
                              // Private offices: only units not already leased/assigned.
                              if (s.type === 'office') {
                                if (s.assignedCompanyId) return false
                                return !leases.some((l) => l.spaceId === s.id && (l.status === 'active' || l.status === 'pending'))
                              }
                              if (s.type === 'virtual') return true // show all virtual-office options
                              return s.status === 'vacant'
                            })
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.unitNumber} — {s.size}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Deposit</span>
                        <NumberStepper
                          value={item.deposit}
                          onChange={(v) => updateItem(itemIdx, { deposit: v })}
                          step={500}
                        />
                        <span className="text-xs text-muted-foreground border border-input px-2 py-1.5 rounded bg-card">
                          AUD
                        </span>
                      </div>

                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(itemIdx)}
                          className="ml-auto p-1.5 text-muted-foreground hover:text-red-500 rounded hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Steps */}
                    <div className="px-4 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Steps
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ⓘ To add a step, move back the plan's end date
                        </span>
                      </div>

                      {/* Column headers */}
                      <div
                        className="grid gap-3 text-xs font-medium text-muted-foreground pb-2 border-b border-border mb-2"
                        style={{ gridTemplateColumns: '24px 1fr 1fr 1fr 1fr 80px 14px' }}
                      >
                        <span />
                        <span>Start Date *</span>
                        <span>End Date *</span>
                        <span>List Price</span>
                        <span>Discount</span>
                        <span />
                        <span />
                      </div>

                      <div className="space-y-2">
                        {item.steps.map((step, stepIdx) => (
                          <div
                            key={stepIdx}
                            className="grid gap-3 items-center"
                            style={{ gridTemplateColumns: '24px 1fr 1fr 1fr 1fr 80px 14px' }}
                          >
                            {/* Step badge */}
                            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">
                              {stepIdx + 1}
                            </span>

                            <input
                              type="date"
                              value={step.startDate}
                              min={form.startDate || undefined}
                              max={form.endDate || undefined}
                              onChange={(e) =>
                                updateStep(itemIdx, stepIdx, { startDate: e.target.value })
                              }
                              className="border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 w-full"
                            />
                            <input
                              type="date"
                              value={step.endDate}
                              min={step.startDate || form.startDate || undefined}
                              max={form.endDate || undefined}
                              onChange={(e) =>
                                updateStep(itemIdx, stepIdx, { endDate: e.target.value })
                              }
                              className="border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 w-full"
                            />

                            <div className="flex items-center gap-1">
                              <NumberStepper
                                value={step.listPrice}
                                onChange={(v) => updateStep(itemIdx, stepIdx, { listPrice: v })}
                                step={100}
                              />
                              <span className="text-xs text-muted-foreground border border-input px-1.5 py-1.5 rounded bg-card shrink-0">
                                AUD
                              </span>
                            </div>

                            {(() => {
                              // Discount as '10%' (percentage) or '$200' ($ off/month).
                              const dStr = String(step.discount ?? '')
                              const mode = dStr.endsWith('%') ? '%' : dStr ? '$' : ''
                              const dVal = dStr.replace(/[%$,\s]/g, '')
                              const setD = (m, v) =>
                                updateStep(itemIdx, stepIdx, { discount: !m || !v ? '' : m === '%' ? `${v}%` : `$${v}` })
                              return (
                                <div className="flex items-center gap-1">
                                  <select
                                    value={mode}
                                    onChange={(e) => setD(e.target.value, e.target.value ? (dVal || (e.target.value === '%' ? '10' : '100')) : '')}
                                    className="border border-input rounded px-1.5 py-1.5 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 shrink-0"
                                  >
                                    <option value="">No disc.</option>
                                    <option value="%">%</option>
                                    <option value="$">$</option>
                                  </select>
                                  {mode && (
                                    <input
                                      type="number"
                                      min="0"
                                      max={mode === '%' ? 100 : undefined}
                                      value={dVal}
                                      onChange={(e) => setD(mode, e.target.value)}
                                      placeholder={mode === '%' ? '10' : '200'}
                                      className="border border-input rounded px-2 py-1.5 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 w-full min-w-0"
                                    />
                                  )}
                                </div>
                              )
                            })()}

                            {stepIdx === item.steps.length - 1 ? (() => {
                              const fillsEnd = form.endDate && step.endDate && step.endDate >= form.endDate
                              return (
                                <button
                                  type="button"
                                  onClick={() => addStep(itemIdx)}
                                  disabled={fillsEnd}
                                  title={fillsEnd ? 'This step already covers the full duration' : undefined}
                                  className={`text-xs font-medium whitespace-nowrap ${fillsEnd ? 'text-muted-foreground cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
                                >
                                  Add Step
                                </button>
                              )
                            })() : <span />}

                            {item.steps.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeStep(itemIdx, stepIdx)}
                                className="text-muted-foreground hover:text-red-400"
                              >
                                <X size={13} />
                              </button>
                            )}
                            {item.steps.length === 1 && <span />}

                            {/* Effective price once a discount is applied */}
                            {discountedPrice(step.listPrice, step.discount) < Number(step.listPrice ?? 0) && (
                              <div className="col-span-full -mt-1 text-xs text-emerald-700 text-right pr-24">
                                After {step.discount} discount: A${discountedPrice(step.listPrice, step.discount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}/mo
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add item row */}
            <div className="mt-4 flex items-center gap-3 p-4 border border-dashed border-input rounded-xl bg-card">
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-foreground border border-input px-3 py-1.5 rounded hover:bg-muted/50"
              >
                + Add Space
              </button>
              <p className="text-xs text-muted-foreground ml-auto">
                To allow different types of items,{' '}
                <span className="underline cursor-pointer hover:text-foreground">
                  edit contract type
                </span>
              </p>
            </div>
          </Section>
        </div>

        {/* ─── Terms & Conditions ─── */}
        <div ref={sectionRefs.terms}>
          <Section title="Terms & Conditions">
            <Field label="Contract Terms">
              {/* Selected templates as removable tags */}
              <div className="border border-input rounded px-2 py-2 min-h-[44px] flex flex-wrap gap-2 bg-card">
                {form.contractTerms.length === 0 && (
                  <span className="text-xs text-muted-foreground py-1 px-1">No documents attached</span>
                )}
                {form.contractTerms.map((tmplId) => {
                  const tmpl = templates.find((t) => t.id === tmplId)
                  const label = tmpl ? `${tmpl.name} · ${tmpl.version}` : tmplId
                  return (
                    <span
                      key={tmplId}
                      className="flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium px-2.5 py-1 rounded"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() => removeTerm(tmplId)}
                        className="text-blue-400 hover:text-blue-700"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Documents attached here will be included in the generated PDF agreement.
              </p>
            </Field>

            {/* Available templates to add — documents only (email templates are
                sent separately and must never be attached to the agreement PDF). */}
            {templates.some((t) => (t.category || 'document') !== 'email') && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Available templates</p>
                <div className="border border-border rounded-xl divide-y divide-border">
                  {templates.filter((t) => (t.category || 'document') !== 'email').map((tmpl) => {
                    const isSelected = form.contractTerms.includes(tmpl.id)
                    return (
                      <div
                        key={tmpl.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                      >
                        <div>
                          <span className="text-sm font-medium text-foreground">{tmpl.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{tmpl.version}</span>
                          <span className="text-xs text-muted-foreground ml-3">
                            {tmpl.clauses?.length ?? 0} clause{tmpl.clauses?.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => (isSelected ? removeTerm(tmpl.id) : addTerm(tmpl.id))}
                          className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors ${
                            isSelected
                              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                              : 'bg-card text-foreground border-input hover:bg-muted/50'
                          }`}
                        >
                          {isSelected ? '✓ Attached' : '+ Attach'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {templates.length === 0 && (
              <div className="mt-4 p-4 bg-muted/50 border border-dashed border-input rounded-xl text-center">
                <p className="text-sm text-muted-foreground">
                  No templates yet.{' '}
                  <a href="/templates" className="text-blue-600 hover:underline">
                    Create templates
                  </a>{' '}
                  in the Templates section.
                </p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-sm font-medium text-foreground mb-1.5">Addendum</label>
              <button
                type="button"
                className="text-sm border border-input px-3 py-1.5 rounded hover:bg-muted/50 text-foreground"
              >
                Add Addendum
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-sm font-medium text-foreground mb-1.5">Inclusions</label>
              <textarea
                rows={4}
                value={form.inclusions}
                onChange={(e) => setForm({ ...form, inclusions: e.target.value })}
                placeholder={'One inclusion per line — printed as an INCLUSIONS table on the agreement, e.g.\n2 × car parks included\n4 hours of boardroom credits per month\nSignage on the Level 4 directory'}
                className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-y"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Whatever was negotiated — each line becomes a row on the agreement document. Virtual Office
                agreements print their standard inclusions first, then these.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <label className="block text-sm font-medium text-foreground mb-1.5">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes about this contract…"
                className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-none"
              />
            </div>
          </Section>
        </div>

        {/* ─── System Messages ─── */}
        <div ref={sectionRefs.messages}>
          <Section title="System Messages">
            <div className="py-10 text-center text-muted-foreground text-sm">
              No system messages for this contract.
            </div>
          </Section>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-border bg-card px-8 py-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={onDiscard}
          className="px-5 py-2 text-sm font-medium text-foreground border border-input rounded hover:bg-muted/50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          {isEdit ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </div>
  )
}
