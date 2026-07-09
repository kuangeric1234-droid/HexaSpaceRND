import { useOutletContext, useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format, startOfMonth, endOfMonth } from 'date-fns'
import { Building2, Users, TrendingUp, AlertTriangle, DollarSign, Clock, CheckCircle, PenLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card.jsx'

function KPICard({ icon: Icon, label, value, sub, color = 'gray' }) {
  const tones = {
    gray:  'text-muted-foreground bg-muted',
    amber: 'text-amber-600 bg-amber-50',
    red:   'text-red-600 bg-red-50',
    green: 'text-green-600 bg-green-50',
    blue:  'text-blue-600 bg-blue-50',
  }
  const t = tones[color] ?? tones.gray
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className={`grid place-items-center h-8 w-8 rounded-lg ${t}`}>
            <Icon size={15} />
          </div>
        </div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-sm font-semibold text-foreground mb-3">{children}</h2>
}

function fmtAud(n) {
  return `$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
}

export default function Dashboard() {
  const { spaces, leases, tenants, invoices = [] } = useOutletContext()
  const navigate = useNavigate()

  // Contracts the client has signed that are waiting for the admin to countersign
  // (which activates the contract + membership).
  const awaitingCountersign = leases
    .filter((l) => l.signatureStatus === 'out_for_signature' && l.tenantSignedAt)
    .sort((a, b) => new Date(b.tenantSignedAt) - new Date(a.tenantSignedAt))

  const today = new Date()
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  const activeLeases = leases.filter((l) => l.status === 'active')
  const officeHasOccupant = (s) =>
    !!(s.occupantTenantId || s.occupantName ||
      leases.some((l) => l.spaceId === s.id && (l.status === 'active' || l.status === 'pending')))
  const occupiedSpaces = spaces.filter((s) => s.status === 'occupied')
  const vacantSpaces = spaces.filter((s) => s.status === 'vacant')
  const vacantOffices = spaces.filter((s) => s.type === 'office' && !officeHasOccupant(s))

  const floorRank = (f) => ({ l4: 0, l5: 1, l2: 2 }[f] ?? 9)
  const firstNum = (s) => { const m = String(s.unitNumber).match(/\d+/); return m ? +m[0] : 9999 }
  const officeList = spaces.filter((s) => s.type === 'office')
    .sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || firstNum(a) - firstNum(b))
  const officeOccupant = (s) => s.occupantTenantId
    ? (tenants.find((t) => t.id === s.occupantTenantId)?.businessName ?? '')
    : (s.occupantName || '')
  const occupancyRate = spaces.length ? Math.round((occupiedSpaces.length / spaces.length) * 100) : 0
  const mrr = activeLeases.reduce((sum, l) => sum + Number(l.monthlyRent || 0), 0)

  const collectedThisMonth = invoices.reduce((sum, inv) => {
    const monthPayments = (inv.payments ?? []).filter((p) => {
      const d = p.date ? new Date(p.date) : null
      return d && d >= monthStart && d <= monthEnd
    })
    return sum + monthPayments.reduce((s, p) => s + Number(p.amount), 0)
  }, 0)

  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue')
  const overdueAmount = overdueInvoices.reduce((sum, inv) => {
    const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
    const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    return sum + Math.max(0, sub * 1.1 - paid)
  }, 0)

  const expiringSoon = activeLeases.filter((l) => {
    // Leases already under notice / scheduled to terminate aren't renewals.
    if (l.noticeGiven || l.terminationScheduledFor || l.vacateDate || l.renewalDeclined) return false
    const days = differenceInDays(parseISO(l.endDate), today)
    return days >= 0 && days <= 60
  }).sort((a, b) => differenceInDays(parseISO(a.endDate), today) - differenceInDays(parseISO(b.endDate), today))

  const becomingAvailable = activeLeases
    .filter((l) => {
      const days = differenceInDays(parseISO(l.endDate), today)
      return days >= 0 && days <= 90
    })
    .map((l) => {
      const space = spaces.find((s) => s.id === l.spaceId)
      const tenant = tenants.find((t) => t.id === l.tenantId)
      const days = differenceInDays(parseISO(l.endDate), today)
      return { lease: l, space, tenant, days }
    })
    .sort((a, b) => a.days - b.days)

  const th = 'text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide'
  const tr = 'border-b border-border last:border-0'

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(today, 'EEEE, d MMMM yyyy')} · Hexa Space · Box Hill</p>
      </div>

      {/* Awaiting your countersignature — client has signed, activate to finalise */}
      {awaitingCountersign.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <PenLine size={16} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">
              {awaitingCountersign.length} contract{awaitingCountersign.length !== 1 ? 's' : ''} awaiting your countersignature
            </h2>
          </div>
          <div className="space-y-2">
            {awaitingCountersign.map((lease) => {
              const tenant = tenants.find((t) => t.id === lease.tenantId)
              const contractNum = lease.contractNumber ?? `CON-${lease.id?.slice(-3).toUpperCase()}`
              return (
                <div key={lease.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-card border border-amber-200 rounded-md px-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{tenant?.businessName ?? '—'} · {contractNum}</div>
                    <div className="text-xs text-muted-foreground">
                      Signed by {lease.tenantSignerName ?? 'the client'}{lease.tenantSignedAt ? ` on ${format(parseISO(lease.tenantSignedAt), 'dd/MM/yyyy')}` : ''} — countersign to activate the contract &amp; membership.
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/leases', { state: { openLeaseId: lease.id } })}
                    className="shrink-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded hover:bg-primary/90"
                  >
                    Review &amp; countersign →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Door access suspended for overdue accounts (clause 7(d) enforcement) */}
      {tenants.some((t) => t.saltoBlockedAt) && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800 mb-2">
            Door access suspended — {tenants.filter((t) => t.saltoBlockedAt).length} compan{tenants.filter((t) => t.saltoBlockedAt).length !== 1 ? 'ies' : 'y'} with overdue invoices
          </h2>
          <div className="flex flex-wrap gap-2">
            {tenants.filter((t) => t.saltoBlockedAt).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5 bg-card border border-red-200 rounded-md px-3 py-1.5 text-xs">
                <span className="font-medium text-foreground">{t.businessName}</span>
                <span className="text-muted-foreground">since {t.saltoBlockedAt}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-red-700 mt-2">Access restores automatically when their overdue balance clears. Suspension and restoration emails are sent to each company.</p>
        </div>
      )}

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 gap-4 mb-4 lg:grid-cols-4">
        <KPICard icon={Building2} label="Occupancy" value={`${occupancyRate}%`}
          sub={`${occupiedSpaces.length} occupied · ${vacantSpaces.length} vacant`} color="gray" />
        <KPICard icon={TrendingUp} label="MRR" value={fmtAud(mrr)}
          sub={`${activeLeases.length} active leases`} color="blue" />
        <KPICard icon={CheckCircle} label="Collected This Month" value={fmtAud(collectedThisMonth)}
          sub={format(today, 'MMMM yyyy')} color="green" />
        <KPICard icon={AlertTriangle} label="Overdue Amount" value={fmtAud(overdueAmount)}
          sub={`${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''} overdue`}
          color={overdueInvoices.length > 0 ? 'red' : 'gray'} />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        <KPICard icon={Users} label="Total Tenants" value={tenants.length}
          sub={`${activeLeases.length} active contracts`} color="gray" />
        <KPICard icon={Clock} label="Expiring in 60 Days" value={expiringSoon.length}
          sub="Requires renewal action" color={expiringSoon.length > 0 ? 'amber' : 'gray'} />
        <KPICard icon={DollarSign} label="Annual Run Rate" value={fmtAud(mrr * 12)}
          sub="Based on current MRR" color="gray" />
        <KPICard icon={Building2} label="Vacant Offices" value={vacantOffices.length}
          sub={vacantOffices.map((s) => s.unitNumber).join(', ') || 'All occupied'}
          color={vacantOffices.length > 0 ? 'green' : 'gray'} />
      </div>

      {/* MRR banner */}
      <div className="bg-primary text-primary-foreground rounded-xl p-6 mb-6 flex items-center justify-between shadow-sm">
        <div>
          <p className="text-sm text-primary-foreground/60 mb-1">Monthly Recurring Revenue</p>
          <p className="text-4xl font-semibold tracking-tight">
            {fmtAud(mrr)} <span className="text-lg font-normal text-primary-foreground/60">AUD + GST / month</span>
          </p>
          <p className="text-xs text-primary-foreground/50 mt-2">Annual run rate: {fmtAud(mrr * 12)}</p>
        </div>
        <div className="text-right hidden lg:block">
          <p className="text-sm text-primary-foreground/60">Collected this month</p>
          <p className="text-2xl font-semibold text-green-400">{fmtAud(collectedThisMonth)}</p>
          {overdueAmount > 0 && <p className="text-sm text-red-400 mt-1">{fmtAud(overdueAmount)} overdue</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue invoices */}
        {overdueInvoices.length > 0 && (
          <div>
            <SectionTitle>Overdue invoices</SectionTitle>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>{['Invoice', 'Tenant', 'Due', 'Amount'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {overdueInvoices.slice(0, 8).map((inv) => {
                    const tenant = tenants.find((t) => t.id === inv.tenantId)
                    const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
                    const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
                    const due = Math.max(0, sub * 1.1 - paid)
                    return (
                      <tr key={inv.id} className={tr}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{inv.number}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{tenant?.businessName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-red-600 text-xs">{inv.dueDate}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{fmtAud(due)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* Expiring leases */}
        {expiringSoon.length > 0 && (
          <div>
            <SectionTitle>Leases expiring soon</SectionTitle>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>{['Tenant', 'Space', 'Expiry', 'Days'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {expiringSoon.map((lease) => {
                    const tenant = tenants.find((t) => t.id === lease.tenantId)
                    const space = spaces.find((s) => s.id === lease.spaceId)
                    const days = differenceInDays(parseISO(lease.endDate), today)
                    return (
                      <tr key={lease.id} className={tr}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{tenant?.businessName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{space?.unitNumber ?? '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${days <= 14 ? 'bg-red-100 text-red-800' : days <= 30 ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'}`}>
                            {days}d
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>

      {/* Vacant private offices */}
      {vacantOffices.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Vacant offices — available now ({vacantOffices.length})</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {vacantOffices.map((space) => (
              <div key={space.id} className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                <div className="font-semibold text-green-900">{space.unitNumber}</div>
                <div className="text-xs text-green-700 mt-0.5 capitalize">{space.type}</div>
                <div className="text-xs text-green-600 mt-1">{fmtAud(space.monthlyRate)}/mo</div>
                {space.size && <div className="text-xs text-green-500 mt-0.5">{space.size}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Becoming available */}
      {becomingAvailable.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Becoming available — next 90 days</SectionTitle>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>{['Space', 'Current Tenant', 'Available From', 'Days', 'Monthly Rate'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {becomingAvailable.map(({ lease, space, tenant, days }) => (
                  <tr key={lease.id} className={tr}>
                    <td className="px-4 py-3 font-medium text-foreground">{space?.unitNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{tenant?.businessName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${days <= 30 ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-700'}`}>
                        {days}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtAud(space?.monthlyRate ?? lease.monthlyRent)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Offices — occupancy */}
      <div className="mt-6">
        <SectionTitle>Offices</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {officeList.map((space) => {
            const occ = officeOccupant(space)
            const occupied = officeHasOccupant(space)
            return (
              <div key={space.id} className={`rounded-xl border p-3 text-sm flex items-center justify-between gap-3 ${
                occupied ? 'border-transparent bg-primary text-primary-foreground' : 'border-green-200 bg-green-50 text-green-900'
              }`}>
                <div className="min-w-0">
                  <div className="font-semibold">{space.unitNumber}</div>
                  <div className={`text-xs mt-0.5 truncate ${occupied ? 'text-primary-foreground/60' : 'text-green-700'}`}>
                    {occ || 'Vacant'}
                  </div>
                </div>
                <div className={`text-xs whitespace-nowrap ${occupied ? 'text-primary-foreground/60' : 'text-green-600'}`}>
                  {fmtAud(space.monthlyRate)}/mo
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
