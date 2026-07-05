import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import Tenants from './components/Tenants.jsx'
import Spaces from './components/Spaces.jsx'
import Leases from './components/Leases.jsx'
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
import MailRegister from './components/MailRegister.jsx'
import Members from './components/Members.jsx'
import Memberships from './components/Memberships.jsx'
import Fees from './components/Fees.jsx'
import Bookings from './components/Bookings.jsx'
import ActivityLog from './components/ActivityLog.jsx'
import Calendar from './components/Calendar.jsx'
import { useStore } from './store/useStore.js'

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

// The full management app. Rendered only once RootAuth confirms an admin session.
export default function AdminApp({ onLogout }) {
  const store = useStore()
  if (store.loading) return <Splash />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout store={store} onLogout={onLogout} />}>
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
          <Route path="mail" element={<MailRegister />} />
          <Route path="events" element={<EventsHub />} />
          <Route path="event-bookings" element={<EventBookings />} />
          <Route path="function-bookings" element={<FunctionBookings />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
