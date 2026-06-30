import { useOutletContext } from 'react-router-dom'
import { differenceInDays, parseISO, format, startOfMonth, endOfMonth } from 'date-fns'
import { Building2, Users, TrendingUp, AlertTriangle, DollarSign, Clock, CheckCircle } from 'lucide-react'

function KPICard({ icon: Icon, label, value, sub, accent, color = 'gray' }) {
  const colors = {
    gray:   { border: 'border-gray-200',   bg: 'bg-gray-50',   icon: 'text-gray-500'   },
    amber:  { border: 'border-amber-300',  bg: 'bg-amber-50',  icon: 'text-amber-600'  },
    red:    { border: 'border-red-300',    bg: 'bg-red-50',    icon: 'text-red-600'    },
    green:  { border: 'border-green-300',  bg: 'bg-green-50',  icon: 'text-green-600'  },
    blue:   { border: 'border-blue-300',   bg: 'bg-blue-50',   icon: 'text-blue-600'   },
  }
  const c = colors[color] ?? colors.gray
  return (
    <div className={`bg-white rounded-md border ${c.border} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`p-2 rounded-md ${c.bg}`}>
          <Icon size={16} className={c.icon} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function fmtAud(n) {
  return `$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
}

export default function Dashboard() {
  const { spaces, leases, tenants, invoices = [] } = useOutletContext()

  const today = new Date()
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  const activeLeases = leases.filter((l) => l.status === 'active')
  const occupiedSpaces = spaces.filter((s) => s.status === 'occupied')
  const vacantSpaces = spaces.filter((s) => s.status === 'vacant')
  // Vacant-space widgets list private offices only — meeting rooms, virtual
  // offices, desks etc. aren't leased month-to-month the same way.
  const vacantOffices = vacantSpaces.filter((s) => s.type === 'office')

  // Offices in chronological order: Office 1–10 (L4), 11–15 (L5), then Suite 1–30 (L2).
  const floorRank = (f) => ({ l4: 0, l5: 1, l2: 2 }[f] ?? 9)
  const firstNum = (s) => { const m = String(s.unitNumber).match(/\d+/); return m ? +m[0] : 9999 }
  const officeList = spaces.filter((s) => s.type === 'office')
    .sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || firstNum(a) - firstNum(b))
  const officeOccupant = (s) => s.occupantTenantId
    ? (tenants.find((t) => t.id === s.occupantTenantId)?.businessName ?? '')
    : (s.occupantName || '')
  const occupancyRate = spaces.length ? Math.round((occupiedSpaces.length / spaces.length) * 100) : 0
  const mrr = activeLeases.reduce((sum, l) => sum + Number(l.monthlyRent || 0), 0)

  // Cash collected this month (payments recorded in this calendar month)
  const collectedThisMonth = invoices.reduce((sum, inv) => {
    const monthPayments = (inv.payments ?? []).filter((p) => {
      const d = p.date ? new Date(p.date) : null
      return d && d >= monthStart && d <= monthEnd
    })
    return sum + monthPayments.reduce((s, p) => s + Number(p.amount), 0)
  }, 0)

  // Overdue invoices
  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue')
  const overdueAmount = overdueInvoices.reduce((sum, inv) => {
    const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
    const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    return sum + Math.max(0, sub * 1.1 - paid)
  }, 0)

  // Expiring leases
  const expiringSoon = activeLeases.filter((l) => {
    const days = differenceInDays(parseISO(l.endDate), today)
    return days >= 0 && days <= 60
  }).sort((a, b) => differenceInDays(parseISO(a.endDate), today) - differenceInDays(parseISO(b.endDate), today))

  // Spaces becoming available in next 90 days (active lease ending)
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

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{format(today, 'EEEE, d MMMM yyyy')} · Hexa Space · Box Hill</p>
      </div>

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
      <div className="bg-black text-white rounded-md p-6 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">Monthly Recurring Revenue</p>
          <p className="text-4xl font-bold">
            {fmtAud(mrr)} <span className="text-lg font-normal text-gray-400">AUD + GST / month</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">Annual run rate: {fmtAud(mrr * 12)}</p>
        </div>
        <div className="text-right hidden lg:block">
          <p className="text-sm text-gray-400">Collected this month</p>
          <p className="text-2xl font-bold text-green-400">{fmtAud(collectedThisMonth)}</p>
          {overdueAmount > 0 && <p className="text-sm text-red-400 mt-1">{fmtAud(overdueAmount)} overdue</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Overdue invoices */}
        {overdueInvoices.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Overdue Invoices</h2>
            <div className="bg-white border border-red-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50 border-b border-red-200">
                  <tr>
                    {['Invoice', 'Tenant', 'Due', 'Amount'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-red-800 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.slice(0, 8).map((inv) => {
                    const tenant = tenants.find((t) => t.id === inv.tenantId)
                    const sub = (inv.lineItems ?? []).reduce((s, l) => s + Math.round(l.unitPrice * l.qty * (1 - (l.discountPct ?? 0) / 100) * 100) / 100, 0)
                    const paid = (inv.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
                    const due = Math.max(0, sub * 1.1 - paid)
                    return (
                      <tr key={inv.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{inv.number}</td>
                        <td className="px-4 py-2.5 text-gray-600">{tenant?.businessName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-red-600 text-xs">{inv.dueDate}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{fmtAud(due)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Expiring leases */}
        {expiringSoon.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Leases Expiring Soon</h2>
            <div className="bg-white border border-amber-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 border-b border-amber-200">
                  <tr>
                    {['Tenant', 'Space', 'Expiry', 'Days'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-amber-800 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expiringSoon.map((lease) => {
                    const tenant = tenants.find((t) => t.id === lease.tenantId)
                    const space = spaces.find((s) => s.id === lease.spaceId)
                    const days = differenceInDays(parseISO(lease.endDate), today)
                    return (
                      <tr key={lease.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium">{tenant?.businessName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{space?.unitNumber ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
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
            </div>
          </div>
        )}
      </div>

      {/* Vacant private offices */}
      {vacantOffices.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Vacant Offices — Available Now ({vacantOffices.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {vacantOffices.map((space) => (
              <div key={space.id} className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
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
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Becoming Available — Next 90 Days
          </h2>
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Space', 'Current Tenant', 'Available From', 'Days', 'Monthly Rate'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {becomingAvailable.map(({ lease, space, tenant, days }) => (
                  <tr key={lease.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{space?.unitNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{tenant?.businessName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{format(parseISO(lease.endDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${days <= 30 ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-700'}`}>
                        {days}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtAud(space?.monthlyRate ?? lease.monthlyRent)}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offices — occupancy (Office 1–15 then Suite 1–30) */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Offices</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {officeList.map((space) => {
            const occ = officeOccupant(space)
            return (
              <div key={space.id} className={`rounded-md border p-3 text-sm flex items-center justify-between gap-3 ${
                space.status === 'occupied' ? 'border-gray-300 bg-gray-900 text-white' : 'border-green-200 bg-green-50 text-green-900'
              }`}>
                <div className="min-w-0">
                  <div className="font-semibold">{space.unitNumber}</div>
                  <div className={`text-xs mt-0.5 truncate ${space.status === 'occupied' ? 'text-gray-300' : 'text-green-700'}`}>
                    {occ || 'Vacant'}
                  </div>
                </div>
                <div className={`text-xs whitespace-nowrap ${space.status === 'occupied' ? 'text-gray-300' : 'text-gray-400'}`}>
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
