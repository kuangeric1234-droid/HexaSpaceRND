import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, CalendarClock, Clapperboard, PartyPopper, Receipt,
  MessageSquare, User, CalendarDays, BookOpen, LogOut, Menu, X,
} from 'lucide-react'

const nav = [
  { to: '/',              label: 'Dashboard',      icon: LayoutDashboard, end: true },
  { to: '/members',       label: 'Members',        icon: Users },
  { to: '/meeting-rooms', label: 'Meeting Rooms',  icon: CalendarClock },
  { to: '/studios',       label: 'Studios',        icon: Clapperboard },
  { to: '/function-space',label: 'Function Space', icon: PartyPopper },
  { to: '/billing',       label: 'Billing',        icon: Receipt },
  { to: '/account',       label: 'Account',        icon: User },
  { to: '/events',        label: 'Events',         icon: CalendarDays },
  { to: '/messages',      label: 'Messages',       icon: MessageSquare },
  { to: '/guides',        label: 'Guides',         icon: BookOpen },
]

export default function PortalLayout({ company, member, onSignOut, children }) {
  const [open, setOpen] = useState(false)
  const who = member?.name || company?.contactName || company?.businessName

  const sidebar = (
    <aside className="w-60 bg-charcoal text-paper flex flex-col h-full">
      <div className="px-6 py-7 border-b border-paper/10 flex items-center justify-between">
        <div>
          <div className="font-heading uppercase text-base tracking-[0.22em] leading-none">Hexa&nbsp;Space</div>
          <p className="font-heading uppercase tracking-label text-[9px] text-paper/40 mt-2">Member Portal</p>
        </div>
        <button onClick={() => setOpen(false)} className="md:hidden text-paper/50 hover:text-paper p-1">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-3 transition-colors ${
                isActive ? 'bg-paper/5 text-paper' : 'text-paper/55 hover:text-paper'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`h-4 w-px ${isActive ? 'bg-hexa-green' : 'bg-transparent'}`} />
                <Icon size={15} strokeWidth={1.5} />
                <span className="font-heading uppercase tracking-nav text-[11px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-5 border-t border-paper/10 shrink-0">
        <div className="font-body text-[13px] text-paper/80 truncate">{who}</div>
        <div className="font-body text-[11px] text-paper/40 truncate mb-3">{member?.email || company?.email}</div>
        <button onClick={onSignOut} className="flex items-center gap-2 font-heading uppercase tracking-nav text-[10px] text-paper/45 hover:text-paper transition-colors">
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-bone overflow-hidden">
      <div className="hidden md:flex">{sidebar}</div>

      {open && (
        <>
          <div className="fixed inset-0 bg-ink/40 z-30 md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-0 bottom-0 w-60 z-40 md:hidden flex">{sidebar}</div>
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="md:hidden flex items-center gap-3 bg-paper border-b border-ink/10 px-4 py-3 shrink-0">
          <button onClick={() => setOpen(true)} className="text-ink"><Menu size={20} /></button>
          <span className="font-heading uppercase tracking-[0.2em] text-sm">Hexa&nbsp;Space</span>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
