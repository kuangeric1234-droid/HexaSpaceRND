import { useState } from 'react'

const INTERESTS = ['Private Office', 'Dedicated Desk', 'Flexible Desk', 'Virtual Office', 'Meeting / Event space']
const ic = 'w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black'

// Public "Book a private tour" page. Posts to /api/book-tour, which creates/updates
// a lead in the CRM (source: book-tour) so the team sees it and nurture stops.
export default function BookTour() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', businessName: '', enquiryType: 'Private Office',
    preferredDate: '', preferredTime: '', message: '', website: '', // website = honeypot
  })
  const [state, setState] = useState('idle') // idle | sending | done | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) { setState('error'); return }
    setState('sending')
    try {
      const res = await fetch('/api/book-tour', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      setState(res.ok ? 'done' : 'error')
    } catch { setState('error') }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-10 px-4">
      <div className="max-w-lg mx-auto bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-black px-8 py-6">
          <div className="text-white text-lg font-bold tracking-widest">HEXA SPACE</div>
          <div className="text-gray-300 text-sm mt-1">Book a private tour</div>
        </div>

        {state === 'done' ? (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2">✅</div>
            <h2 className="text-lg font-semibold text-gray-900">Thanks, {form.name.split(' ')[0] || 'there'}!</h2>
            <p className="text-sm text-gray-600 mt-2">Your tour request is in — our team will be in touch shortly to confirm a time{form.preferredDate ? ` around ${form.preferredDate}` : ''}.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-8 space-y-4">
            <p className="text-sm text-gray-600">Come see the space in person. Tell us a little about you and your preferred time — we'll confirm the details.</p>
            {/* Honeypot */}
            <input type="text" value={form.website} onChange={set('website')} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-4">
              <label className="block col-span-2"><span className="block text-xs font-medium text-gray-500 mb-1">Full name *</span><input value={form.name} onChange={set('name')} className={ic} /></label>
              <label className="block"><span className="block text-xs font-medium text-gray-500 mb-1">Email *</span><input type="email" value={form.email} onChange={set('email')} className={ic} /></label>
              <label className="block"><span className="block text-xs font-medium text-gray-500 mb-1">Phone</span><input value={form.phone} onChange={set('phone')} className={ic} /></label>
              <label className="block col-span-2"><span className="block text-xs font-medium text-gray-500 mb-1">Company</span><input value={form.businessName} onChange={set('businessName')} className={ic} /></label>
              <label className="block col-span-2"><span className="block text-xs font-medium text-gray-500 mb-1">Interested in</span>
                <select value={form.enquiryType} onChange={set('enquiryType')} className={ic}>{INTERESTS.map((i) => <option key={i}>{i}</option>)}</select>
              </label>
              <label className="block"><span className="block text-xs font-medium text-gray-500 mb-1">Preferred date</span><input type="date" value={form.preferredDate} onChange={set('preferredDate')} className={ic} /></label>
              <label className="block"><span className="block text-xs font-medium text-gray-500 mb-1">Preferred time</span><input type="time" value={form.preferredTime} onChange={set('preferredTime')} className={ic} /></label>
              <label className="block col-span-2"><span className="block text-xs font-medium text-gray-500 mb-1">Anything else?</span><textarea rows={3} value={form.message} onChange={set('message')} className={`${ic} resize-none`} /></label>
            </div>
            {state === 'error' && <p className="text-sm text-red-600">Please add your name and a valid email, then try again.</p>}
            <button type="submit" disabled={state === 'sending'} className="w-full bg-black text-white rounded-md py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-60">
              {state === 'sending' ? 'Sending…' : 'Request my tour'}
            </button>
            <p className="text-xs text-gray-400 text-center">830 Whitehorse Road, Box Hill VIC 3128</p>
          </form>
        )}
      </div>
    </div>
  )
}
