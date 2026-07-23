import { useEffect, useState, lazy, Suspense } from 'react'
import PortalLogin from './portal/PortalLogin.jsx'
import SignPage from './components/SignPage.jsx'
import EventBookingSignPage from './components/EventBookingSignPage.jsx'
import FunctionSignPage from './components/FunctionSignPage.jsx'
import FunctionBookPage from './components/FunctionBookPage.jsx'
import ReferrerDashboard from './components/ReferrerDashboard.jsx'
import ProposalAccept from './components/ProposalAccept.jsx'
import GiveNoticePage from './components/GiveNoticePage.jsx'
import PayInvoicePage from './components/PayInvoicePage.jsx'
import DirectoryNamePage from './components/DirectoryNamePage.jsx'
import DirectoryDisplay from './components/DirectoryDisplay.jsx'
import PortalApp from './portal/PortalApp.jsx'
import AdminApp from './AdminApp.jsx'
import { supabase } from './lib/supabase.js'
import { IS_RECOVERY_FLOW, SetPasswordScreen } from './lib/authRecovery.jsx'

// Admins reach the management app; everyone else gets the member portal — decided
// by the logged-in email, not the URL. This fallback guarantees the core team can
// always get in even if the Settings → Admin Users list is misconfigured.
const ADMIN_FALLBACK = ['admin@hexaspace.com.au', 'eric@hexaspace.com.au', 'info@hexaspace.com.au']

function Splash() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-black tracking-widest text-gray-900 mb-3">HEXA SPACE</div>
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    </div>
  )
}

// Single sign-in → route by role.
function RootAuth() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [role, setRole] = useState(null)            // null = undetermined | 'admin' | 'member'
  // Invite / password-reset links: set a password FIRST — for admins and members
  // alike — before we route anywhere (admins were landing on login with no way to
  // set a password because this only lived in the member app).
  const [needsPassword, setNeedsPassword] = useState(IS_RECOVERY_FLOW)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') { setSession(s ?? null); setNeedsPassword(true); return }
      setSession(s ?? null)
      if (!s) setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setRole(null); return }
    let cancelled = false
    ;(async () => {
      const email = (session.user?.email || '').toLowerCase()
      // DB-enforced admin check (admins allow-list). No longer reads the whole
      // settings blob. Falls back to the hardcoded core-team list if the RPC is
      // unavailable, so the team can always get in.
      let isAdmin = ADMIN_FALLBACK.includes(email)
      try {
        const { data, error } = await supabase.rpc('is_admin')
        if (!error) isAdmin = !!data || isAdmin
      } catch { /* keep fallback */ }
      if (!cancelled) setRole(isAdmin ? 'admin' : 'member')
    })()
    return () => { cancelled = true }
  }, [session])

  if (needsPassword) return <SetPasswordScreen onDone={() => setNeedsPassword(false)} />
  if (session === undefined) return <Splash />
  if (!session) return <PortalLogin />
  if (role === null) return <Splash />
  if (role === 'admin') return <AdminApp onLogout={() => { setSession(null); setRole(null) }} />
  return <PortalApp />
}

// Member mobile app — phone-only experience at /app (lazy: its chunk + CSS
// only load when the route is hit, so portal/admin bundles are unaffected).
// Inside the Capacitor shell (Android/iOS) the member app IS the app, whatever
// the path — window.Capacitor avoids pulling the plugin into the web bundle.
const MobileApp = lazy(() => import('./app/MobileApp.jsx'))
const IS_NATIVE = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

export default function App() {
  const path = window.location.pathname

  if (IS_NATIVE || path === '/app' || path.startsWith('/app/')) {
    return <Suspense fallback={null}><MobileApp /></Suspense>
  }

  // Public pages — no auth needed.
  const dirMatch = path.match(/^\/directory\/(2|4)\/?$/)
  if (dirMatch) return <DirectoryDisplay level={dirMatch[1]} />

  if (path.startsWith('/book-function')) return <FunctionBookPage />

  const functionSignMatch = path.match(/^\/book\/function\/([^/]+)/)
  if (functionSignMatch) return <FunctionSignPage token={functionSignMatch[1]} />

  const eventSignMatch = path.match(/^\/sign\/event\/([^/]+)/)
  if (eventSignMatch) return <EventBookingSignPage token={eventSignMatch[1]} />

  const signMatch = path.match(/^\/sign\/([^/]+)/)
  if (signMatch) return <SignPage token={signMatch[1]} />

  const referMatch = path.match(/^\/refer\/([^/]+)/)
  if (referMatch) return <ReferrerDashboard token={referMatch[1]} />

  const proposalMatch = path.match(/^\/proposal\/([^/]+)/)
  if (proposalMatch) return <ProposalAccept token={proposalMatch[1]} />

  const noticeMatch = path.match(/^\/give-notice\/([^/]+)/)
  if (noticeMatch) return <GiveNoticePage token={noticeMatch[1]} />

  const payMatch = path.match(/^\/pay\/([^/]+)/)
  if (payMatch) return <PayInvoicePage invoiceId={payMatch[1]} />

  const dirNameMatch = path.match(/^\/directory-name\/([^/]+)/)
  if (dirNameMatch) return <DirectoryNamePage token={dirNameMatch[1]} />


  return <RootAuth />
}
