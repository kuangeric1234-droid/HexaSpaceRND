import { NavLink } from 'react-router-dom'
import { House, CalendarClock, Ellipsis } from 'lucide-react'
import { useApp } from './context.js'
import { buildNotifications } from './lib/notifications.js'

const TABS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/book', label: 'Book', icon: CalendarClock },
  // Drinks tab hidden until the Eclat partnership is formal — restore to re-enable:
  // { to: '/food', label: 'Drinks', icon: Coffee },  (re-add `Coffee` to the import)
  { to: '/more', label: 'More', icon: Ellipsis },
]

/** Fixed bottom tab bar — 4 tabs, big targets, tracked-caps labels. The More
 *  tab shows a dot when there are notifications (mail, orders, invoices). */
export default function TabBar() {
  const { data } = useApp()
  const hasNotifications = buildNotifications(data).count > 0

  return (
    <nav className="app-tabbar">
      <div className="grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className="flex flex-col items-center justify-center gap-1 min-h-[58px] active:opacity-60">
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon size={20} strokeWidth={isActive ? 1.8 : 1.4}
                    className={isActive ? 'text-ink' : 'text-portal-muted'} />
                  {to === '/more' && hasNotifications && (
                    <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-hexa-green ring-2 ring-paper" />
                  )}
                </span>
                <span className={`font-heading uppercase tracking-label text-[9px] ${isActive ? 'text-ink' : 'text-portal-muted'}`}>
                  {label}
                </span>
                <span className={`h-[3px] w-[3px] rounded-full ${isActive ? 'bg-hexa-green' : 'bg-transparent'}`} />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
