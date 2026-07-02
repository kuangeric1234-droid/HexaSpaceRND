import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Events from './Events.jsx'
import EventRegistrations from './EventRegistrations.jsx'

// Events hub — event management and the registrations that come in for them, in
// one place (registrations used to live under Marketing).
const TABS = [
  { key: 'events',        label: 'Events' },
  { key: 'registrations', label: 'Registrations' },
]

export default function EventsHub() {
  const store = useOutletContext()
  const [tab, setTab] = useState('events')
  const unread = (store?.eventRegistrations ?? []).filter((r) => !r.read).length

  return (
    <div>
      <div className="px-6 md:px-8 pt-6">
        <div className="border-b border-border flex">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              {key === 'registrations' && unread > 0 && (
                <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{unread}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'events' && <Events />}
      {tab === 'registrations' && <EventRegistrations store={store} />}
    </div>
  )
}
