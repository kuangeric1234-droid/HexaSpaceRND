import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, X, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STATUS_STYLE = {
  Confirmed: 'bg-green-100 text-green-800',
  Pending: 'bg-amber-100 text-amber-800',
  Cancelled: 'bg-red-100 text-red-700',
}
const SOURCE_STYLE = {
  Admin: 'bg-red-600 text-white',
  Portal: 'bg-blue-600 text-white',
  Website: 'bg-gray-800 text-white',
}
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { resourceId: '', memberId: '', companyId: '', date: today(), startTime: '09:00', endTime: '10:00', status: 'Confirmed', source: 'Admin', repeat: 'none' }

function hoursBetween(s, e) {
  const [sh, sm] = (s || '0:0').split(':').map(Number)
  const [eh, em] = (e || '0:0').split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}
function to12(t) {
  if (!t) return ''
  let [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

export default function Bookings() {
  const { bookings = [], spaces = [], members = [], tenants = [], addBooking, deleteBooking } = useOutletContext()
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const resource = (id) => spaces.find((s) => s.id === id)
  const member = (id) => members.find((m) => m.id === id)
  const companyName = (id) => tenants.find((t) => t.id === id)?.businessName
  const rooms = spaces.filter((s) => s.type === 'meeting')

  const rows = bookings
    .map((b) => {
      const room = resource(b.resourceId)
      const m = member(b.memberId)
      const hrs = hoursBetween(b.startTime, b.endTime)
      const cost = room?.hourlyRate ? hrs * room.hourlyRate : 0
      return { ...b, room, memberName: m?.name, companyName: companyName(b.companyId), hrs, cost }
    })
    .filter((b) => {
      if (from && b.date < from) return false
      if (to && b.date > to) return false
      if (companyFilter && b.companyId !== companyFilter) return false
      return [b.reference, b.memberName, b.companyName, b.room?.unitNumber].join(' ').toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || '')))

  function submit() {
    if (!form.resourceId) return
    const m = members.find((x) => x.id === form.memberId)
    addBooking({ ...form, companyId: m?.companyId || form.companyId, createdBy: 'Admin' })
    setShowForm(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <button onClick={() => { setForm({ ...EMPTY, date: today() }); setShowForm(true) }} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"><Plus size={15} /> New Booking</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Every room & space booking — made here, from the calendar, the website, or the members portal.</p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search bookings…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 min-w-[180px] max-w-xs border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white" />
        <span className="text-gray-400 text-sm">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white" />
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white">
          <option value="">All companies</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.businessName}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500">{rows.length} bookings</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Booking', 'Reference', 'Member', 'Resource', 'Summary', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No bookings yet. They’ll appear here from the calendar, the website and the members portal — or add one with <strong>New Booking</strong>.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{b.date ? format(parseISO(b.date), 'd MMM yyyy') : '—'} · {to12(b.startTime)} – {to12(b.endTime)}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-400">{b.hrs} hour{b.hrs !== 1 ? 's' : ''}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[b.status] || 'bg-gray-100 text-gray-600'}`}>{b.status}</span>
                    {b.source && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${SOURCE_STYLE[b.source] || 'bg-gray-200 text-gray-700'}`}>{b.source}</span>}
                    {b.repeat && b.repeat !== 'none' && <span className="text-[10px] text-gray-400">↻ {b.repeat}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.reference}</td>
                <td className="px-4 py-3"><div className="text-gray-900">{b.memberName || '—'}</div><div className="text-xs text-gray-400">{b.companyName}</div></td>
                <td className="px-4 py-3"><div className="text-gray-900">{b.room?.unitNumber || '—'}</div><div className="text-xs text-gray-400">Hexa Space</div></td>
                <td className="px-4 py-3 text-gray-700">{b.cost ? `A$${b.cost.toLocaleString('en-AU')}` : 'Free'}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { if (confirm('Delete this booking?')) deleteBooking(b.id) }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <BookingModal form={form} setForm={setForm} rooms={rooms} members={members} tenants={tenants} onClose={() => setShowForm(false)} onSubmit={submit} />}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
function L({ label, children }) { return <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>{children}</label> }

function BookingModal({ form, setForm, rooms, members, tenants, onClose, onSubmit }) {
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">New Booking</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <L label="Resource"><select value={form.resourceId} onChange={up('resourceId')} className={ic}><option value="">Select room / space</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.unitNumber}{r.hourlyRate ? ` — $${r.hourlyRate}/hr` : ''}</option>)}</select></L>
          <L label="Member"><select value={form.memberId} onChange={up('memberId')} className={ic}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}{tenants.find((t) => t.id === m.companyId) ? ` — ${tenants.find((t) => t.id === m.companyId).businessName}` : ''}</option>)}</select></L>
          <L label="Date"><input type="date" value={form.date} onChange={up('date')} className={ic} /></L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Start"><input type="time" value={form.startTime} onChange={up('startTime')} className={ic} /></L>
            <L label="End"><input type="time" value={form.endTime} onChange={up('endTime')} className={ic} /></L>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <L label="Status"><select value={form.status} onChange={up('status')} className={ic}><option>Confirmed</option><option>Pending</option><option>Cancelled</option></select></L>
            <L label="Source"><select value={form.source} onChange={up('source')} className={ic}><option>Admin</option><option>Portal</option><option>Website</option></select></L>
            <L label="Repeat"><select value={form.repeat} onChange={up('repeat')} className={ic}><option value="none">None</option><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></L>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
          <button onClick={() => { if (!form.resourceId) return; onSubmit() }} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">Add</button>
        </div>
      </div>
    </div>
  )
}
