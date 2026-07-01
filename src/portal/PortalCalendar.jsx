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
const LABEL_HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i)

const t12 = (h) => `${h % 12 || 12} ${h >= 12 ? 'pm' : 'am'}`
const to12 = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}` }
const toDec = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h + m / 60 }
const fromDec = (d) => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.round((d % 1) * 60)).padStart(2, '0')}`
const overlaps = (aS, aE, bS, bE) => toDec(aS) < toDec(bE) && toDec(bS) < toDec(aE)

export default function PortalCalendar({ resources, allBookings, member, company }) {
  const [day, setDay] = useState(new Date())
  const [bookings, setBookings] = useState(allBookings ?? [])
  const [modal, setModal] = useState(null) // { resourceId, date, startTime, endTime }
  // Live company credit balance (deducted as bookings are made this session).
  // On a new month the pool tops back up to the company's monthly allowance —
  // mirrors the admin app's monthly reset, keyed on creditsPeriod so the two agree.
  const monthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const [remaining, setRemaining] = useState(() =>
    company?.creditsPeriod === monthKey
      ? Number(company?.creditsRemaining ?? 0)
      : Number(company?.monthlyAllowance ?? company?.creditsRemaining ?? 0)
  )

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

      <Card className="overflow-hidden">
        <div className="flex">
          {/* time gutter */}
          <div className="w-14 shrink-0 border-r border-ink/10">
            <div className="h-16 border-b border-ink/10" />
            {/* labels sit just below each gridline; +1 row gives 5pm a box under it */}
            <div className="relative" style={{ height: (HOURS.length + 1) * HOUR_H }}>
              {LABEL_HOURS.map((h) => (
                <span key={h} style={{ top: (h - DAY_START) * HOUR_H + 4 }} className="absolute right-2 font-heading uppercase tracking-nav text-[9px] text-muted">{t12(h)}</span>
              ))}
            </div>
          </div>
          {/* resource columns */}
          {resources.map((room) => {
            const roomBookings = dayBookings.filter((b) => b.resourceId === room.id)
            const rate = room.hourlyRate ?? room.rate
            return (
              <div key={room.id} className="flex-1 min-w-0 border-r border-ink/10 last:border-r-0">
                <div className="h-16 border-b border-ink/10 px-3 py-2 border-t-2 border-t-hexa-green bg-bone">
                  <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{room.unitNumber}</div>
                  <div className="hx-prose text-[11px] truncate">{rate ? `A$${rate}/hr` : '—'}{room.size ? ` · ${room.size}` : ''}</div>
                </div>
                <div className="relative" style={{ height: (HOURS.length + 1) * HOUR_H }}>
                  {HOURS.map((h) => (
                    <div key={h} onClick={() => openSlot(room.id, h)} style={{ height: HOUR_H }}
                      className="border-b border-ink/5 hover:bg-hexa-green/5 cursor-pointer transition-colors" />
                  ))}
                  <div style={{ height: HOUR_H }} className="border-b border-ink/5" />
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
          slot={modal} resources={resources} bookings={bookings} member={member} company={company} remaining={remaining}
          onClose={() => setModal(null)}
          onBooked={(created, newRemaining) => { setBookings((prev) => [...prev, ...created]); if (newRemaining != null) setRemaining(newRemaining); setModal(null) }}
        />
      )}
    </>
  )
}

function BookingModal({ slot, resources, bookings, member, company, remaining, onClose, onBooked }) {
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
  // Balance is the COMPANY's monthly allowance pool.
  const balance = Number(remaining ?? company?.creditsRemaining ?? 0)

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

    // Deduct the company's credit allowance per booking; any overage becomes a
    // Booking Fee added to the month-end bill.
    let bal = Number(remaining ?? company?.creditsRemaining ?? 0)
    const perCredits = Math.round((perCost / CREDIT_VALUE) * 100) / 100
    let shortfallCredits = 0
    created.forEach((b) => {
      const used = Math.max(0, Math.min(bal, perCredits))
      bal = Math.round((bal - used) * 100) / 100
      shortfallCredits = Math.round((shortfallCredits + Math.max(0, perCredits - used)) * 100) / 100
      b.creditsUsed = used
      b.paidBy = perCredits - used > 0 ? (used > 0 ? 'part_credits' : 'fee') : 'credits'
    })

    setSaving(true)
    const nowIso = new Date().toISOString()
    const writes = [
      supabase.from('bookings').upsert(created.map((b) => ({ id: b.id, data: b, updated_at: nowIso }))),
    ]
    if (company?.id) {
      const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      writes.push(supabase.from('tenants').upsert({ id: company.id, data: { ...company, creditsRemaining: bal, creditsPeriod: mk }, updated_at: nowIso }))
    }
    if (shortfallCredits > 0 && company?.id) {
      const feeId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const room = resources.find((r) => r.id === f.resourceId)
      const fee = {
        id: feeId, name: `Meeting room — ${room?.unitNumber ?? ''} (over allowance)`,
        type: 'Booking Fee', memberId: member?.id ?? null, companyId: company.id,
        date: new Date().toISOString().split('T')[0],
        price: Math.round(shortfallCredits * CREDIT_VALUE * 100) / 100,
        status: 'Not Paid', notes: `Portal booking · ${shortfallCredits} credits over allowance`,
        createdAt: new Date().toISOString().split('T')[0],
      }
      writes.push(supabase.from('fees').upsert({ id: feeId, data: fee, updated_at: nowIso }))
    }
    const results = await Promise.all(writes)
    setSaving(false)
    const dbErr = results.find((r) => r.error)?.error
    if (dbErr) return setError(dbErr.message)
    if (skipped.length) setError('')
    onBooked(created, bal)
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
            {company && totalCost > 0 && (
              <div className="flex justify-between"><span className="hx-prose text-[13px]">Allowance remaining</span>
                <span className={`font-heading uppercase tracking-nav text-[11px] ${balance >= totalCredits ? 'text-hexa-green' : 'text-amber-700'}`}>{balance} cr{balance < totalCredits ? ' · overage billed as a fee' : ''}</span></div>
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
