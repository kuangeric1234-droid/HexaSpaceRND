import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'

// Members = the people within companies. v1 derives a member from each company's
// primary contact; standalone member records can be added in a later phase.
const STATUS_STYLE = {
  Active: 'bg-green-100 text-green-800',
  'Drop In': 'bg-gray-800 text-white',
  Former: 'bg-red-100 text-red-700',
  Pending: 'bg-amber-100 text-amber-800',
}

export default function Members() {
  const { tenants = [] } = useOutletContext()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const members = tenants
    .filter((t) => t.contactName || t.email)
    .map((t) => ({
      id: t.id,
      name: t.contactName || t.email,
      company: t.businessName,
      email: t.email,
      status: t.status || 'Active',
      access: ['Contact Person', t.email ? 'Member Portal User' : null].filter(Boolean),
    }))

  const counts = {
    active: members.filter((m) => m.status === 'Active').length,
    dropin: members.filter((m) => m.status === 'Drop In').length,
    former: members.filter((m) => m.status === 'Former').length,
  }

  const filtered = members.filter((m) => {
    if (filter !== 'all' && m.status !== filter) return false
    return [m.name, m.company, m.email].join(' ').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <div className="flex gap-2 text-xs">
          {[['all', `All ${members.length}`], ['Active', `Active ${counts.active}`], ['Drop In', `Drop-in ${counts.dropin}`], ['Former', `Former ${counts.former}`]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-md border ${filter === v ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">Showing contacts across all companies. Standalone member records are coming in a later phase.</p>

      <input
        type="text"
        placeholder="Search members…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black mb-5"
      />

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Company', 'Location', 'Status', 'Access'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No members found.</td></tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                <td className="px-4 py-3 text-gray-600">{m.company}</td>
                <td className="px-4 py-3 text-gray-500">Hexa Space</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[m.status] || 'bg-gray-100 text-gray-600'}`}>{m.status}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.access.map((a) => (
                      <span key={a} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${a === 'Contact Person' ? 'bg-blue-600 text-white' : a === 'Billing Person' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white'}`}>{a}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
