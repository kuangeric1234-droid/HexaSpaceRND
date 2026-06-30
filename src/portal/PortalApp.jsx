import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import PortalLogin from './PortalLogin.jsx'
import PortalLayout from './PortalLayout.jsx'
import PortalDashboard from './PortalDashboard.jsx'
import PortalMembers from './PortalMembers.jsx'
import PortalRooms from './PortalRooms.jsx'
import PortalStudios from './PortalStudios.jsx'
import PortalFunction from './PortalFunction.jsx'
import PortalBilling from './PortalBilling.jsx'
import PortalMessages from './PortalMessages.jsx'
import PortalAccount from './PortalAccount.jsx'
import PortalEvents from './PortalEvents.jsx'
import PortalGuides from './PortalGuides.jsx'

// Capture hash before Supabase processes it (saved by main.jsx)
const _savedHash = sessionStorage.getItem('_initialHash') ?? ''
sessionStorage.removeItem('_initialHash')
const IS_RECOVERY_FLOW = _savedHash.includes('type=recovery') || _savedHash.includes('type=invite')

/** Brand splash used by loading / error / no-account / set-password screens. */
function Splash({ children }) {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="font-heading uppercase text-2xl tracking-[0.22em] text-ink">Hexa&nbsp;Space</div>
        <p className="hx-eyebrow mt-2">Member Portal</p>
        <div className="mt-10">{children}</div>
      </div>
    </div>
  )
}

function SetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm)  return setError('Passwords do not match.')
    setSaving(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setSaving(false); return }
    onDone()
  }

  return (
    <Splash>
      <div className="hx-card p-8 text-left">
        <h1 className="hx-h text-lg mb-2">Set your password</h1>
        <p className="hx-prose mb-6">Choose a password to secure your account.</p>
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="hx-eyebrow block mb-1.5">New Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} placeholder="At least 8 characters" className="hx-input" />
          </div>
          <div>
            <label className="hx-eyebrow block mb-1.5">Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              required placeholder="Repeat your password" className="hx-input" />
          </div>
          <button type="submit" disabled={saving} className="hx-btn w-full disabled:opacity-50">
            {saving ? 'Saving…' : 'Set password & enter'}
          </button>
        </form>
      </div>
    </Splash>
  )
}

function clearPortalSession() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-') || k.startsWith('supabase'))
    .forEach(k => localStorage.removeItem(k))
  sessionStorage.clear()
  window.location.replace('/')
}

export default function PortalApp() {
  const [session, setSession]   = useState(null)
  const [data, setData]         = useState(null) // { company, member, members, companies, leases, invoices, spaces, bookings, fees, templates }
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(IS_RECOVERY_FLOW)
  const loadedFor = useRef(null)

  useEffect(() => {
    const stuck = setTimeout(() => { setLoading(false); setLoadError(true) }, 8000)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(stuck)
      setSession(session)
      if (IS_RECOVERY_FLOW || !session) { setLoading(false); return }
      await fetchData(session.user.email)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(session); setNeedsPassword(true); setLoading(false); return
      }
      if (!session) {
        setSession(null); setData(null); loadedFor.current = null; return
      }
      setSession(session)
      if (event === 'SIGNED_IN') await fetchData(session.user.email)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchData(email) {
    if (loadedFor.current === email) return
    loadedFor.current = email
    setLoading(true)
    try {
      const tables = ['tenants', 'members', 'leases', 'invoices', 'spaces', 'bookings', 'fees', 'templates']
      const results = await Promise.all(tables.map((t) => supabase.from(t).select('data')))
      const [companies, members, leases, invoices, spaces, bookings, fees, templates] =
        results.map((r) => (r.data ?? []).map((row) => row.data))

      const lc = email?.toLowerCase()
      // Resolve the logged-in person: a member first, else a company primary contact.
      const member = members.find((m) => m.email?.toLowerCase() === lc) ?? null
      const company =
        (member && companies.find((c) => c.id === member.companyId)) ??
        companies.find((c) => c.email?.toLowerCase() === lc) ??
        null

      const cid = company?.id
      const mine = (rows) => rows.filter((r) =>
        r.tenantId === cid || r.companyId === cid || (member && r.memberId === member.id))

      setData({
        company, member, members, companies, spaces, templates,
        leases: cid ? leases.filter((l) => l.tenantId === cid) : [],
        invoices: cid ? invoices.filter((i) => i.tenantId === cid) : [],
        bookings: cid ? mine(bookings) : (member ? bookings.filter((b) => b.memberId === member.id) : []),
        allBookings: bookings, // every booking — used by the calendar for availability
        fees,
      })
    } catch (err) {
      console.error('Portal fetchData error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    loadedFor.current = null
    setSession(null)
    setData(null)
    setNeedsPassword(false)
  }

  if (loading) return <Splash><p className="hx-prose">Loading…</p></Splash>

  if (loadError) {
    return (
      <Splash>
        <p className="hx-lead text-ink mb-2">Having trouble connecting.</p>
        <p className="hx-prose mb-8">This is usually caused by a stale login session.</p>
        <button onClick={clearPortalSession} className="hx-btn w-full">Clear session & sign in again</button>
      </Splash>
    )
  }

  if (!session) return <PortalLogin />

  async function handlePasswordDone() {
    loadedFor.current = null
    setNeedsPassword(false)
    if (session) await fetchData(session.user.email)
  }

  if (needsPassword) return <SetPasswordScreen onDone={handlePasswordDone} />

  const company = data?.company
  if (!company) {
    return (
      <Splash>
        <p className="hx-prose mb-1">No member account found for</p>
        <p className="font-heading uppercase tracking-label text-[12px] text-ink mb-8">{session.user.email}</p>
        <a href="mailto:info@hexaspace.com.au" className="hx-btn w-full mb-4">Contact Hexa Space</a>
        <button onClick={signOut} className="hx-btn-ghost mx-auto">Sign out</button>
      </Splash>
    )
  }

  const basename = window.location.hostname.startsWith('members.') ? '/' : '/portal'

  return (
    <BrowserRouter basename={basename}>
      <PortalLayout company={company} member={data.member} onSignOut={signOut}>
        <Routes>
          <Route path="/"              element={<PortalDashboard data={data} />} />
          <Route path="/members"       element={<PortalMembers members={data.members} companies={data.companies} />} />
          <Route path="/meeting-rooms" element={<PortalRooms spaces={data.spaces} allBookings={data.allBookings} member={data.member} company={data.company} />} />
          <Route path="/studios"       element={<PortalStudios spaces={data.spaces} allBookings={data.allBookings} member={data.member} company={data.company} />} />
          <Route path="/function-space" element={<PortalFunction spaces={data.spaces} member={data.member} company={data.company} />} />
          <Route path="/billing"       element={<PortalBilling data={data} />} />
          <Route path="/account"       element={<PortalAccount data={data} />} />
          <Route path="/messages"      element={<PortalMessages tenant={company} />} />
          <Route path="/events"        element={<PortalEvents />} />
          <Route path="/guides"        element={<PortalGuides />} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </PortalLayout>
    </BrowserRouter>
  )
}
