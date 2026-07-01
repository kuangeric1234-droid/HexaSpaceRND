import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, isWithinInterval } from 'date-fns'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'

// Memberships organised by TYPE (columns) and by BILLING PERIOD (month navigator).
// Read view — populated from the contracts members have signed. Flags overdue invoices.
const TYPES = ['Virtual Office', 'Flexible Desk', 'Dedicated Desk', 'Private Office']
const COL_ACCENT = {
  'Virtual Office': 'border-t-blue-500',
  'Flexible Desk': 'border-t-amber-500',
  'Dedicated Desk': 'border-t-emerald-500',
  'Private Office': 'border-t-gray-800',
}

function membershipType(lease, space) {
  const text = `${lease.planName || ''} ${space?.unitNumber || ''} ${space?.attributes || ''} ${space?.type || ''}`.toLowerCase()
  if (text.includes('virtual')) return 'Virtual Office'
  if (text.includes('flex')) return 'Flexible Desk'
  if (text.includes('dedicated')) return 'Dedicated Desk'
  return 'Private Office'
}

const NOW = new Date()

export default function Memberships() {
  const { leases = [], tenants = [], spaces = [], invoices = [] } = useOutletContext()
  const [offset, setOffset] = useState(0) // months from current

  const company = (id) => tenants.find((t) => t.id === id)
  const space = (id) => spaces.find((s) => s.id === id)

  const monthStart = startOfMonth(addMonths(NOW, offset))
  const monthEnd = endOfMonth(monthStart)
  const monthLabel = format(monthStart, 'MMMM yyyy')

  // Is an invoice overdue & unpaid?
  function isOverdue(i) {
    if (i.status === 'paid' || i.status === 'void') return false
    if (i.status === 'overdue') return true
    const due = i.dueDate ? parseISO(i.dueDate) : null
    const paid = (i.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
    const total = (i.lineItems || []).reduce((s, l) => s + (l.unitPrice || 0) * (l.qty || 1), 0)
    return due && due < NOW && paid < total
  }
  const overdueCompany = (tid) => invoices.some((i) => i.tenantId === tid && isOverdue(i))

  const floorRank = { l2: 0, l4: 1, l5: 2 }
  const floorLabel = { l2: 'Level 2', l4: 'Level 4', l5: 'Level 5' }
  const inPeriod = (l) => {
    const s = l.startDate ? parseISO(l.startDate) : null
    const e = l.endDate ? parseISO(l.endDate) : null
    if (s && s > monthEnd) return false
    if (e && e < monthStart) return false
    return true
  }

  // Virtual Office / Flexible Desk / Dedicated Desk come from the signed leases.
  const OTHER_TYPES = ['Virtual Office', 'Flexible Desk', 'Dedicated Desk']
  const rows = leases
    .map((l) => {
      const sp = space(l.spaceId)
      const unit = (sp && sp.type === 'office' ? sp.unitNumber : l.resource) || l.planName || 'Membership'
      return { ...l, sp, unit, level: l.level || '', type: l.membershipType || membershipType(l, sp), companyName: company(l.tenantId)?.businessName ?? l.companyName ?? l.memberName ?? '—', overdue: overdueCompany(l.tenantId) }
    })
    .filter((r) => OTHER_TYPES.includes(r.type))
    .filter((r) => r.status === 'active' || r.status === 'pending')
    .filter((r) => inPeriod(r))
    .sort((a, b) => a.unit.localeCompare(b.unit) || a.companyName.localeCompare(b.companyName))

  // Private Office column follows every office unit in Spaces, showing its occupant
  // (an explicit space assignment wins; otherwise the active/pending lease on it).
  const officeItems = spaces
    .filter((s) => s.type === 'office')
    .sort((a, b) => (floorRank[a.floor] ?? 9) - (floorRank[b.floor] ?? 9) || String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true }))
    .map((sp) => {
      const override = sp.assignedCompanyId || ''
      let lease = null
      if (override) {
        lease = leases.find((l) => l.tenantId === override && (l.status === 'active' || l.status === 'pending')) || null
      } else {
        lease = leases
          .filter((l) => l.spaceId === sp.id && (l.status === 'active' || l.status === 'pending') && inPeriod(l))
          .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0] || null
      }
      const companyId = override || lease?.tenantId || ''
      const co = company(companyId)
      const vacant = !companyId
      return {
        id: sp.id, unit: sp.unitNumber, level: floorLabel[sp.floor] || '',
        companyName: vacant ? 'Available' : (co?.businessName || lease?.companyName || '—'),
        vacant, status: vacant ? 'vacant' : (lease?.status || 'active'),
        startDate: lease?.startDate, endDate: lease?.endDate, monthlyRent: lease?.monthlyRent,
        overdue: !vacant && overdueCompany(companyId),
      }
    })

  const byType = {
    ...Object.fromEntries(OTHER_TYPES.map((t) => [t, rows.filter((r) => r.type === t)])),
    'Private Office': officeItems,
  }
  const occupiedOffices = officeItems.filter((o) => !o.vacant).length
  const activeCount = rows.length + occupiedOffices
  const overdueCount = [...rows, ...officeItems].filter((r) => r.overdue).length

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Memberships</h1>
        <span className="text-sm text-gray-500">{activeCount} active this period</span>
      </div>
      <p className="text-sm text-gray-500 mb-5">By type — desks &amp; virtual offices from signed contracts; Private Office follows the floor plan in Spaces.</p>

      {/* Billing-period navigator */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset((o) => o - 1)} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <div className="px-4 py-1.5 border border-gray-200 rounded-md bg-white text-sm font-semibold text-gray-900 min-w-[150px] text-center">{monthLabel}</div>
          <button onClick={() => setOffset((o) => o + 1)} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-50"><ChevronRight size={16} /></button>
          {offset !== 0 && <button onClick={() => setOffset(0)} className="text-xs text-blue-600 hover:underline ml-1">This month</button>}
          <span className="text-xs text-gray-400 ml-2">Billing period {format(monthStart, 'd MMM')} – {format(monthEnd, 'd MMM yyyy')}</span>
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
            <AlertTriangle size={14} /> {overdueCount} with overdue invoices
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {TYPES.map((type) => {
          const items = byType[type]
          return (
            <div key={type} className={`bg-gray-50 border border-gray-200 border-t-2 ${COL_ACCENT[type]} rounded-md`}>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">{type}</span>
                <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5">{type === 'Private Office' ? `${occupiedOffices}/${officeItems.length}` : items.length}</span>
              </div>
              <div className="px-3 pb-3 space-y-2 min-h-[120px]">
                {items.length === 0 && <div className="text-xs text-gray-300 text-center py-8">None this period.</div>}
                {items.map((r) => (
                  <div key={r.id} className={`bg-white border rounded-md p-3 ${r.overdue ? 'border-red-300' : r.vacant ? 'border-dashed border-gray-200' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-gray-900 text-sm leading-tight">{r.unit}{r.level ? <span className="text-gray-400 font-normal"> · {r.level}</span> : null}</span>
                      {r.overdue
                        ? <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0"><AlertTriangle size={10} /> Overdue</span>
                        : r.vacant
                          ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-gray-100 text-gray-400">Vacant</span>
                          : <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>{r.status || 'active'}</span>}
                    </div>
                    <div className={`text-xs mt-0.5 ${r.vacant ? 'text-gray-400 italic' : 'text-gray-700'}`}>{r.companyName}</div>
                    {!r.vacant && (
                      <div className="text-[11px] text-gray-400 mt-1.5">
                        {r.startDate ? format(parseISO(r.startDate), 'd MMM yyyy') : '—'} – {r.endDate ? format(parseISO(r.endDate), 'd MMM yyyy') : 'Month-to-month'}
                        {r.monthlyRent != null ? ` · A$${Number(r.monthlyRent).toLocaleString('en-AU')}/mo` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {leases.length === 0 && (
        <p className="text-sm text-gray-400 mt-8 text-center">
          No memberships yet — they appear here automatically when a member signs a contract for a space, and roll forward each billing period.
        </p>
      )}
    </div>
  )
}
