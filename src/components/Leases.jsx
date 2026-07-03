import { useState } from 'react'
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { Settings, ChevronDown, Trash2, FileText, ChevronUp, Filter, Settings2 } from 'lucide-react'
import { format, parseISO, differenceInDays, addMonths, startOfMonth } from 'date-fns'
import ContractForm from './ContractForm.jsx'
import ContractDetail from './ContractDetail.jsx'
import { sendLeaseForSigning, shouldAutoSendForSigning } from '../lib/esign.js'

const DOC_TYPES = [
  'License Agreement',
  'Virtual Office Membership Agreement',
  'Membership Agreement Month-to-month',
  'Service Agreement',
]

const SIG_STATUS = {
  manually_signed: { label: 'Manually Signed', cls: 'bg-green-500 text-white' },
  e_signed:        { label: 'E Signed',          cls: 'bg-green-500 text-white' },
  out_for_signature: { label: 'Out For Signature', cls: 'bg-pink-400 text-white' },
  not_signed:      { label: 'Not Signed',        cls: 'bg-gray-300 text-gray-700' },
}

function getStageBadges(lease) {
  const today = new Date()
  const badges = []

  // Signature state
  const sig = lease.signatureStatus
  if (sig === 'manually_signed' || sig === 'e_signed') {
    badges.push({ label: 'Signed', cls: 'bg-green-500 text-white' })
  } else if (sig === 'out_for_signature') {
    badges.push({ label: 'Not Signed', cls: 'bg-red-400 text-white' })
  } else {
    badges.push({ label: 'Not Signed', cls: 'bg-red-400 text-white' })
  }

  // Contract type
  const type = lease.contractType ?? 'New'
  badges.push({ label: type, cls: 'bg-blue-500 text-white' })

  // Active / Expired / Not Renewed
  if (lease.status === 'active' && lease.endDate) {
    const daysLeft = differenceInDays(parseISO(lease.endDate), today)
    if (daysLeft < 0) {
      badges.push({ label: 'Expired', cls: 'bg-gray-400 text-white' })
    } else if (daysLeft <= 60) {
      badges.push({ label: 'Not Renewed', cls: 'bg-orange-500 text-white' })
    } else {
      badges.push({ label: 'Active', cls: 'bg-green-600 text-white' })
    }
  } else if (lease.status === 'expired') {
    badges.push({ label: 'Expired', cls: 'bg-gray-400 text-white' })
  } else if (lease.status === 'pending') {
    badges.push({ label: 'Pending', cls: 'bg-yellow-500 text-white' })
  }

  return badges
}

function ColHeader({ label, sortKey, currentSort, onSort, filterable = true }) {
  const isActive = currentSort?.key === sortKey
  return (
    <th className="text-left px-4 py-3 border-b border-border bg-muted/50">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <button
          onClick={() => sortKey && onSort(sortKey)}
          className={`flex items-center gap-1 hover:text-foreground ${sortKey ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {label}
          {sortKey && (
            isActive
              ? currentSort.dir === 'desc'
                ? <ChevronDown size={11} className="text-blue-600" />
                : <ChevronUp size={11} className="text-blue-600" />
              : <ChevronDown size={11} className="opacity-30" />
          )}
        </button>
        {filterable && <Filter size={10} className="opacity-30 ml-0.5" />}
      </div>
    </th>
  )
}

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 25, 50]

export default function Leases() {
  const { leases, tenants, spaces, templates, invoices = [], addLease, updateLease, deleteLease, addInvoice, settings } = useOutletContext()
  const navigate = useNavigate()

  const { state: navState } = useLocation()
  const [mode, setMode] = useState(navState?.openLeaseId ? 'detail' : 'list')
  const [selectedLease, setSelectedLease] = useState(
    navState?.openLeaseId ? leases.find(l => l.id === navState.openLeaseId) ?? null : null
  )
  const [editingLease, setEditingLease] = useState(null)
  const [sort, setSort] = useState({ key: 'contractNumber', dir: 'desc' })
  const [openGearId, setOpenGearId] = useState(null)
  const [terminateTarget, setTerminateTarget] = useState(null) // lease to terminate
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  function handleNew() { setEditingLease(null); setMode('create') }
  function handleRowClick(lease) { setSelectedLease(lease); setMode('detail') }
  function handleEdit(lease) {
    setEditingLease(lease ?? selectedLease)
    setMode('edit')
  }

  function handleSave(data) {
    if (mode === 'edit' && editingLease) updateLease(editingLease.id, data)
    else {
      const created = addLease(data)
      // A freshly created renewal goes straight out for e-signature so it
      // can't sit unsigned by mistake.
      if (created && shouldAutoSendForSigning(created)) {
        const tenant = tenants.find((t) => t.id === created.tenantId)
        sendLeaseForSigning({ lease: created, tenant, settings, templates: templates ?? [], updateLease })
          .catch((err) => console.error('Renewal e-sign send failed:', err))
      }
    }
    setMode('list')
    setEditingLease(null)
    setSelectedLease(null)
  }

  function handleDelete(e, id) {
    if (typeof e?.stopPropagation === 'function') e.stopPropagation()
    if (window.confirm('Delete this contract? The space will be marked as vacant.')) {
      deleteLease(typeof e === 'string' ? e : id)
      setMode('list')
      setSelectedLease(null)
    }
  }

  function handleRenew() {
    const base = selectedLease
    if (!base) return
    setEditingLease({
      ...base,
      id: undefined,
      contractNumber: undefined,
      contractType: 'Renewal',
      previousContractId: base.id,
      status: 'pending',
      signatureStatus: 'not_signed',
      startDate: base.endDate ?? '',
      endDate: '',
      createdAt: undefined,
      payments: [],
    })
    setMode('create')
  }

  function handleSort(key) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function handleGearAction(e, action, lease) {
    e.stopPropagation()
    setOpenGearId(null)

    switch (action) {
      case 'renew': {
        // Start renewal on the 1st of the month after the contract ends
        const renewalStart = lease.endDate
          ? format(startOfMonth(addMonths(parseISO(lease.endDate), 1)), 'yyyy-MM-dd')
          : ''
        setEditingLease({
          ...lease,
          id: undefined,
          contractNumber: undefined,
          contractType: 'Renewal',
          previousContractId: lease.id,
          status: 'pending',
          signatureStatus: 'not_signed',
          startDate: renewalStart,
          endDate: '',
          createdAt: undefined,
          payments: [],
          lastGeneratedAt: undefined,
        })
        setSelectedLease(null)
        setMode('create')
        break
      }

      case 'serve-notice':
        if (window.confirm(`Serve notice on ${lease.contractNumber ?? lease.id}? This will record today's notice date.`)) {
          updateLease(lease.id, { noticeServedAt: format(new Date(), 'yyyy-MM-dd') })
        }
        break

      case 'preview':
        handleRowClick(lease)
        break

      case 'terminate':
        setTerminateTarget(lease)
        break

      case 'delete': {
        // Block deletion for signed contracts or contracts with active invoices
        const isSigned = ['manually_signed', 'e_signed'].includes(lease.signatureStatus)
        const hasInvoices = invoices.some(
          (inv) => inv.leaseId === lease.id && inv.status !== 'voided'
        )
        if (isSigned || hasInvoices) {
          alert(
            `Cannot delete ${lease.contractNumber ?? 'this contract'}.\n\n` +
            (isSigned
              ? 'Signed contracts cannot be deleted. Use Terminate instead.'
              : 'This contract has active invoices. Void all invoices first.')
          )
          return
        }
        handleDelete(e, lease.id)
        break
      }

      default:
        break
    }
  }

  // ── Contract detail view ──────────────────────────────────────────────
  if (mode === 'detail' && selectedLease) {
    const lease = leases.find((l) => l.id === selectedLease.id) ?? selectedLease
    const tenant = tenants.find((t) => t.id === lease.tenantId)
    const space = spaces.find((s) => s.id === lease.spaceId)
    return (
      <ContractDetail
        lease={lease}
        tenant={tenant}
        space={space}
        templates={templates}
        allLeases={leases}
        settings={settings}
        onEdit={() => handleEdit(lease)}
        onBack={() => { setMode('list'); setSelectedLease(null) }}
        onRenew={handleRenew}
        onDelete={(id) => handleDelete(id, id)}
        onUpdateLease={updateLease}
      />
    )
  }

  // ── Contract form view ────────────────────────────────────────────────
  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="h-full flex flex-col">
        <ContractForm
          editLease={editingLease}
          leases={leases}
          tenants={tenants}
          spaces={spaces}
          templates={templates}
          onSave={handleSave}
          onDiscard={() => {
            setMode(selectedLease ? 'detail' : 'list')
            setEditingLease(null)
          }}
        />
      </div>
    )
  }

  // ── Sorting ───────────────────────────────────────────────────────────
  const sorted = [...leases].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'contractNumber') {
      const na = parseInt((a.contractNumber ?? a.id).replace(/\D/g, '') || '0', 10)
      const nb = parseInt((b.contractNumber ?? b.id).replace(/\D/g, '') || '0', 10)
      return (na - nb) * dir
    }
    if (sort.key === 'startDate') {
      return ((a.startDate ?? '') > (b.startDate ?? '') ? 1 : -1) * dir
    }
    return 0
  })

  // ── Pagination ────────────────────────────────────────────────────────
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * perPage, safePage * perPage)

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Contracts</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-input rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted/50">
            <Settings size={13} /> Settings
          </button>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-blue-700"
          >
            Add Contract <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Sort info */}
      <div className="px-6 py-1.5 text-xs text-muted-foreground text-right border-b border-border shrink-0">
        Sorted By: {sort.key === 'contractNumber' ? 'Number' : 'Period'} -{' '}
        {sort.dir === 'desc' ? 'Descending' : 'Ascending'}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-sm border-collapse">
          <thead>
            <tr>
              <ColHeader label="Number" sortKey="contractNumber" currentSort={sort} onSort={handleSort} />
              <ColHeader label="Document Type" currentSort={sort} onSort={handleSort} />
              <ColHeader label="Stage" currentSort={sort} onSort={handleSort} />
              <ColHeader label="Signature Status" currentSort={sort} onSort={handleSort} />
              <ColHeader label="Company" currentSort={sort} onSort={handleSort} />
              <ColHeader label="Period" sortKey="startDate" currentSort={sort} onSort={handleSort} />
              <th className="text-right px-4 py-3 border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground text-sm">
                  No contracts.{' '}
                  <button onClick={handleNew} className="text-blue-600 hover:underline">
                    Create the first one
                  </button>
                </td>
              </tr>
            )}
            {paged.map((lease) => {
              const tenant = tenants.find((t) => t.id === lease.tenantId)
              const space = spaces.find((s) => s.id === lease.spaceId)
              const contractNum = lease.contractNumber ?? `CON-${lease.id.slice(-3).toUpperCase()}`
              const stageBadges = getStageBadges(lease)
              const sigMeta = SIG_STATUS[lease.signatureStatus]
              const annualValue = lease.monthlyRent ? lease.monthlyRent * 12 : null
              const isMonthToMonth = lease.documentType === 'Membership Agreement Month-to-month' || lease.contractType === 'Month-to-month'
              const docType = lease.documentType ?? 'License Agreement'

              return (
                <tr
                  key={lease.id}
                  onClick={() => handleRowClick(lease)}
                  className="border-b border-border hover:bg-blue-50/30 cursor-pointer transition-colors"
                >
                  {/* NUMBER */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-blue-600 text-sm">{contractNum}</span>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenGearId((id) => (id === lease.id ? null : lease.id))
                          }}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted"
                        >
                          <Settings2 size={13} />
                        </button>

                        {openGearId === lease.id && (
                          <div
                            className="absolute left-0 top-6 bg-card border border-border rounded-xl shadow-lg z-50 w-44 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {[
                              { action: 'renew',        icon: '↻', label: 'Renew' },
                              { action: 'serve-notice', icon: '📄', label: 'Serve Notice' },
                              { action: 'preview',      icon: '👁', label: 'Preview PDF' },
                              { action: 'terminate',    icon: '⊘', label: 'Terminate', danger: false },
                              { action: 'delete',       icon: '🗑', label: 'Delete', danger: true },
                            ].map(({ action, icon, label, danger }) => (
                              <button
                                key={action}
                                onClick={(e) => handleGearAction(e, action, lease)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-muted/50 ${
                                  danger ? 'text-red-600 hover:bg-red-50' : 'text-foreground'
                                }`}
                              >
                                <span className="text-xs w-4 text-center">{icon}</span>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* DOCUMENT TYPE */}
                  <td className="px-4 py-3 align-top">
                    <div className="text-blue-600 text-sm font-medium hover:underline">{docType}</div>
                    {tenant?.contactName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <span className="text-muted-foreground">👤</span>
                        {tenant.contactName}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <span className="text-muted-foreground">📅</span>
                      {lease.createdAt ? format(parseISO(lease.createdAt), 'dd/MM/yyyy') : '—'}
                    </div>
                  </td>

                  {/* STAGE */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {stageBadges.map((b) => (
                        <span key={b.label} className={`text-xs font-semibold px-2 py-0.5 rounded ${b.cls}`}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* SIGNATURE STATUS */}
                  <td className="px-4 py-3 align-top">
                    {sigMeta ? (
                      <>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${sigMeta.cls}`}>
                          {sigMeta.label}
                        </span>
                        {tenant?.contactName && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <span className="text-muted-foreground">✍</span>
                            {tenant.contactName}
                          </div>
                        )}
                        {lease.startDate && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            📅 {format(parseISO(lease.startDate), 'dd/MM/yyyy')}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* COMPANY */}
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-foreground text-sm leading-tight">
                      {tenant?.businessName ?? '—'}
                    </div>
                    {tenant?.contactName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <span className="text-muted-foreground">👤</span>
                        {tenant.contactName}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <span className="text-muted-foreground">📍</span>
                      Hexa Space
                    </div>
                  </td>

                  {/* PERIOD */}
                  <td className="px-4 py-3 align-top">
                    {lease.startDate && (
                      <div className="text-sm text-foreground">
                        {format(parseISO(lease.startDate), 'dd/MM/yyyy')} –{' '}
                        {isMonthToMonth ? '∞' : lease.endDate ? format(parseISO(lease.endDate), 'dd/MM/yyyy') : '—'}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ⏰ {lease.noticePeriodMonths ?? 1} month{(lease.noticePeriodMonths ?? 1) !== 1 ? 's' : ''} notice
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Rolling Stage: Disabled</div>
                  </td>

                  {/* VALUE */}
                  <td className="px-4 py-3 align-top text-right">
                    {isMonthToMonth ? (
                      <span className="text-sm text-muted-foreground">N/A</span>
                    ) : annualValue ? (
                      <span className="text-sm font-medium text-foreground">
                        A${annualValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-card shrink-0 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Items per page:</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
            className="border border-input rounded px-2 py-1 text-sm bg-card focus:outline-none"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span>
            {total === 0 ? '0' : `${(safePage - 1) * perPage + 1}–${Math.min(safePage * perPage, total)}`} out of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="w-7 h-7 flex items-center justify-center border border-input rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              &lt;
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="w-7 h-7 flex items-center justify-center border border-input rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* Click-outside to close gear dropdown */}
      {openGearId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenGearId(null)} />
      )}

      {/* Terminate modal */}
      {terminateTarget && (
        <TerminateModal
          lease={terminateTarget}
          reasons={settings?.contracts?.terminationReasons ?? TERMINATION_REASONS}
          exitFee={Number(settings?.billingRules?.exitFee ?? 350)}
          onConfirm={(data) => {
            // Exit fee first (House Rules: fixed cleaning/restoration fee for
            // Private Office members) — before the status flip so the invoice
            // exists when offboarding runs.
            if (data.chargeExitFee && addInvoice) {
              const space = spaces.find((s) => s.id === terminateTarget.spaceId)
              const dueDays = settings?.invoicing?.dueDateDays ?? 14
              const due = new Date(); due.setDate(due.getDate() + dueDays)
              addInvoice({
                tenantId: terminateTarget.tenantId,
                leaseId: terminateTarget.id,
                status: 'pending', sentStatus: 'not_sent', source: 'offboarding',
                invoiceType: 'exit_fee',
                issueDate: format(new Date(), 'yyyy-MM-dd'),
                dueDate: format(due, 'yyyy-MM-dd'),
                periodStart: null, periodEnd: null, vatEnabled: true,
                lineItems: [{
                  id: `li${Date.now()}`,
                  description: `Exit fee — cleaning & restoration · ${space?.unitNumber ?? terminateTarget.resource ?? ''}`.trim(),
                  revenueAccount: 'Exit Fee',
                  unitPrice: data.exitFeeAmount, qty: 1, discountPct: 0,
                }],
              })
            }
            updateLease(terminateTarget.id, {
              status: 'expired',
              terminatedAt: data.date,
              terminationReason: data.reason,
              terminationComments: data.comments,
              // Clause 13(b) opt-out — offboarding reads this flag.
              skipVirtualOfficeEnrol: data.enrolVirtualOffice === false,
            })
            setTerminateTarget(null)
          }}
          onClose={() => setTerminateTarget(null)}
        />
      )}
    </div>
  )
}

// ── Terminate Modal ────────────────────────────────────────────────────────────
const TERMINATION_REASONS = [
  'Office Move - Client request move',
  'Business Closure',
  'Non-Payment',
  'Lease Breach',
  'End of Term',
  'Mutual Agreement',
  'Upgrade / Downgrade',
  'Other',
]

function TerminateModal({ lease, reasons, exitFee = 350, onConfirm, onClose }) {
  const allReasons = reasons?.length ? reasons : TERMINATION_REASONS
  const contractNum = lease.contractNumber ?? `CON-${lease.id?.slice(-3).toUpperCase()}`
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState(allReasons[0])
  const [comments, setComments] = useState('')
  // House Rules: fixed exit fee for Private Office members, so default the
  // checkbox ON for office contracts and OFF for everything else.
  const isOffice = (/office/i.test(lease.membershipType || '') && !/virtual/i.test(lease.membershipType || '')) || lease.documentType === 'License Agreement'
  const [chargeExitFee, setChargeExitFee] = useState(isOffice && exitFee > 0)
  // Clause 13(b): departing Private Office members are auto-enrolled in a
  // 3-month Virtual Office deducted from the bond. Untick to waive.
  const [enrolVo, setEnrolVo] = useState(isOffice)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            Terminate Contract — {contractNum}?
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Termination Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-input rounded px-3 py-2 text-sm bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {allReasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Comments</label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Comments"
              className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-none"
            />
          </div>

          {exitFee > 0 && (
            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={chargeExitFee}
                onChange={(e) => setChargeExitFee(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Charge the ${exitFee} + GST exit fee (cleaning &amp; restoration)
                <span className="block text-xs text-muted-foreground">Raises a pending one-off invoice. Per the House Rules for Private Office members.</span>
              </span>
            </label>
          )}

          {isOffice && (
            <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={enrolVo}
                onChange={(e) => setEnrolVo(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Enrol in the 3-month Virtual Office (clause 13(b))
                <span className="block text-xs text-muted-foreground">Creates a 3-month Virtual Office membership at the prevailing list price, deducted from the security deposit before it's refunded. Untick to waive.</span>
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground border border-input rounded hover:bg-muted/50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ date, reason, comments, chargeExitFee, exitFeeAmount: exitFee, enrolVirtualOffice: enrolVo })}
            disabled={!date}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-40"
          >
            Terminate
          </button>
        </div>
      </div>
    </div>
  )
}
