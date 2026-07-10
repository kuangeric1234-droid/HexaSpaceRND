import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { format, parseISO, isFuture, isToday } from 'date-fns'
import {
  Mailbox, Printer, Coffee, ArrowRight, ArrowUpRight, KeyRound, Receipt,
  CalendarClock, Bell, Send,
} from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { fetchSanityEvents } from '../../lib/sanity.js'
import { useApp } from '../context.js'
import { Screen, Label, Display, Rule, Card, Chip, Sheet, fmt, to12, money, bookingName } from '../ui.jsx'
import { invoiceTotal, unpaidInvoices } from '../lib/invoiceTotal.js'
import { accessSummary } from '../lib/doorAccess.js'
import { buildNotifications } from '../lib/notifications.js'
import PaySheet from '../screens/PaySheet.jsx'

// Home — Eclat-style front page: wordmark + icon row, serif greeting,
// "what's happening" (upcoming events) with the lounge photo, quick actions,
// then the member's own signals (invoices due, next booking).

export default function Home() {
  const { data, patch } = useApp()
  const nav = useNavigate()
  const { company, member, bookings, spaces, invoices, mailItems } = data
  const [payInvoice, setPayInvoice] = useState(null)
  const [showNotifications, setShowNotifications] = useState(false)

  // Stripe Checkout bounces back to /app?paid=<invoice number>.
  const [justPaid] = useState(() => new URLSearchParams(window.location.search).get('paid'))
  useEffect(() => {
    if (justPaid) window.history.replaceState({}, '', window.location.pathname)
  }, [justPaid])

  // Upcoming events for the "what's happening" strip (same sources as Events).
  const [events, setEvents] = useState([])
  useEffect(() => {
    let alive = true
    async function load() {
      const [sanityEvents, localRes] = await Promise.all([
        fetchSanityEvents().catch(() => []),
        supabase.from('portal_events').select('data'),
      ])
      const local = (localRes.data ?? []).map((r) => r.data)
      const upcoming = [...sanityEvents, ...local]
        .filter((e) => { try { const d = parseISO(e.date); return isFuture(d) || isToday(d) } catch { return false } })
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      if (alive) setEvents(upcoming.slice(0, 2))
    }
    load()
    return () => { alive = false }
  }, [])

  const firstName = (member?.name || company?.contactName || company?.businessName || '').split(' ')[0]
  const awaitingMail = (mailItems ?? []).filter((m) => m.status === 'awaiting')

  const todayStr = new Date().toISOString().split('T')[0]
  const nextBooking = [...(bookings ?? [])]
    .filter((b) => b.date && b.date >= todayStr && b.status !== 'Cancelled')
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))[0]

  const unpaid = unpaidInvoices(invoices)
  const owing = unpaid.reduce((s, i) => s + invoiceTotal(i), 0)
  const doorActive = accessSummary(data).status === 'active'
  const notifications = buildNotifications(data)

  // "My key" → the dedicated tap-to-unlock screen (own office door +
  // building-entry guidance). See screens/Key.jsx.
  const openKey = () => nav('/key')

  return (
    <Screen>
      {/* Top bar — wordmark + key / bell / messages */}
      <div className="flex items-center justify-between pt-5">
        <span className="font-heading uppercase text-[15px] tracking-[0.22em] text-ink">Hexa&nbsp;Space</span>
        <div className="flex items-center gap-1">
          <button onClick={openKey} aria-label="Door key"
            className="h-10 w-10 flex items-center justify-center text-ink active:opacity-60">
            <KeyRound size={18} strokeWidth={1.5} />
          </button>
          <button onClick={() => setShowNotifications(true)} aria-label="Notifications"
            className="relative h-10 w-10 flex items-center justify-center text-ink active:opacity-60">
            <Bell size={18} strokeWidth={1.5} />
            {notifications.count > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-hexa-green ring-2 ring-bone" />
            )}
          </button>
          <button onClick={() => nav('/more/messages')} aria-label="Messages"
            className="h-10 w-10 -mr-2 flex items-center justify-center text-ink active:opacity-60">
            <Send size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div className="pt-6 pb-4">
        <Display className="text-[38px]">
          Hello {firstName},<br />welcome back!
        </Display>
        <p className="font-display font-extralight text-[19px] text-charcoal mt-4 leading-snug">
          Here is what's happening at{' '}
          <Link to="/more/events" className="underline decoration-ink/40 underline-offset-4 active:opacity-60">Hexa Space</Link>
        </p>
      </div>

      {/* Lounge photo */}
      <img src="/app-home.jpg" alt="Hexa Space lounge" className="w-full h-52 object-cover" />

      {/* Upcoming events strip */}
      {events.length > 0 && (
        <div className="divide-y divide-ink/5 border-b border-ink/10">
          {events.map((e, i) => (
            <Link key={e.id ?? i} to="/more/events" className="flex items-center gap-4 py-3.5 active:opacity-60">
              <span className="bg-paper border border-ink/10 h-11 w-11 shrink-0 flex flex-col items-center justify-center">
                <span className="font-display font-extralight text-lg leading-none">{String(e.date).slice(8, 10)}</span>
                <span className="font-heading uppercase tracking-label text-[7px] text-portal-muted mt-0.5">
                  {format(parseISO(e.date), 'MMM')}
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-body text-[14px] text-ink truncate">{e.title}</span>
                <span className="block hx-prose text-[11px] mt-0.5 truncate">{e.time && e.time !== '12:00 am' ? `${e.time} · ` : ''}{e.location || 'Hexa Space'}</span>
              </span>
              <ArrowUpRight size={14} className="text-portal-muted shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {justPaid && (
        <div className="mt-5 border border-hexa-green/40 bg-hexa-green/10 px-4 py-3">
          <p className="hx-prose text-[13px] text-ink">
            ✓ Payment received for <span className="font-heading uppercase tracking-nav text-[11px]">{justPaid}</span> — thank
            you. It will show as paid within a few minutes.
          </p>
        </div>
      )}

      {/* Quick actions — Eclat tile row + full-width drinks */}
      <div className="grid grid-cols-3 gap-px bg-ink/10 mt-6 border border-ink/10">
        <Tile icon={KeyRound} label="My key" onClick={openKey} chip={doorActive ? null : 'soon'} />
        <Tile icon={Mailbox} label={`${awaitingMail.length} ${awaitingMail.length === 1 ? 'Delivery' : 'Deliveries'}`}
          onClick={() => nav('/mail')} highlight={awaitingMail.length > 0} />
        <Tile icon={Printer} label="Printer" onClick={() => nav('/printer')} />
      </div>
      {/* "Order drinks" button hidden until the Eclat partnership is formal — restore to re-enable:
      <button onClick={() => nav('/food')}
        className="w-full mt-px border border-ink/10 bg-paper min-h-[52px] flex items-center justify-center gap-2.5 active:bg-bone transition-colors">
        <Coffee size={16} strokeWidth={1.5} className="text-ink" />
        <span className="font-heading uppercase tracking-nav text-[11px] text-ink">Order drinks</span>
      </button> */}

      {/* Unpaid invoice banner */}
      {unpaid.length > 0 && !justPaid && (
        <button onClick={() => setPayInvoice(unpaid[0])}
          className="w-full mt-6 bg-charcoal text-paper px-5 py-4 flex items-center gap-4 text-left active:opacity-80">
          <Receipt size={18} strokeWidth={1.5} className="text-hexa-green shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-heading uppercase tracking-nav text-[10px] text-paper/60">
              {unpaid.length === 1 ? 'Invoice due' : `${unpaid.length} invoices due`}
            </span>
            <span className="block font-display font-extralight text-xl mt-0.5">
              {money(owing)}{unpaid.some((i) => i.status === 'overdue') ? ' · overdue' : ''}
            </span>
          </span>
          <span className="font-heading uppercase tracking-nav text-[10px] text-hexa-green shrink-0">
            Pay <ArrowRight size={11} className="inline -mt-0.5" />
          </span>
        </button>
      )}

      {/* Next booking */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <Label>Next booking</Label>
          <Link to="/book" className="font-heading uppercase tracking-nav text-[10px] text-ink flex items-center gap-1 py-2 active:opacity-60">
            Book <ArrowUpRight size={11} />
          </Link>
        </div>
        {nextBooking ? (
          <Card className="p-5 flex items-center gap-4">
            <div className="bg-bone border border-ink/10 h-14 w-14 shrink-0 flex flex-col items-center justify-center">
              <span className="font-display font-extralight text-xl leading-none">{nextBooking.date.slice(8, 10)}</span>
              <span className="font-heading uppercase tracking-label text-[8px] text-portal-muted mt-1">
                {format(new Date(nextBooking.date + 'T00:00:00'), 'MMM')}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">
                {bookingName(spaces, nextBooking)}
              </div>
              <div className="hx-prose text-[12px] mt-1">
                {fmt(nextBooking.date)}{nextBooking.startTime ? ` · ${to12(nextBooking.startTime)} – ${to12(nextBooking.endTime)}` : ''}
              </div>
            </div>
            <Chip tone={nextBooking.status === 'Confirmed' ? 'green' : 'ink'}>{nextBooking.status}</Chip>
          </Card>
        ) : (
          <Card onClick={() => nav('/book')} className="p-5 flex items-center gap-4">
            <CalendarClock size={18} strokeWidth={1.4} className="text-hexa-green shrink-0" />
            <span className="flex-1">
              <span className="block font-heading uppercase tracking-nav text-[11px] text-ink">No upcoming bookings</span>
              <span className="block hx-prose text-[12px] mt-0.5">Book a meeting room or studio</span>
            </span>
            <ArrowRight size={14} className="text-ink shrink-0" />
          </Card>
        )}
      </div>

      <Rule className="mt-10 mb-6" />
      <p className="hx-prose text-[12px] text-center">
        Hexa Space · 402/830 Whitehorse Road, Box Hill · build locally, scale sustainably
      </p>

      {/* Notifications */}
      <Sheet open={showNotifications} onClose={() => setShowNotifications(false)} title="Notifications">
        {notifications.items.length === 0 ? (
          <p className="hx-prose text-[13px] text-center py-8">You're all caught up.</p>
        ) : (
          <div className="divide-y divide-ink/5">
            {notifications.items.map((n) => (
              <button key={n.key} onClick={() => { setShowNotifications(false); nav(n.to) }}
                className="w-full flex items-center gap-4 py-4 text-left active:opacity-60">
                <span className={`h-2 w-2 rounded-full shrink-0 ${n.tone === 'green' ? 'bg-hexa-green' : 'bg-ink'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block font-body text-[14px] text-ink truncate">{n.label}</span>
                  <span className="block hx-prose text-[11px] mt-0.5 truncate">{n.sub}</span>
                </span>
                <ArrowRight size={13} className="text-portal-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {payInvoice && (
        <PaySheet
          invoice={payInvoice}
          company={company}
          onClose={() => setPayInvoice(null)}
          onPaid={(updated) => {
            patch((prev) => ({
              ...prev,
              invoices: prev.invoices.map((i) => (i.id === updated.id ? updated : i)),
            }))
            setPayInvoice(null)
          }}
        />
      )}
    </Screen>
  )
}

function Tile({ icon: Icon, label, onClick, chip, highlight }) {
  return (
    <button onClick={onClick} className="relative bg-paper min-h-[84px] flex flex-col items-center justify-center gap-2 px-2 active:bg-bone transition-colors">
      <Icon size={18} strokeWidth={1.4} className={highlight ? 'text-hexa-green' : 'text-ink'} />
      <span className="font-heading uppercase tracking-nav text-[10px] text-ink text-center leading-tight">{label}</span>
      {chip && (
        <span className="absolute top-2 right-2 font-heading uppercase tracking-label text-[7px] text-hexa-green border border-hexa-green/40 px-1.5 py-0.5">
          {chip}
        </span>
      )}
    </button>
  )
}
