import { useState } from 'react'
import { CheckCircle2, Users, Clock, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { Page, PageHeader, Card, Eyebrow, Empty, money0 } from './ui.jsx'
import { findFunctionSpace } from './functionSpace.js'

const LAYOUTS = [
  { name: 'Cocktail', cap: 'Up to 100' },
  { name: 'Seminar', cap: 'Up to 80' },
  { name: 'Classroom', cap: 'Up to 45' },
  { name: 'Boardroom', cap: 'Up to 26' },
]

const POLICIES = [
  'All function bookings are by request and subject to availability and approval by the Hexa Space team.',
  'Minimum three-hour hire. A 25% deposit is required to confirm; the balance is due 7 days before the event.',
  'Cancellations within 14 days of the event forfeit the deposit. A refundable security bond may apply.',
  'External catering, beverages and suppliers must be approved in advance.',
  'Events over 50 guests require current public liability insurance.',
  'Music and amplified audio curfew is 10:00pm, with pack-down complete by 11:00pm.',
  'A cleaning fee applies. The space must be returned in the condition it was provided.',
]

export default function PortalFunction({ spaces, member, company }) {
  const fn = findFunctionSpace(spaces)
  const rate = fn?.hourlyRate ?? fn?.rate
  const [f, setF] = useState({ eventName: '', eventType: 'Corporate', date: '', startTime: '18:00', endTime: '22:00', guests: '', layout: 'Cocktail', catering: '', av: '', notes: '', ack: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!f.date || !f.startTime || !f.endTime || !f.guests) return setError('Please complete date, time and guest numbers.')
    if (!f.ack) return setError('Please acknowledge the function booking policies to continue.')
    const reference = `FUNC-${Math.floor(100000 + Math.random() * 900000)}`
    const record = {
      id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      reference, type: 'function', resourceId: fn?.id ?? 'hx_func',
      memberId: member?.id ?? '', companyId: company?.id ?? '',
      date: f.date, startTime: f.startTime, endTime: f.endTime,
      title: f.eventName || `${f.eventType} function`,
      eventType: f.eventType, guests: Number(f.guests) || null, layout: f.layout,
      catering: f.catering, av: f.av, notes: f.notes,
      status: 'Pending', approval: 'requested', source: 'Portal', repeat: 'none',
      createdBy: 'Member', createdAt: new Date().toISOString().split('T')[0],
    }
    setSaving(true)
    const { error: dbErr } = await supabase.from('bookings').upsert({ id: record.id, data: record, updated_at: new Date().toISOString() })
    // Notify the team (fire-and-forget; works once deployed with email keys)
    fetch('/api/portal/notify-message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantName: company?.businessName, tenantEmail: company?.email, message: `Function booking request ${reference}: ${record.title}, ${f.date} ${f.startTime}-${f.endTime}, ${f.guests} guests (${f.layout}).` }),
    }).catch(() => {})
    setSaving(false)
    if (dbErr) return setError(dbErr.message)
    setDone({ reference })
  }

  if (!fn) {
    return (
      <Page>
        <PageHeader kicker="Events · By request" title="Function Space" />
        <Empty label="The Function Space isn't available to book online yet." sub="Please contact our team to enquire." />
      </Page>
    )
  }

  if (done) {
    return (
      <Page>
        <PageHeader kicker="Events · By request" title="Function Space" />
        <Card className="p-10 text-center max-w-xl mx-auto">
          <CheckCircle2 size={28} className="mx-auto text-hexa-green" />
          <h2 className="hx-display text-2xl mt-4">Request received</h2>
          <p className="hx-prose mt-3">
            Thank you — your function request <span className="text-ink font-heading tracking-nav text-[12px]">{done.reference}</span> has
            been sent to our events team. We'll review availability and be in touch to confirm details, catering and your deposit.
          </p>
          <button onClick={() => setDone(null)} className="hx-btn mt-7">Submit another request</button>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader kicker="Events · By request" title="Function Space">
        A light-filled venue for launches, dinners and conferences — booked by request, with a
        dedicated coordinator handling every detail.
      </PageHeader>

      {/* Feature band */}
      <div className="bg-charcoal text-paper px-8 md:px-10 py-8 flex flex-wrap items-center gap-x-12 gap-y-4 mb-9">
        <div>
          <Eyebrow className="text-paper/50">The Function Space</Eyebrow>
          <div className="font-display font-extralight text-2xl mt-1">{fn.unitNumber}</div>
        </div>
        <div className="flex items-center gap-2"><Users size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{fn.size || '20–100 guests'}</span></div>
        {rate ? <div className="flex items-center gap-2"><Clock size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{money0(rate)}/hr</span></div> : null}
        <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">Approval required</span></div>
      </div>

      {/* Layouts */}
      <Eyebrow className="mb-4">Configurations</Eyebrow>
      <div className="grid gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        {LAYOUTS.map((l, i) => (
          <Card key={l.name} className="p-6">
            <span className="font-heading uppercase tracking-label text-[11px] text-muted">0{i + 1}</span>
            <h3 className="font-display font-extralight text-2xl mt-3">{l.name}</h3>
            <p className="font-heading uppercase tracking-nav text-[11px] text-hexa-green mt-2">{l.cap}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8 items-start">
        {/* Request form */}
        <form onSubmit={submit}>
          <Eyebrow className="mb-4">Request a booking</Eyebrow>
          <Card className="p-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div><label className="hx-eyebrow block mb-1.5">Event name</label><input className="hx-input" value={f.eventName} onChange={up('eventName')} placeholder="e.g. Brand launch" /></div>
              <div><label className="hx-eyebrow block mb-1.5">Event type</label>
                <select className="hx-input" value={f.eventType} onChange={up('eventType')}>
                  <option>Corporate</option><option>Launch</option><option>Conference / Seminar</option><option>Dinner</option><option>Celebration</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              <div><label className="hx-eyebrow block mb-1.5">Date</label><input type="date" className="hx-input" value={f.date} onChange={up('date')} required /></div>
              <div><label className="hx-eyebrow block mb-1.5">From</label><input type="time" className="hx-input" value={f.startTime} onChange={up('startTime')} required /></div>
              <div><label className="hx-eyebrow block mb-1.5">To</label><input type="time" className="hx-input" value={f.endTime} onChange={up('endTime')} required /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div><label className="hx-eyebrow block mb-1.5">Expected guests</label><input type="number" min={1} max={120} className="hx-input" value={f.guests} onChange={up('guests')} placeholder="e.g. 60" required /></div>
              <div><label className="hx-eyebrow block mb-1.5">Layout</label>
                <select className="hx-input" value={f.layout} onChange={up('layout')}>
                  {LAYOUTS.map((l) => <option key={l.name} value={l.name}>{l.name} — {l.cap}</option>)}
                </select>
              </div>
            </div>
            <div><label className="hx-eyebrow block mb-1.5">Catering & beverages</label><input className="hx-input" value={f.catering} onChange={up('catering')} placeholder="In-house, external, or none" /></div>
            <div><label className="hx-eyebrow block mb-1.5">AV & staging needs</label><input className="hx-input" value={f.av} onChange={up('av')} placeholder="PA, screens, staging, lighting…" /></div>
            <div><label className="hx-eyebrow block mb-1.5">Anything else</label><textarea rows={3} className="hx-input" value={f.notes} onChange={up('notes')} placeholder="Run sheet, accessibility, special requests…" /></div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={f.ack} onChange={(e) => setF({ ...f, ack: e.target.checked })} className="mt-1 accent-[#7F8B2F]" />
              <span className="hx-prose text-[13px]">I've read and accept the function booking policies, and understand this request is subject to approval and a deposit.</span>
            </label>

            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
            <button type="submit" disabled={saving} className="hx-btn w-full disabled:opacity-50">{saving ? 'Sending…' : 'Submit function request'}</button>
          </Card>
        </form>

        {/* Policies */}
        <div>
          <Eyebrow className="mb-4">Policies</Eyebrow>
          <Card className="p-7">
            <ul className="space-y-3.5">
              {POLICIES.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-[7px] h-1 w-1 shrink-0 bg-hexa-green" />
                  <span className="hx-prose text-[13px]">{p}</span>
                </li>
              ))}
            </ul>
            <p className="hx-prose text-[12px] mt-6 border-t border-ink/10 pt-4">
              Full terms are provided with your booking confirmation. Questions? Email{' '}
              <a href="mailto:events@hexaspace.com.au" className="text-hexa-green hover:text-ink">events@hexaspace.com.au</a>.
            </p>
          </Card>
        </div>
      </div>
    </Page>
  )
}
