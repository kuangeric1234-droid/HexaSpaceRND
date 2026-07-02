import { useRef, useState } from 'react'
import { CheckCircle2, Users, Clock, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { Page, PageHeader, Card, Eyebrow, Empty, money0 } from './ui.jsx'
import { findFunctionSpace } from './functionSpace.js'
import SignatureCanvas from '../components/SignatureCanvas.jsx'
import { ADDONS, TERMS, TERMS_INTRO, computeQuote, money } from '../lib/functionBooking.js'

const LAYOUTS = [
  { name: 'Cocktail', cap: 'Up to 100' },
  { name: 'Seminar', cap: 'Up to 80' },
  { name: 'Classroom', cap: 'Up to 45' },
  { name: 'Boardroom', cap: 'Up to 26' },
]

const today = () => new Date().toISOString().split('T')[0]

function Row({ label, value, strong, muted }) {
  return (
    <div className={`flex items-baseline justify-between py-1 ${strong ? 'text-ink font-medium' : muted ? 'text-portal-muted' : 'text-ink'}`}>
      <span className="hx-prose text-[13px]">{label}</span>
      <span className="hx-prose text-[13px] tabular-nums">{value}</span>
    </div>
  )
}

export default function PortalFunction({ spaces, member, company }) {
  const fn = findFunctionSpace(spaces)
  const rate = fn?.hourlyRate ?? fn?.rate
  const [f, setF] = useState({ eventName: '', eventType: 'Corporate', date: '', startTime: '18:00', endTime: '22:00', guests: '', layout: 'Cocktail', catering: false, addons: { parking: false, nameTags: false, photographer: false }, notes: '', signerName: member?.name || '', ack: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const sigRef = useRef(null)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setAddon = (k, v) => setF((p) => ({ ...p, addons: { ...p.addons, [k]: v } }))

  const quote = computeQuote({ eventDate: f.date, startTime: f.startTime, endTime: f.endTime, guests: f.guests, addons: f.addons, bookedOn: today() })

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!f.date || !f.startTime || !f.endTime || !f.guests) return setError('Please complete date, time and guest numbers.')
    if (!f.signerName.trim()) return setError('Please enter your full name for the signature.')
    if (sigRef.current?.isEmpty()) return setError('Please add your signature.')
    if (!f.ack) return setError('Please accept the Terms & Conditions to continue.')

    const ref = `FN-${Math.floor(100000 + Math.random() * 900000)}`
    const id = `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const record = {
      id, ref, source: 'member', stage: 'pending_approval', read: false,
      name: f.signerName, organisation: company?.businessName || '', email: company?.email || member?.email || '',
      phone: member?.phone || company?.phone || '', memberId: member?.id || '', companyId: company?.id || '',
      eventName: f.eventName || `${f.eventType} function`, eventType: f.eventType,
      eventDate: f.date, startTime: f.startTime, endTime: f.endTime, guests: f.guests,
      layout: f.layout, catering: f.catering, addons: f.addons, additionalRequirements: f.notes,
      quote, signerName: f.signerName.trim(), signatureData: sigRef.current.toDataURL(), signedAt: now, agreed: true,
      createdAt: today(), updatedAt: now,
    }
    setSaving(true)
    const { error: dbErr } = await supabase.from('function_bookings').upsert({ id, data: record, updated_at: now })
    fetch('/api/function-bookings/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking: record, mode: 'signed' }) }).catch(() => {})
    setSaving(false)
    if (dbErr) return setError(dbErr.message)
    setDone({ ref })
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
          <p className="hx-prose mt-3">Thank you — your signed function request <span className="text-ink font-heading tracking-nav text-[12px]">{done.ref}</span> has been sent to our events team for approval. Once approved we’ll raise your deposit &amp; security invoices and lock in your date (with a 30-minute buffer each side).</p>
          <button onClick={() => setDone(null)} className="hx-btn mt-7">Submit another request</button>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader kicker="Events · By request" title="Function Space">
        A light-filled venue for launches, dinners and conferences — request, sign and we’ll confirm.
      </PageHeader>

      <div className="bg-charcoal text-paper px-8 md:px-10 py-8 flex flex-wrap items-center gap-x-12 gap-y-4 mb-9">
        <div><Eyebrow className="text-paper/50">The Function Space</Eyebrow><div className="font-display font-extralight text-2xl mt-1">{fn.unitNumber}</div></div>
        <div className="flex items-center gap-2"><Users size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{fn.size || '20–100 guests'}</span></div>
        {rate ? <div className="flex items-center gap-2"><Clock size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{money0(rate)}/hr weekday</span></div> : null}
        <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">Approval required</span></div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8 items-start">
        <form onSubmit={submit}>
          <Eyebrow className="mb-4">Request &amp; sign</Eyebrow>
          <Card className="p-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div><label className="hx-eyebrow block mb-1.5">Event name</label><input className="hx-input" value={f.eventName} onChange={up('eventName')} placeholder="e.g. Brand launch" /></div>
              <div><label className="hx-eyebrow block mb-1.5">Event type</label>
                <select className="hx-input" value={f.eventType} onChange={up('eventType')}><option>Corporate</option><option>Launch</option><option>Conference / Seminar</option><option>Dinner</option><option>Celebration</option><option>Other</option></select>
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
                <select className="hx-input" value={f.layout} onChange={up('layout')}>{LAYOUTS.map((l) => <option key={l.name} value={l.name}>{l.name} — {l.cap}</option>)}</select>
              </div>
            </div>

            <div>
              <label className="hx-eyebrow block mb-2">Add-ons</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 hx-prose text-[13px]"><input type="checkbox" className="accent-[#7F8B2F]" checked={f.catering} onChange={(e) => setF({ ...f, catering: e.target.checked })} /> Catering required <span className="text-portal-muted">(quoted separately)</span></label>
                {ADDONS.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 hx-prose text-[13px]"><input type="checkbox" className="accent-[#7F8B2F]" checked={!!f.addons[a.key]} onChange={(e) => setAddon(a.key, e.target.checked)} /> {a.label} — {money(a.price)}</label>
                ))}
                {Number(f.guests) > 80 && <p className="hx-prose text-[12px] text-hexa-green">80+ guests — F&B & AV staff ($40/hr) will be added.</p>}
              </div>
            </div>

            <div><label className="hx-eyebrow block mb-1.5">Anything else</label><textarea rows={3} className="hx-input" value={f.notes} onChange={up('notes')} placeholder="Run sheet, accessibility, special requests…" /></div>

            <div>
              <label className="hx-eyebrow block mb-1.5">Full name (signature)</label>
              <input className="hx-input" value={f.signerName} onChange={up('signerName')} placeholder="Your full legal name" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5"><label className="hx-eyebrow">Signature</label><button type="button" onClick={() => sigRef.current?.clear()} className="hx-prose text-[12px] underline">Clear</button></div>
              <SignatureCanvas ref={sigRef} height={130} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={f.ack} onChange={(e) => setF({ ...f, ack: e.target.checked })} className="mt-1 accent-[#7F8B2F]" />
              <span className="hx-prose text-[13px]">I have read and accept the Function Space Hire Terms &amp; Conditions and the quoted pricing, and understand this request is subject to team approval and payment of the deposit.</span>
            </label>

            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
            <button type="submit" disabled={saving} className="hx-btn w-full disabled:opacity-50">{saving ? 'Sending…' : 'Sign & submit request'}</button>
          </Card>
        </form>

        <div className="space-y-8">
          <div>
            <Eyebrow className="mb-4">Your quote</Eyebrow>
            <Card className="p-7">
              <Row label={`Venue hire — ${quote.hours} hrs @ ${money(quote.rate)}/hr ${quote.isWeekend ? '(weekend)' : '(weekday)'}`} value={money(quote.rental)} />
              <Row label="Cleaning fee" value={money(quote.cleaning)} />
              {quote.staffApplies ? <Row label={`F&B & AV staff (80+ pax)`} value={money(quote.staff)} /> : null}
              {ADDONS.filter((a) => f.addons[a.key]).map((a) => <Row key={a.key} label={a.label} value={money(a.price)} />)}
              {quote.lateFee ? <Row label="Late booking surcharge" value={money(quote.lateFee)} /> : null}
              <div className="border-t border-ink/10 mt-2 pt-2">
                <Row label="GST (10%)" value={money(quote.gst)} muted />
                <Row label="Total (inc GST)" value={money(quote.total)} strong />
              </div>
              <div className="mt-3 border-t border-ink/10 pt-3">
                <Row label="Payable now — 50% deposit + $300 security" value={money(quote.dueNow)} strong />
                <Row label="Balance (14 days before event)" value={money(quote.balanceDue)} muted />
              </div>
              <p className="hx-prose text-[12px] mt-4">The $300 security deposit is refundable within 5 business days after your event if there’s no damage or excessive cleaning.</p>
            </Card>
          </div>
          <div>
            <Eyebrow className="mb-4">Terms &amp; Conditions</Eyebrow>
            <Card className="p-7">
              <p className="hx-prose text-[12px] italic mb-3">{TERMS_INTRO}</p>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-2">
                {TERMS.map((t, i) => <div key={i} className="hx-prose text-[12px]"><strong>{i + 1}. {t.title}</strong> {t.body}</div>)}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Page>
  )
}
