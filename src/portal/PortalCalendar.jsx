import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, Repeat, Check, User } from 'lucide-react'
import { format, addDays, addMonths } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { bookingFeeName, isPerkRoom, perkHoursUsed, companyPerk } from '../lib/credits.js'
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
// Room people-capacity as a number — prefers the numeric `capacity`, else a
// legacy size string that clearly counts people ("Up to 8", "4 seats").
// Area strings like "90 m²" (studios) are NOT a capacity → returns null.
const capacityOf = (room) => {
  if (Number.isFinite(room?.capacity) && room.capacity > 0) return room.capacity
  const m = String(room?.size ?? '').match(/up to\s*(\d+)|(\d+)\s*(?:pax|people|seats?|guests?)/i)
  return m ? Number(m[1] ?? m[2]) : null
}

export default function PortalCalendar({ resources, allBookings, member, company, leases, settings, allSpaces }) {
  const [day, setDay] = useState(new Date())
  const [bookings, setBookings] = useState(allBookings ?? [])
  const [modal, setModal] = useState(null) // { resourceId, date, startTime, endTime }
  const [amend, setAmend] = useState(null) // the member's own booking being edited
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
  // Cancelled bookings free their slot — never draw them (a cancel would
  // otherwise leave its block on screen and look like it did nothing).
  const dayBookings = bookings.filter((b) => b.date === dayStr && b.status !== 'Cancelled')

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
                <span key={h} style={{ top: (h - DAY_START) * HOUR_H + 4 }} className="absolute right-2 font-heading uppercase tracking-nav text-[9px] text-portal-muted">{t12(h)}</span>
              ))}
            </div>
          </div>
          {/* resource columns */}
          {resources.map((room) => {
            const roomBookings = dayBookings.filter((b) => b.resourceId === room.id)
            const rate = room.hourlyRate ?? room.rate
            const cap = capacityOf(room)
            return (
              <div key={room.id} className="flex-1 min-w-0 border-r border-ink/10 last:border-r-0">
                <div className="h-16 border-b border-ink/10 px-3 py-2 border-t-2 border-t-hexa-green bg-bone">
                  <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{room.unitNumber}</div>
                  <div className="hx-prose text-[11px] flex items-center gap-2">
                    <span className="truncate">{rate ? `A$${rate}/hr` : '—'}</span>
                    {cap != null && (
                      <span className="inline-flex items-center gap-0.5 text-portal-muted shrink-0" title={`Seats up to ${cap}`}>
                        <User size={11} strokeWidth={2} />{cap}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative" style={{ height: (HOURS.length + 1) * HOUR_H }}>
                  {HOURS.map((h) => (
                    <div key={h} onClick={() => openSlot(room.id, h)} style={{ height: HOUR_H }}
                      className="border-b border-ink/5 hover:bg-hexa-green/5 cursor-pointer transition-colors" />
                  ))}
                  <div style={{ height: HOUR_H }} className="border-b border-ink/5" />
                  {roomBookings.map((b) => {
                    // Clamp to the visible 9–5 window: imported all-day hires
                    // (08:00–19:00) otherwise start above the grid and blanket
                    // the whole column, header included.
                    const s = Math.max(toDec(b.startTime), DAY_START)
                    const e = Math.min(toDec(b.endTime), DAY_END)
                    if (e <= s) return null
                    const top = (s - DAY_START) * HOUR_H
                    const height = Math.max(20, (e - s) * HOUR_H)
                    // Yours (you booked it) → bright green; a teammate's (same company)
                    // → soft green; anyone else's → charcoal "Booked".
                    const mine = !!b.memberId && b.memberId === member?.id
                    const team = !mine && !!b.companyId && b.companyId === company?.id
                    const cls = mine ? 'bg-hexa-green text-paper'
                      : team ? 'bg-hexa-green/20 text-ink ring-1 ring-inset ring-hexa-green/50'
                      : 'bg-charcoal text-paper/90'
                    const label = mine ? (b.title || 'Your booking')
                      : team ? (b.title || 'Team booking')
                      : 'Booked'
                    // Own bookings are editable — click to amend times or cancel.
                    if (mine) {
                      return (
                        <button key={b.id} onClick={() => setAmend(b)}
                          className={`absolute left-1 right-1 px-2 py-1 text-[10px] overflow-hidden text-left cursor-pointer hover:ring-2 hover:ring-ink/30 transition-shadow ${cls}`}
                          style={{ top, height }}>
                          <div className="font-heading uppercase tracking-nav text-[9px] truncate">{label}</div>
                          <div className="truncate opacity-80">{to12(b.startTime)} · tap to change</div>
                        </button>
                      )
                    }
                    return (
                      <div key={b.id} className={`absolute left-1 right-1 px-2 py-1 text-[10px] overflow-hidden ${cls}`} style={{ top, height }}>
                        <div className="font-heading uppercase tracking-nav text-[9px] truncate">{label}</div>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
        <span className="inline-flex items-center gap-1.5 hx-prose text-[11px]"><span className="h-2.5 w-2.5 bg-hexa-green inline-block" /> Your booking</span>
        <span className="inline-flex items-center gap-1.5 hx-prose text-[11px]"><span className="h-2.5 w-2.5 bg-hexa-green/20 ring-1 ring-inset ring-hexa-green/50 inline-block" /> Your team</span>
        <span className="inline-flex items-center gap-1.5 hx-prose text-[11px]"><span className="h-2.5 w-2.5 bg-charcoal inline-block" /> Booked</span>
      </div>
      <p className="hx-prose text-[12px] mt-2">Click any open slot to request a booking. Credits = A${CREDIT_VALUE} each · our team confirms portal requests.</p>

      {amend && (
        <AmendModal
          booking={amend} resources={resources} bookings={bookings} company={company} remaining={remaining}
          leases={leases} settings={settings} allSpaces={allSpaces ?? resources}
          onClose={() => setAmend(null)}
          onSaved={(updated, newRemaining) => {
            setBookings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            if (newRemaining != null) setRemaining(newRemaining)
            setAmend(null)
          }}
        />
      )}

      {modal && (
        <BookingModal
          slot={modal} resources={resources} bookings={bookings} member={member} company={company} remaining={remaining}
          leases={leases} settings={settings} allSpaces={allSpaces ?? resources}
          onClose={() => setModal(null)}
          onBooked={(created, newRemaining) => { setBookings((prev) => [...prev, ...created]); if (newRemaining != null) setRemaining(newRemaining); setModal(null) }}
        />
      )}
    </>
  )
}

// "a@x.com, b@y.com" → deduped valid email list.
const parseEmails = (s) => [...new Set(String(s || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]

// Fire-and-forget attendee notification via the member-authed endpoint.
async function notifyAttendees(bookingId, mode, occurrences = 1) {
  try {
    const { authHeaders } = await import('../lib/apiFetch.js')
    await fetch('/api/portal/booking-invite', {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ bookingId, mode, occurrences }),
    })
  } catch { /* invitations are best-effort */ }
}

function BookingModal({ slot, resources, bookings, member, company, remaining, leases, settings, allSpaces, onClose, onBooked }) {
  const [f, setF] = useState({ resourceId: slot.resourceId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, title: '', repeat: 'none', occurrences: 4, attendees: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const room = resources.find((r) => r.id === f.resourceId)
  const rate = room?.hourlyRate ?? room?.rate ?? 0
  const hrs = Math.max(0, toDec(f.endTime) - toDec(f.startTime))
  // Office perk: private-office (suite) companies get Sky/Earth/Sun/Moon free,
  // capped per booking + per company per day. When it applies, no credits/fee.
  const perk = companyPerk(company?.id, leases, allSpaces ?? resources, settings)
  const isPerk = isPerkRoom(room, perk)
  const perkHoursToday = isPerk ? perkHoursUsed({ companyId: company?.id, date: f.date, bookings, perk, spaces: allSpaces ?? resources }) : 0
  const perkLeftToday = isPerk ? Math.max(0, perk.maxHoursPerDay - perkHoursToday) : 0
  const perCost = isPerk ? 0 : hrs * rate
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
    // Office-perk cap: max hours PER BOOKING (checked once — same length for a series).
    if (isPerk && hrs > perk.maxHoursPerBooking) {
      return setError(`${room?.unitNumber || 'This room'} is included with your membership — up to ${perk.maxHoursPerBooking}h per booking. Please shorten or split it.`)
    }
    const dates = occurrenceDates()
    const created = []
    const skipped = []
    const dayCapped = []            // dates skipped by the per-day perk cap
    const perkAddedByDate = {}      // running perk hours this session, per date
    for (const date of dates) {
      const clash = bookings.some((b) => b.resourceId === f.resourceId && b.date === date && b.status !== 'Cancelled' && overlaps(f.startTime, f.endTime, b.startTime, b.endTime))
      if (clash) { skipped.push(date); continue }
      // Office-perk cap: max hours PER DAY per company across the free rooms.
      if (isPerk) {
        const used = perkHoursUsed({ companyId: company?.id, date, bookings, perk, spaces: allSpaces ?? resources }) + (perkAddedByDate[date] || 0)
        if (used + hrs > perk.maxHoursPerDay) { dayCapped.push(date); continue }
        perkAddedByDate[date] = (perkAddedByDate[date] || 0) + hrs
      }
      created.push({
        id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reference: `BKG-${Math.floor(100000 + Math.random() * 900000)}`,
        resourceId: f.resourceId, memberId: member?.id ?? '', companyId: company?.id ?? '',
        date, startTime: f.startTime, endTime: f.endTime, title: f.title,
        memberName: member?.name || company?.contactName || '', companyName: company?.businessName || '',
        attendees: parseEmails(f.attendees),
        status: 'Pending', source: 'Portal', repeat: f.repeat, createdBy: 'Member',
        createdAt: new Date().toISOString().split('T')[0],
      })
    }
    if (created.length === 0) {
      if (dayCapped.length && !skipped.length) {
        return setError(`Your membership includes up to ${perk.maxHoursPerDay}h/day in these rooms — you've reached that day's limit.`)
      }
      return setError('Those times are already booked. Please choose another slot.')
    }

    // Perk bookings are FREE (no credits, no fee). Otherwise deduct the company's
    // credit allowance per booking; any overage becomes a month-end Booking Fee.
    let bal = Number(remaining ?? company?.creditsRemaining ?? 0)
    let shortfallCredits = 0
    if (isPerk) {
      created.forEach((b) => { b.creditsUsed = 0; b.paidBy = 'included' })
    } else {
      const perCredits = Math.round(((hrs * rate) / CREDIT_VALUE) * 100) / 100
      created.forEach((b) => {
        const used = Math.max(0, Math.min(bal, perCredits))
        bal = Math.round((bal - used) * 100) / 100
        shortfallCredits = Math.round((shortfallCredits + Math.max(0, perCredits - used)) * 100) / 100
        b.creditsUsed = used
        b.paidBy = perCredits - used > 0 ? (used > 0 ? 'part_credits' : 'fee') : 'credits'
      })
    }

    setSaving(true)
    const nowIso = new Date().toISOString()
    const writes = [
      supabase.from('bookings').upsert(created.map((b) => ({ id: b.id, data: b, updated_at: nowIso }))),
    ]
    if (!isPerk && company?.id) {
      const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      // update, not upsert: members have UPDATE-only RLS on tenants (an upsert
      // is checked as an INSERT first and gets rejected).
      writes.push(supabase.from('tenants').update({ data: { ...company, creditsRemaining: bal, creditsPeriod: mk }, updated_at: nowIso }).eq('id', company.id))
    }
    if (!isPerk && shortfallCredits > 0 && company?.id) {
      const feeId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const feeRoom = resources.find((r) => r.id === f.resourceId)
      const fee = {
        id: feeId,
        name: bookingFeeName({
          roomName: feeRoom?.unitNumber, rate: feeRoom?.hourlyRate ?? feeRoom?.rate,
          date: created[0]?.date, startTime: f.startTime, endTime: f.endTime,
          usedCredits: created.reduce((s, b) => s + (b.creditsUsed || 0), 0),
        }),
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
    // Email the invited attendees (covers the whole series in one invite).
    if (created[0]?.attendees?.length) notifyAttendees(created[0].id, 'invite', created.length)
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
          <button onClick={onClose} className="text-portal-muted hover:text-ink"><X size={18} /></button>
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
          <div>
            <label className="hx-eyebrow block mb-1.5">Invite people (optional)</label>
            <input value={f.attendees} onChange={up('attendees')} className="hx-input" placeholder="guest@company.com, colleague@company.com" />
            <p className="hx-prose text-[11px] mt-1.5">Each address gets an email invitation with the meeting details and a calendar file.</p>
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
          {isPerk ? (
            <div className="bg-hexa-green/5 border border-hexa-green/30 p-4 text-[13px] space-y-1">
              <div className="flex justify-between">
                <span className="hx-prose text-[13px]">{count > 1 ? `${count} bookings × ${hrs}h` : `${hrs} hour${hrs !== 1 ? 's' : ''}`}</span>
                <span className="font-heading uppercase tracking-nav text-[11px] text-hexa-green">Included with your membership</span>
              </div>
              <p className="hx-prose text-[12px] text-portal-muted">{room?.unitNumber} is free with your membership — up to {perk.maxHoursPerBooking}h per booking, {perk.maxHoursPerDay}h/day per company. You have {perkLeftToday}h left today.</p>
            </div>
          ) : (
            <div className="bg-bone border border-ink/10 p-4 text-[13px] space-y-1.5">
              <div className="flex justify-between"><span className="hx-prose text-[13px]">{count > 1 ? `${count} bookings × ${hrs}h` : `${hrs} hour${hrs !== 1 ? 's' : ''}`}</span>
                <span className="font-heading uppercase tracking-nav text-[11px]">{totalCost ? `A$${totalCost.toLocaleString('en-AU')} · ${totalCredits} cr` : 'Free'}</span></div>
              {company && totalCost > 0 && (
                <div className="flex justify-between"><span className="hx-prose text-[13px]">Allowance remaining</span>
                  <span className={`font-heading uppercase tracking-nav text-[11px] ${balance >= totalCredits ? 'text-hexa-green' : 'text-amber-700'}`}>{balance} cr{balance < totalCredits ? ' · overage billed as a fee' : ''}</span></div>
              )}
            </div>
          )}

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

// ── Amend / cancel the member's own booking ──────────────────────────────────
// Changing times re-balances the company credit pool (old spend refunded, new
// spend deducted; only NET overage beyond what was already fee'd raises a new
// Booking Fee) and drops the booking back to Pending for team re-confirmation.
// Cancelling refunds the credits that were drawn from the pool.
function AmendModal({ booking, resources, bookings, company, remaining, leases, settings, allSpaces, onClose, onSaved }) {
  const b = booking
  const [f, setF] = useState({ date: b.date, startTime: b.startTime, endTime: b.endTime, attendees: (b.attendees ?? []).join(', ') })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const room = resources.find((r) => r.id === b.resourceId)
  const rate = room?.hourlyRate ?? room?.rate ?? 0
  const round2c = (n) => Math.round(n * 100) / 100
  const perk = companyPerk(company?.id, leases, allSpaces ?? resources, settings)
  const isPerk = isPerkRoom(room, perk)

  const oldHrs = Math.max(0, toDec(b.endTime) - toDec(b.startTime))
  const oldNeed = round2c(oldHrs * rate / CREDIT_VALUE)
  const oldUsed = Number(b.creditsUsed || 0)
  const oldShort = Math.max(0, round2c(oldNeed - oldUsed))

  const newHrs = Math.max(0, toDec(f.endTime) - toDec(f.startTime))
  const newNeed = round2c(newHrs * rate / CREDIT_VALUE)
  const pool = round2c(Number(remaining ?? 0) + oldUsed) // refund the old spend first
  const newUsed = Math.max(0, Math.min(pool, newNeed))
  const newPool = round2c(pool - newUsed)
  const extraFee = Math.max(0, round2c((newNeed - newUsed) - oldShort))
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const nowIso = () => new Date().toISOString()

  async function persist(updated, poolAfter, feeWrite) {
    const writes = [supabase.from('bookings').update({ data: updated, updated_at: nowIso() }).eq('id', b.id)]
    if (company?.id) {
      writes.push(supabase.from('tenants').update({ data: { ...company, creditsRemaining: poolAfter, creditsPeriod: monthKey }, updated_at: nowIso() }).eq('id', company.id))
    }
    if (feeWrite) writes.push(feeWrite)
    const results = await Promise.all(writes)
    return results.find((r) => r.error)?.error
  }

  async function saveChanges() {
    setError('')
    if (newHrs <= 0) return setError('End time must be after start time.')
    if (isPerk && newHrs > perk.maxHoursPerBooking) {
      return setError(`${room?.unitNumber || 'This room'} is included with your membership — up to ${perk.maxHoursPerBooking}h per booking.`)
    }
    const clash = bookings.some((x) => x.id !== b.id && x.resourceId === b.resourceId && x.date === f.date &&
      x.status !== 'Cancelled' && overlaps(f.startTime, f.endTime, x.startTime, x.endTime))
    if (clash) return setError('That time is already booked — pick another slot.')
    if (isPerk) {
      const usedElsewhere = perkHoursUsed({ companyId: company?.id, date: f.date, bookings, perk, spaces: allSpaces ?? resources, excludeIds: [b.id] })
      if (usedElsewhere + newHrs > perk.maxHoursPerDay) {
        const left = round2c(Math.max(0, perk.maxHoursPerDay - usedElsewhere))
        return setError(`Your membership includes up to ${perk.maxHoursPerDay}h/day in these rooms — you have ${left}h left that day.`)
      }
    }
    setSaving(true)
    const attendees = parseEmails(f.attendees)
    const updated = {
      ...b, date: f.date, startTime: f.startTime, endTime: f.endTime, attendees,
      creditsUsed: isPerk ? 0 : newUsed,
      paidBy: isPerk ? 'included' : (newNeed > newUsed ? (newUsed > 0 ? 'part_credits' : 'fee') : 'credits'),
      status: 'Pending', amendedAt: nowIso(),
    }
    let feeWrite = null
    if (!isPerk && extraFee > 0 && company?.id) {
      const feeId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      feeWrite = supabase.from('fees').upsert({ id: feeId, data: {
        id: feeId,
        name: bookingFeeName({ roomName: room?.unitNumber, rate, date: f.date, startTime: f.startTime, endTime: f.endTime, usedCredits: newUsed }),
        type: 'Booking Fee', memberId: b.memberId ?? null, companyId: company.id,
        date: new Date().toISOString().split('T')[0],
        price: round2c(extraFee * CREDIT_VALUE), status: 'Not Paid',
        notes: `Amended portal booking · ${extraFee} extra credits over allowance`,
        createdAt: new Date().toISOString().split('T')[0],
      }, updated_at: nowIso() })
    }
    const poolAfter = isPerk ? Number(remaining ?? 0) : newPool
    const err = await persist(updated, poolAfter, feeWrite)
    setSaving(false)
    if (err) return setError(err.message)
    if (attendees.length) notifyAttendees(b.id, 'update')
    onSaved(updated, poolAfter)
  }

  async function cancelBooking() {
    if (!window.confirm('Cancel this booking? Credits used will return to your allowance.')) return
    setSaving(true)
    const updated = { ...b, status: 'Cancelled', cancelledAt: nowIso(), creditsUsed: 0 }
    const refundedPool = round2c(Number(remaining ?? 0) + oldUsed)
    const err = await persist(updated, refundedPool, null)
    setSaving(false)
    if (err) return setError(err.message)
    if ((b.attendees ?? []).length) notifyAttendees(b.id, 'cancelled')
    onSaved(updated, refundedPool)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <div>
            <p className="hx-eyebrow">Your booking</p>
            <h2 className="font-display font-extralight text-2xl mt-1">{room?.unitNumber}{b.title ? ` · ${b.title}` : ''}</h2>
          </div>
          <button onClick={onClose} className="text-portal-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="hx-eyebrow block mb-1.5">Date</label><input type="date" value={f.date} onChange={up('date')} className="hx-input" /></div>
            <div><label className="hx-eyebrow block mb-1.5">From</label><input type="time" value={f.startTime} onChange={up('startTime')} className="hx-input" /></div>
            <div><label className="hx-eyebrow block mb-1.5">To</label><input type="time" value={f.endTime} onChange={up('endTime')} className="hx-input" /></div>
          </div>
          <div>
            <label className="hx-eyebrow block mb-1.5">Invited people</label>
            <input value={f.attendees} onChange={up('attendees')} className="hx-input" placeholder="guest@company.com, colleague@company.com" />
            <p className="hx-prose text-[11px] mt-1.5">Attendees are emailed the updated details when you save.</p>
          </div>
          {isPerk ? (
            <div className="bg-hexa-green/5 border border-hexa-green/30 p-4 text-[13px]">
              <div className="flex justify-between">
                <span className="hx-prose text-[13px]">{newHrs} hour{newHrs !== 1 ? 's' : ''}</span>
                <span className="font-heading uppercase tracking-nav text-[11px] text-hexa-green">Included with your membership</span>
              </div>
              <p className="hx-prose text-[12px] text-portal-muted mt-1">Free with your membership — up to {perk.maxHoursPerBooking}h per booking, {perk.maxHoursPerDay}h/day per company.</p>
            </div>
          ) : (
            <div className="bg-bone border border-ink/10 p-4 text-[13px] space-y-1.5">
              <div className="flex justify-between"><span className="hx-prose text-[13px]">{newHrs} hour{newHrs !== 1 ? 's' : ''} × A${rate}/hr</span>
                <span className="font-heading uppercase tracking-nav text-[11px]">{newNeed ? `${newNeed} cr` : 'Free'}</span></div>
              <div className="flex justify-between"><span className="hx-prose text-[13px]">Allowance after change</span>
                <span className="font-heading uppercase tracking-nav text-[11px] text-hexa-green">{newPool} cr</span></div>
              {extraFee > 0 && (
                <div className="flex justify-between"><span className="hx-prose text-[13px]">Extra over allowance</span>
                  <span className="font-heading uppercase tracking-nav text-[11px] text-amber-700">{extraFee} cr · billed as a fee</span></div>
              )}
            </div>
          )}
          <p className="hx-prose text-[12px]">Changed bookings return to <strong>Pending</strong> until our team re-confirms the new time.</p>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink/10">
          <button onClick={cancelBooking} disabled={saving}
            className="font-heading uppercase tracking-nav text-[11px] text-red-700 border-b border-red-300 pb-0.5 hover:border-red-700 disabled:opacity-50">
            Cancel booking
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="hx-btn-ghost">Close</button>
            <button onClick={saveChanges} disabled={saving} className="hx-btn disabled:opacity-50">
              <Check size={13} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
