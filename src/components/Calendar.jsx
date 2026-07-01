import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, addDays, parseISO } from 'date-fns'

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

const t12 = (h) => `${h % 12 || 12}:00 ${h >= 12 ? 'pm' : 'am'}`
const toDec = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h + m / 60 }
const fromDec = (d) => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`
const ROOM_COLORS = ['#7c8b2f', '#10b981', '#7c3aed', '#b45309', '#1d4ed8', '#d97706', '#374151', '#9d174d']

export default function Calendar() {
  const { bookings = [], spaces = [], members = [], tenants = [], addBooking, updateMember } = useOutletContext()
  const [day, setDay] = useState(new Date())
  const [resType, setResType] = useState('meeting')
  const [modal, setModal] = useState(null) // { resourceId, start, end }

  const dayStr = format(day, 'yyyy-MM-dd')
  const rooms = spaces.filter((s) => s.type === resType)
  const dayBookings = bookings.filter((b) => b.date === dayStr)

  function openSlot(resourceId, hour) {
    setModal({ resourceId, date: dayStr, startTime: fromDec(hour), endTime: fromDec(hour + 1) })
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
                      return (
                        <div key={b.id} className="absolute left-1 right-1 rounded px-1.5 py-1 text-[10px] text-white overflow-hidden" style={{ top, height, background: color }}>
                          <div className="font-semibold truncate">{b.title || co?.businessName || m?.name || 'Booking'}</div>
                          <div className="truncate opacity-90">{t12(Math.floor(toDec(b.startTime)))}–{t12(Math.floor(toDec(b.endTime)))}</div>
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

      <p className="text-xs text-gray-400 mt-3">Click a slot to book. Credits = ${CREDIT_VALUE}/credit · also bookable from the website & members portal (paid via Stripe when out of credits).</p>

      {modal && (
        <BookingModal slot={modal} rooms={rooms} members={members} tenants={tenants}
          onClose={() => setModal(null)}
          onBook={(payload) => {
            const room = spaces.find((s) => s.id === payload.resourceId)
            const hrs = toDec(payload.endTime) - toDec(payload.startTime)
            const cost = payload.free ? 0 : hrs * (room?.hourlyRate || 0)
            const creditsUsed = cost / CREDIT_VALUE
            const m = members.find((x) => x.id === payload.memberId)
            // deduct credits where available
            let paidBy = 'unpaid'
            if (!payload.free && m) {
              const bal = Number(m.credits || 0)
              if (bal >= creditsUsed) { updateMember(m.id, { credits: Math.round((bal - creditsUsed) * 100) / 100 }); paidBy = 'credits' }
            } else if (payload.free) paidBy = 'free'
            addBooking({ ...payload, companyId: m?.companyId || '', creditsUsed: payload.free ? 0 : creditsUsed, paidBy, status: payload.tentative ? 'Pending' : 'Confirmed', source: 'Admin', createdBy: 'Admin' })
            setModal(null)
          }} />
      )}
    </div>
  )
}

const ic = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'

function BookingModal({ slot, rooms, members, tenants, onClose, onBook }) {
  const [f, setF] = useState({ memberId: '', title: '', resourceId: slot.resourceId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, free: false, tentative: false })
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const room = rooms.find((r) => r.id === f.resourceId)
  const member = members.find((m) => m.id === f.memberId)
  const hrs = Math.max(0, toDec(f.endTime) - toDec(f.startTime))
  const cost = f.free ? 0 : hrs * (room?.hourlyRate || 0)
  const credits = cost / CREDIT_VALUE
  const bal = Number(member?.credits || 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">New Booking</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Member</span>
            <select value={f.memberId} onChange={up('memberId')} className={ic}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}{tenants.find((t) => t.id === m.companyId) ? ` — ${tenants.find((t) => t.id === m.companyId).businessName}` : ''}</option>)}</select>
          </label>
          <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Title</span><input value={f.title} onChange={up('title')} placeholder="Title (optional)" className={ic} /></label>
          <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">Meeting Room</span>
            <select value={f.resourceId} onChange={up('resourceId')} className={ic}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.unitNumber}{r.hourlyRate ? ` — $${r.hourlyRate}/hr` : ''}</option>)}</select>
          </label>
          <div className="grid grid-cols-3 gap-3 items-end">
            <label className="block col-span-1"><span className="block text-xs font-medium text-gray-600 mb-1">Date</span><input type="date" value={f.date} onChange={up('date')} className={ic} /></label>
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">From</span><input type="time" value={f.startTime} onChange={up('startTime')} className={ic} /></label>
            <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">To</span><input type="time" value={f.endTime} onChange={up('endTime')} className={ic} /></label>
          </div>
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.free} onChange={(e) => setF({ ...f, free: e.target.checked })} /> Free</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.tentative} onChange={(e) => setF({ ...f, tentative: e.target.checked })} /> Tentative</label>
          </div>
          {/* Credits summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">This booking</span><span className="font-semibold text-gray-900">{f.free ? 'Free' : `A$${cost.toLocaleString('en-AU')} · ${credits} credit${credits !== 1 ? 's' : ''}`}</span></div>
            {member && !f.free && (
              <div className="flex justify-between mt-1"><span className="text-gray-500">{member.name} balance</span>
                <span className={bal >= credits ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>{bal} credit{bal !== 1 ? 's' : ''}{bal < credits ? ' — shortfall via Stripe' : ''}</span>
              </div>
            )}
          </div>
          {!f.memberId && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-xs">Member not selected.</div>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
          <button onClick={() => { if (!f.memberId || !f.resourceId) return; onBook(f) }} disabled={!f.memberId} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">Book Now</button>
        </div>
      </div>
    </div>
  )
}
