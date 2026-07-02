import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Pencil, Building2, Mail, Phone, Hash, Plus, FileDown, Send, MessageSquare, Users, CreditCard, Receipt, Trash2, User, UserPlus } from 'lucide-react'
import InvoiceForm from './InvoiceForm.jsx'
import DocumentsPanel from './DocumentsPanel.jsx'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase.js'
import { computeMonthlyAllowance, effectiveAllowance } from '../lib/credits.js'

const SIG_BADGE = {
  manually_signed:   { label: 'Signed',       cls: 'bg-green-100 text-green-700' },
  e_signed:          { label: 'E Signed',      cls: 'bg-green-100 text-green-700' },
  out_for_signature: { label: 'Out for Sig',   cls: 'bg-yellow-100 text-yellow-700' },
  not_signed:        { label: 'Not Signed',    cls: 'bg-red-100 text-red-700' },
}

const INV_STATUS = {
  pending: { label: 'Pending', cls: 'bg-orange-100 text-orange-700' },
  paid:    { label: 'Paid',    cls: 'bg-green-100 text-green-700' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
  voided:  { label: 'Voided',  cls: 'bg-gray-100 text-gray-500' },
}

function Badge({ label, cls }) {
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${cls}`}>{label}</span>
}

function fmt(d) {
  try { return format(parseISO(d), 'dd MMM yyyy') } catch { return d ?? '—' }
}

function fmtAud(n) {
  return `$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
}

// Per-company portal invite: checks the member-portal status for the company's
// email, then sends an invite (or reports it's already invited/active).
function PortalInviteButton({ email }) {
  const [state, setState] = useState('idle') // idle | working | invited | active | error
  if (!email) return null
  async function invite() {
    setState('working')
    try {
      const st = await fetch(`/api/portal/status?email=${encodeURIComponent(email)}`).then((r) => r.json()).catch(() => ({}))
      if (st.status === 'active') { setState('active'); return }
      if (st.status === 'invited') { setState('invited'); return }
      const res = await fetch('/api/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setState(res.ok ? 'invited' : 'error')
    } catch { setState('error') }
  }
  const label = state === 'working' ? 'Inviting…'
    : state === 'invited' ? 'Invite sent'
    : state === 'active' ? 'On portal'
    : state === 'error' ? 'Retry invite'
    : 'Invite to portal'
  const done = state === 'invited' || state === 'active'
  return (
    <button onClick={invite} disabled={state === 'working' || done}
      className={`flex items-center gap-1.5 text-xs rounded px-3 py-1.5 border ${done ? 'border-green-300 text-green-700 bg-green-50' : 'border-blue-300 text-blue-600 hover:bg-blue-50'} disabled:opacity-70`}>
      <UserPlus size={13} /> {label}
    </button>
  )
}

function Section({ title, action, children }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function TenantProfile({ tenant, leases, invoices, spaces, settings, members = [], addMember, updateMember, deleteMember, addLease, updateLease, updateTenant, onBack, onEdit, onSelectInvoice, onSelectContract, onAddInvoice }) {
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [memberModal, setMemberModal] = useState(null)   // null | {} (new) | member (edit)
  const [showMembership, setShowMembership] = useState(false)
  const tenantLeases = leases.filter((l) => l.tenantId === tenant.id)
  const companyMembers = members.filter((m) => m.companyId === tenant.id)

  // Booking-credit allowance (company pool). Computed from active memberships;
  // an admin can override the monthly allowance or top up the remaining balance.
  const computedAllowance = computeMonthlyAllowance(tenant.id, leases, spaces)
  const effAllowance = effectiveAllowance(tenant, computedAllowance)
  const creditsRemaining = Number(tenant.creditsRemaining ?? effAllowance)

  function generateStatement() {
    const taxRate = (settings?.billingRules?.taxRate ?? 10) / 100
    const companyName = settings?.billing?.businessName ?? settings?.company?.name ?? 'Hexa Space Pty Ltd'
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const ml = 15, mr = W - 15
    let y = 20

    doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text('STATEMENT OF ACCOUNT', ml, y); y += 8
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
    doc.text(`Prepared: ${format(new Date(), 'dd/MM/yyyy')}`, ml, y)
    doc.text(companyName, mr, y, { align: 'right' }); y += 10

    doc.setDrawColor(0); doc.setLineWidth(0.4)
    doc.line(ml, y, mr, y); y += 6

    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text('To:', ml, y)
    doc.setFont('helvetica', 'normal')
    doc.text(tenant.businessName ?? '', ml + 8, y); y += 5
    if (tenant.contactName) { doc.text(tenant.contactName, ml + 8, y); y += 5 }
    if (tenant.email) { doc.text(tenant.email, ml + 8, y); y += 5 }
    y += 5

    // Table header
    const cols = { num: ml, date: ml + 28, due: ml + 58, period: ml + 88, status: ml + 130, amount: mr }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60)
    doc.text('Invoice', cols.num, y)
    doc.text('Issue Date', cols.date, y)
    doc.text('Due Date', cols.due, y)
    doc.text('Period', cols.period, y)
    doc.text('Status', cols.status, y)
    doc.text('Amount', cols.amount, y, { align: 'right' })
    y += 2
    doc.setLineWidth(0.3); doc.setDrawColor(180)
    doc.line(ml, y, mr, y); y += 5

    const tInvoices = invoices.filter((inv) => inv.tenantId === tenant.id && inv.status !== 'voided')
    let totalInvoiced = 0, totalPaid = 0

    for (const inv of tInvoices) {
      if (y > H - 30) { doc.addPage(); y = 20 }
      const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
      const gst = inv.vatEnabled !== false ? Math.round(sub * taxRate * 100) / 100 : 0
      const total = sub + gst
      const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      totalInvoiced += total; totalPaid += paid

      doc.setFont('helvetica', 'normal'); doc.setTextColor(0); doc.setFontSize(8)
      doc.text(inv.number ?? '', cols.num, y)
      doc.text(inv.issueDate ?? '', cols.date, y)
      doc.text(inv.dueDate ?? '', cols.due, y)
      const period = inv.periodStart ? `${inv.periodStart.slice(0, 7)}` : (inv.invoiceType === 'deposit' ? 'Deposit' : '—')
      doc.text(period, cols.period, y)
      doc.setTextColor(inv.status === 'overdue' ? 180 : inv.status === 'paid' ? 0 : 80, 0, 0)
      doc.text(inv.status?.toUpperCase() ?? '', cols.status, y)
      doc.setTextColor(0)
      doc.text(`$${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, cols.amount, y, { align: 'right' })
      y += 6

      // Show payments
      for (const pay of (inv.payments ?? [])) {
        if (y > H - 30) { doc.addPage(); y = 20 }
        doc.setTextColor(0, 120, 0); doc.setFontSize(7.5)
        doc.text(`  Payment received ${pay.date ?? ''} — ${pay.method ?? ''}`, cols.num, y)
        doc.text(`-$${Number(pay.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, cols.amount, y, { align: 'right' })
        doc.setTextColor(0)
        y += 5
      }
    }

    // Totals
    y += 4; doc.setLineWidth(0.4); doc.setDrawColor(0)
    doc.line(ml + 80, y, mr, y); y += 5
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Total Invoiced:', ml + 80, y)
    doc.text(`$${totalInvoiced.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, mr, y, { align: 'right' }); y += 5
    doc.text('Total Paid:', ml + 80, y)
    doc.text(`$${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, mr, y, { align: 'right' }); y += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Balance Outstanding:', ml + 80, y)
    doc.text(`$${Math.max(0, totalInvoiced - totalPaid).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, mr, y, { align: 'right' })

    const slug = (tenant.businessName ?? 'tenant').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    doc.save(`Statement_${slug}_${format(new Date(), 'yyyy-MM-dd')}.pdf`)
  }


  const tenantInvoices = invoices.filter((inv) => inv.tenantId === tenant.id)
  const taxRate = (settings?.billingRules?.taxRate ?? 10) / 100

  const activeLeases = tenantLeases.filter((l) => l.status === 'active')
  const mrr = activeLeases.reduce((s, l) => s + (Number(l.monthlyRent) || 0), 0)

  const depositInvoices = tenantInvoices.filter((inv) => inv.invoiceType === 'deposit' && inv.status !== 'voided')
  const depositHeld = depositInvoices
    .filter((inv) => inv.status !== 'paid')
    .reduce((s, inv) => s + (inv.lineItems ?? []).reduce((a, l) => a + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0), 0)

  const signedLeases = tenantLeases.filter((l) => ['manually_signed', 'e_signed'].includes(l.signatureStatus))
  const oneOffFees = signedLeases.map((lease) => {
    const bondAmount = lease.items?.[0]?.deposit ?? lease.bondAmount ?? 0
    if (!bondAmount) return null
    const space = spaces.find((s) => s.id === lease.spaceId)
    const depInv = tenantInvoices.find((inv) => inv.leaseId === lease.id && inv.invoiceType === 'deposit' && inv.status !== 'voided')
    let status, statusCls
    if (!depInv) { status = 'Not Invoiced'; statusCls = 'bg-gray-100 text-gray-500' }
    else if (depInv.status === 'paid') { status = 'Paid'; statusCls = 'bg-green-100 text-green-700' }
    else { status = 'Invoiced'; statusCls = 'bg-blue-100 text-blue-700' }
    return {
      id: lease.id,
      name: `Security Deposit — ${space?.unitNumber ?? lease.spaceId}`,
      contract: lease.contractNumber ?? `CON-${lease.id.slice(-3).toUpperCase()}`,
      amount: bondAmount, date: lease.startDate, status, statusCls,
      invoiceNumber: depInv?.number ?? null, invoiceId: depInv?.id ?? null,
    }
  }).filter(Boolean)

  return (
    <>
    <div className="flex flex-col h-full bg-muted/50">
      {/* Header */}
      <div className="bg-card border-b border-border px-8 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft size={15} /> Tenants
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-foreground">{tenant.businessName}</span>
          </div>
          <div className="flex items-center gap-2">
            <PortalInviteButton email={tenant.email} />
            <button onClick={generateStatement} className="flex items-center gap-1.5 text-xs border border-input rounded px-3 py-1.5 hover:bg-muted/50 text-muted-foreground">
              <FileDown size={13} /> Statement PDF
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 text-xs border border-input rounded px-3 py-1.5 hover:bg-muted/50 text-muted-foreground">
              <Pencil size={13} /> Edit Details
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — fixed sidebar */}
        <aside className="w-60 shrink-0 bg-card border-r border-border overflow-y-auto p-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Building2 size={28} className="text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-center font-bold text-foreground text-sm mb-1">{tenant.businessName}</h2>
          {tenant.email && <p className="text-center text-xs text-muted-foreground mb-5 break-all">{tenant.email}</p>}

          <div className="space-y-3 text-xs text-muted-foreground">
            {tenant.contactName && <Row label="Contact">{tenant.contactName}</Row>}
            {tenant.phone && <Row icon={<Phone size={11} />}>{tenant.phone}</Row>}
            {tenant.abn && <Row icon={<Hash size={11} />}>ABN: {tenant.abn}</Row>}
            {tenant.industry && <Row label="Industry">{tenant.industry}</Row>}
            {tenant.country && <Row label="Country">{tenant.country}</Row>}
            {tenant.createdAt && <Row label="Since">{fmt(tenant.createdAt)}</Row>}
          </div>

          {/* Portal status */}
          <PortalSidebarStatus email={tenant.email} />
        </aside>

        {/* Scrollable main content */}
        <div className="flex-1 overflow-y-auto">
          {/* Stats bar */}
          <div className="bg-card border-b border-border px-8 py-5 grid grid-cols-4 gap-6 shrink-0">
            {[
              ['MRR', fmtAud(mrr)],
              ['Active Contracts', activeLeases.length],
              ['Total Invoices', tenantInvoices.filter((i) => i.status !== 'voided').length],
              ['Deposit Held', fmtAud(depositHeld)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="p-8 space-y-6">

            {/* ── Active Contracts ── */}
            <Section title="Active Contracts">
              {activeLeases.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No active contracts.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {activeLeases.map((l) => {
                      const space = spaces.find((s) => s.id === l.spaceId)
                      return (
                        <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => onSelectContract?.(l)}>
                          <td className="px-5 py-3 font-medium text-foreground">{l.contractNumber ?? `CON-${l.id.slice(-3).toUpperCase()}`}</td>
                          <td className="px-5 py-3 text-muted-foreground">{space?.unitNumber ?? '—'}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">{fmt(l.startDate)} – {fmt(l.endDate)}</td>
                          <td className="px-5 py-3 text-right font-medium text-foreground">{fmtAud(l.monthlyRent)}/mo</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Booking Credits ── */}
            <Section title="Booking Credits">
              <CreditsCard
                tenant={tenant}
                computed={computedAllowance}
                effAllowance={effAllowance}
                remaining={creditsRemaining}
                updateTenant={updateTenant}
              />
            </Section>

            {/* ── Members ── */}
            <Section title="Members" action={
              <button onClick={() => setMemberModal({})} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 font-medium">
                <Plus size={12} /> Add member
              </button>
            }>
              {companyMembers.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted-foreground">No members yet. Add the people who work under this company.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {['Name', 'Email', 'Roles', 'Status', ''].map((h) => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {companyMembers.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User size={13} className="text-muted-foreground" /></span>
                            <span className="font-medium text-foreground">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{m.email || '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {m.contactPerson && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700"><CreditCard size={10} /> Contact</span>}
                            {m.billingPerson && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700"><Receipt size={10} /> Billing</span>}
                            {!m.contactPerson && !m.billingPerson && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge label={m.status && m.status !== 'Auto' ? m.status : 'Active'} cls={(m.status === 'Inactive' || m.status === 'inactive') ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'} />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setMemberModal(m)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                            <button onClick={() => { if (window.confirm(`Remove ${m.name}?`)) deleteMember?.(m.id) }} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Memberships ── */}
            <Section title="Memberships" action={
              <button onClick={() => setShowMembership(true)} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 font-medium">
                <Plus size={12} /> Add membership
              </button>
            }>
              {tenantLeases.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted-foreground">No memberships. Add a desk/office plan, or sign a contract to enrol automatically.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {['Plan', 'Member', 'Status', 'Period', 'Price'].map((h) => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenantLeases.map((l) => {
                      const space = spaces.find((s) => s.id === l.spaceId)
                      const plan = l.membershipType || l.planName || 'Private Office'
                      const fromContract = l.contractNumber && !/^membership$/i.test(l.source || '')
                      return (
                        <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => onSelectContract?.(l)}>
                          <td className="px-5 py-3">
                            <div className="font-medium text-foreground">{plan}</div>
                            <div className="text-xs text-muted-foreground">{space?.unitNumber ?? (fromContract ? l.contractNumber : 'Hexa Space')}</div>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">{l.memberName || tenant.contactName || '—'}</td>
                          <td className="px-5 py-3">
                            <Badge label={l.status} cls={l.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} />
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">{fmt(l.startDate)} – {fmt(l.endDate)}<br /><span className="text-muted-foreground">{l.contractType || 'Month-to-Month'}</span></td>
                          <td className="px-5 py-3 font-medium text-foreground">{fmtAud(l.monthlyRent)}/mo</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── One-off Fees (Deposits) ── */}
            <Section title="One-off Fees">
              {oneOffFees.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted-foreground">No one-off fees. Deposits appear here once a contract is signed.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {['Name', 'Contract', 'Date', 'Amount', 'Status', 'Invoice'].map((h) => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {oneOffFees.map((fee) => (
                      <tr key={fee.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-5 py-3 font-medium text-foreground">{fee.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{fee.contract}</td>
                        <td className="px-5 py-3 text-muted-foreground">{fmt(fee.date)}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{fmtAud(fee.amount)}</td>
                        <td className="px-5 py-3"><Badge label={fee.status} cls={fee.statusCls} /></td>
                        <td className="px-5 py-3">
                          {fee.invoiceNumber ? (
                            <button onClick={() => { const inv = tenantInvoices.find((i) => i.id === fee.invoiceId); if (inv) onSelectInvoice?.(inv) }}
                              className="text-blue-600 hover:underline text-xs font-medium">{fee.invoiceNumber}</button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── All Contracts ── */}
            <Section title="Contracts">
              {tenantLeases.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted-foreground">No contracts.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {['Number', 'Document Type', 'Status', 'Signature', 'Period', 'Monthly'].map((h) => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenantLeases.map((l) => {
                      const sig = SIG_BADGE[l.signatureStatus] ?? SIG_BADGE.not_signed
                      const space = spaces.find((s) => s.id === l.spaceId)
                      return (
                        <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => onSelectContract?.(l)}>
                          <td className="px-5 py-3 font-medium text-foreground">{l.contractNumber ?? `CON-${l.id.slice(-3).toUpperCase()}`}</td>
                          <td className="px-5 py-3 text-muted-foreground">{l.documentType ?? 'License Agreement'}</td>
                          <td className="px-5 py-3">
                            <Badge label={l.status} cls={l.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} />
                          </td>
                          <td className="px-5 py-3"><Badge label={sig.label} cls={sig.cls} /></td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">
                            {fmt(l.startDate)} – {fmt(l.endDate)}<br />
                            <span className="text-muted-foreground">{space?.unitNumber ?? ''}</span>
                          </td>
                          <td className="px-5 py-3 font-medium text-foreground">{fmtAud(l.monthlyRent)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Invoices ── */}
            <Section title="Invoices" action={
              <button
                onClick={() => setShowInvoiceForm(true)}
                className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 font-medium"
              >
                <Plus size={12} /> Add Invoice
              </button>
            }>
              {tenantInvoices.length === 0 ? (
                <p className="px-5 py-5 text-sm text-muted-foreground">No invoices.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {['Number', 'Status', 'Sent', 'Issue Date', 'Due Date', 'Period', 'Amount'].map((h) => (
                        <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenantInvoices.map((inv) => {
                      const meta = INV_STATUS[inv.status] ?? { label: inv.status, cls: 'bg-gray-100 text-gray-600' }
                      const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
                      return (
                        <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => onSelectInvoice?.(inv)}>
                          <td className="px-5 py-3 font-medium text-foreground">{inv.number}</td>
                          <td className="px-5 py-3"><Badge label={meta.label} cls={meta.cls} /></td>
                          <td className="px-5 py-3">
                            <Badge label={inv.sentStatus === 'sent' ? 'Sent' : 'Not Sent'} cls={inv.sentStatus === 'sent' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} />
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">{fmt(inv.issueDate)}</td>
                          <td className="px-5 py-3 text-muted-foreground">{fmt(inv.dueDate)}</td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">
                            {inv.periodStart ? `${fmt(inv.periodStart)} – ${fmt(inv.periodEnd)}` : inv.invoiceType === 'deposit' ? 'Deposit' : '—'}
                          </td>
                          <td className="px-5 py-3 font-medium text-foreground">{fmtAud(sub * (1 + taxRate))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Portal Access ── */}
            <PortalAccessSection email={tenant.email} />

            {/* ── Documents ── */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <DocumentsPanel tenantId={tenant.id} title="Documents" />
            </div>

            {/* ── Portal Messages ── */}
            <PortalMessagesAdmin tenantId={tenant.id} />

          </div>
        </div>
      </div>
    </div>

    {showInvoiceForm && (() => {
      // Pre-fill uninvoiced deposits as line items
      const tenantInvoicesNow = invoices.filter((inv) => inv.tenantId === tenant.id)
      const depositLines = tenantLeases
        .filter((l) => ['manually_signed', 'e_signed'].includes(l.signatureStatus))
        .filter((l) => {
          const bond = l.items?.[0]?.deposit ?? l.bondAmount ?? 0
          if (!bond) return false
          return !tenantInvoicesNow.some((inv) => inv.leaseId === l.id && inv.invoiceType === 'deposit' && inv.status !== 'voided')
        })
        .map((l) => {
          const bond = l.items?.[0]?.deposit ?? l.bondAmount ?? 0
          const space = spaces.find((s) => s.id === l.spaceId)
          return {
            id: `li${Date.now()}_${l.id}`,
            description: `Security Deposit — ${space?.unitNumber ?? l.spaceId} (${l.contractNumber ?? `CON-${l.id.slice(-3).toUpperCase()}`})`,
            revenueAccount: 'Security Deposit',
            unitPrice: bond,
            qty: 1,
            discountPct: 0,
            vatExempt: true,
          }
        })
      return (
        <InvoiceForm
          invoices={invoices}
          tenants={[tenant]}
          leases={leases}
          spaces={spaces}
          settings={settings}
          taxRatePct={settings?.billingRules?.taxRate ?? 10}
          defaultTenantId={tenant.id}
          defaultLineItems={depositLines.length > 0 ? depositLines : null}
          defaultInvoiceType={depositLines.length > 0 ? 'deposit' : null}
          onSave={(data) => {
            onAddInvoice?.(data)
            setShowInvoiceForm(false)
          }}
          onClose={() => setShowInvoiceForm(false)}
        />
      )
    })()}

    {memberModal && (
      <MemberModal
        member={memberModal.id ? memberModal : null}
        tenant={tenant}
        onClose={() => setMemberModal(null)}
        onSave={(data) => {
          if (memberModal.id) updateMember?.(memberModal.id, data)
          else addMember?.({ ...data, companyId: tenant.id })
          setMemberModal(null)
        }}
      />
    )}

    {showMembership && (
      <MembershipModal
        tenant={tenant}
        members={companyMembers}
        onClose={() => setShowMembership(false)}
        onSave={(data) => {
          addLease?.(data)
          setShowMembership(false)
        }}
      />
    )}
    </>
  )
}

// ── Add / edit a member (person) under a company ──────────────────────────────
function MemberModal({ member, tenant, onClose, onSave }) {
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    contactPerson: member?.contactPerson ?? false,
    billingPerson: member?.billingPerson ?? false,
    status: member?.status ?? 'Auto',
  })
  const ic = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">{member ? 'Edit member' : 'Add member'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Name *</span>
            <input value={form.name} onChange={set('name')} placeholder="Full name" className={ic} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Company</span>
            <input value={tenant.businessName} disabled className={`${ic} bg-muted/50 text-muted-foreground`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Email</span>
              <input value={form.email} onChange={set('email')} placeholder="name@company.com" className={ic} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Phone</span>
              <input value={form.phone} onChange={set('phone')} placeholder="+61…" className={ic} />
            </label>
          </div>

          <div className="space-y-3 bg-muted/50 rounded-md p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.checked }))} className="mt-0.5" />
              <span>
                <span className="text-sm font-medium text-foreground">Contact Person</span>
                <span className="block text-xs text-muted-foreground">Can pay by card and add members into the portal.</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={form.billingPerson} onChange={(e) => setForm((f) => ({ ...f, billingPerson: e.target.checked }))} className="mt-0.5" />
              <span>
                <span className="text-sm font-medium text-foreground">Billing Person</span>
                <span className="block text-xs text-muted-foreground">Receives invoices by email.</span>
              </span>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Status</span>
            <select value={form.status} onChange={set('status')} className={ic}>
              <option value="Auto">Auto</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <span className="block text-xs text-muted-foreground mt-1">Auto: calculated from their memberships.</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
          <button onClick={() => form.name.trim() && onSave(form)} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">{member ? 'Save' : 'Add member'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Booking-credit allowance card ───────────────────────────────────────────────
// Shows the company's monthly meeting-room credit pool. Allowance auto-computes
// from active memberships (Flexible Desk 4 · Dedicated Desk 8 · Private Office
// 5/pax); an admin can override it or top up the remaining balance for this month.
function CreditsCard({ tenant, computed, effAllowance, remaining, updateTenant }) {
  const hasOverride = tenant.creditAllowanceOverride === 0 || !!tenant.creditAllowanceOverride
  const [allowance, setAllowance] = useState(String(effAllowance))
  const [rem, setRem] = useState(String(remaining))
  const [saved, setSaved] = useState(false)

  function save() {
    const a = Number(allowance)
    const r = Number(rem)
    const patch = {
      creditAllowanceOverride: Number.isFinite(a) ? a : undefined,
      monthlyAllowance: Number.isFinite(a) ? a : effAllowance,
      creditsRemaining: Number.isFinite(r) ? r : remaining,
    }
    updateTenant?.(tenant.id, patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  function resetToComputed() {
    setAllowance(String(computed))
    setRem(String(computed))
    updateTenant?.(tenant.id, { creditAllowanceOverride: undefined, monthlyAllowance: computed, creditsRemaining: computed })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const input = 'w-28 border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Monthly allowance</label>
          <input type="number" min="0" step="0.5" value={allowance} onChange={(e) => setAllowance(e.target.value)} className={input} />
          <span className="text-xs text-muted-foreground ml-2">credits{hasOverride ? ' · overridden' : ' · auto'}</span>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Remaining this month</label>
          <input type="number" min="0" step="0.5" value={rem} onChange={(e) => setRem(e.target.value)} className={input} />
          <span className="text-xs text-muted-foreground ml-2">of {effAllowance}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium hover:bg-primary/90">
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={resetToComputed} className="text-xs text-muted-foreground hover:text-foreground underline">
            Reset to plan
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        From active memberships: <span className="font-medium text-foreground">{computed} credits/mo</span>. Bookings deduct from Remaining; overage is billed as a fee on the month-end invoice. Resets on the 1st.
      </p>
    </div>
  )
}

// ── Add a membership (desk / office / virtual) — stored as a lease so it bills ──
const MEMBERSHIP_PLANS = [
  { key: 'Flexible Desk',  price: 300 },
  { key: 'Dedicated Desk', price: 600 },
  { key: 'Private Office', price: 0 },
  { key: 'Virtual Office', price: 150 },
]

function MembershipModal({ tenant, members, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ plan: 'Dedicated Desk', memberId: '', price: 600, startDate: today, endDate: '' })
  const ic = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  function pickPlan(plan) {
    const def = MEMBERSHIP_PLANS.find((p) => p.key === plan)
    setForm((f) => ({ ...f, plan, price: def ? def.price : f.price }))
  }
  function save() {
    const price = Number(form.price) || 0
    const member = members.find((m) => m.id === form.memberId)
    onSave({
      tenantId: tenant.id,
      companyName: tenant.businessName,
      memberId: form.memberId || undefined,
      memberName: member?.name || undefined,
      membershipType: form.plan,
      planName: form.plan,
      monthlyRent: price,
      total: price,
      status: 'active',
      contractType: 'Month-to-month',
      documentType: 'Membership',
      signatureStatus: 'not_signed',
      source: 'membership',
      location: 'Hexa Space',
      startDate: form.startDate,
      endDate: form.endDate || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">Add membership</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">Plan</span>
            <div className="grid grid-cols-2 gap-2">
              {MEMBERSHIP_PLANS.map((p) => (
                <button key={p.key} type="button" onClick={() => pickPlan(p.key)}
                  className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${form.plan === p.key ? 'border-primary bg-primary text-primary-foreground' : 'border-input hover:bg-muted/50 text-foreground'}`}>
                  {p.key}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Assign to member (optional)</span>
            <select value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))} className={ic}>
              <option value="">— Company (unassigned) —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1">Price (AUD / month, ex GST)</span>
            <input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={ic} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1">Start date</span>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={ic} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1">End date (optional)</span>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={ic} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Enrols {tenant.businessName} on this plan and bills it monthly. Signing an office contract creates a membership automatically.</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Add membership</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, icon, children }) {
  return (
    <div className="flex items-start gap-2">
      {icon ? <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span> : <span className="text-muted-foreground uppercase font-semibold w-14 shrink-0 text-[10px] mt-0.5">{label}</span>}
      <span>{children}</span>
    </div>
  )
}

function PortalSidebarStatus({ email }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!email) return
    fetch(`/api/portal/status?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setStatus(d.status))
      .catch(() => setStatus(null))
  }, [email])

  if (!status || status === 'not_invited') return null

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <MessageSquare size={10} /> Portal Access
      </div>
      {status === 'active' ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Active Member
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
          Invited
        </span>
      )}
    </div>
  )
}

function PortalAccessSection({ email }) {
  const [portalStatus, setPortalStatus] = useState(null) // null | 'not_invited' | 'invited' | 'active'
  const [inviteStatus, setInviteStatus] = useState('idle') // idle | sending | sent | error

  useEffect(() => {
    if (!email) return
    fetch(`/api/portal/status?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setPortalStatus(d.status))
      .catch(() => setPortalStatus('not_invited'))
  }, [email])

  async function sendInvite() {
    setInviteStatus('sending')
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setInviteStatus('sent')
        setPortalStatus('invited')
      } else {
        setInviteStatus('error')
      }
    } catch {
      setInviteStatus('error')
    }
    setTimeout(() => setInviteStatus('idle'), 4000)
  }

  const badge = {
    active:       <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Active Member</span>,
    invited:      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">Invited — Pending</span>,
    not_invited:  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Not Invited</span>,
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/50">
        <MessageSquare size={13} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Portal Access</span>
      </div>
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">members.hexaspace.com.au</div>
          {portalStatus === null
            ? <span className="text-xs text-muted-foreground">Checking…</span>
            : badge[portalStatus]}
          {portalStatus === 'active' && (
            <p className="text-xs text-muted-foreground mt-1.5">Member has signed in to the portal.</p>
          )}
          {portalStatus === 'invited' && (
            <p className="text-xs text-muted-foreground mt-1.5">Invite sent — awaiting first login.</p>
          )}
          {portalStatus === 'not_invited' && (
            <p className="text-xs text-muted-foreground mt-1.5">This member has not been invited yet.</p>
          )}
        </div>

        {/* Only show invite/resend if not yet active */}
        {portalStatus !== 'active' && portalStatus !== null && (
          <button
            onClick={sendInvite}
            disabled={inviteStatus === 'sending' || !email}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded border border-input hover:bg-muted/50 text-foreground disabled:opacity-50"
          >
            {inviteStatus === 'sent'    ? '✓ Sent!'
             : inviteStatus === 'error' ? 'Failed — retry'
             : inviteStatus === 'sending' ? 'Sending…'
             : portalStatus === 'invited' ? 'Resend Invite'
             : 'Invite to Portal'}
          </button>
        )}
      </div>
    </div>
  )
}

function PortalMessagesAdmin({ tenantId }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!open) return
    load()
    const channel = supabase
      .channel(`portal_msgs_admin_${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_messages' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [open, tenantId])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function load() {
    const { data } = await supabase.from('portal_messages').select('data')
    const all = (data ?? []).map(r => r.data).filter(m => m.tenantId === tenantId)
    all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    setMessages(all)
    // mark unread (from tenant) as read by admin
    for (const m of all.filter(m => m.sender === 'tenant' && !m.readByAdmin)) {
      supabase.from('portal_messages').upsert({ id: m.id, data: { ...m, readByAdmin: true } })
    }
  }

  async function sendReply(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tenantId,
      sender: 'admin',
      content: text.trim(),
      timestamp: new Date().toISOString(),
      readByAdmin: true,
      readByTenant: false,
    }
    await supabase.from('portal_messages').insert({ id: msg.id, data: msg })
    setText('')
    setSending(false)
  }

  const unread = messages.filter(m => m.sender === 'tenant' && !m.readByAdmin).length

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/50 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare size={15} className="text-muted-foreground" />
          Portal Messages
          {unread > 0 && !open && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Collapse' : 'Expand'}</span>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4">
          {/* Thread */}
          <div className="h-64 overflow-y-auto space-y-3 mb-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No messages yet.
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs px-3 py-2 rounded-xl text-sm ${
                  msg.sender === 'admin'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  <p className="leading-relaxed whitespace-pre-wrap text-xs">{msg.content}</p>
                  <p className="text-xs mt-1 opacity-60">
                    {msg.sender === 'admin' ? 'You' : 'Member'} ·{' '}
                    {(() => { try { return format(parseISO(msg.timestamp), 'dd/MM h:mm a') } catch { return '' } })()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          {/* Reply form */}
          <form onSubmit={sendReply} className="flex gap-2">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Reply to member…"
              className="flex-1 border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="bg-primary text-primary-foreground px-3 py-2 rounded hover:bg-primary/90 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
