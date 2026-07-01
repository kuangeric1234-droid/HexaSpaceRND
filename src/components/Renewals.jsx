import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { differenceInDays, parseISO, format, addYears, addMonths } from 'date-fns'
import { FileText, RefreshCw, Mail, X } from 'lucide-react'
import { sendEmail } from '../lib/sendEmail.js'
import ContractForm from './ContractForm.jsx'

export default function Renewals() {
  const { leases, tenants, spaces, settings, addLease, updateLease, templates, discounts } = useOutletContext()
  const [sending, setSending] = useState(null) // leaseId being sent
  const [renewLease, setRenewLease] = useState(null) // lease to renew (opens ContractForm)
  const today = new Date()

  // Leases that auto-renewed (rolled forward past their end date) and are awaiting
  // an admin decision. Billing continues in the meantime so no invoices are missed.
  const pendingRenewal = leases
    .filter((l) => l.pendingRenewalApproval && l.status === 'active')
    .sort((a, b) => String(a.autoRenewedAt ?? '').localeCompare(String(b.autoRenewedAt ?? '')))

  function approveRenewal(lease) {
    updateLease(lease.id, { pendingRenewalApproval: false, renewalApprovedAt: new Date().toISOString() })
  }
  function declineRenewal(lease) {
    if (!window.confirm('Decline the renewal and end this lease?\n\nThe space (and any parking) will be released, Salto access revoked, and a bond refund raised for approval.')) return
    updateLease(lease.id, {
      pendingRenewalApproval: false,
      renewalDeclined: true,
      endDate: lease.previousEndDate ?? lease.endDate,
      status: 'expired',
    })
  }

  const expiring = leases
    .filter((l) => {
      if (l.status !== 'active') return false
      const days = differenceInDays(parseISO(l.endDate), today)
      return days >= 0 && days <= 60
    })
    .sort((a, b) => differenceInDays(parseISO(a.endDate), today) - differenceInDays(parseISO(b.endDate), today))

  const expired = leases
    .filter((l) => {
      const days = differenceInDays(parseISO(l.endDate), today)
      return days < 0 && l.status === 'active'
    })
    .sort((a, b) => differenceInDays(parseISO(b.endDate), today) - differenceInDays(parseISO(a.endDate), today))

  function urgencyBadge(days) {
    if (days <= 14) return 'bg-red-100 text-red-800 border border-red-200'
    if (days <= 30) return 'bg-orange-100 text-orange-800 border border-orange-200'
    return 'bg-amber-100 text-amber-800 border border-amber-200'
  }

  async function handleSendRenewalEmail(lease) {
    const tenant = tenants.find((t) => t.id === lease.tenantId)
    const space = spaces.find((s) => s.id === lease.spaceId)
    if (!tenant?.email) { alert('No email on file for this tenant.'); return }
    setSending(lease.id)
    try {
      const companyName = settings?.company?.name ?? 'Hexa Space'
      const contractNum = lease.contractNumber ?? `CON-${lease.id.slice(-3).toUpperCase()}`
      const expiryDate = format(parseISO(lease.endDate), 'dd MMM yyyy')
      await sendEmail({
        to: tenant.email,
        subject: `Renewal notice — ${contractNum} expires ${expiryDate}`,
        tenantId: tenant.id, emailType: 'renewal',
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
  <div style="background:#000;padding:20px 32px"><span style="color:#fff;font-size:18px;font-weight:bold;letter-spacing:2px">${companyName.toUpperCase()}</span></div>
  <div style="padding:32px">
    <h2 style="margin:0 0 12px;font-size:16px">Lease Renewal Notice</h2>
    <p style="color:#555;font-size:14px;margin:0 0 16px">Hi ${tenant.contactName ?? tenant.businessName},</p>
    <p style="color:#555;font-size:14px;margin:0 0 16px">Your licence agreement for <strong>${space?.unitNumber ?? 'your unit'}</strong> (${contractNum}) is due to expire on <strong>${expiryDate}</strong>.</p>
    <p style="color:#555;font-size:14px;margin:0 0 16px">We would love to continue our arrangement with you. Please contact us to discuss renewal terms at your earliest convenience.</p>
    <p style="color:#555;font-size:14px;margin:0 0 8px">Current monthly licence fee: <strong>$${Number(lease.monthlyRent).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD + GST</strong></p>
    <p style="font-size:12px;color:#888;margin-top:24px">If you do not intend to renew, please provide written notice as per your agreement terms.</p>
  </div>
</div></body></html>`,
        settings,
      })
      alert(`Renewal email sent to ${tenant.email}`)
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
    } finally {
      setSending(null)
    }
  }

  function handleOpenRenew(lease) {
    // Pre-fill a new contract based on this lease, starting from expiry date
    const newStart = lease.endDate // start the day after expiry
    const newEnd = format(addYears(parseISO(lease.endDate), 1), 'yyyy-MM-dd')
    setRenewLease({
      ...lease,
      id: null, // will get new id
      previousContractId: lease.id,
      contractType: 'Renewal',
      signatureStatus: 'not_signed',
      startDate: newStart,
      endDate: newEnd,
      contractNumber: null, // will auto-generate
      items: (lease.items ?? []).map((item) => ({
        ...item,
        steps: (item.steps ?? []).map((step) => ({
          ...step,
          startDate: newStart,
          endDate: newEnd,
        })),
      })),
    })
  }

  function LeaseRow({ lease, daysLabel, badgeStyle }) {
    const tenant = tenants.find((t) => t.id === lease.tenantId)
    const space = spaces.find((s) => s.id === lease.spaceId)
    const isSending = sending === lease.id
    return (
      <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-gray-900">{tenant?.businessName ?? '—'}</td>
        <td className="px-4 py-3 text-gray-600">{tenant?.email ?? '—'}</td>
        <td className="px-4 py-3 text-gray-600">{tenant?.phone ?? '—'}</td>
        <td className="px-4 py-3 text-gray-600">{space?.unitNumber ?? '—'}</td>
        <td className="px-4 py-3 text-gray-600">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
        <td className="px-4 py-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeStyle}`}>{daysLabel}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSendRenewalEmail(lease)}
              disabled={isSending}
              className="flex items-center gap-1 text-xs border border-blue-200 rounded px-2 py-1 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              <Mail size={12} /> {isSending ? 'Sending…' : 'Email Tenant'}
            </button>
            <button
              onClick={() => handleOpenRenew(lease)}
              className="flex items-center gap-1 text-xs border border-gray-200 rounded px-2 py-1 bg-black text-white hover:bg-gray-800"
            >
              <RefreshCw size={12} /> Renew
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Renewals</h1>
        <p className="text-sm text-gray-500 mt-1">Leases expiring within 60 days — action required.</p>
      </div>

      {expiring.length === 0 && expired.length === 0 && pendingRenewal.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center text-green-800 text-sm font-medium">
          No leases expiring in the next 60 days.
        </div>
      )}

      {pendingRenewal.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Auto-Renewed — Pending Approval ({pendingRenewal.length})
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            These leases rolled their term forward automatically because no non-renewal notice was given. Billing continues so no invoices are missed — approve to confirm, or decline to end the lease.
          </p>
          <div className="bg-white border border-indigo-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 border-b border-indigo-200">
                <tr>
                  {['Tenant', 'Space', 'Renewed To', 'Term', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-indigo-800 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingRenewal.map((lease) => {
                  const tenant = tenants.find((t) => t.id === lease.tenantId)
                  const space = spaces.find((s) => s.id === lease.spaceId)
                  return (
                    <tr key={lease.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{tenant?.businessName ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{space?.unitNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {lease.previousEndDate ? `from ${format(parseISO(lease.previousEndDate), 'dd/MM/yyyy')}` : '—'}
                        {lease.renewalCount ? ` · renewal #${lease.renewalCount}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveRenewal(lease)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-black text-white hover:bg-gray-800"
                          >
                            Approve renewal
                          </button>
                          <button
                            onClick={() => declineRenewal(lease)}
                            className="text-xs border border-red-200 rounded px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            Decline &amp; end
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expiring.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Expiring Within 60 Days ({expiring.length})
          </h2>
          <div className="bg-white border border-amber-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 border-b border-amber-200">
                <tr>
                  {['Tenant', 'Email', 'Phone', 'Space', 'Expiry', 'Urgency', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-amber-800 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expiring.map((lease) => {
                  const days = differenceInDays(parseISO(lease.endDate), today)
                  return <LeaseRow key={lease.id} lease={lease} daysLabel={`${days} days left`} badgeStyle={urgencyBadge(days)} />
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Overdue / Not Renewed ({expired.length})
          </h2>
          <div className="bg-white border border-red-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-50 border-b border-red-200">
                <tr>
                  {['Tenant', 'Email', 'Phone', 'Space', 'Expiry', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-red-800 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expired.map((lease) => {
                  const days = Math.abs(differenceInDays(parseISO(lease.endDate), today))
                  return <LeaseRow key={lease.id} lease={lease} daysLabel={`${days}d overdue`} badgeStyle="bg-red-100 text-red-800 border border-red-200" />
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Renew contract modal */}
      {renewLease && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-md w-full max-w-4xl shadow-2xl relative">
              <button
                onClick={() => setRenewLease(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 z-10"
              >
                <X size={20} />
              </button>
              <ContractForm
                editLease={renewLease}
                leases={leases}
                tenants={tenants}
                spaces={spaces}
                templates={templates ?? []}
                discounts={discounts ?? []}
                settings={settings}
                onSave={(data) => {
                  addLease(data)
                  // Auto-expire the original lease
                  if (renewLease.previousContractId) {
                    updateLease(renewLease.previousContractId, { status: 'expired' })
                  }
                  setRenewLease(null)
                }}
                onDiscard={() => setRenewLease(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
