import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Megaphone } from 'lucide-react'
import ListingsPanel from './ListingsPanel.jsx'
import AdsWorkbench from './AdsWorkbench.jsx'
import AiStudio from './AiStudio.jsx'

// Marketing — promotion & demand generation. Listings publish vacancies; Ads and
// the AI Studio create and run campaigns. (Leads/Enquiries live in CRM; event
// registrations live under Events.)
const TABS = [
  { key: 'listings', label: 'Listings' },
  { key: 'ads',      label: 'Ads' },
  { key: 'studio',   label: 'AI Studio' },
]

export default function Marketing() {
  const store = useOutletContext()
  const [tab, setTab] = useState('listings')

  const { spaces = [] } = store
  const vacantCount = spaces.filter((s) => s.status === 'vacant').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone size={22} /> Marketing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {vacantCount} vacant {vacantCount === 1 ? 'space' : 'spaces'} to promote
          </p>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="border-b border-gray-200 mb-6 flex">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
              tab === key ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'listings' && <ListingsPanel store={store} />}
      {tab === 'ads' && <AdsWorkbench store={store} />}
      {tab === 'studio' && <AiStudio store={store} />}
    </div>
  )
}
