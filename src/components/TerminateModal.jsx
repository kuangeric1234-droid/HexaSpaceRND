import { useState } from 'react'
import { format } from 'date-fns'

// Shared contract/membership termination — used by the Contracts list and the
// Memberships board so both behave identically.
//
// Semantics of the termination date:
//   today or past  → the contract ends NOW (status expired → offboarding
//                    cascade: spaces freed, bond refund, portal revocation,
//                    clause-13(b) Virtual Office where applicable).
//   future         → a SCHEDULED cancellation: the membership stays active
//                    until the date, billing stops at the date (the engine
//                    prorates the final month to it and never bills past it),
//                    and the daily reconcile cron ends + offboards the
//                    contract automatically on the day.

export const TERMINATION_REASONS = [
  'Office Move - Client request move',
  'Business Closure',
  'Non-Payment',
  'Lease Breach',
  'End of Term',
  'Mutual Agreement',
  'Upgrade / Downgrade',
  'Other',
]

const todayISO = () => format(new Date(), 'yyyy-MM-dd')

// Apply a confirmed termination. ctx: { updateLease, addInvoice, spaces, settings }
export function applyTermination(lease, data, ctx) {
  const { updateLease, addInvoice, spaces = [], settings } = ctx
  const isFuture = data.date > todayISO()

  // Exit fee (House Rules, office contracts) — raised now; for a scheduled
  // cancellation it falls due on the termination date.
  if (data.chargeExitFee && addInvoice) {
    const space = spaces.find((s) => s.id === lease.spaceId)
    const dueDays = settings?.invoicing?.dueDateDays ?? 14
    const due = new Date(); due.setDate(due.getDate() + dueDays)
    const dueISO = format(due, 'yyyy-MM-dd')
    addInvoice({
      tenantId: lease.tenantId,
      leaseId: lease.id,
      status: 'pending', sentStatus: 'not_sent', source: 'offboarding',
      invoiceType: 'exit_fee',
      issueDate: todayISO(),
      dueDate: isFuture && data.date > dueISO ? data.date : dueISO,
      periodStart: null, periodEnd: null, vatEnabled: true,
      lineItems: [{
        id: `li${Date.now()}`,
        description: `Exit fee — cleaning & restoration · ${space?.unitNumber ?? lease.resource ?? ''}`.trim(),
        revenueAccount: 'Exit Fee',
        unitPrice: data.exitFeeAmount, qty: 1, discountPct: 0,
      }],
    })
  }

  if (isFuture) {
    // Scheduled cancellation: stays active until the date; the billing engine
    // caps invoicing at vacateDate, and the daily reconcile cron flips the
    // contract to expired (+ offboarding cascade) once the date passes.
    updateLease(lease.id, {
      noticeGiven: true,
      noticeDate: todayISO(),
      vacateDate: data.date,
      terminationScheduledFor: data.date,
      terminationReason: data.reason,
      terminationComments: data.comments,
      skipVirtualOfficeEnrol: data.enrolVirtualOffice === false,
    })
  } else {
    updateLease(lease.id, {
      status: 'expired',
      terminatedAt: data.date,
      terminationReason: data.reason,
      terminationComments: data.comments,
      skipVirtualOfficeEnrol: data.enrolVirtualOffice === false,
    })
  }
  return { scheduled: isFuture }
}

export default function TerminateModal({ lease, reasons, exitFee = 350, onConfirm, onClose }) {
  const allReasons = reasons?.length ? reasons : TERMINATION_REASONS
  const contractNum = lease.contractNumber ?? `CON-${lease.id?.slice(-3).toUpperCase()}`
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState(allReasons[0])
  const [comments, setComments] = useState('')
  // House Rules: fixed exit fee for Private Office members, so default the
  // checkbox ON for office contracts and OFF for everything else.
  const isOffice = (/office/i.test(lease.membershipType || '') && !/virtual/i.test(lease.membershipType || '')) || lease.documentType === 'License Agreement'
  const [chargeExitFee, setChargeExitFee] = useState(isOffice && exitFee > 0)
  // Clause 13(b): departing Private Office members are auto-enrolled in a
  // 3-month Virtual Office deducted from the bond. Untick to waive.
  const [enrolVo, setEnrolVo] = useState(isOffice)
  const isFuture = date > todayISO()

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
            <p className={`text-xs mt-1.5 ${isFuture ? 'text-blue-700' : 'text-muted-foreground'}`}>
              {isFuture
                ? `Scheduled cancellation: the membership stays active until ${format(new Date(`${date}T00:00:00`), 'dd/MM/yyyy')}, is never billed past that date (the final month is prorated to it), and ends automatically on the day — offboarding, bond refund and portal access all handled.`
                : 'Ends the contract immediately — spaces freed, billing stops, offboarding runs now.'}
            </p>
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
            {isFuture ? 'Schedule termination' : 'Terminate'}
          </button>
        </div>
      </div>
    </div>
  )
}
