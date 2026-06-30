import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, CalendarPlus } from 'lucide-react'
import { FLOORS, floorLabel, StatusPill, money, Field, Modal, ic, memberOptions } from './shared.jsx'

const today = () => new Date().toISOString().split('T')[0]
const EMPTY_ROOM = { unitNumber: '', floor: 'l4', capacity: '', hourlyRate: '', attributes: '' }
const EMPTY_BOOK = { date: today(), startTime: '09:00', endTime: '10:00', memberId: '', status: 'Confirmed' }

function hoursBetween(s, e) {
  const [sh, sm] = (s || '0:0').split(':').map(Number)
  const [eh, em] = (e || '0:0').split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60)
}

// Meeting Rooms — bookable resources with an hourly rate. Booking writes to the
// shared Bookings/calendar store so it shows up everywhere.
export default function MeetingRoomsTab({ ctx }) {
  const { spaces, members, tenants, bookings = [], addSpace, updateSpace, deleteSpace, addBooking } = ctx
  const navigate = useNavigate()
  const [editId, setEditId] = useState(undefined) // undefined=closed, null=new
  const [form, setForm] = useState(EMPTY_ROOM)
  const [bookRoom, setBookRoom] = useState(null)
  const [book, setBook] = useState(EMPTY_BOOK)

  const rooms = spaces.filter((s) => s.type === 'meeting')

  function openNew() { setEditId(null); setForm(EMPTY_ROOM) }
  function openEdit(r) {
    setEditId(r.id)
    setForm({
      unitNumber: r.unitNumber ?? '',
      floor: r.floor ?? 'l4',
      capacity: r.capacity ?? '',
      hourlyRate: r.hourlyRate ?? '',
      attributes: r.attributes ?? '',
    })
  }
  function saveRoom() {
    if (!form.unitNumber) return
    const data = {
      ...form,
      type: 'meeting',
      capacity: form.capacity !== '' ? Number(form.capacity) : undefined,
      hourlyRate: form.hourlyRate !== '' ? Number(form.hourlyRate) : 0,
      monthlyRate: 0,
      status: 'vacant',
      location: 'whitehorse',
      address: '830 Whitehorse Rd, Box Hill',
    }
    if (editId) updateSpace(editId, data)
    else addSpace(data)
    setEditId(undefined)
  }

  function openBook(r) { setBookRoom(r); setBook(EMPTY_BOOK) }
  function saveBooking() {
    const m = members.find((x) => x.id === book.memberId)
    addBooking({
      resourceId: bookRoom.id,
      memberId: book.memberId,
      companyId: m?.companyId || '',
      date: book.date,
      startTime: book.startTime,
      endTime: book.endTime,
      status: book.status,
      source: 'Admin',
      repeat: 'none',
      createdBy: 'Admin',
    })
    setBookRoom(null)
  }

  const memberOpts = memberOptions(members, tenants)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {rooms.length} meeting rooms · book onto the calendar at the listed hourly rate
        </p>
        <div className="flex gap-2">
          <button onClick={() => navigate('/bookings')} className="text-sm border border-gray-300 px-3 py-2 rounded-md hover:bg-gray-50">
            View calendar
          </button>
          <button onClick={openNew} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800">
            <Plus size={15} /> Add Meeting Room
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Room', 'Floor', 'Capacity', 'Rate', 'Today', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">No meeting rooms yet.</td></tr>
            )}
            {rooms.map((r) => {
              const todays = bookings.filter((b) => b.resourceId === r.id && b.date === today() && b.status !== 'Cancelled')
              return (
                <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{r.unitNumber}</div>
                    {r.attributes && <div className="text-xs text-gray-400 max-w-xs truncate">{r.attributes}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{floorLabel(r.floor)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.capacity ? `${r.capacity} pax` : r.size || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.hourlyRate ? `${money(r.hourlyRate)}/hr` : 'Free'}</td>
                  <td className="px-4 py-3 text-gray-600">{todays.length ? `${todays.length} booking${todays.length > 1 ? 's' : ''}` : '—'}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openBook(r)} title="Book" className="flex items-center gap-1 text-xs text-white bg-black hover:bg-gray-800 px-2.5 py-1.5 rounded-md font-medium">
                        <CalendarPlus size={12} /> Book
                      </button>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Delete this room?')) deleteSpace(r.id) }} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editId !== undefined && (
        <Modal title={editId ? 'Edit Meeting Room' : 'Add Meeting Room'} onClose={() => setEditId(undefined)}>
          <div className="space-y-4">
            <Field label="Name *">
              <input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="e.g. North (Bei)" className={ic} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Floor">
                <select value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className={ic}>
                  {FLOORS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Capacity (pax)">
                <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="8" className={ic} />
              </Field>
            </div>
            <Field label="Hourly Rate (AUD)">
              <input type="number" min="0" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="60" className={ic} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} className={`${ic} resize-none`} />
            </Field>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setEditId(undefined)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={saveRoom} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">{editId ? 'Save' : 'Add Room'}</button>
            </div>
          </div>
        </Modal>
      )}

      {bookRoom && (
        <Modal title={`Book — ${bookRoom.unitNumber}`} onClose={() => setBookRoom(null)}>
          <div className="space-y-4">
            <Field label="Member">
              <select value={book.memberId} onChange={(e) => setBook({ ...book, memberId: e.target.value })} className={ic}>
                <option value="">Select member</option>
                {memberOpts.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={book.date} onChange={(e) => setBook({ ...book, date: e.target.value })} className={ic} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start"><input type="time" value={book.startTime} onChange={(e) => setBook({ ...book, startTime: e.target.value })} className={ic} /></Field>
              <Field label="End"><input type="time" value={book.endTime} onChange={(e) => setBook({ ...book, endTime: e.target.value })} className={ic} /></Field>
            </div>
            <div className="bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600 flex justify-between">
              <span>{hoursBetween(book.startTime, book.endTime)} hour(s) × {money(bookRoom.hourlyRate || 0)}/hr</span>
              <span className="font-semibold text-gray-900">{money(hoursBetween(book.startTime, book.endTime) * (bookRoom.hourlyRate || 0))}</span>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setBookRoom(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={saveBooking} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">Add Booking</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
