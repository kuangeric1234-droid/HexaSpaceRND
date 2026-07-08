import { useMemo, useState, useRef, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { Check, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../context.js'
import { Screen, BackHeader, Label, Rule, Chip, Sheet, BigButton, RoomPhoto, fmt, to12, money0 } from '../ui.jsx'
import { toDec, fromDec, isFree, creditBalance, createBooking, CREDIT_VALUE } from '../lib/bookingActions.js'
import { isPerkRoom, perkHoursUsed, companyPerk, round2, companyCanAfterHours, bookingWindow, afterHoursConfig } from '../../lib/credits.js'

// Single-room day calendar — the app's version of the website's booking grid:
// scrollable date strip on top, an hour column below with existing bookings
// blocked out, tap any open half-hour to book from there. The grid spans the
// extended (after-hours) window; slots outside a member's band are disabled.

const HOUR_H = 60 // px per hour → 30px per half-hour cell
const LABEL_PAD = 22 // room under the last gridline so the last label isn't clipped
const DURATIONS = [
  { min: 30, label: '30 mins' },
  { min: 60, label: '1 hour' },
  { min: 90, label: '1.5 hrs' },
  { min: 120, label: '2 hours' },
]

export default function RoomDetail({ room, onBack }) {
  const { data, patch } = useApp()
  const { allBookings, member, company, leases, spaces, settings } = data

  // Grid spans the extended window; the member's own band (win) gates slots.
  const ahCfg = afterHoursConfig(settings)
  const DAY_START = ahCfg.extendedStart
  const DAY_END = ahCfg.extendedEnd
  const GRID_H = (DAY_END - DAY_START) * HOUR_H
  const canAfterHours = companyCanAfterHours(company?.id, leases, spaces, settings)
  const win = bookingWindow(canAfterHours, settings)

  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [slot, setSlot] = useState(null) // "HH:mm" start tapped

  const days = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(new Date(), i)), [])
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const nowDec = new Date().getHours() + new Date().getMinutes() / 60

  const dayBookings = useMemo(() =>
    (allBookings ?? [])
      .filter((b) => b.resourceId === room.id && b.date === date && b.status !== 'Cancelled')
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [allBookings, room.id, date])

  const rate = room.hourlyRate ?? room.rate ?? 0
  const balance = creditBalance(company)

  // Half-hour cells across the grid window
  const cells = []
  for (let d = DAY_START; d < DAY_END; d += 0.5) cells.push(d)
  const cellBooked = (d) => dayBookings.some((b) => toDec(b.startTime) < d + 0.5 && d < toDec(b.endTime))
  const cellPast = (d) => date === todayStr && d <= nowDec
  // Outside the member's bookable band → after-hours (needs 24/7 access).
  const cellAfterHours = (d) => d < win.start || d >= win.end

  return (
    <Screen>
      <BackHeader title={room.unitNumber} />

      {/* Arched hero — only when a photo exists */}
      <RoomPhoto room={room} fallback="none" className="app-arch w-full h-44 mb-5" />

      <div className="flex items-end justify-between gap-3 pt-1 pb-5">
        <div>
          <p className="font-display font-extralight text-[30px] leading-tight text-ink">{room.unitNumber}</p>
          <p className="hx-prose text-[13px] mt-1.5 flex items-center gap-3">
            <span>{rate ? `${money0(rate)}/hr` : '—'}</span>
            {room.pax && <span className="flex items-center gap-1"><Users size={12} /> up to {room.pax}</span>}
            {room.size && !/up\s*to/i.test(room.size) && <span>{room.size}</span>}
          </p>
        </div>
        <Chip tone="green">{balance} cr</Chip>
      </div>

      {/* Date strip — 4 weeks: swipeable on touch, chevrons + wheel on desktop */}
      <DateStrip days={days} date={date} onPick={(ds) => { setDate(ds); setSlot(null) }} />

      <div className="flex items-center justify-between mt-5 mb-3">
        <Label>{format(new Date(date + 'T00:00:00'), 'EEEE d MMMM')}</Label>
        <span className="hx-prose text-[11px]">Tap an open slot</span>
      </div>

      {/* Day grid — one column, bookings blocked out */}
      <div className="bg-paper border border-ink/10 flex">
        {/* hour gutter */}
        <div className="w-14 shrink-0 border-r border-ink/10 relative" style={{ height: GRID_H + LABEL_PAD }}>
          {Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i).map((h) => (
            <span key={h} style={{ top: (h - DAY_START) * HOUR_H + 3 }}
              className="absolute right-2 font-heading uppercase tracking-nav text-[9px] text-portal-muted">
              {h % 12 || 12} {h >= 12 ? 'pm' : 'am'}
            </span>
          ))}
        </div>
        {/* slots + booking overlays */}
        <div className="relative flex-1" style={{ height: GRID_H + LABEL_PAD }}>
          {cells.map((d) => {
            const booked = cellBooked(d)
            const past = cellPast(d)
            const afterHours = cellAfterHours(d)
            const open = !booked && !past && !afterHours
            return (
              <button key={d} disabled={!open}
                onClick={() => setSlot(fromDec(d))}
                style={{ top: (d - DAY_START) * HOUR_H, height: HOUR_H / 2 }}
                className={`absolute inset-x-0 border-b ${Number.isInteger(d) ? 'border-ink/10' : 'border-ink/5'} ${
                  past || afterHours ? 'bg-bone/70' : open ? 'active:bg-hexa-green/10' : ''
                }`}
                aria-label={open ? `Book from ${to12(fromDec(d))}` : afterHours ? 'After-hours — needs 24/7 access' : undefined}
              />
            )
          })}
          {dayBookings.map((b) => {
            const top = (Math.max(toDec(b.startTime), DAY_START) - DAY_START) * HOUR_H
            const height = Math.max(22, (Math.min(toDec(b.endTime), DAY_END) - Math.max(toDec(b.startTime), DAY_START)) * HOUR_H)
            const mine = b.companyId === company?.id
            return (
              <div key={b.id} style={{ top, height }}
                className={`absolute left-1 right-1 px-2.5 py-1 overflow-hidden pointer-events-none ${mine ? 'bg-hexa-green text-paper' : 'bg-charcoal text-paper/90'}`}>
                <span className="font-heading uppercase tracking-nav text-[9px] block truncate">
                  {mine ? (b.title || 'Your booking') : 'Booked'}
                </span>
                <span className="text-[10px] opacity-80 block truncate">{to12(b.startTime)} – {to12(b.endTime)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="hx-prose text-[11px] mt-3">
        Open {to12(fromDec(win.start))} – {to12(fromDec(win.end))} · {canAfterHours
          ? 'after-hours booking is on for your membership.'
          : 'after-hours is included with Private Office & Dedicated Desk memberships.'} Requests confirmed usually within the hour.
      </p>

      {slot && (
        <SlotSheet
          room={room} date={date} start={slot}
          member={member} company={company} allBookings={allBookings} balance={balance}
          leases={leases} spaces={spaces} settings={settings}
          onClose={() => setSlot(null)}
          onBooked={({ booking, company: updatedCompany, fee }) => {
            patch((prev) => ({
              ...prev,
              bookings: [...prev.bookings, booking],
              allBookings: [...prev.allBookings, booking],
              company: updatedCompany,
              fees: fee ? [...prev.fees, fee] : prev.fees,
            }))
          }}
        />
      )}
    </Screen>
  )
}

function DateStrip({ days, date, onPick }) {
  const ref = useRef(null)

  // Mouse-wheel → horizontal scroll (needs a non-passive listener to prevent
  // the page scrolling instead; React's onWheel is passive).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const page = (dir) => ref.current?.scrollBy({ left: dir * 4 * 64, behavior: 'smooth' })

  return (
    <div className="flex items-center gap-1 -mx-2">
      <button onClick={() => page(-1)} aria-label="Earlier dates"
        className="h-11 w-8 shrink-0 flex items-center justify-center text-portal-muted active:text-ink">
        <ChevronLeft size={16} strokeWidth={1.5} />
      </button>
      <div ref={ref} className="flex gap-2 overflow-x-auto no-scrollbar flex-1 pb-1">
        {days.map((d) => {
          const ds = format(d, 'yyyy-MM-dd')
          const on = ds === date
          return (
            <button key={ds} onClick={() => onPick(ds)}
              className={`shrink-0 w-14 py-2.5 border text-center transition-colors ${on ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink border-ink/15 active:bg-bone'}`}>
              <span className={`block font-heading uppercase tracking-label text-[9px] ${on ? 'text-paper/60' : 'text-portal-muted'}`}>
                {format(d, 'EEE')}
              </span>
              <span className="block font-display font-extralight text-lg leading-tight mt-0.5">{format(d, 'd')}</span>
            </button>
          )
        })}
      </div>
      <button onClick={() => page(1)} aria-label="Later dates"
        className="h-11 w-8 shrink-0 flex items-center justify-center text-portal-muted active:text-ink">
        <ChevronRight size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

function SlotSheet({ room, date, start, member, company, allBookings, balance, leases, spaces, settings, onClose, onBooked }) {
  const [durMin, setDurMin] = useState(60)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  // Office perk: private-office (suite) companies book Sky/Earth/Sun/Moon free,
  // capped per booking + per company per day.
  const perk = companyPerk(company?.id, leases, spaces, settings)
  const isPerk = isPerkRoom(room, perk)
  const perkUsedToday = isPerk ? perkHoursUsed({ companyId: company?.id, date, bookings: allBookings, perk, spaces }) : 0
  const canAfterHours = companyCanAfterHours(company?.id, leases, spaces, settings)
  const win = bookingWindow(canAfterHours, settings)

  const fits = (min) => {
    const end = toDec(start) + min / 60
    if (toDec(start) < win.start || end > win.end || !isFree(allBookings, room.id, date, start, fromDec(end))) return false
    if (isPerk && (min / 60 > perk.maxHoursPerBooking || perkUsedToday + min / 60 > perk.maxHoursPerDay)) return false
    return true
  }
  // If the default hour doesn't fit, fall back to the longest duration that does.
  const usable = DURATIONS.filter((d) => fits(d.min))
  const effDur = usable.some((d) => d.min === durMin) ? durMin : (usable.at(-1)?.min ?? 30)
  const end = fromDec(toDec(start) + effDur / 60)

  const rate = room.hourlyRate ?? room.rate ?? 0
  const hrs = effDur / 60
  const cost = hrs * rate
  const credits = Math.round((cost / CREDIT_VALUE) * 100) / 100
  const overage = Math.max(0, Math.round((credits - balance) * 100) / 100)

  async function confirm() {
    setSaving(true); setError('')
    try {
      const result = await createBooking({ room, date, startTime: start, endTime: end, title, member, company, allBookings, leases, spaces, settings })
      onBooked(result)
      setDone(result.booking)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={done ? 'Booking requested' : 'Confirm booking'}>
      {done ? (
        <div className="text-center pt-2">
          <span className="mx-auto h-12 w-12 border border-hexa-green/50 bg-hexa-green/10 flex items-center justify-center">
            <Check size={20} className="text-hexa-green" />
          </span>
          <p className="font-display font-extralight text-2xl text-ink mt-5">{room.unitNumber}</p>
          <p className="hx-prose text-[13px] mt-2">{fmt(date)} · {to12(start)} – {to12(end)}</p>
          <p className="hx-prose text-[12px] mt-4">Reference {done.reference}. Our team confirms requests — usually within the hour.</p>
          <BigButton onClick={onClose} className="mt-7">Done</BigButton>
        </div>
      ) : (
        <>
          <div className="text-center pt-1 pb-5">
            <p className="font-display font-extralight text-[28px] text-ink">{room.unitNumber}</p>
            <p className="hx-prose text-[13px] mt-1">{fmt(date)} · from {to12(start)}</p>
          </div>
          <Rule className="mb-5" />

          <label className="hx-eyebrow block mb-2">Duration</label>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {DURATIONS.map((d) => {
              const ok = fits(d.min)
              const on = d.min === effDur
              return (
                <button key={d.min} disabled={!ok} onClick={() => setDurMin(d.min)}
                  className={`min-h-[44px] border font-heading uppercase tracking-nav text-[10px] transition-colors ${
                    on ? 'bg-ink text-paper border-ink' : ok ? 'bg-paper text-ink border-ink/15 active:bg-bone' : 'bg-bone text-portal-muted border-ink/10 opacity-50'
                  }`}>
                  {d.label}
                </button>
              )
            })}
          </div>

          <label className="hx-eyebrow block mb-2">Title (optional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client meeting"
            className="hx-input min-h-[48px] mb-5" />

          {isPerk ? (
            <div className="bg-hexa-green/5 border border-hexa-green/30 p-4">
              <Line k={`${to12(start)} – ${to12(end)}`} v="Included" green />
              <p className="hx-prose text-[12px] text-portal-muted mt-1.5">Free with your membership — up to {perk.maxHoursPerBooking}h/booking, {perk.maxHoursPerDay}h/day per company. {round2(Math.max(0, perk.maxHoursPerDay - perkUsedToday))}h left today.</p>
            </div>
          ) : (
            <div className="bg-bone border border-ink/10 p-4 space-y-2">
              <Line k={`${to12(start)} – ${to12(end)}`} v={cost ? `${money0(cost)} · ${credits} cr` : 'Free'} />
              <Line k="Allowance remaining" v={`${balance} cr`} green={balance >= credits} />
              {overage > 0 && <Line k="Over allowance" v={`${overage} cr · billed as a fee`} amber />}
            </div>
          )}

          {error && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
          <BigButton onClick={confirm} disabled={saving} className="mt-6">
            {saving ? 'Booking…' : 'Confirm booking'}
          </BigButton>
        </>
      )}
    </Sheet>
  )
}

function Line({ k, v, green, amber }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="hx-prose text-[13px]">{k}</span>
      <span className={`font-heading uppercase tracking-nav text-[10px] ${green ? 'text-hexa-green' : amber ? 'text-amber-700' : 'text-ink'}`}>{v}</span>
    </div>
  )
}
