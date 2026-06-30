import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Upload } from 'lucide-react'
import PriceListImport from './PriceListImport.jsx'
import { SPACE_TABS } from './spaces/shared.jsx'
import LocationsTab from './spaces/LocationsTab.jsx'
import MeetingRoomsTab from './spaces/MeetingRoomsTab.jsx'
import PrivateOfficesTab from './spaces/PrivateOfficesTab.jsx'
import AssignableResourceTab from './spaces/AssignableResourceTab.jsx'

// Per-type config for the generic assignable resource manager.
const RESOURCE_CONFIG = {
  studio:  { type: 'studio',  noun: 'Media Studio',   prefix: 'Media Studio ', start: 1,   rateLabel: 'Hourly Rate',  ratePer: '/hr' },
  podcast: { type: 'podcast', noun: 'Podcast Room',   prefix: 'Podcast Room ', start: 1,   rateLabel: 'Hourly Rate',  ratePer: '/hr' },
  parking: { type: 'parking', noun: 'Parking Slot',   prefix: 'P',             start: 1,   rateLabel: 'Monthly Rate', ratePer: '/mo' },
  desk:    { type: 'desk',    noun: 'Dedicated Desk',  prefix: 'Dedicated Desk ', start: 1, rateLabel: 'Monthly Rate', ratePer: '/mo' },
  virtual: {
    type: 'virtual', noun: 'Virtual Office', prefix: 'Suite ', start: 403,
    rateLabel: 'Monthly Rate', ratePer: '/mo', autoAssignOnAdd: true,
    note: 'Suite numbers auto-increment from Suite 403. “Add Virtual Office” creates the next available suite and prompts you to assign the member.',
  },
}

export default function Spaces() {
  const ctx = useOutletContext()
  const { spaces, addSpace, updateSpace, resetSampleData, resyncSpaces } = ctx
  const [tab, setTab] = useState('locations')
  const [showImport, setShowImport] = useState(false)

  const active = SPACE_TABS.find((t) => t.key === tab)
  const count = (type) => spaces.filter((s) => s.type === type).length

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spaces</h1>
          <p className="text-sm text-gray-500 mt-1">{spaces.length} spaces across 830 Whitehorse Road, Box Hill</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => resyncSpaces()} className="text-xs font-medium text-gray-700 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
            Sync Hexa layout
          </button>
          <button onClick={() => resetSampleData()} className="text-xs text-gray-400 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50">
            Load sample data
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50">
            <Upload size={15} /> Import price list
          </button>
        </div>
      </div>

      {/* Sub-tab navigation (OfficeRND-style) */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {SPACE_TABS.map((t) => {
          const Icon = t.icon
          const isActive = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive ? 'border-black text-black font-semibold' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon size={15} />
              {t.label}
              {t.type && count(t.type) > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {count(t.type)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'locations' && <LocationsTab ctx={ctx} />}
      {tab === 'meeting' && <MeetingRoomsTab ctx={ctx} />}
      {tab === 'office' && <PrivateOfficesTab ctx={ctx} />}
      {['studio', 'podcast', 'parking', 'desk', 'virtual'].includes(tab) && (
        <AssignableResourceTab key={tab} ctx={ctx} config={RESOURCE_CONFIG[tab]} />
      )}

      {showImport && (
        <PriceListImport store={{ spaces, addSpace, updateSpace }} onClose={() => setShowImport(false)} />
      )}
    </div>
  )
}
