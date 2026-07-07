import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Users, Clock, ShieldCheck, CalendarCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { Page, PageHeader, Card, Eyebrow, Empty, money0 } from './ui.jsx'
import { findFunctionSpace } from './functionSpace.js'
import SignatureCanvas from '../components/SignatureCanvas.jsx'
import { ADDONS, LAYOUTS, TERMS, TERMS_INTRO, computeQuote, money, bookingSessions } from '../lib/functionBooking.js'

const today = () => new Date().toISOString().split('T')[0]
const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) } catch { return d }
}
const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  const ap = h < 12 ? 'am' : 'pm'
  const hh = ((h + 11) % 12) || 12
  return `${hh}:${String(m || 0).padStart(2, '0')}${ap}`
}

// What the client should SEE for their current function booking — so a completed
// booking never shows the blank form again:
//   'confirmed' → date secured (deposit paid)
//   'deposit'   → details signed + deposit invoice issued, awaiting payment
//   'review'    → member self-serve request signed, awaiting admin approval
//   null        → nothing submitted yet → show the form
function bookingStatus(b) {
  if (!b) return null
  if (['confirmed', 'completed'].includes(b.stage)) return 'confirmed'
  if (b.signedAt) return b.stage === 'requested' ? 'review' : 'deposit'
  return null
}

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
  const [existing, setExisting] = useState(null)
  const [f, setF] = useState({
    businessName: company?.businessName || '', abn: company?.abn || '', companyPhone: company?.phone || '', memberPhone: member?.phone || '',
    eventName: '', eventType: 'Corporate', date: '', startTime: '18:00', endTime: '22:00', guests: '', layout: 'Cocktail',
    catering: false, addons: { parking: false, nameTags: false, photographer: false }, notes: '', signerName: member?.name || company?.contactName || '', ack: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sigRef = useRef(null)
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setAddon = (k, v) => setF((p) => ({ ...p, addons: { ...p.addons, [k]: v } }))

  // Find this client's active function booking (created from the website request /
  // approval) so we prefill it and complete the same record.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('function_bookings').select('id, data')
      const email = (company?.email || member?.email || '').toLowerCase()
      const mine = (data ?? []).map((r) => r.data).filter((x) =>
        (x.companyId && x.companyId === company?.id) || (email && (x.email || '').toLowerCase() === email))
      // Pick the most recent live booking (incl. confirmed) so a signed/confirmed
      // booking shows its status rather than re-opening the blank form.
      const active = mine
        .filter((x) => ['invited', 'awaiting_deposit', 'requested', 'quoted', 'enquiry', 'confirmed'].includes(x.stage))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
      if (active) {
        setExisting(active)
        setF((p) => ({
          ...p,
          businessName: p.businessName || active.organisation || active.companyInfo?.businessName || '',
          eventName: active.eventName || p.eventName, eventType: active.eventType || p.eventType,
          date: active.eventDate || p.date, startTime: active.startTime || p.startTime, endTime: active.endTime || p.endTime,
          guests: active.guests || p.guests, layout: active.layout || p.layout,
          addons: { ...p.addons, ...(active.addons || {}) }, catering: !!active.catering,
        }))
      }
    })()
  }, [company?.id])

  // Carry any negotiated pricing (discount / custom rate) from the client's
  // existing booking so the portal shows the SAME numbers as the proposal.
  const quote = computeQuote({ eventDate: f.date, startTime: f.startTime, endTime: f.endTime, guests: f.guests, addons: f.addons, priceOverrides: existing?.priceOverrides, bookedOn: today() })

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!f.businessName.trim()) return setError('Please enter your company / organisation name.')
    if (!f.date || !f.startTime || !f.endTime || !f.guests) return setError('Please complete date, time and guest numbers.')
    if (!f.signerName.trim()) return setError('Please enter your full name for the signature.')
    if (sigRef.current?.isEmpty()) return setError('Please add your signature.')
    if (!f.ack) return setError('Please accept the Terms & Conditions to continue.')

    setSaving(true)
    const now = new Date().toISOString()
    const id = existing?.id || `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const ref = existing?.ref || `FN-${Math.floor(100000 + Math.random() * 900000)}`
    // Website-approved records arrive as 'invited'/'awaiting_deposit' → the deposit
    // is (or will be) raised. Member self-serve (no invite) → 'requested' for admin review first.
    const viaInvite = ['invited', 'awaiting_deposit'].includes(existing?.stage)
    const record = {
      ...(existing || {}), id, ref, source: existing?.source || 'member',
      stage: viaInvite ? (existing?.stage === 'awaiting_deposit' ? 'awaiting_deposit' : 'invited') : 'requested',
      name: f.signerName, organisation: f.businessName, email: company?.email || member?.email || '',
      phone: f.memberPhone || company?.phone || '', memberId: member?.id || existing?.memberId || '', companyId: company?.id || existing?.companyId || '',
      eventName: f.eventName || `${f.eventType} function`, eventType: f.eventType,
      eventDate: f.date, startTime: f.startTime, endTime: f.endTime, guests: f.guests, layout: f.layout,
      catering: f.catering, addons: f.addons, additionalRequirements: f.notes,
      companyInfo: { businessName: f.businessName, abn: f.abn, phone: f.companyPhone, contactName: f.signerName },
      memberInfo: { name: f.signerName, email: company?.email || member?.email || '', phone: f.memberPhone },
      quote, signerName: f.signerName.trim(), signatureData: sigRef.current.toDataURL(), signedAt: now, agreed: true,
      createdAt: existing?.createdAt || today(), updatedAt: now,
    }
    const { error: dbErr } = await supabase.from('function_bookings').upsert({ id, data: record, updated_at: now })
    if (dbErr) { setSaving(false); return setError(dbErr.message) }

    if (viaInvite) {
      // Raise the deposit + email it, move to awaiting_deposit.
      await fetch('/api/function-bookings/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
    } else {
      fetch('/api/function-bookings/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking: record, mode: 'signed' }) }).catch(() => {})
    }
    // Show the status screen (persisted): the freshly-signed record drives it, and
    // a reload will re-derive the same status from the stored booking.
    setExisting(record)
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!fn) {
    return (
      <Page>
        <PageHeader kicker="Events · By request" title="Function Space" />
        <Empty label="The Function Space isn't available to book online yet." sub="Please contact our team to enquire." />
      </Page>
    )
  }

  // Already signed / confirmed → show the booking's status, not the form again.
  const status = bookingStatus(existing)
  if (status) {
    const b = existing
    const q = b.quote || quote
    const first = (b.name || '').split(' ')[0]
    const refTag = <span className="text-ink font-heading tracking-nav text-[12px]">{b.ref}</span>
    const head = status === 'confirmed' ? "You're confirmed 🎉" : status === 'deposit' ? 'Almost there — deposit due' : 'Request received'
    return (
      <Page>
        <PageHeader kicker="Events · By request" title="Function Space" />
        <Card className="p-8 md:p-10 max-w-2xl mx-auto">
          {status === 'confirmed'
            ? <CalendarCheck size={28} className="text-hexa-green" />
            : <CheckCircle2 size={28} className="text-hexa-green" />}
          <h2 className="hx-display text-3xl mt-4">{head}</h2>
          <p className="hx-prose mt-3">
            {status === 'confirmed' && <>Your date is secured{first ? `, ${first}` : ''} — we can’t wait to host <strong>{b.eventName || 'your event'}</strong>. Booking {refTag}.</>}
            {status === 'deposit' && <>Thanks{first ? `, ${first}` : ''}! Your booking {refTag} is signed. We’ve emailed your <strong>deposit ({money(q.dueNow)})</strong> with payment details — your date is secured once it’s received.</>}
            {status === 'review' && <>Thanks{first ? `, ${first}` : ''} — your request {refTag} has been sent to our team for approval. Once it’s approved we’ll email your deposit to secure the date.</>}
          </p>

          <div className="mt-7 border-t border-ink/10 pt-5 grid sm:grid-cols-2 gap-x-10 gap-y-1">
            <Row label="Event" value={b.eventName || '—'} />
            <Row label="Type" value={b.eventType || '—'} />
            {bookingSessions(b).length > 1 ? (
              <div className="sm:col-span-2">
                <Row label={`Sessions (${bookingSessions(b).length})`} value="" strong />
                {bookingSessions(b).map((s, i) => (
                  <p key={i} className="hx-prose text-[13px]">{fmtDate(s.date)} · {fmtTime(s.startTime)} – {fmtTime(s.endTime)}</p>
                ))}
              </div>
            ) : (
              <>
                <Row label="Date" value={fmtDate(b.eventDate)} strong />
                <Row label="Time" value={`${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`} strong />
              </>
            )}
            <Row label="Guests" value={b.guests || '—'} />
            <Row label="Layout" value={b.layout || '—'} />
          </div>

          {status === 'confirmed' && (
            <div className="mt-5 border-t border-ink/10 pt-5">
              <Row label="Total (inc GST)" value={money(q.total)} />
              <Row label="Balance due — 14 days before" value={money(q.balanceDue)} strong />
              <Link to="/billing" className="hx-btn inline-block mt-5">View billing</Link>
            </div>
          )}
          {status === 'deposit' && (
            <div className="mt-5 border-t border-ink/10 pt-5">
              <Row label="Deposit due now" value={money(q.dueNow)} strong />
              <Row label="Balance — 14 days before event" value={money(q.balanceDue)} muted />
              <Link to="/billing" className="hx-btn inline-block mt-5">Pay deposit in Billing</Link>
            </div>
          )}
          {status === 'confirmed' && (
            <button type="button" onClick={() => setExisting(null)} className="hx-prose text-[12px] underline mt-6 block">Plan another event →</button>
          )}
        </Card>
      </Page>
    )
  }

  const depositScreen = ['invited', 'awaiting_deposit'].includes(existing?.stage)

  return (
    <Page>
      <PageHeader kicker="Events · By request" title={depositScreen ? 'Complete your function booking' : 'Function Space'}>
        {depositScreen ? 'Your date is approved — confirm your details below to secure it with a deposit.' : 'A light-filled venue for launches, dinners and conferences — request, sign and we’ll confirm.'}
      </PageHeader>

      <div className="bg-charcoal text-paper px-8 md:px-10 py-8 flex flex-wrap items-center gap-x-12 gap-y-4 mb-9">
        <div><Eyebrow className="text-paper/50">The Function Space</Eyebrow><div className="font-display font-extralight text-2xl mt-1">{fn.unitNumber}</div></div>
        <div className="flex items-center gap-2"><Users size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{fn.size || '20–100 guests'}</span></div>
        {rate ? <div className="flex items-center gap-2"><Clock size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">{money0(rate)}/hr weekday</span></div> : null}
        <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-hexa-green" /><span className="font-heading uppercase tracking-nav text-[11px]">Deposit secures your date</span></div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8 items-start">
        <form onSubmit={submit}>
          <Eyebrow className="mb-4">Your details</Eyebrow>
          <Card className="p-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <div><label className="hx-eyebrow block mb-1.5">Company / organisation *</label><input className="hx-input" value={f.businessName} onChange={up('businessName')} placeholder="Business or organisation name" /></div>
              <div><label className="hx-eyebrow block mb-1.5">ABN</label><input className="hx-input" value={f.abn} onChange={up('abn')} placeholder="For your invoice" /></div>
              <div><label className="hx-eyebrow block mb-1.5">Contact phone</label><input className="hx-input" value={f.memberPhone} onChange={up('memberPhone')} /></div>
              <div><label className="hx-eyebrow block mb-1.5">Company phone</label><input className="hx-input" value={f.companyPhone} onChange={up('companyPhone')} placeholder="If different" /></div>
            </div>

            <div className="border-t border-ink/10 pt-4 hx-eyebrow">Event</div>
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

            <div><label className="hx-eyebrow block mb-1.5">Full name (signature)</label><input className="hx-input" value={f.signerName} onChange={up('signerName')} placeholder="Your full legal name" /></div>
            <div>
              <div className="flex items-center justify-between mb-1.5"><label className="hx-eyebrow">Signature</label><button type="button" onClick={() => sigRef.current?.clear()} className="hx-prose text-[12px] underline">Clear</button></div>
              <SignatureCanvas ref={sigRef} height={130} />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={f.ack} onChange={(e) => setF({ ...f, ack: e.target.checked })} className="mt-1 accent-[#7F8B2F]" />
              <span className="hx-prose text-[13px]">I have read and accept the Function Space Hire Terms &amp; Conditions and the quoted pricing, and understand my date is secured once the deposit is paid.</span>
            </label>

            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>}
            <button type="submit" disabled={saving} className="hx-btn w-full disabled:opacity-50">{saving ? 'Submitting…' : depositScreen ? 'Confirm & get deposit invoice' : 'Sign & submit request'}</button>
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
              {(quote.extras ?? []).map((l, i) => <Row key={`x${i}`} label={l.description} value={money(l.amount)} />)}
              {quote.lateFee ? <Row label="Late booking surcharge" value={money(quote.lateFee)} /> : null}
              {quote.discount > 0 && (
                <Row label={`Discount${quote.discountPct ? ` (${quote.discountPct}%)` : ''}${quote.discountReason ? ` — ${quote.discountReason}` : ''}`} value={`−${money(quote.discount)}`} />
              )}
              <div className="border-t border-ink/10 mt-2 pt-2">
                <Row label="GST (10%)" value={money(quote.gst)} muted />
                <Row label="Total (inc GST)" value={money(quote.total)} strong />
              </div>
              <div className="mt-3 border-t border-ink/10 pt-3">
                <Row label={`Deposit due now — 50% + ${money(quote.securityDeposit ?? 300)} security`} value={money(quote.dueNow)} strong />
                <Row label="Balance (14 days before event)" value={money(quote.balanceDue)} muted />
              </div>
              <p className="hx-prose text-[12px] mt-4">The {money(quote.securityDeposit ?? 300)} security deposit is refundable within 5 business days after your event if there’s no damage or excessive cleaning.</p>
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
