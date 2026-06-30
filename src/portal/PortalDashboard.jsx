import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Page, Card, Eyebrow, StatusBadge, fmt, money, to12, bookingName } from './ui.jsx'

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

export default function PortalDashboard({ data }) {
  const { company, member, leases, invoices, bookings, spaces } = data
  const activeLeases = leases.filter(l => l.status === 'active')
  const sorted = [...invoices].sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
  const recent = sorted.slice(0, 4)
  const nextDue = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]
  const todayStr = new Date().toISOString().split('T')[0]
  const upcoming = [...bookings]
    .filter(b => b.date && b.date >= todayStr && b.status !== 'Cancelled')
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
    .slice(0, 3)
  const credits = member?.credits

  const who = (member?.name || company?.contactName || company?.businessName || '').split(' ')[0]

  return (
    <Page>
      {/* Hero */}
      <div className="bg-charcoal text-paper px-8 md:px-12 py-12 md:py-16">
        <p className="hx-eyebrow text-paper/50">Welcome back{who ? `, ${who}` : ''}</p>
        <h1 className="hx-display text-paper mt-4">{company?.businessName}</h1>
        <p className="font-display font-extralight text-xl text-paper/70 mt-4">Your space, beautifully serviced.</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-3 gap-px bg-ink/10 mt-px">
        <Card className="p-7">
          <Eyebrow>Membership</Eyebrow>
          <div className="hx-display text-3xl mt-3">{activeLeases.length || '—'}</div>
          <p className="hx-prose mt-1">
            {activeLeases.length === 1 ? 'active agreement' : 'active agreements'}
            {activeLeases[0]?.endDate ? ` · to ${fmt(activeLeases[0].endDate)}` : ''}
          </p>
        </Card>
        <Card className="p-7">
          <Eyebrow>Next invoice</Eyebrow>
          <div className="hx-display text-3xl mt-3">{nextDue ? money(calcTotal(nextDue)) : '—'}</div>
          <p className="hx-prose mt-1">{nextDue ? `due ${fmt(nextDue.dueDate)}` : 'nothing outstanding'}</p>
        </Card>
        <Card className="p-7">
          <Eyebrow>Allowance</Eyebrow>
          <div className="hx-display text-3xl mt-3">{credits != null ? credits : '—'}</div>
          <p className="hx-prose mt-1">{credits != null ? 'credits remaining' : 'no credits on file'}</p>
        </Card>
      </div>

      {/* Recent invoices */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <Eyebrow>Recent invoices</Eyebrow>
          <Link to="/billing" className="hx-btn-ghost">View all <ArrowRight size={12} /></Link>
        </div>
        <Card>
          {recent.length === 0 ? (
            <div className="px-6 py-10 text-center hx-prose">No invoices yet.</div>
          ) : (
            <div className="divide-y divide-ink/5">
              {recent.map(inv => (
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

      {/* Upcoming bookings + quick links */}
      <div className="grid md:grid-cols-2 gap-6 mt-10">
        <div>
          <Eyebrow className="mb-4">Upcoming bookings</Eyebrow>
          <Card>
            {upcoming.length === 0 ? (
              <div className="px-6 py-10 text-center hx-prose">No upcoming bookings.</div>
            ) : (
              <div className="divide-y divide-ink/5">
                {upcoming.map((b, i) => (
                  <div key={b.id ?? i} className="px-6 py-4">
                    <div className="font-heading uppercase tracking-nav text-[11px] text-ink">{bookingName(spaces, b)}</div>
                    <div className="hx-prose text-[13px]">{fmt(b.date)}{b.startTime ? ` · ${to12(b.startTime)}` : ''}</div>
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
              { to: '/meeting-rooms', label: 'Book a room' },
              { to: '/studios', label: 'Studios' },
              { to: '/messages', label: 'Message us' },
              { to: '/events', label: 'Events' },
            ].map(q => (
              <Link key={q.to} to={q.to} className="hx-card p-6 hover:bg-bone transition-colors">
                <span className="font-heading uppercase tracking-nav text-[11px] text-ink">{q.label}</span>
                <ArrowRight size={13} className="mt-3 text-hexa-green" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Page>
  )
}
