import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import Tenants from './components/Tenants.jsx'
import Spaces from './components/Spaces.jsx'
import Leases from './components/Leases.jsx'
import AgreementGenerator from './components/AgreementGenerator.jsx'
import Renewals from './components/Renewals.jsx'
import Templates from './components/Templates.jsx'
import Billing from './components/Billing.jsx'
import Settings from './components/Settings.jsx'
import Maintenance from './components/Maintenance.jsx'
import Reports from './components/Reports.jsx'
import EventsHub from './components/EventsHub.jsx'
import Marketing from './components/Marketing.jsx'
import Crm from './components/Crm.jsx'
import EventBookings from './components/EventBookings.jsx'
import FunctionBookings from './components/FunctionBookings.jsx'
import AdminMessages from './components/AdminMessages.jsx'
import Members from './components/Members.jsx'
import Memberships from './components/Memberships.jsx'
import Fees from './components/Fees.jsx'
import Bookings from './components/Bookings.jsx'
import ActivityLog from './components/ActivityLog.jsx'
import Calendar from './components/Calendar.jsx'
import Login from './components/Login.jsx'
import SignPage from './components/SignPage.jsx'
import EventBookingSignPage from './components/EventBookingSignPage.jsx'
import FunctionSignPage from './components/FunctionSignPage.jsx'
import ReferrerDashboard from './components/ReferrerDashboard.jsx'
import ProposalAccept from './components/ProposalAccept.jsx'
import PortalApp from './portal/PortalApp.jsx'
import { useStore } from './store/useStore.js'
import { supabase } from './lib/supabase.js'

export default function App() {
  // Member portal (via subdomain OR direct /portal path)
  if (
    window.location.hostname.startsWith('members.') ||
    window.location.pathname.startsWith('/portal')
  ) return <PortalApp />

  // Public sign pages — no auth needed
  const functionSignMatch = window.location.pathname.match(/^\/book\/function\/([^/]+)/)
  if (functionSignMatch) return <FunctionSignPage token={functionSignMatch[1]} />

  const eventSignMatch = window.location.pathname.match(/^\/sign\/event\/([^/]+)/)
  if (eventSignMatch) return <EventBookingSignPage token={eventSignMatch[1]} />

  const signMatch = window.location.pathname.match(/^\/sign\/([^/]+)/)
  if (signMatch) return <SignPage token={signMatch[1]} />

  // Public referrer dashboard — magic link, no auth needed
  const referMatch = window.location.pathname.match(/^\/refer\/([^/]+)/)
  if (referMatch) return <ReferrerDashboard token={referMatch[1]} />

  // Public proposal accept page — no auth needed
  const proposalMatch = window.location.pathname.match(/^\/proposal\/([^/]+)/)
  if (proposalMatch) return <ProposalAccept token={proposalMatch[1]} />

  const store = useStore()
  const [authed, setAuthed] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session)
      setAuthLoading(false)
    })
    // Listen for sign in / sign out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-black tracking-widest text-gray-900 mb-3">HEXA SPACE</div>
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  if (store.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-black tracking-widest text-gray-900 mb-3">HEXA SPACE</div>
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout store={store} onLogout={() => setAuthed(false)} />}>
          <Route index element={<Dashboard />} />
          <Route path="companies" element={<Tenants />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="members" element={<Members />} />
          <Route path="memberships" element={<Memberships />} />
          <Route path="fees" element={<Fees />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="spaces" element={<Spaces />} />
          <Route path="leases" element={<Leases />} />
          <Route path="billing" element={<Billing />} />
          <Route path="renewals" element={<Renewals />} />
          <Route path="templates" element={<Templates />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="reports" element={<Reports />} />
          <Route path="crm" element={<Crm />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="messages" element={<AdminMessages />} />
          <Route path="events" element={<EventsHub />} />
          <Route path="event-bookings" element={<EventBookings />} />
          <Route path="function-bookings" element={<FunctionBookings />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
