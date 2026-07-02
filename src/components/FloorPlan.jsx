import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { X, Warehouse, Package, Map } from 'lucide-react'
import SitePlanViewer from './SitePlanViewer.jsx'

// Annual price from PDF ÷ 12 = monthlyRate stored in the system
// Prices in PDF exclude GST and outgoings

const SECTION_ORDER = ['Distribution Circuit', 'Logistic Court']

function detectSection(address) {
  if (!address) return 'Other'
  const a = address.toLowerCase()
  if (a.includes('distribution')) return 'Distribution Circuit'
  if (a.includes('logistic')) return 'Logistic Court'
  return 'Other'
}

function calcWidth(sizeStr, minW, maxW, minSqm, maxSqm) {
  const sqm = parseInt(sizeStr) || minSqm
  const clamped = Math.max(minSqm, Math.min(maxSqm, sqm))
  return Math.round(minW + ((clamped - minSqm) / (maxSqm - minSqm)) * (maxW - minW))
}

function cellCls(space, isSelected) {
  const base = 'border rounded-sm cursor-pointer transition-colors text-left focus:outline-none '
  const ring = isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ' : ''
  if (space.status === 'occupied')
    return base + ring + 'bg-gray-900 text-white border-gray-700 hover:bg-gray-800'
  if (space.status === 'reserved')
    return base + ring + 'bg-amber-50 text-amber-900 border-amber-400 hover:bg-amber-100'
  return base + ring + 'bg-white text-green-900 border-green-300 hover:bg-green-50'
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  )
}

export default function FloorPlan({ spaces, leases, tenants, onNewContract }) {
  const [view, setView] = useState('warehouses')
  const [selected, setSelected] = useState(null)

  function switchView(v) {
    setView(v)
    setSelected(null)
  }

  function getActiveLease(spaceId) {
    return leases.find((l) => l.spaceId === spaceId && l.status === 'active')
  }

  function getTenant(spaceId) {
    const lease = getActiveLease(spaceId)
    return lease ? tenants.find((t) => t.id === lease.tenantId) : null
  }

  function handleSelect(space) {
    setSelected((prev) => (prev?.id === space.id ? null : space))
  }

  const selectedLease = selected ? getActiveLease(selected.id) : null
  const selectedTenant = selected ? getTenant(selected.id) : null

  const warehouseSpaces = spaces.filter((s) => s.type === 'warehouse')
  const storageSpaces = spaces.filter((s) => s.type === 'storage')

  // Group warehouses into road sections
  const sectionMap = {}
  warehouseSpaces.forEach((s) => {
    const sec = detectSection(s.address)
    if (!sectionMap[sec]) sectionMap[sec] = []
    sectionMap[sec].push(s)
  })
  const sections = [
    ...SECTION_ORDER.filter((s) => sectionMap[s]).map((s) => ({ name: s, units: sectionMap[s] })),
    ...(sectionMap['Other'] ? [{ name: 'Other', units: sectionMap['Other'] }] : []),
  ]

  return (
    <div className="flex gap-5 items-start">
      {/* Main floorplan area */}
      <div className="flex-1 min-w-0">
        {/* View tabs */}
        <div className="flex gap-2 mb-5">
          {[
            { id: 'warehouses', label: 'Warehouses', Icon: Warehouse },
            { id: 'storage', label: 'Storage Units', Icon: Package },
            { id: 'siteplan', label: 'Site Plan', Icon: Map },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => switchView(id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Warehouses floorplan ── */}
        {view === 'warehouses' && (
          <div className="border-2 border-gray-400 rounded-md overflow-hidden bg-neutral-200">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm">Found Huntingdale</span>
                <span className="text-gray-400 text-xs ml-3">Warehouse & Office Units</span>
              </div>
              <span className="text-gray-400 text-xs">17-31 Franklyn Street, Huntingdale VIC 3166</span>
            </div>

            {warehouseSpaces.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm italic">
                No warehouse units — add spaces of type "Warehouse" to see them here.
              </div>
            ) : (
              <div className="p-6 space-y-7">
                {sections.map(({ name, units }) => (
                  <div key={name}>
                    {/* Section divider */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-px flex-1 bg-gray-400" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
                        {name}
                      </span>
                      <div className="h-px flex-1 bg-gray-400" />
                    </div>

                    {/* Units */}
                    <div className="flex gap-3 flex-wrap">
                      {units.map((space) => {
                        const tenant = getTenant(space.id)
                        const w = calcWidth(space.size, 100, 172, 100, 250)
                        const isSelected = selected?.id === space.id
                        return (
                          <button
                            key={space.id}
                            onClick={() => handleSelect(space)}
                            className={cellCls(space, isSelected)}
                            style={{ width: w, minHeight: 100, padding: 10 }}
                          >
                            <div className="text-sm font-bold leading-tight">{space.unitNumber}</div>
                            <div className="text-xs mt-0.5 opacity-70">{space.size}</div>
                            {space.cars ? (
                              <div className="text-xs opacity-50 mt-0.5">{space.cars} car{space.cars !== 1 ? 's' : ''}</div>
                            ) : null}
                            <div className="text-xs mt-2 font-medium leading-tight">
                              {tenant
                                ? tenant.businessName.split(' ').slice(0, 2).join(' ')
                                : space.status === 'vacant'
                                ? '● Available'
                                : '◌ Under Offer'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Storage floorplan ── */}
        {view === 'storage' && (
          <div className="border-2 border-gray-400 rounded-md overflow-hidden bg-neutral-200">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-sm">Storage Units</span>
                <span className="text-gray-400 text-xs ml-3">18 Logistic Court</span>
              </div>
              <span className="text-gray-400 text-xs">Huntingdale VIC 3166</span>
            </div>

            {storageSpaces.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm italic">
                No storage units — add spaces of type "Storage" to see them here.
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gray-400" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
                    18 Logistic Court — Internal Units
                  </span>
                  <div className="h-px flex-1 bg-gray-400" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {storageSpaces.map((space) => {
                    const tenant = getTenant(space.id)
                    const w = calcWidth(space.size, 70, 110, 30, 80)
                    const isSelected = selected?.id === space.id
                    return (
                      <button
                        key={space.id}
                        onClick={() => handleSelect(space)}
                        className={cellCls(space, isSelected)}
                        style={{ width: w, minHeight: 80, padding: 8 }}
                      >
                        <div className="text-xs font-bold leading-tight">{space.unitNumber}</div>
                        <div className="text-xs opacity-70 mt-0.5">{space.size}</div>
                        <div className="text-xs mt-2 leading-tight font-medium">
                          {tenant
                            ? tenant.businessName.split(' ')[0]
                            : space.status === 'vacant'
                            ? '● Avail'
                            : '◌ Offer'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Site Plan PDF viewer ── */}
        {view === 'siteplan' && <SitePlanViewer />}

        {/* Legend — only shown for interactive views */}
        {view !== 'siteplan' && (
          <div className="flex gap-5 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-gray-900 inline-block" /> Occupied
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-400 inline-block" /> Under Offer
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-white border border-green-300 inline-block" /> Available
            </span>
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="w-60 shrink-0 bg-card border border-border rounded-xl p-4 sticky top-4 self-start">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-bold text-foreground text-base">{selected.unitNumber}</div>
              {selected.address && (
                <div className="text-xs text-muted-foreground mt-0.5">{selected.address}</div>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground mt-0.5"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                  selected.status === 'occupied'
                    ? 'bg-gray-900 text-white'
                    : selected.status === 'reserved'
                    ? 'bg-amber-50 text-amber-800 border border-amber-300'
                    : 'bg-green-50 text-green-800 border border-green-200'
                }`}
              >
                {selected.status === 'reserved' ? 'Under Offer' : selected.status}
              </span>
            </div>
            <DetailRow label="Total Area">{selected.size}</DetailRow>
            <DetailRow label="Monthly Rate">
              <span className="font-semibold">
                ${Number(selected.monthlyRate).toLocaleString('en-AU')}/mo
              </span>
            </DetailRow>
            <DetailRow label="Annual Rate">
              ${(Number(selected.monthlyRate) * 12).toLocaleString('en-AU')}/yr
            </DetailRow>
            {selected.cars ? (
              <DetailRow label="Car Spaces">{selected.cars}</DetailRow>
            ) : null}
          </div>

          {selected.attributes && (
            <div className="py-3 border-t border-border">
              <p className="text-xs text-muted-foreground leading-relaxed">{selected.attributes}</p>
            </div>
          )}

          {selectedTenant && (
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Current Tenant</div>
              <div className="font-semibold text-foreground text-sm leading-tight">
                {selectedTenant.businessName}
              </div>
              {selectedTenant.contactName && (
                <div className="text-xs text-muted-foreground mt-0.5">{selectedTenant.contactName}</div>
              )}
              {selectedTenant.email && (
                <div className="text-xs text-muted-foreground">{selectedTenant.email}</div>
              )}
              {selectedTenant.phone && (
                <div className="text-xs text-muted-foreground">{selectedTenant.phone}</div>
              )}
              {selectedLease && (
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                  Lease to {format(parseISO(selectedLease.endDate), 'dd/MM/yyyy')}
                </div>
              )}
            </div>
          )}

          {selected.status === 'vacant' && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-green-700 font-semibold">Available now</p>
              {onNewContract ? (
                <button
                  onClick={() => onNewContract(selected)}
                  className="mt-2 w-full bg-primary text-primary-foreground text-xs font-semibold py-2 rounded hover:bg-primary/90"
                >
                  + New Contract
                </button>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Go to Leases to assign a tenant</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
