import { useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, Check, LayoutGrid, Map, FileText, Upload } from 'lucide-react'
import FloorPlan from './FloorPlan.jsx'
import InteractiveFloorPlan from './InteractiveFloorPlan.jsx'
import ContractForm from './ContractForm.jsx'
import PriceListImport from './PriceListImport.jsx'

const SPACE_TYPES = ['warehouse', 'storage', 'desk', 'office', 'popup']
const LOCATIONS = ['huntingdale', 'lonsdale', 'whitehorse']
const STATUSES = ['vacant', 'occupied', 'reserved']

const EMPTY_FORM = {
  unitNumber: '',
  type: 'warehouse',
  size: '',
  monthlyRate: '',
  status: 'vacant',
  location: 'huntingdale',
  address: '',
  cars: '',
  attributes: '',
}

const STATUS_STYLE = {
  occupied: 'bg-gray-900 text-white',
  vacant: 'bg-green-50 text-green-800 border border-green-200',
  reserved: 'bg-amber-50 text-amber-800 border border-amber-200',
}

const TYPE_LABEL = {
  warehouse: 'Warehouse',
  storage: 'Storage Unit',
  desk: 'Coworking Desk',
  office: 'Private Office',
  popup: 'Pop-up / Retail Bay',
}

export default function Spaces() {
  const { spaces, leases, tenants, addSpace, updateSpace, deleteSpace, resetSampleData,
    addLease, templates, discounts, settings } = useOutletContext()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [contractSpace, setContractSpace] = useState(null) // space to create contract for
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewMode, setViewMode] = useState('floorplan')
  const [showImport, setShowImport] = useState(false)

  const filtered = spaces.filter((s) => {
    if (filterType !== 'all' && s.type !== filterType) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(space) {
    setEditId(space.id)
    setForm({
      unitNumber: space.unitNumber,
      type: space.type,
      size: space.size,
      monthlyRate: space.monthlyRate,
      status: space.status,
      location: space.location,
      address: space.address || '',
      cars: space.cars != null ? String(space.cars) : '',
      attributes: space.attributes || '',
    })
    setShowForm(true)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const data = {
      ...form,
      monthlyRate: Number(form.monthlyRate),
      cars: form.cars !== '' ? Number(form.cars) : undefined,
      attributes: form.attributes || undefined,
      address: form.address || undefined,
    }
    if (editId) {
      updateSpace(editId, data)
    } else {
      addSpace(data)
    }
    setShowForm(false)
  }

  function handleDelete(id) {
    if (window.confirm('Delete this space? Ensure there are no active leases against it.')) {
      deleteSpace(id)
    }
  }

  const warehouseCount = spaces.filter((s) => s.type === 'warehouse').length
  const storageCount = spaces.filter((s) => s.type === 'storage').length
  const vacantCount = spaces.filter((s) => s.status === 'vacant').length

  return (
    <>
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spaces</h1>
          <p className="text-sm text-gray-500 mt-1">
            {spaces.length} units · {warehouseCount} warehouses · {storageCount} storage ·{' '}
            <span className="text-green-700 font-medium">{vacantCount} available</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => resetSampleData()}
            className="text-xs text-gray-400 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            Load sample data
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload size={15} /> Import price list
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus size={15} /> Add Space
          </button>
        </div>
      </div>

      {/* View toggle + filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* List / Floorplan toggle */}
        <div className="flex border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
              viewMode === 'list' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid size={14} /> List
          </button>
          <button
            onClick={() => setViewMode('floorplan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 transition-colors ${
              viewMode === 'floorplan' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Map size={14} /> Schematic
          </button>
          <button
            onClick={() => setViewMode('interactive')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 transition-colors ${
              viewMode === 'interactive' ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Map size={14} /> Plan
          </button>
        </div>

        {viewMode === 'list' && (
          <>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
            >
              <option value="all">All Types</option>
              {SPACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* ── Floorplan view (schematic) ── */}
      {viewMode === 'floorplan' && (
        <FloorPlan spaces={spaces} leases={leases} tenants={tenants} onNewContract={setContractSpace} />
      )}

      {/* ── Interactive image-based plan ── */}
      {viewMode === 'interactive' && (
        <InteractiveFloorPlan
          spaces={spaces}
          leases={leases}
          tenants={tenants}
          updateSpace={updateSpace}
          onNewContract={setContractSpace}
        />
      )}

      {/* ── List / Card view ── */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400 text-sm">
              No spaces match the selected filters.
            </div>
          )}
          {filtered.map((space) => (
            <div key={space.id} className="bg-white border border-gray-200 rounded-md p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-lg font-bold text-gray-900">{space.unitNumber}</span>
                  {space.address && (
                    <div className="text-xs text-gray-400 mt-0.5">{space.address}</div>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${STATUS_STYLE[space.status]}`}
                >
                  {space.status === 'reserved' ? 'Under Offer' : space.status}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span>{TYPE_LABEL[space.type] ?? space.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Size</span>
                  <span>{space.size}</span>
                </div>
                {space.cars != null && space.cars > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cars</span>
                    <span>{space.cars}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Monthly Rate</span>
                  <span className="font-semibold text-gray-900">
                    ${Number(space.monthlyRate).toLocaleString('en-AU')}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Annual Rate</span>
                  <span className="text-gray-600">
                    ${(Number(space.monthlyRate) * 12).toLocaleString('en-AU')}/yr
                  </span>
                </div>
              </div>
              {space.attributes && (
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">{space.attributes}</p>
              )}
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                {space.status === 'vacant' && (
                  <button
                    onClick={() => setContractSpace(space)}
                    className="flex items-center gap-1.5 text-xs text-white bg-black hover:bg-gray-800 px-2.5 py-1.5 rounded-md font-medium"
                  >
                    <FileText size={12} /> New Contract
                  </button>
                )}
                <button
                  onClick={() => openEdit(space)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2.5 py-1.5 rounded-md hover:bg-gray-50"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(space.id)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 border border-gray-200 px-2.5 py-1.5 rounded-md hover:bg-red-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-md w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-900">{editId ? 'Edit Space' : 'Add Space'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit Number *</label>
                  <input
                    required
                    value={form.unitNumber}
                    onChange={(e) => setForm({ ...form, unitNumber: e.target.value })}
                    placeholder="e.g. O5"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                  <input
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    placeholder="e.g. 240 m²"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    {SPACE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <select
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l} className="capitalize">
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Rate (AUD) *</label>
                  <input
                    required
                    type="number"
                    value={form.monthlyRate}
                    onChange={(e) => setForm({ ...form, monthlyRate: e.target.value })}
                    placeholder="4708"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Street Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g. 11 Distribution Circuit"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Car Spaces</label>
                  <input
                    type="number"
                    min="0"
                    value={form.cars}
                    onChange={(e) => setForm({ ...form, cars: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Features / Attributes
                  </label>
                  <textarea
                    rows={2}
                    value={form.attributes}
                    onChange={(e) => setForm({ ...form, attributes: e.target.value })}
                    placeholder="e.g. Street frontage, rear access tilt door & full floor office"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800"
                >
                  <Check size={14} />
                  {editId ? 'Save Changes' : 'Add Space'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

    {/* Quick New Contract modal */}
    {contractSpace && (
      <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
        <div className="min-h-full flex items-start justify-center p-4 pt-8">
          <div className="bg-white rounded-md w-full max-w-4xl shadow-2xl relative">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                New Contract — {contractSpace.unitNumber}
              </h2>
              <button onClick={() => setContractSpace(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <ContractForm
              editLease={{ spaceId: contractSpace.id, monthlyRent: contractSpace.monthlyRate }}
              leases={leases}
              tenants={tenants}
              spaces={spaces}
              templates={templates ?? []}
              discounts={discounts ?? []}
              settings={settings}
              onSave={(data) => {
                addLease(data)
                setContractSpace(null)
                navigate('/leases')
              }}
              onCancel={() => setContractSpace(null)}
            />
          </div>
        </div>
      </div>
    )}

    {showImport && (
      <PriceListImport store={{ spaces, addSpace, updateSpace }} onClose={() => setShowImport(false)} />
    )}
    </>
  )
}
