import { useEffect, useState } from 'react'

// Public directory-listing confirmation page (/directory-name/<token>), linked
// from the getting-started email. The member types exactly how their business
// should appear on the lobby digital directory (optional second line for a
// bilingual name); saving stores tenant.directoryName, which the directory
// auto-sync then uses on the boards.
export default function DirectoryNamePage({ token }) {
  const [state, setState] = useState('loading') // loading | ready | saved | invalid
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/directory-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'load' }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const current = (d.directoryName || d.businessName || '').split('\n')
        setLine1(current[0] ?? '')
        setLine2(current[1] ?? '')
        setState('ready')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function save() {
    if (!line1.trim()) { setErr('Please enter the name to display.'); return }
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/directory-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'save', name: [line1, line2].filter((l) => l.trim()).join('\n') }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Could not save — please try again.')
      setState('saved')
    } catch (e) {
      setErr(e.message)
    }
    setSaving(false)
  }

  const shell = (children) => (
    <div className="min-h-screen bg-[#f4f2ee] flex items-center justify-center p-5 font-sans text-[#1a1a1a]">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-lg font-black tracking-[0.3em]">HEXA SPACE</span>
        </div>
        {children}
      </div>
    </div>
  )

  if (state === 'loading') return shell(<div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">Loading…</div>)
  if (state === 'invalid') {
    return shell(
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
        <p className="font-semibold">This link is not valid.</p>
        <p className="text-sm text-gray-500 mt-2">Please use the link from your welcome email, or contact info@hexaspace.com.au.</p>
      </div>
    )
  }
  if (state === 'saved') {
    return shell(
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
        <p className="text-2xl mb-2">✓</p>
        <p className="font-semibold">Thank you — your listing is confirmed.</p>
        <p className="text-sm text-gray-500 mt-3">
          <span className="block font-medium text-[#1a1a1a]">{line1}</span>
          {line2.trim() && <span className="block">{line2}</span>}
        </p>
        <p className="text-xs text-gray-400 mt-4">The lobby directory updates within a day. Need a change later? Just email info@hexaspace.com.au.</p>
      </div>
    )
  }

  return shell(
    <div className="bg-white border border-gray-200 rounded-lg p-8">
      <div className="text-[10px] tracking-[0.22em] uppercase text-gray-400">Lobby directory</div>
      <h1 className="text-xl font-bold mt-1">How should your business appear?</h1>
      <p className="text-sm text-gray-500 mt-2 leading-relaxed">
        This is exactly what will show on the digital directory in the lobby. Keep it short and clean —
        most members drop the “Pty Ltd”.
      </p>
      <label className="block mt-6 text-xs font-semibold uppercase tracking-wide text-gray-400">Display name</label>
      <input
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        maxLength={80}
        className="mt-1.5 w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        placeholder="e.g. Connected Logics"
      />
      <label className="block mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Second line — optional</label>
      <input
        value={line2}
        onChange={(e) => setLine2(e.target.value)}
        maxLength={80}
        className="mt-1.5 w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        placeholder="e.g. a Chinese name, or a second brand"
      />
      {err && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="mt-6 w-full bg-[#1a1a1a] text-white rounded-md py-3 text-[13px] font-semibold tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Confirm listing'}
      </button>
    </div>
  )
}
