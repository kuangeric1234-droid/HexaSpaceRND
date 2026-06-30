import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'

// Memberships = active plan/space assignments (derived from contracts/leases).
export default function Memberships() {
  const { leases = [], tenants = [], spaces = [] } = useOutletContext()
  const [search, setSearch] = useState('')

  const company = (id) => tenants.find((t) => t.id === id)
  const space = (id) => spaces.find((s) => s.id === id)

  const rows = leases
    .map((l) => ({
      ...l,
      companyName: company(l.tenantId)?.businessName ?? '—',
      spaceName: space(l.spaceId)?.unitNumber ?? l.planName ?? '—',
    }))
    .filter((r) =>
      [r.companyName, r.spaceName].join(' ').toLowerCase().includes(search.toLowerCase())
    )

  const active = rows.filter((r) => r.status === 'active').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Memberships</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">{rows.length} memberships · {active} active</p>

      <input
        type="text"
        placeholder="Search memberships…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black mb-5"
      />

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Company', 'Plan / Space', 'Price', 'Status', 'Period'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No memberships yet. Memberships appear here when a contract is created against a space.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.companyName}</td>
                <td className="px-4 py-3 text-gray-600">{r.spaceName}</td>
                <td className="px-4 py-3 text-gray-900">{r.monthlyRent != null ? `A$${Number(r.monthlyRent).toLocaleString('en-AU')}/mo` : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                    r.status === 'active' ? 'bg-green-100 text-green-800'
                    : r.status === 'pending' ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {r.startDate ? format(parseISO(r.startDate), 'dd/MM/yy') : '—'} – {r.endDate ? format(parseISO(r.endDate), 'dd/MM/yy') : '∞'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
