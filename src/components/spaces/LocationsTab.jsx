import { useState } from 'react'
import { Map, LayoutGrid, Building } from 'lucide-react'
import InteractiveFloorPlan from '../InteractiveFloorPlan.jsx'
import { FLOORS, floorLabel, SPACE_TABS } from './shared.jsx'

// Locations = the floors of 830 Whitehorse Road, Box Hill.
// A summary card per floor, plus the visual interactive floorplan.
export default function LocationsTab({ ctx }) {
  const { spaces, leases, tenants, updateSpace } = ctx
  const [view, setView] = useState('floors') // 'floors' | 'plan'

  const typeLabel = (t) => SPACE_TABS.find((x) => x.type === t)?.label ?? t

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          One location — <span className="font-medium text-gray-700">830 Whitehorse Road, Box Hill VIC 3128</span> · {FLOORS.length} floors
        </p>
        <div className="flex border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setView('floors')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === 'floors' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutGrid size={14} /> Floors
          </button>
          <button
            onClick={() => setView('plan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 ${view === 'plan' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <Map size={14} /> Floorplan
          </button>
        </div>
      </div>

      {view === 'floors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FLOORS.map((f) => {
            const onFloor = spaces.filter((s) => s.floor === f.id)
            const occupied = onFloor.filter((s) => s.status === 'occupied').length
            const byType = onFloor.reduce((acc, s) => {
              acc[s.type] = (acc[s.type] || 0) + 1
              return acc
            }, {})
            return (
              <div key={f.id} className="bg-white border border-gray-200 rounded-md p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Building size={18} className="text-gray-400" />
                  <span className="text-lg font-bold text-gray-900">{f.label}</span>
                </div>
                <div className="flex items-baseline gap-4 mb-4">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{onFloor.length}</div>
                    <div className="text-xs text-gray-400">spaces</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{occupied}</div>
                    <div className="text-xs text-gray-400">occupied</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{onFloor.length - occupied}</div>
                    <div className="text-xs text-gray-400">available</div>
                  </div>
                </div>
                {Object.keys(byType).length === 0 ? (
                  <p className="text-xs text-gray-400">No spaces pinned to this floor yet.</p>
                ) : (
                  <div className="space-y-1 border-t border-gray-100 pt-3">
                    {Object.entries(byType).map(([t, n]) => (
                      <div key={t} className="flex justify-between text-sm">
                        <span className="text-gray-500">{typeLabel(t)}</span>
                        <span className="text-gray-900 font-medium">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {/* Unassigned bucket */}
          {spaces.some((s) => !s.floor) && (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-md p-5">
              <div className="text-sm font-semibold text-gray-600 mb-1">Unassigned</div>
              <div className="text-2xl font-bold text-gray-900">{spaces.filter((s) => !s.floor).length}</div>
              <p className="text-xs text-gray-400 mt-1">
                Spaces not yet pinned to a floor. Drop them onto a floor in the Floorplan view.
              </p>
            </div>
          )}
        </div>
      )}

      {view === 'plan' && (
        <InteractiveFloorPlan
          spaces={spaces}
          leases={leases}
          tenants={tenants}
          updateSpace={updateSpace}
          onNewContract={() => {}}
        />
      )}
    </div>
  )
}
