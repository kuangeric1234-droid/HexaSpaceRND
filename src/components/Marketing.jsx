import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Megaphone } from 'lucide-react'
import AdsWorkbench from './AdsWorkbench.jsx'
import AiStudio from './AiStudio.jsx'

// Marketing — promotion & demand generation. Ads and the AI Studio create and
// run campaigns. (Leads/Enquiries live in CRM; event registrations live under
// Events.)
const TABS = [
  { key: 'ads',      label: 'Ads' },
  { key: 'studio',   label: 'AI Studio' },
]

export default function Marketing() {
  const store = useOutletContext()
  const [tab, setTab] = useState('ads')

  const { spaces = [] } = store
  const vacantCount = spaces.filter((s) => s.status === 'vacant').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone size={22} /> Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {vacantCount} vacant {vacantCount === 1 ? 'space' : 'spaces'} to promote
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="border-b border-border mb-6 flex">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ads' && <AdsWorkbench store={store} />}
      {tab === 'studio' && <AiStudio store={store} />}
    </div>
  )
}
