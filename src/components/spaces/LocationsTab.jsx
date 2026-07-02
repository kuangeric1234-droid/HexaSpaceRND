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
  // An office is occupied if it has an occupant or an active/pending lease —
  // same rule as the Spaces, Memberships and Dashboard views.
  const officeOccupied = (s) =>
    !!(s.occupantTenantId || s.occupantName ||
      leases.some((l) => l.spaceId === s.id && (l.status === 'active' || l.status === 'pending')))

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">
          One location — <span className="font-medium text-foreground">830 Whitehorse Road, Box Hill VIC 3128</span> · {FLOORS.length} floors
        </p>
        <div className="flex border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setView('floors')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === 'floors' ? 'bg-black text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
          >
            <LayoutGrid size={14} /> Floors
          </button>
          <button
            onClick={() => setView('plan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-border ${view === 'plan' ? 'bg-black text-white' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}
          >
            <Map size={14} /> Floorplan
          </button>
        </div>
      </div>

      {view === 'floors' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FLOORS.map((f) => {
            // Private offices only — parking, desks, virtual offices etc. are excluded.
            const onFloor = spaces.filter((s) => s.floor === f.id && s.type === 'office')
            const occupied = onFloor.filter(officeOccupied).length
            const byType = onFloor.reduce((acc, s) => {
              acc[s.type] = (acc[s.type] || 0) + 1
              return acc
            }, {})
            return (
              <div key={f.id} className="bg-card border border-border rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Building size={18} className="text-muted-foreground" />
                  <span className="text-lg font-bold text-foreground">{f.label}</span>
                </div>
                <div className="flex items-baseline gap-4 mb-4">
                  <div>
                    <div className="text-2xl font-bold text-foreground">{onFloor.length}</div>
                    <div className="text-xs text-muted-foreground">spaces</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">{occupied}</div>
                    <div className="text-xs text-muted-foreground">occupied</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{onFloor.length - occupied}</div>
                    <div className="text-xs text-muted-foreground">available</div>
                  </div>
                </div>
                {Object.keys(byType).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No private offices on this floor.</p>
                ) : (
                  <div className="space-y-1 border-t border-border pt-3">
                    {Object.entries(byType).map(([t, n]) => (
                      <div key={t} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{typeLabel(t)}</span>
                        <span className="text-foreground font-medium">{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {/* Unassigned bucket — private offices only */}
          {spaces.some((s) => !s.floor && s.type === 'office') && (
            <div className="bg-muted/50 border border-dashed border-border rounded-xl p-5">
              <div className="text-sm font-semibold text-muted-foreground mb-1">Unassigned</div>
              <div className="text-2xl font-bold text-foreground">{spaces.filter((s) => !s.floor && s.type === 'office').length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Offices not yet pinned to a floor. Drop them onto a floor in the Floorplan view.
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
