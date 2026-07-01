import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { X, MapPin, Crosshair, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

// Image-based interactive floorplan: your real plan as the backdrop, with each
// space pinned on it as a status-coloured marker. Positions persist on the space
// record as `pos: { x, y }` (percent of image). Drop the plan image at the `src`
// path below (a friendly placeholder shows until you do).
const FLOORPLANS = [
  { id: 'hexa-l2', floor: 'l2', label: 'Level 2', src: '/floorplans/hexa-l2.png', location: 'whitehorse', description: '830 Whitehorse Road, Box Hill VIC 3128' },
  { id: 'hexa-l4', floor: 'l4', label: 'Level 4', src: '/floorplans/hexa-l4.png', location: 'whitehorse', description: '830 Whitehorse Road, Box Hill VIC 3128' },
  { id: 'hexa-l5', floor: 'l5', label: 'Level 5', src: '/floorplans/hexa-l5.png', location: 'whitehorse', description: '830 Whitehorse Road, Box Hill VIC 3128' },
]

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2]

function statusDot(status) {
  if (status === 'occupied') return 'bg-gray-900 text-white border-gray-900'
  if (status === 'reserved') return 'bg-amber-400 text-amber-950 border-amber-500'
  return 'bg-green-500 text-white border-green-600'
}

export default function InteractiveFloorPlan({ spaces, leases, tenants, updateSpace, onNewContract }) {
  const [planId, setPlanId] = useState(FLOORPLANS[0].id)
  const [zoom, setZoom] = useState(1)
  const [placingId, setPlacingId] = useState(null) // space currently being pinned
  const [selectedId, setSelectedId] = useState(null)
  const [imgError, setImgError] = useState(false)
  const imgWrapRef = useRef(null)

  const plan = FLOORPLANS.find((p) => p.id === planId)
  // Floor plan is for private offices only — not virtual, desks, parking or studios.
  const planSpaces = spaces.filter((s) => (s.location || 'whitehorse') === plan.location && s.type === 'office')
  // pinned to THIS floor
  const placed = planSpaces.filter((s) => s.pos && typeof s.pos.x === 'number' && s.floor === plan.floor)
  // not yet pinned anywhere — can be dropped onto any floor
  const unplaced = planSpaces.filter((s) => !s.pos || typeof s.pos.x !== 'number')

  const getActiveLease = (spaceId) => leases.find((l) => l.spaceId === spaceId && l.status === 'active')
  const getTenant = (spaceId) => {
    const lease = getActiveLease(spaceId)
    return lease ? tenants.find((t) => t.id === lease.tenantId) : null
  }

  const selected = selectedId ? planSpaces.find((s) => s.id === selectedId) : null
  const selectedTenant = selected ? getTenant(selected.id) : null
  const selectedLease = selected ? getActiveLease(selected.id) : null

  function handleImageClick(e) {
    if (!placingId || imgError) return
    const rect = imgWrapRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    updateSpace(placingId, { pos: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }, floor: plan.floor })
    setPlacingId(null)
  }

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FLOORPLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPlanId(p.id); setSelectedId(null); setPlacingId(null) }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                planId === p.id ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 border border-gray-200 rounded-md overflow-hidden">
            <button onClick={() => setZoom((z) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(z) - 1)])} className="px-2.5 py-1.5 hover:bg-gray-100" title="Zoom out"><ZoomOut size={14} /></button>
            <span className="text-xs text-gray-600 px-2 min-w-[42px] text-center font-medium">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(z) + 1)])} className="px-2.5 py-1.5 hover:bg-gray-100" title="Zoom in"><ZoomIn size={14} /></button>
            <button onClick={() => setZoom(1)} className="px-2.5 py-1.5 hover:bg-gray-100 border-l border-gray-200" title="Reset"><Maximize2 size={14} /></button>
          </div>
        </div>

        {placingId && (
          <div className="mb-3 flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-3 py-2">
            <Crosshair size={15} /> Click on the plan to place <strong>{planSpaces.find((s) => s.id === placingId)?.unitNumber}</strong>
            <button onClick={() => setPlacingId(null)} className="ml-auto text-blue-500 hover:text-blue-800"><X size={14} /></button>
          </div>
        )}

        {/* Plan image with markers */}
        <div className="border border-gray-200 rounded-md overflow-auto bg-gray-100" style={{ maxHeight: '72vh' }}>
          {imgError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <MapPin size={36} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">Floor plan image not found</p>
              <p className="text-xs text-gray-400 mt-2 max-w-sm">
                Drop your plan at{' '}
                <code className="bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-800">public{plan.src.replace(/\//g, '\\')}</code>
                {' '}— markers can still be placed once the image is present.
              </p>
            </div>
          ) : (
            <div style={{ transformOrigin: 'top left', transform: `scale(${zoom})`, width: `${100 / zoom}%` }}>
              <div
                ref={imgWrapRef}
                className={`relative ${placingId ? 'cursor-crosshair' : ''}`}
                onClick={handleImageClick}
              >
                <img src={plan.src} alt={plan.label} className="w-full h-auto block select-none" draggable={false}
                  onError={() => setImgError(true)} onLoad={() => setImgError(false)} />
                {placed.map((s) => {
                  const tenant = getTenant(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedId((p) => (p === s.id ? null : s.id)) }}
                      title={`${s.unitNumber}${tenant ? ' — ' + tenant.businessName : ''}`}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 border shadow-sm rounded-full text-[10px] font-bold px-2 py-1 leading-none whitespace-nowrap transition-transform hover:scale-110 ${statusDot(s.status)} ${selectedId === s.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                      style={{ left: `${s.pos.x}%`, top: `${s.pos.y}%` }}
                    >
                      {s.unitNumber}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Legend + unplaced */}
        <div className="flex gap-5 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-900 inline-block" /> Occupied</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Reserved</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Vacant</span>
        </div>

        {unplaced.length > 0 && (
          <div className="mt-4 border border-dashed border-gray-300 rounded-md p-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Unplaced spaces ({unplaced.length}) — click to pin onto the plan
            </div>
            <div className="flex flex-wrap gap-2">
              {unplaced.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPlacingId(s.id)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    placingId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <MapPin size={11} className="inline mr-1" />{s.unitNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-60 shrink-0 bg-white border border-gray-200 rounded-md p-4 sticky top-4 self-start">
          <div className="flex items-start justify-between mb-3">
            <div className="font-bold text-gray-900 text-base">{selected.unitNumber}</div>
            <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${
                selected.status === 'occupied' ? 'bg-gray-900 text-white'
                : selected.status === 'reserved' ? 'bg-amber-50 text-amber-800 border border-amber-300'
                : 'bg-green-50 text-green-800 border border-green-200'}`}>{selected.status}</span>
            </div>
            {selected.size && <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Size</span><span className="text-sm text-gray-900">{selected.size}</span></div>}
            {selected.monthlyRate != null && <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Monthly</span><span className="text-sm font-semibold text-gray-900">${Number(selected.monthlyRate).toLocaleString('en-AU')}</span></div>}
          </div>
          {selectedTenant && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Current tenant</div>
              <div className="font-semibold text-gray-900 text-sm">{selectedTenant.businessName}</div>
              {selectedLease && <div className="text-xs text-gray-400 mt-1">Lease to {format(parseISO(selectedLease.endDate), 'dd/MM/yyyy')}</div>}
            </div>
          )}
          {selected.status === 'vacant' && onNewContract && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-green-700 font-semibold mb-2">Available now</p>
              <button onClick={() => onNewContract(selected)} className="w-full bg-black text-white text-xs font-semibold py-2 rounded hover:bg-gray-800">+ New Contract</button>
            </div>
          )}
          <div className="pt-3 mt-1 border-t border-gray-100">
            <button onClick={() => { updateSpace(selected.id, { pos: null, floor: null }); setSelectedId(null) }} className="text-xs text-gray-400 hover:text-red-600">Unpin from plan</button>
          </div>
        </div>
      )}
    </div>
  )
}
