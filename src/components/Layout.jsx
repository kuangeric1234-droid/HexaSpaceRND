import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, Warehouse, FileText,
  RefreshCw, BookOpen, Receipt, Settings, LogOut,
  Wrench, BarChart2, Menu, X, Calendar, MessageSquare,
  ClipboardList, Megaphone, Building2, User, Tag, DollarSign,
  CalendarCheck, Activity, CalendarDays, PartyPopper, Mailbox, Croissant, KeyRound,
  MonitorPlay,
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
      { to: '/fobs', icon: KeyRound, label: 'Fobs & Remotes' },
      { to: '/bookings', icon: CalendarCheck, label: 'Bookings' },
      { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
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
    heading: 'Growth',
    items: [
      { to: '/crm', icon: Users, label: 'CRM' },
      { to: '/marketing', icon: Megaphone, label: 'Marketing' },
      { to: '/events', icon: Calendar, label: 'Events' },
      { to: '/function-bookings', icon: PartyPopper, label: 'Function Space Bookings' },
    ],
  },
  {
    heading: 'More',
    items: [
      { to: '/announcements', icon: Megaphone, label: 'Announcements' },
      { to: '/messages', icon: MessageSquare, label: 'Messages' },
      { to: '/mail', icon: Mailbox, label: 'Mail & Deliveries' },
      { to: '/directory', icon: MonitorPlay, label: 'Directory' },
      { to: '/food-orders', icon: Croissant, label: 'Food Orders' },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
      { to: '/reports', icon: BarChart2, label: 'Reports' },
      { to: '/templates', icon: BookOpen, label: 'Templates' },
    ],
  },
  { items: [{ to: '/settings', icon: Settings, label: 'Settings' }] },
]

export default function Layout({ store, onLogout }) {
  const [open, setOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const unreadEnquiries = (store?.leads ?? []).filter((l) => !l.read).length

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
    <aside className="w-60 bg-[#0b0b0d] text-zinc-300 flex flex-col h-full border-r border-white/5">
      <div className="px-5 py-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-white text-black grid place-items-center font-bold text-sm">H</div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white">Hexa Space</span>
            <p className="text-[11px] text-zinc-500 leading-none mt-0.5">Management System</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="md:hidden text-zinc-400 hover:text-white p-1">
          <X size={18} />
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-4' : ''}>
            {group.heading && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
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
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-white text-zinc-950 font-medium shadow-sm'
                      : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1">{label}</span>
                {to === '/messages' && unreadMessages > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadMessages}
                  </span>
                )}
                {to === '/crm' && unreadEnquiries > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadEnquiries}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-white/5 text-xs text-zinc-500 shrink-0">
        <div className="mb-3 leading-relaxed">402/830 Whitehorse Road<br />Box Hill VIC 3128</div>
        <button
          onClick={() => { logout(); onLogout?.() }}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-muted/40 text-foreground font-sans">

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
          <div className="fixed inset-y-0 left-0 z-50 flex md:hidden w-60">
            {sidebar}
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 bg-[#0b0b0d] text-white px-4 py-3 shrink-0">
          <button onClick={() => setOpen(true)} className="text-zinc-300 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="font-semibold tracking-tight text-sm">Hexa Space</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet context={store} />
        </main>
      </div>
    </div>
  )
}
