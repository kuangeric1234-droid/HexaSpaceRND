import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck, PartyPopper, Receipt, MessageSquare, User } from 'lucide-react'
import { Page, Card, Eyebrow, StatusBadge, fmt, money } from './ui.jsx'
import { STAGES, bookingSessions, sessionsLabel } from '../lib/functionBooking.js'

// Dashboard for function-only clients (no membership agreement): a proper
// landing instead of dropping them straight onto the booking form — their
// bookings at a glance, anything that needs action, billing, quick links.

function calcTotal(invoice) {
  let taxable = 0, exempt = 0
  for (const li of invoice.lineItems ?? []) {
    const price = (li.unitPrice ?? 0) * (li.qty ?? 1)
    const disc = price * ((li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += price - disc; else taxable += price - disc
  }
  const gst = invoice.vatEnabled ? taxable * 0.1 : 0
  return taxable + exempt + gst
}

export default function PortalFunctionHome({ data }) {
  const { company, member, invoices = [], functionBookings = [] } = data
  const who = (member?.name || company?.contactName || company?.businessName || '').split(' ')[0]
  const todayStr = new Date().toISOString().split('T')[0]

  const fnAction = functionBookings.find((b) => ['invited', 'awaiting_deposit'].includes(b.stage))
  const active = functionBookings
    .filter((b) => !['cancelled', 'declined', 'refunded'].includes(b.stage))
    .sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999'))
  const upcoming = active.filter((b) => (b.eventDate || '') >= todayStr)

  const nextDue = invoices
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]
  const recent = [...invoices]
    .filter((i) => i.status !== 'voided')
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
    .slice(0, 3)

  return (
    <Page>
      {/* Hero */}
      <div className="bg-charcoal text-paper px-8 md:px-12 py-12 md:py-16">
        <p className="hx-eyebrow text-paper/50">Welcome back{who ? `, ${who}` : ''}</p>
        <h1 className="hx-display mt-4" style={{ color: 'var(--color-paper)' }}>{company?.businessName}</h1>
        <p className="font-display font-extralight text-xl text-paper/70 mt-4">Function Space · Box Hill</p>
      </div>

      {/* Needs action — review, sign & pay deposit */}
      {fnAction && (
        <div className="bg-hexa-green/10 border-y border-hexa-green/30 px-8 md:px-12 py-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
            <div className="flex items-start gap-3">
              <CalendarCheck size={22} className="text-hexa-green shrink-0 mt-0.5" />
              <div>
                <div className="font-heading uppercase tracking-nav text-[11px] text-hexa-green">Your booking is approved</div>
                <p className="hx-prose text-ink mt-1">
                  Your date{fnAction.eventDate ? ` (${fmt(fnAction.eventDate)})` : ''} is available. Review, sign and pay your
                  deposit{fnAction.quote?.dueNow ? ` (${money(fnAction.quote.dueNow)} due now)` : ''} to secure the venue.
                </p>
              </div>
            </div>
            <Link to="/function-space" className="hx-btn shrink-0 whitespace-nowrap">Review &amp; secure <ArrowRight size={13} /></Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-px bg-ink/10 mt-px">
        <Card className="p-7">
          <Eyebrow>Next function</Eyebrow>
          <div className="hx-display text-3xl mt-3">{upcoming[0]?.eventDate ? fmt(upcoming[0].eventDate) : '—'}</div>
          <p className="hx-prose mt-1">{upcoming[0] ? (upcoming[0].eventName || sessionsLabel(upcoming[0])) : 'nothing booked yet'}</p>
        </Card>
        <Card className="p-7">
          <Eyebrow>Next invoice</Eyebrow>
          <div className="hx-display text-3xl mt-3">{nextDue ? money(calcTotal(nextDue)) : '—'}</div>
          <p className="hx-prose mt-1">{nextDue ? `due ${fmt(nextDue.dueDate)}` : 'nothing outstanding'}</p>
        </Card>
        <Card className="p-7">
          <Eyebrow>Bookings</Eyebrow>
          <div className="hx-display text-3xl mt-3">{active.length || '—'}</div>
          <p className="hx-prose mt-1">{active.length === 1 ? 'booking with us' : 'bookings with us'}</p>
        </Card>
      </div>

      {/* My bookings */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <Eyebrow>My function bookings</Eyebrow>
          <Link to="/function-space" className="hx-btn-ghost">Book a date <ArrowRight size={12} /></Link>
        </div>
        <Card>
          {active.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <PartyPopper size={22} className="mx-auto text-hexa-green" />
              <p className="font-display font-extralight text-2xl text-ink/80 mt-4">Plan your first event with us.</p>
              <p className="hx-prose mt-2">Launches, dinners and conferences — pick a date and we'll take it from there.</p>
              <Link to="/function-space" className="hx-btn inline-flex mt-6">Request a date <ArrowRight size={13} /></Link>
            </div>
          ) : (
            <div className="divide-y divide-ink/5">
              {active.slice(0, 5).map((b) => {
                const stage = STAGES[b.stage] ?? { label: b.stage }
                return (
                  <div key={b.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="min-w-0">
                      <div className="font-heading uppercase tracking-nav text-[11px] text-ink truncate">{b.eventName || 'Function'}</div>
                      <div className="hx-prose text-[13px] mt-0.5">
                        {sessionsLabel(b) || 'date TBC'}
                        {bookingSessions(b)[0]?.startTime ? ` · ${bookingSessions(b)[0].startTime}–${bookingSessions(b)[0].endTime}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={stage.label} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Recent invoices + quick links */}
      <div className="grid md:grid-cols-2 gap-6 mt-10">
        <div>
          <div className="flex items-center justify-between mb-4">
            <Eyebrow>Recent invoices</Eyebrow>
            <Link to="/billing" className="hx-btn-ghost">View all <ArrowRight size={12} /></Link>
          </div>
          <Card>
            {recent.length === 0 ? (
              <div className="px-6 py-10 text-center hx-prose">No invoices yet.</div>
            ) : (
              <div className="divide-y divide-ink/5">
                {recent.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <div className="font-heading uppercase tracking-nav text-[11px] text-ink">{inv.number}</div>
                      <div className="hx-prose text-[13px]">Due {fmt(inv.dueDate)}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-display font-extralight text-xl">{money(calcTotal(inv))}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div>
          <Eyebrow className="mb-4">Quick links</Eyebrow>
          <div className="grid grid-cols-2 gap-px bg-ink/10">
            {[
              { to: '/function-space', label: 'Book the venue', icon: PartyPopper },
              { to: '/billing', label: 'Billing', icon: Receipt },
              { to: '/messages', label: 'Message us', icon: MessageSquare },
              { to: '/account', label: 'Account', icon: User },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="hx-card p-6 hover:bg-bone transition-colors">
                <q.icon size={16} strokeWidth={1.4} className="text-hexa-green" />
                <span className="block font-heading uppercase tracking-nav text-[11px] text-ink mt-3">{q.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
