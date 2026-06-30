import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Warehouse, FileText,
  RefreshCw, BookOpen, Receipt, Settings, LogOut,
  Wrench, BarChart2, Menu, X, Calendar, MessageSquare,
  ClipboardList, Megaphone, Building2, User, Tag, DollarSign,
  CalendarCheck, Activity,
} from 'lucide-react'
import { logout } from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

const GROUPS = [
  { items: [{ to: '/', icon: LayoutDashboard, label: 'Dashboard' }] },
  {
    heading: 'Operations',
    items: [
      { to: '/companies', icon: Building2, label: 'Companies' },
      { to: '/members', icon: User, label: 'Members' },
      { to: '/leases', icon: FileText, label: 'Contracts' },
      { to: '/memberships', icon: Tag, label: 'Memberships' },
      { to: '/fees', icon: DollarSign, label: 'Fees' },
      { to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
      { to: '/activity', icon: Activity, label: 'Activity Log' },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { to: '/spaces', icon: Warehouse, label: 'Spaces' },
      { to: '/billing', icon: Receipt, label: 'Billing' },
      { to: '/renewals', icon: RefreshCw, label: 'Renewals' },
    ],
  },
  {
    heading: 'More',
    items: [
      { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
      { to: '/reports', icon: BarChart2, label: 'Reports' },
      { to: '/marketing', icon: Megaphone, label: 'Marketing' },
      { to: '/messages', icon: MessageSquare, label: 'Messages' },
      { to: '/events', icon: Calendar, label: 'Events' },
      { to: '/event-bookings', icon: ClipboardList, label: 'Pop-up Bookings' },
      { to: '/templates', icon: BookOpen, label: 'Templates' },
    ],
  },
  { items: [{ to: '/settings', icon: Settings, label: 'Settings' }] },
]

export default function Layout({ store, onLogout }) {
  const [open, setOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    loadUnread()
    const timer = setInterval(loadUnread, 10000)
    return () => clearInterval(timer)
  }, [])

  async function loadUnread() {
    const { data } = await supabase.from('portal_messages').select('data')
    const count = (data ?? []).filter(r => r.data?.sender === 'tenant' && !r.data?.readByAdmin).length
    setUnreadMessages(count)
  }

  const sidebar = (
    <aside className="w-52 bg-black text-white flex flex-col h-full">
      <div className="px-5 py-6 border-b border-gray-800 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold tracking-tight">Hexa Space</span>
          <p className="text-xs text-gray-400 mt-0.5">Management System</p>
        </div>
        {/* Close button — mobile only */}
        <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 hover:text-white p-1">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
            {group.heading && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {group.heading}
              </div>
            )}
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-white text-black font-semibold'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {to === '/messages' && unreadMessages > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadMessages}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-gray-800 text-xs text-gray-500 shrink-0">
        <div className="mb-3">Level 4, 830 Whitehorse Road<br />Box Hill VIC 3128</div>
        <button
          onClick={() => { logout(); onLogout?.() }}
          className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        {sidebar}
      </div>

      {/* Mobile sidebar — slide-in drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex md:hidden w-52">
            {sidebar}
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 bg-black text-white px-4 py-3 shrink-0">
          <button onClick={() => setOpen(true)} className="text-gray-300 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="font-bold tracking-tight text-sm">Hexa Space</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet context={store} />
        </main>
      </div>
    </div>
  )
}
