import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { differenceInDays, differenceInMonths, parseISO, format, addDays, addMonths, isValid } from 'date-fns'
import { FileText, RefreshCw, Mail, X } from 'lucide-react'
import { sendEmail, brandShell, bKicker, bH1, bP, bSmall } from '../lib/sendEmail.js'
import { billingEmailFor } from '../lib/credits.js'
import { sendLeaseForSigning, shouldAutoSendForSigning } from '../lib/esign.js'
import ContractForm from './ContractForm.jsx'

export default function Renewals() {
  const { leases, tenants, spaces, settings, addLease, updateLease, templates, discounts, members = [] } = useOutletContext()
  const [sending, setSending] = useState(null) // leaseId being sent
  const [renewLease, setRenewLease] = useState(null) // lease to renew (opens ContractForm)
  const today = new Date()
  // Date-safe helpers: leases can have an empty/invalid endDate (e.g. rolling
  // month-to-month), which would otherwise crash format()/parseISO().
  const parse = (s) => { if (!s) return null; const d = parseISO(s); return isValid(d) ? d : null }
  const fmt = (s) => { const d = parse(s); return d ? format(d, 'dd/MM/yyyy') : '—' }
  const daysTo = (s) => { const d = parse(s); return d ? differenceInDays(d, today) : null }

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

  // A lease that's been given notice / scheduled to terminate isn't a renewal
  // candidate — it's on its way out. Keep it out of both nag lists so it stops
  // showing as "expiring, action required" once the client has agreed to leave.
  const leaving = (l) => !!(l.noticeGiven || l.terminationScheduledFor || l.vacateDate || l.renewalDeclined)

  const expiring = leases
    .filter((l) => {
      if (l.status !== 'active' || leaving(l)) return false
      const days = daysTo(l.endDate)
      return days !== null && days >= 0 && days <= 60
    })
    .sort((a, b) => (daysTo(a.endDate) ?? 9e9) - (daysTo(b.endDate) ?? 9e9))

  const expired = leases
    .filter((l) => {
      if (l.status !== 'active' || leaving(l)) return false
      const days = daysTo(l.endDate)
      return days !== null && days < 0
    })
    .sort((a, b) => (daysTo(b.endDate) ?? -9e9) - (daysTo(a.endDate) ?? -9e9))

  function urgencyBadge(days) {
    if (days <= 14) return 'bg-red-100 text-red-800 border border-red-200'
    if (days <= 30) return 'bg-orange-100 text-orange-800 border border-orange-200'
    return 'bg-amber-100 text-amber-800 border border-amber-200'
  }

  async function handleSendRenewalEmail(lease) {
    const tenant = tenants.find((t) => t.id === lease.tenantId)
    const space = spaces.find((s) => s.id === lease.spaceId)
    const email = billingEmailFor(tenant, members)
    if (!email) { alert('No email on file for this company or its billing person.'); return }
    setSending(lease.id)
    try {
      const companyName = settings?.company?.name ?? 'Hexa Space'
      const contractNum = lease.contractNumber ?? `CON-${lease.id.slice(-3).toUpperCase()}`
      const expiryDate = parse(lease.endDate) ? format(parse(lease.endDate), 'dd MMM yyyy') : 'the end of your term'
      await sendEmail({
        to: email,
        subject: `Renewal notice — ${contractNum} expires ${expiryDate}`,
        tenantId: tenant.id, emailType: 'renewal',
        html: brandShell(
          bKicker('Renewal notice') +
          bH1('Time to renew.') +
          bP(`Hi ${tenant.contactName ?? tenant.businessName},`) +
          bP(`Your licence agreement for <strong style="color:#1a1a1a">${space?.unitNumber ?? 'your unit'}</strong> (${contractNum}) is due to expire on <strong style="color:#1a1a1a">${expiryDate}</strong>.`) +
          bP('We would love to continue our arrangement with you. Please get in touch to discuss renewal terms at your earliest convenience.') +
          bP(`Current monthly licence fee: <strong style="color:#1a1a1a">$${Number(lease.monthlyRent).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD + GST</strong>`) +
          bSmall('If you do not intend to renew, please provide written notice as per your agreement terms.'),
          { company: companyName, website: settings?.company?.website || 'hexaspace.com.au' },
        ),
        settings,
      })
      alert(`Renewal email sent to ${email}`)
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
    } finally {
      setSending(null)
    }
  }

  function handleOpenRenew(lease) {
    // One-click renewal: reuse the SAME space(s) and the SAME term length,
    // shifted to run for the following period (contiguous — starts the day after
    // the current term ends). Nothing to re-select.
    const start = parse(lease.startDate)
    const end = parse(lease.endDate)
    const newStartD = end ? addDays(end, 1) : today
    // Preserve the original term length (in months); default to 12 if unknown.
    const termMonths = (start && end) ? Math.max(1, differenceInMonths(addDays(end, 1), start)) : 12
    const newEndD = addDays(addMonths(newStartD, termMonths), -1) // day before the anniversary
    const newStart = format(newStartD, 'yyyy-MM-dd')
    const newEnd = format(newEndD, 'yyyy-MM-dd')

    // Always carry the space forward. Older leases keep the space at the top
    // level with no items[] — build an item from it so the space is pre-selected.
    const baseItems = (lease.items && lease.items.length)
      ? lease.items
      : [{ spaceId: lease.spaceId, deposit: lease.bondAmount ?? 0, steps: [{ listPrice: lease.monthlyRent ?? 0, discount: lease.discount ?? '' }] }]
    const items = baseItems.map((item) => ({
      ...item,
      steps: (item.steps && item.steps.length ? item.steps : [{ listPrice: lease.monthlyRent ?? 0, discount: lease.discount ?? '' }])
        .map((step) => ({ ...step, startDate: newStart, endDate: newEnd })),
    }))

    setRenewLease({
      ...lease,
      id: null, // will get new id
      previousContractId: lease.id,
      contractType: 'Renewal',
      signatureStatus: 'not_signed',
      startDate: newStart,
      endDate: newEnd,
      contractNumber: null, // will auto-generate
      items,
    })
  }

  function LeaseRow({ lease, daysLabel, badgeStyle }) {
    const tenant = tenants.find((t) => t.id === lease.tenantId)
    const space = spaces.find((s) => s.id === lease.spaceId)
    const isSending = sending === lease.id
    return (
      <tr className="border-b border-border last:border-0 hover:bg-muted/50">
        <td className="px-4 py-3 font-medium text-foreground">{tenant?.businessName ?? '—'}</td>
        <td className="px-4 py-3 text-muted-foreground">{billingEmailFor(tenant, members) || '—'}</td>
        <td className="px-4 py-3 text-muted-foreground">{tenant?.phone ?? '—'}</td>
        <td className="px-4 py-3 text-muted-foreground">{space?.unitNumber ?? '—'}</td>
        <td className="px-4 py-3 text-muted-foreground">{fmt(lease.endDate)}</td>
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
              className="flex items-center gap-1 text-xs border border-border rounded px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90"
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
        <h1 className="text-2xl font-bold text-foreground">Renewals</h1>
        <p className="text-sm text-muted-foreground mt-1">Leases expiring within 60 days — action required.</p>
      </div>

      {expiring.length === 0 && expired.length === 0 && pendingRenewal.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center text-green-800 text-sm font-medium">
          No leases expiring in the next 60 days.
        </div>
      )}

      {pendingRenewal.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
            Auto-Renewed — Pending Approval ({pendingRenewal.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            These leases rolled their term forward automatically because no non-renewal notice was given. Billing continues so no invoices are missed — approve to confirm, or decline to end the lease.
          </p>
          <div className="bg-card border border-indigo-200 rounded-xl shadow-sm overflow-hidden">
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
                    <tr key={lease.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium text-foreground">{tenant?.businessName ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{space?.unitNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmt(lease.endDate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lease.previousEndDate ? `from ${fmt(lease.previousEndDate)}` : '—'}
                        {lease.renewalCount ? ` · renewal #${lease.renewalCount}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => approveRenewal(lease)}
                            className="text-xs border border-border rounded px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90"
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
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
            Expiring Within 60 Days ({expiring.length})
          </h2>
          <div className="bg-card border border-amber-200 rounded-xl shadow-sm overflow-hidden">
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
                  const days = daysTo(lease.endDate) ?? 0
                  return <LeaseRow key={lease.id} lease={lease} daysLabel={`${days} days left`} badgeStyle={urgencyBadge(days)} />
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wide">
            Overdue / Not Renewed ({expired.length})
          </h2>
          <div className="bg-card border border-red-200 rounded-xl shadow-sm overflow-hidden">
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
                  const days = Math.abs(daysTo(lease.endDate) ?? 0)
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
            <div className="bg-card rounded-xl w-full max-w-4xl shadow-2xl relative">
              <button
                onClick={() => setRenewLease(null)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10"
              >
                <X size={20} />
              </button>
              <ContractForm
                editLease={renewLease}
                leases={leases}
                tenants={tenants}
                spaces={spaces}
                members={members}
                templates={templates ?? []}
                discounts={discounts ?? []}
                settings={settings}
                onSave={(data) => {
                  const created = addLease(data)
                  // Auto-expire the original lease
                  if (renewLease.previousContractId) {
                    updateLease(renewLease.previousContractId, { status: 'expired' })
                  }
                  // Send the renewal straight out for e-signature so it can't
                  // sit unsigned by mistake.
                  if (created && shouldAutoSendForSigning(created)) {
                    const tenant = tenants.find((t) => t.id === created.tenantId)
                    sendLeaseForSigning({ lease: created, tenant, members, settings, templates: templates ?? [], updateLease })
                      .catch((e) => console.error('Renewal e-sign send failed:', e))
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
