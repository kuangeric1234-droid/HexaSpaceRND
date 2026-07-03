import { useEffect, useState } from 'react'

const money = (n) => `$${Number(n || 0).toLocaleString('en-AU')}`

// Public proposal page: client reviews their offices + pricing, picks a start date,
// fills in company details → creates their client profile + contract → e-sign.
// On-brand (bone / charcoal / hexa-green, brand fonts) to match hexaspace.com.au.
export default function ProposalAccept({ token }) {
  const [state, setState] = useState('loading') // loading | review | form | done | invalid
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ businessName: '', abn: '', contactName: '', email: '', phone: '', address: '', city: '', state: '', zip: '', country: 'Australia', startDate: '' })
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [selOffices, setSelOffices] = useState([])
  const [selParking, setSelParking] = useState([])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleOff = (id) => setSelOffices((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])
  const togglePark = (id) => setSelParking((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id])

  useEffect(() => {
    fetch(`/api/proposal?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setState('invalid'); return }
        if (d.status === 'expired') { setState('expired'); return }
        if (d.status === 'declined') { setState('declined'); return }
        setData(d)
        setForm((f) => ({ ...f, businessName: d.businessName || '', contactName: d.leadName || '', email: d.email || '', startDate: d.today || '' }))
        // Preselect the office if only one was offered (common case).
        if ((d.offices || []).length === 1) setSelOffices([d.offices[0].spaceId])
        setState(d.status === 'accepted' ? 'done' : 'review')
        if (d.status === 'accepted') setResult({ alreadyAccepted: true })
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function decline() {
    const reason = window.prompt("We're sorry this one isn't right. Any feedback for us? (optional)")
    if (reason === null) return
    try {
      const res = await fetch('/api/proposal-decline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d.error || 'Something went wrong. Please try again.')
        return
      }
      setState('declined')
    } catch {
      setErr('Something went wrong. Please try again.')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (selOffices.length === 0) { setErr('Please choose an office.'); return }
    if (!form.businessName.trim() || !form.contactName.trim() || !form.email.trim()) { setErr('Company name, your name and email are required.'); return }
    setSubmitting(true); setErr('')
    try {
      const res = await fetch('/api/proposal-accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...form, officeIds: selOffices, parkingIds: selParking }) })
      const d = await res.json()
      if (res.status === 410) { setState('expired'); return }
      if (!res.ok) { setErr(d.error || 'Something went wrong. Please try again.'); setSubmitting(false); return }
      setResult(d); setState('done')
    } catch { setErr('Something went wrong. Please try again.'); setSubmitting(false) }
  }

  const offices = data?.offices || []
  const parking = data?.parking || []
  const total = [...offices.filter((o) => selOffices.includes(o.spaceId)), ...parking.filter((o) => selParking.includes(o.spaceId))].reduce((s, o) => s + Number(o.price || 0), 0)
  const TERM_LABEL = { mtm: 'Month-to-month', '6mo': '6-month term', '12mo': '12-month term' }
  const termMonths = data?.term === '6mo' ? 6 : 12
  const endFrom = (s) => { if (!s) return ''; const d = new Date(`${s}T00:00:00`); d.setMonth(d.getMonth() + termMonths); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] }
  const fmtD = (s) => { try { return new Date(`${s}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return s } }

  return (
    <div className="min-h-screen bg-bone font-body text-ink py-10 px-4">
      <div className="max-w-xl mx-auto">
        <header className="bg-charcoal text-paper px-8 py-8 rounded-t-lg">
          <div className="font-heading uppercase tracking-[0.3em] text-sm">Hexa&nbsp;Space</div>
          <div className="font-display font-extralight text-3xl mt-3">Your proposal</div>
        </header>

        <div className="bg-paper border border-ink/10 border-t-0 rounded-b-lg">
          {state === 'loading' && <div className="p-10 text-center hx-prose">Loading your proposal…</div>}
          {state === 'invalid' && <div className="p-10 text-center hx-prose">This proposal link is invalid or has expired. Please contact us for a new one.</div>}
          {state === 'expired' && (
            <div className="p-10 text-center space-y-3">
              <div className="hx-eyebrow">Proposal expired</div>
              <p className="hx-prose text-[14px]">This proposal has expired — contact us and we'll refresh it for you with current availability and pricing.</p>
              <p className="hx-prose text-[13px] text-portal-muted">info@hexaspace.com.au</p>
            </div>
          )}
          {state === 'declined' && (
            <div className="p-10 text-center space-y-3">
              <div className="hx-eyebrow">Proposal declined</div>
              <p className="hx-prose text-[14px]">No problem — thanks for letting us know. If anything changes, or you'd like us to put together a different option, we'd love to hear from you.</p>
              <p className="hx-prose text-[13px] text-portal-muted">info@hexaspace.com.au</p>
            </div>
          )}

          {(state === 'review' || state === 'form') && data && (
            <div className="p-8 space-y-6">
              <p className="hx-prose text-[15px]">Hi {data.leadName || 'there'}, here's the proposal we've put together for you.</p>

              <div>
                <div className="hx-eyebrow mb-2">{offices.length > 1 ? 'Choose your office' : (data.typeLabel || 'Private Office')}</div>
                <div className="space-y-2">
                  {offices.map((o) => {
                    const on = selOffices.includes(o.spaceId)
                    const meta = [o.level, o.pax ? `${o.pax} pax` : '', o.note].filter(Boolean).join(' · ')
                    return (
                      <button type="button" key={o.spaceId} onClick={() => toggleOff(o.spaceId)}
                        className={`w-full flex items-center gap-3 text-left border p-3 transition-colors ${on ? 'border-hexa-green bg-bone' : 'border-ink/15 bg-paper hover:border-ink/40'}`}>
                        <span className={`h-4 w-4 shrink-0 border ${on ? 'bg-hexa-green border-hexa-green' : 'border-ink/30'}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-heading uppercase tracking-nav text-[12px] text-ink">{o.unit}</span>
                          {meta && <span className="block hx-prose text-[12px] text-portal-muted mt-0.5">{meta}</span>}
                        </span>
                        <span className="font-body text-[15px] text-ink tabular-nums">{money(o.price)}<span className="text-portal-muted">/mo</span></span>
                      </button>
                    )
                  })}
                </div>
                {offices.length > 1 && <p className="hx-prose text-[12px] text-portal-muted mt-2">Pick your preferred office — or select more than one for additional offices.</p>}

                {parking.length > 0 && (
                  <>
                    <div className="hx-eyebrow mb-2 mt-5">Optional parking</div>
                    <div className="space-y-2">
                      {parking.map((o) => {
                        const on = selParking.includes(o.spaceId)
                        return (
                          <button type="button" key={o.spaceId} onClick={() => togglePark(o.spaceId)}
                            className={`w-full flex items-center gap-3 text-left border p-3 transition-colors ${on ? 'border-hexa-green bg-bone' : 'border-ink/15 bg-paper hover:border-ink/40'}`}>
                            <span className={`h-4 w-4 shrink-0 border ${on ? 'bg-hexa-green border-hexa-green' : 'border-ink/30'}`} />
                            <span className="flex-1 font-heading uppercase tracking-nav text-[12px] text-ink">Car parking {o.unit}</span>
                            <span className="font-body text-[15px] text-ink tabular-nums">{money(o.price)}<span className="text-portal-muted">/mo</span></span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                <div className="flex items-baseline justify-between border-t border-ink/10 mt-4 pt-4">
                  <span className="font-heading uppercase tracking-nav text-[11px] text-ink">Total / month (ex GST)</span>
                  <span className="font-display text-2xl">{total ? money(total) : '—'}</span>
                </div>
              </div>

              <div className="bg-bone border border-ink/10 px-4 py-3">
                <div className="flex items-baseline justify-between"><span className="hx-prose text-[13px] text-portal-muted">Term</span><span className="font-heading uppercase tracking-nav text-[11px] text-ink">{TERM_LABEL[data.term] || '12-month term'}</span></div>
                {data.freeMonths > 0 && <div className="flex items-baseline justify-between mt-1.5"><span className="hx-prose text-[13px] text-portal-muted">New-member offer</span><span className="font-heading uppercase tracking-nav text-[11px] text-hexa-green">Final {data.freeMonths} month{data.freeMonths > 1 ? 's' : ''} rent-free</span></div>}
              </div>
              <p className="hx-prose text-[12px] text-portal-muted">Valid for {data.validityDays} days. Pricing excludes GST and is subject to a signed licence agreement.</p>

              {state === 'review' ? (
                <>
                  <button onClick={() => setState('form')} className="hx-btn w-full">Accept &amp; continue →</button>
                  <button onClick={decline} className="block w-full text-center hx-prose text-[12px] text-portal-muted underline underline-offset-2 hover:text-ink">
                    This isn't right for me — decline this proposal
                  </button>
                  {err && <p className="hx-prose text-[13px] text-red-700 text-center">{err}</p>}
                </>
              ) : (
                <form onSubmit={submit} className="space-y-5 border-t border-ink/10 pt-6">
                  <div>
                    <div className="hx-eyebrow mb-3">Start date</div>
                    <label className="block"><span className="hx-eyebrow block mb-1.5">Preferred commencement date *</span><input type="date" value={form.startDate} min={data.today} onChange={set('startDate')} className="hx-input" /></label>
                    {form.startDate && <p className="hx-prose text-[12px] text-portal-muted mt-2">{TERM_LABEL[data.term] || '12-month term'} · {fmtD(form.startDate)} → {fmtD(endFrom(form.startDate))}{data.freeMonths > 0 ? ` · final ${data.freeMonths} month${data.freeMonths > 1 ? 's' : ''} rent-free` : ''}</p>}
                  </div>

                  <div>
                    <div className="hx-eyebrow mb-3">Your company details</div>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block col-span-2"><span className="hx-eyebrow block mb-1.5">Company name *</span><input value={form.businessName} onChange={set('businessName')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">ABN</span><input value={form.abn} onChange={set('abn')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">Your name *</span><input value={form.contactName} onChange={set('contactName')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">Email *</span><input type="email" value={form.email} onChange={set('email')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">Phone</span><input value={form.phone} onChange={set('phone')} className="hx-input" /></label>
                      <label className="block col-span-2"><span className="hx-eyebrow block mb-1.5">Address</span><input value={form.address} onChange={set('address')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">City</span><input value={form.city} onChange={set('city')} className="hx-input" /></label>
                      <label className="block"><span className="hx-eyebrow block mb-1.5">State</span><input value={form.state} onChange={set('state')} className="hx-input" /></label>
                    </div>
                  </div>
                  {err && <p className="hx-prose text-[13px] text-red-700">{err}</p>}
                  <button type="submit" disabled={submitting} className="hx-btn w-full disabled:opacity-50">
                    {submitting ? 'Setting up…' : 'Accept & set up my agreement'}
                  </button>
                  <p className="hx-prose text-[12px] text-portal-muted text-center">We'll create your licence agreement and send it straight to you to e-sign.</p>
                </form>
              )}
            </div>
          )}

          {state === 'done' && (
            <div className="p-10 text-center space-y-4">
              <div className="hx-eyebrow text-hexa-green">{result?.alreadyAccepted ? 'Already accepted' : 'Proposal accepted'}</div>
              <h2 className="font-display font-extralight text-3xl text-ink">{result?.alreadyAccepted ? "You're all set." : 'Welcome aboard. 🎉'}</h2>
              <p className="hx-prose text-[14px]">Your licence agreement{result?.contractNumber ? ` (${result.contractNumber})` : ''} is ready to sign — we've also emailed you the link.</p>
              {result?.signLink && (
                <a href={result.signLink} className="hx-btn inline-block">Review &amp; sign now →</a>
              )}
            </div>
          )}
        </div>

        <p className="text-center hx-eyebrow mt-6 normal-case tracking-normal text-portal-muted">402/830 Whitehorse Road, Box Hill VIC 3128 · hexaspace.com.au</p>
      </div>
    </div>
  )
}
