import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Repeat, Check } from 'lucide-react'
import { format, addDays, addMonths } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { Card } from './ui.jsx'

// Mirrors the admin Calendar so the portal reads/writes the SAME bookings table.
const DAY_START = 9
const DAY_END = 17
const HOUR_H = 52
const CREDIT_VALUE = 40 // A$40 per credit
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)

const t12 = (h) => `${h % 12 || 12} ${h >= 12 ? 'pm' : 'am'}`
const to12 = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}` }
const toDec = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h + m / 60 }
const fromDec = (d) => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`
const overlaps = (aS, aE, bS, bE) => toDec(aS) < toDec(bE) && toDec(bS) < toDec(aE)

export default function PortalCalendar({ resources, allBookings, member, company }) {
  const [day, setDay] = useState(new Date())
  const [bookings, setBookings] = useState(allBookings ?? [])
  const [modal, setModal] = useState(null) // { resourceId, date, startTime, endTime }

  const dayStr = format(day, 'yyyy-MM-dd')
  const dayBookings = bookings.filter((b) => b.date === dayStr)

  function openSlot(resourceId, hour) {
    setModal({ resourceId, date: dayStr, startTime: fromDec(hour), endTime: fromDec(hour + 1) })
  }

  return (
    <>
      {/* Day navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setDay(new Date())} className="font-heading uppercase tracking-nav text-[10px] border border-ink/15 px-4 py-2 hover:bg-ink hover:text-paper transition-colors">Today</button>
          <div className="flex items-center border border-ink/15">
            <button onClick={() => setDay((d) => addDays(d, -1))} className="p-2 hover:bg-bone"><ChevronLeft size={15} /></button>
            <button onClick={() => setDay((d) => addDays(d, 1))} className="p-2 border-l border-ink/15 hover:bg-bone"><ChevronRight size={15} /></button>
          </div>
          <span className="font-display font-extralight text-2xl">{format(day, 'EEEE, d MMMM')}</span>
        </div>
        <span className="hx-eyebrow">{resources.length} {resources.length === 1 ? 'space' : 'spaces'}</span>
      </div>

      <Card className="overflow-auto">
        <div className="flex min-w-max">
          {/* time gutter */}
          <div className="w-16 shrink-0 border-r border-ink/10">
            <div className="h-16 border-b border-ink/10" />
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_H }} className="font-heading uppercase tracking-nav text-[9px] text-muted text-right pr-2 -mt-1.5">{t12(h)}</div>
            ))}
          </div>
          {/* resource columns */}
          {resources.map((room) => {
            const roomBookings = dayBookings.filter((b) => b.resourceId === room.id)
            const rate = room.hourlyRate ?? room.rate
            return (
              <div key={room.id} className="w-44 shrink-0 border-r border-ink/10 last:border-r-0">
                <div className="h-16 border-b border-ink/10 px-3 py-2 border-t-2 border-t-hexa-green bg-bone">
                  <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{room.unitNumber}</div>
                  <div className="hx-prose text-[11px]">{rate ? `A$${rate}/hr` : '—'}{room.size ? ` · ${room.size}` : ''}</div>
                </div>
                <div className="relative" style={{ height: HOURS.length * HOUR_H }}>
                  {HOURS.map((h) => (
                    <div key={h} onClick={() => openSlot(room.id, h)} style={{ height: HOUR_H }}
                      className="border-b border-ink/5 hover:bg-hexa-green/5 cursor-pointer transition-colors" />
                  ))}
                  {roomBookings.map((b) => {
                    const top = (toDec(b.startTime) - DAY_START) * HOUR_H
                    const height = Math.max(20, (toDec(b.endTime) - toDec(b.startTime)) * HOUR_H)
                    const mine = b.companyId === company?.id
                    return (
                      <div key={b.id} className={`absolute left-1 right-1 px-2 py-1 text-[10px] overflow-hidden ${mine ? 'bg-hexa-green text-paper' : 'bg-charcoal text-paper/90'}`} style={{ top, height }}>
                        <div className="font-heading uppercase tracking-nav text-[9px] truncate">{mine ? (b.title || 'Your booking') : 'Booked'}</div>
                        <div className="truncate opacity-80">{to12(b.startTime)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      <p className="hx-prose text-[12px] mt-3">Click any open slot to request a booking. Credits = A${CREDIT_VALUE} each · our team confirms portal requests.</p>

      {modal && (
        <BookingModal
          slot={modal} resources={resources} bookings={bookings} member={member} company={company}
          onClose={() => setModal(null)}
          onBooked={(created) => { setBookings((prev) => [...prev, ...created]); setModal(null) }}
        />
      )}
    </>
  )
}

function BookingModal({ slot, resources, bookings, member, company, onClose, onBooked }) {
  const [f, setF] = useState({ resourceId: slot.resourceId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, title: '', repeat: 'none', occurrences: 4 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const room = resources.find((r) => r.id === f.resourceId)
  const rate = room?.hourlyRate ?? room?.rate ?? 0
  const hrs = Math.max(0, toDec(f.endTime) - toDec(f.startTime))
  const perCost = hrs * rate
  const count = f.repeat === 'none' ? 1 : Math.max(1, Math.min(12, Number(f.occurrences) || 1))
  const totalCost = perCost * count
  const totalCredits = Math.round((totalCost / CREDIT_VALUE) * 100) / 100
  const balance = Number(member?.credits ?? 0)

  function occurrenceDates() {
    const base = new Date(f.date + 'T00:00:00')
    const out = []
    for (let i = 0; i < count; i++) {
      const d = f.repeat === 'weekly' ? addDays(base, i * 7)
        : f.repeat === 'daily' ? addDays(base, i)
        : f.repeat === 'monthly' ? addMonths(base, i)
        : base
      out.push(format(d, 'yyyy-MM-dd'))
    }
    return out
  }

  async function confirm() {
    setError('')
    if (hrs <= 0) return setError('End time must be after start time.')
    const dates = occurrenceDates()
    const created = []
    const skipped = []
    for (const date of dates) {
      const clash = bookings.some((b) => b.resourceId === f.resourceId && b.date === date && b.status !== 'Cancelled' && overlaps(f.startTime, f.endTime, b.startTime, b.endTime))
      if (clash) { skipped.push(date); continue }
      created.push({
        id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reference: `BKG-${Math.floor(100000 + Math.random() * 900000)}`,
        resourceId: f.resourceId, memberId: member?.id ?? '', companyId: company?.id ?? '',
        date, startTime: f.startTime, endTime: f.endTime, title: f.title,
        status: 'Pending', source: 'Portal', repeat: f.repeat, createdBy: 'Member',
        createdAt: new Date().toISOString().split('T')[0],
      })
    }
    if (created.length === 0) return setError('Those times are already booked. Please choose another slot.')
    setSaving(true)
    const { error: dbErr } = await supabase.from('bookings').upsert(created.map((b) => ({ id: b.id, data: b, updated_at: new Date().toISOString() })))
    setSaving(false)
    if (dbErr) return setError(dbErr.message)
    if (skipped.length) setError('')
    onBooked(created)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <div>
            <p className="hx-eyebrow">Request a booking</p>
            <h2 className="font-display font-extralight text-2xl mt-1">{room?.unitNumber}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="hx-eyebrow block mb-1.5">Space</label>
            <select value={f.resourceId} onChange={up('resourceId')} className="hx-input">
              {resources.map((r) => <option key={r.id} value={r.id}>{r.unitNumber}{(r.hourlyRate ?? r.rate) ? ` — A$${r.hourlyRate ?? r.rate}/hr` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="hx-eyebrow block mb-1.5">Title (optional)</label>
            <input value={f.title} onChange={up('title')} className="hx-input" placeholder="e.g. Client meeting" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="hx-eyebrow block mb-1.5">Date</label><input type="date" value={f.date} onChange={up('date')} className="hx-input" /></div>
            <div><label className="hx-eyebrow block mb-1.5">From</label><input type="time" value={f.startTime} onChange={up('startTime')} className="hx-input" /></div>
            <div><label className="hx-eyebrow block mb-1.5">To</label><input type="time" value={f.endTime} onChange={up('endTime')} className="hx-input" /></div>
          </div>

          {/* Recurring */}
          <div className="border border-ink/10 p-4">
            <div className="flex items-center gap-2 mb-3"><Repeat size={14} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">Recurring</span></div>
            <div className="grid grid-cols-2 gap-3">
              <select value={f.repeat} onChange={up('repeat')} className="hx-input">
                <option value="none">Does not repeat</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
              {f.repeat !== 'none' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={2} max={12} value={f.occurrences} onChange={up('occurrences')} className="hx-input w-20" />
                  <span className="hx-prose text-[12px]">times</span>
                </div>
              )}
            </div>
          </div>

          {/* Cost summary */}
          <div className="bg-bone border border-ink/10 p-4 text-[13px] space-y-1.5">
            <div className="flex justify-between"><span className="hx-prose text-[13px]">{count > 1 ? `${count} bookings × ${hrs}h` : `${hrs} hour${hrs !== 1 ? 's' : ''}`}</span>
              <span className="font-heading uppercase tracking-nav text-[11px]">{totalCost ? `A$${totalCost.toLocaleString('en-AU')} · ${totalCredits} cr` : 'Free'}</span></div>
            {member && totalCost > 0 && (
              <div className="flex justify-between"><span className="hx-prose text-[13px]">Your balance</span>
                <span className={`font-heading uppercase tracking-nav text-[11px] ${balance >= totalCredits ? 'text-hexa-green' : 'text-amber-700'}`}>{balance} cr{balance < totalCredits ? ' · shortfall billed' : ''}</span></div>
            )}
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-ink/10">
          <button onClick={onClose} className="hx-btn-ghost">Cancel</button>
          <button onClick={confirm} disabled={saving} className="hx-btn disabled:opacity-50"><Check size={13} /> {saving ? 'Booking…' : 'Confirm booking'}</button>
        </div>
      </div>
    </div>
  )
}
