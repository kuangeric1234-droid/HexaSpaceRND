import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import SignatureCanvas from './SignatureCanvas.jsx'
import { TERMS, TERMS_INTRO, ADDONS, money, computeQuote } from '../lib/functionBooking.js'

function Screen({ icon, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-md p-10 shadow-sm max-w-md text-center">
        {icon && <div className="text-4xl mb-4">{icon}</div>}
        <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="bg-black px-6 py-4">
      <span className="text-white font-black tracking-[0.3em] text-sm">HEXA SPACE</span>
      <span className="text-gray-400 text-xs ml-3">Function Space Hire</span>
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(`${d}T00:00:00`), 'EEEE, d MMMM yyyy') } catch { return d }
}

function Row({ label, value, strong, muted }) {
  return (
    <div className={`flex items-baseline justify-between py-1.5 ${strong ? 'font-bold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  )
}

export default function FunctionSignPage({ token }) {
  const [state, setState] = useState('loading') // loading|ready|signed|invalid|error
  const [b, setB] = useState(null)
  const [view, setView] = useState('quote')     // quote | terms | sign
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [dateStr, setDateStr] = useState(format(new Date(), 'dd/MM/yyyy'))
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const sigRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.from('function_bookings').select('data')
        if (error) { setState('error'); return }
        const match = (data ?? []).map((r) => r.data).find((x) => x?.signingToken === token)
        if (!match) { setState('invalid'); return }
        setB(match)
        if (match.name) setName(match.name)
        setState(match.signedAt ? 'signed' : 'ready')
      } catch { setState('error') }
    }
    load()
  }, [token])

  const q = b?.quote || (b ? computeQuote(b) : null)

  async function handleSign() {
    if (!agreed) { alert('Please confirm you have read and agree to the Terms & Conditions.'); return }
    if (!name.trim()) { alert('Please enter your full name.'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw your signature.'); return }
    setSubmitting(true)
    try {
      const signatureData = sigRef.current.toDataURL()
      const now = new Date().toISOString()
      const updated = {
        ...b, stage: 'signed', signedAt: now, signerName: name.trim(), signerTitle: title.trim(),
        signerDate: dateStr, signatureData, agreed: true, read: false, updatedAt: now,
      }
      await supabase.from('function_bookings').update({ data: updated, updated_at: now }).eq('id', b.id)
      fetch('/api/function-bookings/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, mode: 'signed' }),
      }).catch(() => {})
      setB(updated)
      setState('signed')
    } catch (err) {
      console.error(err); alert('Something went wrong. Please try again.')
    } finally { setSubmitting(false) }
  }

  if (state === 'loading') return <Screen title="Loading…" />
  if (state === 'invalid') return <Screen icon="🔒" title="Invalid or expired link" subtitle="This link is invalid or has already been used. Contact events@hexaspace.com.au for help." />
  if (state === 'error') return <Screen icon="⚠️" title="Something went wrong" subtitle="Please try again or contact events@hexaspace.com.au." />
  if (state === 'signed') {
    return <Screen icon="✅" title="Agreement signed" subtitle={`Thank you, ${b?.signerName || ''}. We’ll confirm your booking and send your deposit invoice shortly. Your date is held pending deposit payment.`} />
  }

  const addonLines = ADDONS.filter((a) => b?.addons?.[a.key])

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <div className="bg-white border-b border-gray-200 px-4 flex overflow-x-auto">
        {[{ k: 'quote', l: '1. Your Quote' }, { k: 'terms', l: '2. Terms' }, { k: 'sign', l: '✍ Sign' }].map((t) => (
          <button key={t.k} onClick={() => setView(t.k)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${view === t.k ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {view === 'quote' && (
        <div className="max-w-xl mx-auto my-8 px-4">
          <div className="bg-white border border-gray-200 rounded-md p-7 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">{b?.eventName || 'Function Space Hire'}</h2>
            <p className="text-sm text-gray-500 mb-5">{fmtDate(b?.eventDate)} · {b?.startTime}–{b?.endTime} · {b?.guests || '—'} guests</p>

            <div className="border-t border-gray-100 pt-3">
              <Row label={`Venue hire — ${q?.hours || 0} hrs @ ${money(q?.rate)}/hr ${q?.isWeekend ? '(weekend)' : '(weekday)'}`} value={money(q?.rental)} />
              <Row label="Cleaning fee" value={money(q?.cleaning)} />
              {q?.staffApplies ? <Row label={`F&B & AV staff (80+ pax) — ${q?.hours} hrs @ $40/hr`} value={money(q?.staff)} /> : null}
              {addonLines.map((a) => <Row key={a.key} label={a.label} value={money(a.price)} />)}
              {q?.lateFee ? <Row label="Late booking surcharge (within 7 days)" value={money(q?.lateFee)} /> : null}
              <div className="border-t border-gray-100 mt-2 pt-2">
                <Row label="GST (10%)" value={money(q?.gst)} muted />
                <Row label="Total (inc GST)" value={money(q?.total)} strong />
              </div>
            </div>

            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-md p-4">
              <Row label="Payable now — 50% deposit + $300 security" value={money(q?.dueNow)} strong />
              <Row label="Balance (due 14 days before event)" value={money(q?.balanceDue)} muted />
              <p className="text-xs text-gray-500 mt-2">The $300 security deposit is refundable within 5 business days after your event, provided there’s no damage or excessive cleaning. The 50% venue-hire deposit is non-refundable and secures your date.</p>
            </div>
            {b?.catering && <p className="text-xs text-gray-500 mt-4">You indicated you’d like catering — our team will be in touch to quote this separately.</p>}
            <button onClick={() => setView('terms')} className="w-full mt-6 bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800">Next: Terms →</button>
          </div>
        </div>
      )}

      {view === 'terms' && (
        <div className="max-w-xl mx-auto my-8 px-4">
          <div className="bg-white border border-gray-200 rounded-md p-7 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Terms &amp; Conditions</h2>
            <p className="text-xs text-gray-500 italic mb-4">{TERMS_INTRO}</p>
            <div className="space-y-3 text-xs text-gray-700 max-h-[420px] overflow-y-auto pr-2">
              {TERMS.map((t, i) => (
                <div key={i}><strong>{i + 1}. {t.title}</strong><p className="mt-0.5">{t.body}</p></div>
              ))}
            </div>
            <button onClick={() => setView('sign')} className="w-full mt-6 bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800">Proceed to Sign →</button>
          </div>
        </div>
      )}

      {view === 'sign' && (
        <div className="max-w-xl mx-auto my-8 px-4">
          <div className="bg-white border border-gray-200 rounded-md p-7 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sign Agreement</h2>
            <p className="text-sm text-gray-500 mb-6">By signing you agree to the quote above and the Function Space Hire Terms &amp; Conditions.</p>
            <div className="mb-4"><label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="Your full legal name" /></div>
            <div className="mb-4"><label className="block text-xs font-medium text-gray-600 mb-1">Title / position</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="e.g. Director, Organiser" /></div>
            <div className="mb-4"><label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" /></div>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Signature</label>
                <button onClick={() => sigRef.current?.clear()} className="text-xs text-gray-400 hover:text-gray-700 underline">Clear</button>
              </div>
              <SignatureCanvas ref={sigRef} height={140} />
            </div>
            <label className="flex items-start gap-3 mb-6 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 shrink-0" />
              <span className="text-sm text-gray-600">I have read, understood and agree to be bound by the Function Space Hire Terms &amp; Conditions and the quoted pricing, and I am authorised to sign.</span>
            </label>
            <button onClick={handleSign} disabled={submitting || !agreed} className="w-full bg-black text-white py-3 rounded-md text-sm font-bold hover:bg-gray-800 disabled:opacity-40">
              {submitting ? 'Submitting…' : 'Sign & Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
