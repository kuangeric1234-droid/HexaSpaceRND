import { useEffect, useState } from 'react'

const ic = 'w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black'
const money = (n) => `$${Number(n || 0).toLocaleString('en-AU')}`

// Public proposal page: client reviews their offices + pricing, accepts, fills in
// company details → creates their client profile + contract and sends it to e-sign.
export default function ProposalAccept({ token }) {
  const [state, setState] = useState('loading') // loading | review | form | done | invalid
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ businessName: '', abn: '', contactName: '', email: '', phone: '', address: '', city: '', state: '', zip: '', country: 'Australia' })
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    fetch(`/api/proposal?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { setState('invalid'); return }
        setData(d)
        setForm((f) => ({ ...f, businessName: d.businessName || '', contactName: d.leadName || '', email: d.email || '' }))
        setState(d.status === 'accepted' ? 'done' : 'review')
        if (d.status === 'accepted') setResult({ alreadyAccepted: true })
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function submit(e) {
    e.preventDefault()
    if (!form.businessName.trim() || !form.contactName.trim() || !form.email.trim()) { setErr('Company name, your name and email are required.'); return }
    setSubmitting(true); setErr('')
    try {
      const res = await fetch('/api/proposal-accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...form }) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Something went wrong. Please try again.'); setSubmitting(false); return }
      setResult(d); setState('done')
    } catch { setErr('Something went wrong. Please try again.'); setSubmitting(false) }
  }

  const total = (data?.offices || []).reduce((s, o) => s + Number(o.price || 0), 0)

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-10 px-4">
      <div className="max-w-lg mx-auto bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-black px-8 py-6">
          <div className="text-white text-lg font-bold tracking-widest">{(data?.company || 'HEXA SPACE').toUpperCase()}</div>
          <div className="text-gray-300 text-sm mt-1">Your proposal</div>
        </div>

        {state === 'loading' && <div className="p-8 text-center text-sm text-gray-500">Loading your proposal…</div>}
        {state === 'invalid' && <div className="p-8 text-center text-sm text-gray-600">This proposal link is invalid or has expired. Please contact us for a new one.</div>}

        {(state === 'review' || state === 'form') && data && (
          <div className="p-8 space-y-5">
            <p className="text-sm text-gray-700">Hi {data.leadName || 'there'}, here's the proposal we put together for you.</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200"><tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Office</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Details</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Monthly</th>
                </tr></thead>
                <tbody>
                  {data.offices.map((o, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-900">{o.unit}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{[o.level, o.pax ? `${o.pax} pax` : '', o.note].filter(Boolean).join(' · ')}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{money(o.price)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50"><td className="px-3 py-2 font-semibold" colSpan={2}>Total / month (ex GST)</td><td className="px-3 py-2 text-right font-bold">{money(total)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400">Valid for {data.validityDays} days. Pricing excludes GST and is subject to a signed licence agreement.</p>

            {state === 'review' ? (
              <button onClick={() => setState('form')} className="w-full bg-black text-white rounded-md py-3 text-sm font-semibold hover:bg-gray-800">Accept & continue →</button>
            ) : (
              <form onSubmit={submit} className="space-y-4 border-t border-gray-100 pt-5">
                <h3 className="text-sm font-semibold text-gray-900">Your company details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block col-span-2"><span className="block text-xs text-gray-500 mb-1">Company name *</span><input value={form.businessName} onChange={set('businessName')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">ABN</span><input value={form.abn} onChange={set('abn')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">Your name *</span><input value={form.contactName} onChange={set('contactName')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">Email *</span><input type="email" value={form.email} onChange={set('email')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">Phone</span><input value={form.phone} onChange={set('phone')} className={ic} /></label>
                  <label className="block col-span-2"><span className="block text-xs text-gray-500 mb-1">Address</span><input value={form.address} onChange={set('address')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">City</span><input value={form.city} onChange={set('city')} className={ic} /></label>
                  <label className="block"><span className="block text-xs text-gray-500 mb-1">State</span><input value={form.state} onChange={set('state')} className={ic} /></label>
                </div>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button type="submit" disabled={submitting} className="w-full bg-black text-white rounded-md py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-60">
                  {submitting ? 'Setting up…' : 'Accept & set up my agreement'}
                </button>
                <p className="text-xs text-gray-400 text-center">We'll create your agreement and send it straight to you for e-signature.</p>
              </form>
            )}
          </div>
        )}

        {state === 'done' && (
          <div className="p-8 text-center space-y-4">
            <div className="text-3xl">🎉</div>
            <h2 className="text-lg font-semibold text-gray-900">{result?.alreadyAccepted ? 'This proposal is already accepted' : 'Proposal accepted!'}</h2>
            <p className="text-sm text-gray-600">Your licence agreement{result?.contractNumber ? ` (${result.contractNumber})` : ''} is ready to sign. We've also emailed you the link.</p>
            {result?.signLink && (
              <a href={result.signLink} className="inline-block bg-black text-white rounded-md px-6 py-3 text-sm font-semibold hover:bg-gray-800">Review & sign now →</a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
