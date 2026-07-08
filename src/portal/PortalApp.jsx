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
import PortalPrinting from './PortalPrinting.jsx'
import PortalFunctionHome from './PortalFunctionHome.jsx'

// Detect a set-password (recovery/invite) link from BOTH sources, because of
// load order: the LIVE hash — this module evaluates before Supabase's async
// URL processing clears it — and the copy main.jsx saves to sessionStorage
// (main.jsx's inline code runs AFTER imported modules like this one, so on the
// first load only the live hash is visible here; the saved copy covers any
// later reload). Relying on the saved copy alone missed the flow entirely, and
// the PASSWORD_RECOVERY auth event fires before this component mounts (RootAuth
// is still resolving the role), so it can't be the only trigger either.
const _savedHash = sessionStorage.getItem('_initialHash') ?? ''
sessionStorage.removeItem('_initialHash')
const _liveHash = typeof window !== 'undefined' ? window.location.hash : ''
const IS_RECOVERY_FLOW = [_savedHash, _liveHash].some((h) => h.includes('type=recovery') || h.includes('type=invite'))

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
      // NB: a plain select() is capped at 1000 rows by Supabase, so large tables
      // (invoices, leases) MUST be fetched scoped to the tenant — otherwise recent
      // rows fall outside the cap and never reach the member.
      const tables = ['tenants', 'members', 'spaces', 'bookings', 'fees', 'templates', 'function_bookings']
      const results = await Promise.all(tables.map((t) => supabase.from(t).select('data')))
      const [companies, members, spaces, bookings, fees, templates, functionBookings] =
        results.map((r) => (r.data ?? []).map((row) => row.data))

      const lc = email?.toLowerCase()
      // Resolve the logged-in person: a member first, else a company primary contact.
      const member = members.find((m) => m.email?.toLowerCase() === lc) ?? null
      const company =
        (member && companies.find((c) => c.id === member.companyId)) ??
        companies.find((c) => c.email?.toLowerCase() === lc) ??
        null

      const cid = company?.id
      const myEmail = (company?.email || member?.email || '').toLowerCase()

      // Tenant-scoped fetches (JSONB filter → immune to the 1000-row cap).
      const [invRes, leaseRes] = cid
        ? await Promise.all([
            supabase.from('invoices').select('data').eq('data->>tenantId', cid),
            supabase.from('leases').select('data').eq('data->>tenantId', cid),
          ])
        : [{ data: [] }, { data: [] }]
      const invoices = (invRes.data ?? []).map((r) => r.data)
      const leases = (leaseRes.data ?? []).map((r) => r.data)

      const mine = (rows) => rows.filter((r) =>
        r.tenantId === cid || r.companyId === cid || (member && r.memberId === member.id))

      // Availability across ALL companies comes from the sanitized view (resource
      // + date + times + status only — no title/company/member), so per-tenant RLS
      // on `bookings` doesn't blind the calendar. Own bookings keep full detail;
      // everyone else's render as a plain "Booked" slot. Robust whether the
      // bookings read returned all rows (pre-cutover) or only ours (post-cutover).
      const ownBookings = cid ? mine(bookings) : (member ? bookings.filter((b) => b.memberId === member.id) : [])
      const ownIds = new Set(ownBookings.map((b) => b.id))
      const availRes = await supabase.from('booking_availability').select('*')
      const slots = (availRes.data ?? [])
        .filter((s) => !ownIds.has(s.id))
        .map((s) => ({ id: s.id, resourceId: s.resource_id, date: s.date, startTime: s.start_time, endTime: s.end_time, status: s.status }))

      setData({
        company, member, members, companies, spaces, templates,
        leases,
        invoices,
        bookings: ownBookings,
        allBookings: [...ownBookings, ...slots], // own (detailed) + others (masked)
        functionBookings: functionBookings.filter((fb) =>
          (cid && (fb.companyId === cid || fb.tenantId === cid)) ||
          (member && fb.memberId === member.id) ||
          (myEmail && (fb.email || '').toLowerCase() === myEmail)),
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

  // Offboarded members keep their auth session until it expires — show the
  // membership-ended screen instead of the portal (revoke bans new logins).
  if (data.member && data.member.portalAccess === false) {
    return (
      <Splash>
        <p className="hx-prose mb-1">Your membership has ended</p>
        <p className="font-heading uppercase tracking-label text-[12px] text-ink mb-8">{session.user.email}</p>
        <p className="hx-prose text-[13px] text-portal-muted mb-8">Thanks for being part of Hexa Space. If you think this is a mistake, or you'd like to come back, we'd love to hear from you.</p>
        <a href="mailto:info@hexaspace.com.au" className="hx-btn w-full mb-4">Contact Hexa Space</a>
        <button onClick={signOut} className="hx-btn-ghost mx-auto">Sign out</button>
      </Splash>
    )
  }

  // Portal now lives at the domain root (routing is by login, not by /portal path).
  const basename = '/'

  // A "member" holds a membership agreement (private office / virtual office /
  // desk) — i.e. any real lease. Function-only clients have none: they get a
  // restricted portal (book/track functions + their invoices/account) and can't
  // reach member facilities, the directory, discounts or perks.
  const restricted = !(data.leases || []).some((l) => !['voided', 'declined', 'cancelled'].includes(l.status))

  return (
    <BrowserRouter basename={basename}>
      <PortalLayout company={company} member={data.member} onSignOut={signOut} restricted={restricted}>
        <Routes>
          {restricted ? (
            <>
              <Route path="/"              element={<PortalFunctionHome data={data} />} />
              <Route path="/meeting-rooms" element={<PortalRooms spaces={data.spaces} allBookings={data.allBookings} member={data.member} company={data.company} />} />
              <Route path="/function-space" element={<PortalFunction spaces={data.spaces} member={data.member} company={data.company} />} />
              <Route path="/billing"       element={<PortalBilling data={data} />} />
              <Route path="/account"       element={<PortalAccount data={data} />} />
              <Route path="/messages"      element={<PortalMessages tenant={company} />} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/"              element={<PortalDashboard data={data} />} />
              <Route path="/members"       element={<PortalMembers members={data.members} companies={data.companies} company={data.company} />} />
              <Route path="/meeting-rooms" element={<PortalRooms spaces={data.spaces} allBookings={data.allBookings} member={data.member} company={data.company} />} />
              <Route path="/studios"       element={<PortalStudios spaces={data.spaces} allBookings={data.allBookings} member={data.member} company={data.company} />} />
              <Route path="/function-space" element={<PortalFunction spaces={data.spaces} member={data.member} company={data.company} />} />
              <Route path="/billing"       element={<PortalBilling data={data} />} />
              <Route path="/account"       element={<PortalAccount data={data} />} />
              <Route path="/messages"      element={<PortalMessages tenant={company} />} />
              <Route path="/events"        element={<PortalEvents />} />
              <Route path="/printing"      element={<PortalPrinting member={data.member} />} />
              <Route path="/guides"        element={<PortalGuides member={data.member} />} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </PortalLayout>
    </BrowserRouter>
  )
}
