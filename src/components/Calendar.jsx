import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, Users, Clock } from 'lucide-react'
import { format, addDays } from 'date-fns'

const DAY_START = 9
const DAY_END = 17
const HOUR_H = 52
const CREDIT_VALUE = 40 // $40 per credit
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const RESOURCE_TYPES = [
  { label: 'Meeting Rooms', type: 'meeting' },
  { label: 'Media Studios', type: 'studio' },
  { label: 'Podcast Rooms', type: 'podcast' },
  { label: 'Hotdesks', type: 'desk' },
]
const BOOKABLE = ['meeting', 'studio', 'podcast', 'desk']

const t12 = (h) => `${h % 12 || 12}:00 ${h >= 12 ? 'pm' : 'am'}`
const toDec = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h + m / 60 }
const fromDec = (d) => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`
const round2 = (n) => Math.round(n * 100) / 100
const ROOM_COLORS = ['#7c8b2f', '#10b981', '#7c3aed', '#b45309', '#1d4ed8', '#d97706', '#374151', '#9d174d']

export default function Calendar() {
  const { bookings = [], spaces = [], members = [], tenants = [], addBooking, updateBooking, deleteBooking, updateMember, addMember } = useOutletContext()
  const [day, setDay] = useState(new Date())
  const [resType, setResType] = useState('meeting')
  const [modal, setModal] = useState(null) // { mode:'new'|'edit', ...booking/slot }

  const dayStr = format(day, 'yyyy-MM-dd')
  const rooms = spaces.filter((s) => s.type === resType)
  const bookableRooms = spaces.filter((s) => BOOKABLE.includes(s.type))
  const dayBookings = bookings.filter((b) => b.date === dayStr)

  const openSlot = (resourceId, hour) =>
    setModal({ mode: 'new', resourceId, date: dayStr, startTime: fromDec(hour), endTime: fromDec(hour + 1) })
  const openBooking = (b) => setModal({ mode: 'edit', ...b })

  // Refund the old credit charge (if any) and apply the new one, returning what the
  // booking should now record. Keeps member.credits in sync with every change.
  function reconcile(oldB, next) {
    const deltas = {}
    const add = (mid, v) => { if (mid) deltas[mid] = (deltas[mid] || 0) + v }
    if (oldB && oldB.paidBy === 'credits' && oldB.creditsUsed) add(oldB.memberId, oldB.creditsUsed)

    let creditsUsed = 0, paidBy = 'unpaid'
    if (next) {
      if (next.status === 'Cancelled') paidBy = 'cancelled'
      else if (next.free) paidBy = 'free'
      else {
        const room = spaces.find((s) => s.id === next.resourceId)
        const hrs = Math.max(0, toDec(next.endTime) - toDec(next.startTime))
        const need = round2(hrs * (room?.hourlyRate || 0) / CREDIT_VALUE)
        if (need <= 0) paidBy = 'free'
        else {
          creditsUsed = need
          const m = members.find((x) => x.id === next.memberId)
          const avail = Number(m?.credits || 0) + (deltas[next.memberId] || 0) // include refund
          if (m && avail >= need) { paidBy = 'credits'; add(next.memberId, -need) }
          else paidBy = 'unpaid' // shortfall billed via Stripe
        }
      }
    }
    for (const [mid, d] of Object.entries(deltas)) {
      if (!d) continue
      const m = members.find((x) => x.id === mid); if (!m) continue
      updateMember(mid, { credits: round2(Number(m.credits || 0) + d) })
    }
    return { creditsUsed, paidBy }
  }

  function handleSave(payload) {
    const status = payload.tentative ? 'Pending' : 'Confirmed'
    const member = members.find((m) => m.id === payload.memberId)
    const companyId = payload.companyId || member?.companyId || ''
    if (modal.mode === 'edit') {
      const { creditsUsed, paidBy } = reconcile(modal, { ...payload, status })
      updateBooking(modal.id, { ...payload, companyId, status, creditsUsed, paidBy })
    } else {
      const { creditsUsed, paidBy } = reconcile(null, { ...payload, status })
      addBooking({ ...payload, companyId, status, creditsUsed, paidBy, source: 'Admin', createdBy: 'Admin' })
    }
    setModal(null)
  }
  function handleCancel() {
    reconcile(modal, { ...modal, status: 'Cancelled' })
    updateBooking(modal.id, { status: 'Cancelled', creditsUsed: 0, paidBy: 'cancelled' })
    setModal(null)
  }
  function handleDelete() {
    reconcile(modal, null) // refund only
    deleteBooking(modal.id)
    setModal(null)
  }

  return (
    <div className="p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDay(new Date())} className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50">Today</button>
          <div className="flex items-center">
            <button onClick={() => setDay((d) => addDays(d, -1))} className="p-1.5 border border-gray-200 rounded-l-md hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <button onClick={() => setDay((d) => addDays(d, 1))} className="p-1.5 border border-gray-200 border-l-0 rounded-r-md hover:bg-gray-50"><ChevronRight size={16} /></button>
          </div>
          <span className="font-semibold text-gray-900">{format(day, 'EEEE, d MMMM yyyy')}</span>
        </div>
        <select value={resType} onChange={(e) => setResType(e.target.value)} className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white">
          {RESOURCE_TYPES.map((r) => <option key={r.type} value={r.type}>{r.label}</option>)}
        </select>
      </div>

      {rooms.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-md p-12 text-center text-gray-400 text-sm">No {RESOURCE_TYPES.find((r) => r.type === resType)?.label.toLowerCase()} yet. Add spaces of this type in Spaces.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-md overflow-auto">
          <div className="flex min-w-max">
            {/* time gutter */}
            <div className="w-16 shrink-0 border-r border-gray-200">
              <div className="h-16 border-b border-gray-200" />
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_H }} className="text-[11px] text-gray-400 text-right pr-2 -mt-2">{t12(h)}</div>
              ))}
            </div>
            {/* room columns */}
            {rooms.map((room, ri) => {
              const color = ROOM_COLORS[ri % ROOM_COLORS.length]
              const roomBookings = dayBookings.filter((b) => b.resourceId === room.id)
              return (
                <div key={room.id} className="w-48 shrink-0 border-r border-gray-200 last:border-r-0">
                  <div className="h-16 border-b border-gray-200 px-2 py-1.5" style={{ borderTop: `3px solid ${color}` }}>
                    <div className="font-semibold text-xs text-gray-900 truncate">{room.unitNumber}</div>
                    <div className="text-[10px] text-gray-400">{room.hourlyRate ? `$${room.hourlyRate}/hr` : '—'}{room.size ? ` · ${room.size}` : ''}</div>
                  </div>
                  <div className="relative" style={{ height: HOURS.length * HOUR_H }}>
                    {HOURS.map((h) => (
                      <div key={h} onClick={() => openSlot(room.id, h)} style={{ height: HOUR_H }} className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer" />
                    ))}
                    {roomBookings.map((b) => {
                      const top = (toDec(b.startTime) - DAY_START) * HOUR_H
                      const height = Math.max(18, (toDec(b.endTime) - toDec(b.startTime)) * HOUR_H)
                      const m = members.find((x) => x.id === b.memberId)
                      const co = tenants.find((t) => t.id === b.companyId)
                      const cancelled = b.status === 'Cancelled'
                      return (
                        <div
                          key={b.id}
                          onClick={(e) => { e.stopPropagation(); openBooking(b) }}
                          title="Click to edit"
                          className={`absolute left-1 right-1 rounded px-1.5 py-1 text-[10px] text-white overflow-hidden cursor-pointer hover:ring-2 hover:ring-black/40 transition ${cancelled ? 'opacity-50 line-through' : ''}`}
                          style={{ top, height, background: color }}
                        >
                          <div className="font-semibold truncate">{b.title || co?.businessName || m?.name || 'Booking'}</div>
                          <div className="truncate opacity-90">{t12(Math.floor(toDec(b.startTime)))}–{t12(Math.floor(toDec(b.endTime)))}{b.status === 'Pending' ? ' · tentative' : ''}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">Click a slot to book · click a booking to edit. Credits = ${CREDIT_VALUE}/credit · also bookable from the website & members portal (paid via Stripe when out of credits).</p>

      {modal && (
        <BookingModal
          key={modal.id || 'new'}
          init={modal}
          rooms={bookableRooms}
          members={members}
          tenants={tenants}
          addMember={addMember}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onCancelBooking={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

function BookingModal({ init, rooms, members, tenants, addMember, onClose, onSave, onCancelBooking, onDelete }) {
  const edit = init.mode === 'edit'
  const [f, setF] = useState({
    companyId: init.companyId || '',
    memberId: init.memberId || '',
    title: init.title || '',
    description: init.description || '',
    showDesc: !!init.description,
    resourceId: init.resourceId || (rooms[0]?.id ?? ''),
    date: init.date || '',
    startTime: init.startTime || '09:00',
    endTime: init.endTime || '10:00',
    prepMinutes: init.prepMinutes || 0,
    repeat: !!init.repeat && init.repeat !== 'none',
    inviteGuests: !!init.inviteGuests,
    free: init.paidBy === 'free' || !!init.free,
    tentative: init.status === 'Pending' || !!init.tentative,
    notify: init.notify !== undefined ? init.notify : true,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const up = (k) => (e) => set(k, e.target.value)
  const chk = (k) => (e) => set(k, e.target.checked)

  const room = rooms.find((r) => r.id === f.resourceId)
  const member = members.find((m) => m.id === f.memberId)
  // members filtered by chosen company (or all when none chosen)
  const memberOpts = f.companyId ? members.filter((m) => m.companyId === f.companyId) : members
  const hrs = Math.max(0, toDec(f.endTime) - toDec(f.startTime))
  const cost = f.free ? 0 : hrs * (room?.hourlyRate || 0)
  const credits = round2(cost / CREDIT_VALUE)
  const bal = Number(member?.credits || 0)

  function pickCompany(e) {
    const companyId = e.target.value
    setF((p) => ({ ...p, companyId, memberId: members.find((m) => m.id === p.memberId)?.companyId === companyId ? p.memberId : '' }))
  }
  function pickMember(e) {
    const memberId = e.target.value
    const m = members.find((x) => x.id === memberId)
    setF((p) => ({ ...p, memberId, companyId: m?.companyId || p.companyId }))
  }
  function addNewMember() {
    const name = window.prompt('New member name')?.trim()
    if (!name) return
    const created = addMember({ name, companyId: f.companyId || '', status: 'Active', credits: 0, source: 'calendar' })
    if (created?.id) setF((p) => ({ ...p, memberId: created.id, companyId: created.companyId || p.companyId }))
  }

  const save = () => {
    if (!f.resourceId || !f.date) return
    onSave({
      companyId: f.companyId, memberId: f.memberId, title: f.title, description: f.description,
      resourceId: f.resourceId, date: f.date, startTime: f.startTime, endTime: f.endTime,
      prepMinutes: Number(f.prepMinutes) || 0, repeat: f.repeat ? (init.repeat && init.repeat !== 'none' ? init.repeat : 'weekly') : 'none',
      inviteGuests: f.inviteGuests, free: f.free, tentative: f.tentative, notify: f.notify,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md w-full max-w-lg shadow-xl max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{edit ? `Edit Booking ${init.reference || ''}`.trim() : 'New Booking'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Member / Company */}
          <div>
            <span className={lbl}>Member</span>
            <div className="grid grid-cols-2 gap-3">
              <select value={f.companyId} onChange={pickCompany} className={ic}>
                <option value="">Select company</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.businessName}</option>)}
              </select>
              <select value={f.memberId} onChange={pickMember} className={ic}>
                <option value="">Select member</option>
                {memberOpts.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <button onClick={addNewMember} className="text-xs text-blue-600 hover:underline mt-1">Add new</button>
          </div>

          {/* Title + description */}
          <div>
            <span className={lbl}>Title</span>
            <input value={f.title} onChange={up('title')} placeholder="Title" className={ic} />
            {f.showDesc ? (
              <textarea value={f.description} onChange={up('description')} rows={2} placeholder="Description" className={`${ic} mt-2`} />
            ) : (
              <button onClick={() => set('showDesc', true)} className="text-xs text-blue-600 hover:underline mt-1">Add Description</button>
            )}
          </div>

          {/* Meeting room */}
          <label className="block">
            <span className={lbl}>Meeting Room</span>
            <select value={f.resourceId} onChange={up('resourceId')} className={ic}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.unitNumber}{r.size ? ` · ${r.size}` : ''}{r.hourlyRate ? ` — $${r.hourlyRate}/hr` : ''}</option>)}
            </select>
          </label>

          {/* From / To */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 items-end">
            <label className="block"><span className={lbl}>From</span><input type="date" value={f.date} onChange={up('date')} className={ic} /></label>
            <label className="block"><span className={lbl}>Start</span><input type="time" value={f.startTime} onChange={up('startTime')} className={ic} /></label>
            <label className="block"><span className={lbl}>To</span><input type="time" value={f.endTime} onChange={up('endTime')} className={ic} /></label>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 -mt-1">
            <Clock size={12} /> {hrs ? `${hrs} hour${hrs !== 1 ? 's' : ''}` : '—'} · (GMT +10:00) Australia/Sydney
          </div>

          {/* Preparation time */}
          <label className="block">
            <span className={lbl}>Preparation time</span>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={f.prepMinutes} onChange={up('prepMinutes')} className={ic} />
              <span className="text-xs text-gray-500 shrink-0">minutes</span>
            </div>
          </label>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.repeat} onChange={chk('repeat')} /> Repeat</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.inviteGuests} onChange={chk('inviteGuests')} /> Invite guests</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.free} onChange={chk('free')} /> Free</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.tentative} onChange={chk('tentative')} /> Tentative</label>
          </div>

          {/* Booking fee + balance */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500 flex items-center gap-1"><Users size={12} /> Booking Fee</span>
              <span className="font-semibold text-gray-900">{f.free ? 'Free' : `${credits} credit${credits !== 1 ? 's' : ''} · A$${cost.toLocaleString('en-AU')}`}</span></div>
            {member && !f.free && (
              <div className="flex justify-between"><span className="text-gray-500">{member.name} balance</span>
                <span className={bal >= credits ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>{bal} credit{bal !== 1 ? 's' : ''}{bal < credits ? ' — shortfall via Stripe' : ''}</span></div>
            )}
            {edit && <div className="flex justify-between"><span className="text-gray-500">Booking Reference</span><span className="font-mono text-gray-700">{init.reference || '—'}</span></div>}
          </div>

          {!f.memberId && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-xs">Member not selected.</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={f.notify} onChange={chk('notify')} /> Send notification</label>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
            {edit && <button onClick={() => { if (window.confirm('Delete this booking?')) onDelete() }} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700">Delete</button>}
            {edit && init.status !== 'Cancelled' && <button onClick={onCancelBooking} className="px-4 py-2 text-sm bg-amber-500 text-white rounded-md hover:bg-amber-600">Cancel</button>}
            <button onClick={save} disabled={!f.memberId || !f.resourceId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">{edit ? 'Update' : 'Book Now'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
