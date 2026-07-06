import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronRight, Users } from 'lucide-react'
import { useApp } from '../context.js'
import { isFunctionSpace } from '../../portal/functionSpace.js'
import { Screen, Label, Display, Rule, Chip, RoomPhoto, to12, money0, bookingName } from '../ui.jsx'
import { creditBalance, CREDIT_VALUE } from '../lib/bookingActions.js'
import RoomDetail from '../screens/RoomDetail.jsx'

// Book tab: rooms grouped by capacity (4 pax · 8 pax · 12 pax · other spaces),
// tap a room for its own day calendar with live availability — the same model
// as the website's booking grid, phone-sized.

export default function Book() {
  const { data } = useApp()
  const { spaces, bookings, company } = data

  const rooms = useMemo(() => (spaces ?? [])
    .filter((s) => s.type === 'meeting' && !isFunctionSpace(s))
    .sort((a, b) => (a.pax ?? 99) - (b.pax ?? 99) || (a.hourlyRate ?? a.rate ?? 0) - (b.hourlyRate ?? b.rate ?? 0)), [spaces])
  const studios = useMemo(() => (spaces ?? [])
    .filter((s) => s.type === 'studio' || s.type === 'podcast')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'studio' ? -1 : 1)), [spaces])

  const [kind, setKind] = useState('rooms')
  const [selected, setSelected] = useState(null)

  if (selected) return <RoomDetail room={selected} onBack={() => setSelected(null)} />

  const list = kind === 'rooms' ? rooms : studios

  // Group meeting rooms by capacity; studios by kind.
  const groups = []
  if (kind === 'rooms') {
    const seen = new Map()
    for (const r of list) {
      // Rooms without a capacity on file are the tea room (East) — own section, last.
      const key = r.pax ? `Up to ${r.pax} guests` : 'Tea Room'
      if (!seen.has(key)) { seen.set(key, []); groups.push({ label: key, items: seen.get(key) }) }
      seen.get(key).push(r)
    }
    groups.sort((a, b) => (a.label === 'Tea Room') - (b.label === 'Tea Room'))
  } else {
    const media = list.filter((s) => s.type === 'studio')
    const podcast = list.filter((s) => s.type === 'podcast')
    if (media.length) groups.push({ label: 'Media studios', items: media })
    if (podcast.length) groups.push({ label: 'Podcast', items: podcast })
  }

  const balance = creditBalance(company)

  return (
    <Screen>
      <div className="pt-9 pb-6">
        <Label>Book · By the hour</Label>
        <Display className="mt-4">Rooms &amp; studios.</Display>
      </div>

      {/* Rooms / Studios toggle */}
      <div className="flex gap-6 border-b border-ink/10 mb-6">
        {[['rooms', 'Meeting Rooms'], ['studios', 'Studios']].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)}
            className={`relative pb-3 min-h-[44px] font-heading uppercase tracking-nav text-[11px] transition-colors ${kind === k ? 'text-ink' : 'text-portal-muted'}`}>
            {label}
            {kind === k && <span className="absolute inset-x-0 -bottom-px h-px bg-hexa-green" />}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <span className="hx-prose text-[12px]">Tap a space to see its calendar</span>
        <Chip tone="green">{balance} credits · A${CREDIT_VALUE} each</Chip>
      </div>

      {groups.length === 0 ? (
        <>
          <Rule />
          <p className="hx-prose text-[13px] py-6 text-center">No {kind} available — please check back soon.</p>
        </>
      ) : (
        groups.map(({ label, items }) => (
          <section key={label} className="mb-7">
            <Label className="mb-2">{label}</Label>
            <div className="divide-y divide-ink/5 border-y border-ink/10">
              {items.map((room) => <RoomRow key={room.id} room={room} onOpen={() => setSelected(room)} />)}
            </div>
          </section>
        ))
      )}

      <UpcomingList bookings={bookings} spaces={spaces} />
    </Screen>
  )
}

function RoomRow({ room, onOpen }) {
  const rate = room.hourlyRate ?? room.rate
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-4 py-4 min-h-[68px] active:opacity-60 transition-opacity">
      <RoomPhoto room={room} className="h-14 w-14 shrink-0 text-xl" />
      <span className="flex-1 min-w-0 text-left">
        <span className="block font-heading uppercase tracking-nav text-[11px] text-ink truncate">{room.unitNumber}</span>
        <span className="hx-prose text-[12px] mt-0.5 flex items-center gap-3">
          <span>{rate ? `${money0(rate)}/hr` : '—'}</span>
          {room.pax && <span className="flex items-center gap-1"><Users size={11} /> up to {room.pax}</span>}
          {room.size && <span className="truncate">{room.size}</span>}
        </span>
      </span>
      <ChevronRight size={15} className="text-portal-muted shrink-0" />
    </button>
  )
}

function UpcomingList({ bookings, spaces }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const upcoming = [...(bookings ?? [])]
    .filter((b) => b.date && b.date >= todayStr && b.status !== 'Cancelled')
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
    .slice(0, 6)

  return (
    <div className="mt-3">
      <Label className="mb-3">My upcoming bookings</Label>
      {upcoming.length === 0 ? (
        <>
          <Rule />
          <p className="hx-prose text-[13px] py-5">Nothing booked yet — pick a space above.</p>
        </>
      ) : (
        <div className="divide-y divide-ink/5 border-y border-ink/10">
          {upcoming.map((b) => (
            <div key={b.id} className="flex items-center gap-4 py-4">
              <div className="bg-paper border border-ink/10 h-12 w-12 shrink-0 flex flex-col items-center justify-center">
                <span className="font-display font-extralight text-lg leading-none">{b.date.slice(8, 10)}</span>
                <span className="font-heading uppercase tracking-label text-[8px] text-portal-muted mt-0.5">
                  {format(new Date(b.date + 'T00:00:00'), 'MMM')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{bookingName(spaces, b)}</div>
                <div className="hx-prose text-[12px] mt-0.5">
                  {to12(b.startTime)} – {to12(b.endTime)}{b.title ? ` · ${b.title}` : ''}
                </div>
              </div>
              <Chip tone={b.status === 'Confirmed' ? 'green' : 'ink'}>{b.status}</Chip>
            </div>
          ))}
        </div>
      )}
      <p className="hx-prose text-[11px] mt-4">
        Requests are confirmed by our team — usually within the hour. Credits are a company pool;
        anything over the allowance is billed as a fee at month end.
      </p>
    </div>
  )
}
