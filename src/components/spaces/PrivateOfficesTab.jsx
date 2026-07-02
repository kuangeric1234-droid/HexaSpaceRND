import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus, Pencil, Trash2, FileText, DoorClosed, KeyRound } from 'lucide-react'
import ContractForm from '../ContractForm.jsx'
import {
  FLOORS, floorLabel, StatusPill, money, Field, Modal, ic,
  officeRate, ppRate, revenueAccountFor, accountCode,
} from './shared.jsx'

const PLACEMENTS = [['external', 'External'], ['internal', 'Internal']]
// Floor order. Level 4 & 5 bill together (Xero 201); Level 2 bills separately (201.1).
const OFFICE_FLOORS = ['l4', 'l5', 'l2']

function blankForm(floor = 'l4') {
  return { unitNumber: '', floor, placement: 'external', pax: '', monthlyRate: '', rateTouched: false, saltoDoors: '', attributes: '' }
}

// Private Offices — grouped by floor (Level 4 / Level 2 bill to different Xero
// accounts). Rate auto-computes from floor × placement × pax.
export default function PrivateOfficesTab({ ctx }) {
  const { spaces, leases, tenants, settings, templates, discounts,
    addSpace, updateSpace, deleteSpace, addLease, updateLease, currentUserRole } = ctx
  const navigate = useNavigate()
  const [editId, setEditId] = useState(undefined)
  const [form, setForm] = useState(blankForm())
  const [contractSpace, setContractSpace] = useState(null)
  const [levelFilter, setLevelFilter] = useState('all') // 'all' | 'l4' | 'l2'
  const [editEndId, setEditEndId] = useState(null) // lease id whose end date is being edited
  const isSuperAdmin = currentUserRole === 'super_admin'

  const offices = spaces.filter((s) => s.type === 'office')
  const activeLeaseFor = (spaceId) =>
    leases.find((l) => l.spaceId === spaceId && l.status === 'active') ||
    leases.find((l) => l.spaceId === spaceId && l.status === 'pending')
  const companyName = (tenantId) => tenants.find((t) => t.id === tenantId)?.businessName ?? '—'
  const fmtDate = (d) => { if (!d) return '—'; try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return '—' } }
  // Explicit floorplan occupant on the space wins; otherwise fall back to a lease.
  const occupantOf = (o) => {
    if (o.occupantTenantId) return { name: companyName(o.occupantTenantId), tenantId: o.occupantTenantId }
    if (o.occupantName) return { name: o.occupantName }
    const lease = activeLeaseFor(o.id)
    if (lease) return { name: companyName(lease.tenantId), tenantId: lease.tenantId, contract: lease.contractNumber }
    return null
  }

  function nextSuite(floor) {
    const nums = offices.filter((o) => o.floor === floor)
      .map((o) => parseInt(String(o.unitNumber).replace(/\D/g, ''), 10)).filter((n) => !isNaN(n))
    return `Suite ${(nums.length ? Math.max(...nums) : 0) + 1}`
  }

  function openNew(floor = 'l4') {
    setEditId(null)
    setForm({ ...blankForm(floor), unitNumber: nextSuite(floor) })
  }
  function openEdit(o) {
    setEditId(o.id)
    setForm({
      unitNumber: o.unitNumber ?? '', floor: o.floor ?? 'l4',
      placement: o.placement ?? 'external', pax: o.pax ?? '',
      monthlyRate: o.monthlyRate ?? '', rateTouched: true,
      saltoDoors: o.saltoDoors ?? '', attributes: o.attributes ?? '',
    })
  }

  // Recompute the rate from pricing rules unless the user has manually edited it.
  function patch(updates) {
    setForm((prev) => {
      const next = { ...prev, ...updates }
      const pricingChanged = ['floor', 'placement', 'pax'].some((k) => k in updates)
      if (pricingChanged && !next.rateTouched && next.pax !== '') {
        next.monthlyRate = officeRate(next.floor, next.placement, next.pax)
      }
      return next
    })
  }

  function save() {
    if (!form.unitNumber) return
    const pax = form.pax !== '' ? Number(form.pax) : undefined
    const data = {
      type: 'office', unitNumber: form.unitNumber, floor: form.floor,
      placement: form.placement, pax,
      size: pax ? `${pax} pax${form.placement === 'internal' ? ' internal' : ''}` : undefined,
      monthlyRate: form.monthlyRate !== '' ? Number(form.monthlyRate) : officeRate(form.floor, form.placement, pax),
      saltoDoors: form.saltoDoors || undefined,
      attributes: form.attributes || undefined,
      location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill',
    }
    if (editId) updateSpace(editId, data)
    else addSpace({ ...data, status: 'vacant' })
    setEditId(undefined)
  }

  // Every office in one flat list, ordered by floor then suite number.
  const floorRank = (f) => { const i = OFFICE_FLOORS.indexOf(f); return i === -1 ? 99 : i }
  const suiteNum = (o) => { const n = parseInt(String(o.unitNumber).replace(/\D/g, ''), 10); return isNaN(n) ? 9999 : n }
  const sorted = [...offices]
    .filter((o) => levelFilter === 'all' || (o.floor || '') === levelFilter)
    .sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || suiteNum(a) - suiteNum(b))

  const levelCount = (f) => offices.filter((o) => f === 'all' || (o.floor || '') === f).length
  // All + one tab per floor that actually has offices, in OFFICE_FLOORS order.
  const FLOOR_LABEL = { l4: 'Level 4', l5: 'Level 5', l2: 'Level 2' }
  const LEVEL_TABS = [['all', 'All'], ...OFFICE_FLOORS.filter((f) => levelCount(f) > 0).map((f) => [f, FLOOR_LABEL[f]])]

  const previewAccount = revenueAccountFor({ type: 'office', floor: form.floor }, settings)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          {offices.length} offices · {offices.filter((o) => o.status === 'vacant').length} available — Level 4 &amp; Level 2 bill to separate Xero accounts
        </p>
        <button onClick={() => openNew('l4')} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800">
          <Plus size={15} /> Add Office
        </button>
      </div>

      <div className="flex border border-gray-200 rounded-md overflow-hidden w-fit mb-4">
        {LEVEL_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setLevelFilter(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm border-l first:border-l-0 border-gray-200 transition-colors ${
              levelFilter === key ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${levelFilter === key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{levelCount(key)}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Suite', 'Level', 'Pax', 'Placement', 'Start', 'End', 'Rate', 'Occupant', 'Salto doors', 'Status', ''].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-gray-400 text-sm">No private offices yet.</td></tr>
            )}
            {sorted.map((o) => {
              const occ = occupantOf(o)
              const lease = activeLeaseFor(o.id)
              // Status follows occupancy: occupied when someone's in it, available when not.
              const derivedStatus = occ ? 'occupied' : 'vacant'
              return (
                <tr key={o.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{o.unitNumber}</td>
                  <td className="px-4 py-2.5 text-gray-600">{floorLabel(o.floor)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{o.pax ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${o.placement === 'internal' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                      {o.placement === 'internal' ? 'Internal' : 'External'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(lease?.startDate)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {lease && isSuperAdmin ? (
                      editEndId === lease.id ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={lease.endDate || ''}
                          onBlur={(e) => { updateLease(lease.id, { endDate: e.target.value || '' }); setEditEndId(null) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditEndId(null) }}
                          className="border border-gray-300 rounded px-1.5 py-0.5 text-sm"
                        />
                      ) : (
                        <button
                          onClick={() => setEditEndId(lease.id)}
                          title="Click to change the end date (updates the lease & bill run)"
                          className="hover:underline decoration-dotted underline-offset-2 hover:text-gray-900"
                        >
                          {fmtDate(lease.endDate)}
                        </button>
                      )
                    ) : fmtDate(lease?.endDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{money(o.monthlyRate)}/mo</div>
                    {o.discount > 0 && (
                      <div className="text-xs text-gray-400">
                        <span className="line-through">{money(o.listPrice)}</span>
                        <span className="text-green-700 ml-1">−{money(o.discount)}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {occ ? (
                      <button onClick={() => navigate('/leases')} className="text-left group">
                        <div className="text-gray-900 group-hover:underline">{occ.name}</div>
                        {occ.contract && <div className="text-xs text-gray-400 flex items-center gap-1"><FileText size={11} /> {occ.contract}</div>}
                      </button>
                    ) : <span className="text-gray-400">Vacant</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {o.saltoDoors
                      ? <span className="inline-flex items-center gap-1 text-xs text-gray-600"><DoorClosed size={12} /> {o.saltoDoors}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5"><StatusPill status={derivedStatus} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {derivedStatus === 'vacant' && (
                        <button onClick={() => setContractSpace(o)} className="flex items-center gap-1 text-xs text-white bg-black hover:bg-gray-800 px-2.5 py-1.5 rounded-md font-medium">
                          <FileText size={12} /> Contract
                        </button>
                      )}
                      <button onClick={() => openEdit(o)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Delete this office?')) deleteSpace(o.id) }} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editId !== undefined && (
        <Modal title={editId ? 'Edit Office' : 'Add Office'} onClose={() => setEditId(undefined)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Suite name *"><input value={form.unitNumber} onChange={(e) => patch({ unitNumber: e.target.value })} placeholder="Suite 1" className={ic} /></Field>
              <Field label="Floor">
                <select value={form.floor} onChange={(e) => patch({ floor: e.target.value })} className={ic}>
                  {FLOORS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Placement">
                <select value={form.placement} onChange={(e) => patch({ placement: e.target.value })} className={ic}>
                  {PLACEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Capacity (pax)">
                <input type="number" min="1" value={form.pax} onChange={(e) => patch({ pax: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="4" className={ic} />
              </Field>
            </div>
            <Field label="Monthly Rate (AUD)">
              <input type="number" min="0" value={form.monthlyRate} onChange={(e) => setForm({ ...form, monthlyRate: e.target.value, rateTouched: true })} className={ic} />
            </Field>
            <p className="text-xs text-gray-400 -mt-2">
              Auto: {form.pax || 0} pax × {money(ppRate(form.floor, form.placement))}pp ({form.placement}, {floorLabel(form.floor)}) = <span className="font-medium text-gray-600">{money(officeRate(form.floor, form.placement, form.pax))}/mo</span>
              {form.rateTouched && form.monthlyRate !== '' && Number(form.monthlyRate) !== officeRate(form.floor, form.placement, form.pax) && ' · manual override'}
            </p>
            <div className="bg-gray-50 rounded-md px-3 py-2 text-xs text-gray-600">
              Bills to Xero account: <span className="font-medium text-gray-800">{previewAccount}</span>
            </div>
            <Field label={<span className="flex items-center gap-1"><KeyRound size={12} /> Salto doors (comma-separated)</span>}>
              <input value={form.saltoDoors} onChange={(e) => setForm({ ...form, saltoDoors: e.target.value })} placeholder="L4 Lift, Suite 1 Door" className={ic} />
            </Field>
            <Field label="Notes"><textarea rows={2} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} className={`${ic} resize-none`} /></Field>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setEditId(undefined)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Cancel</button>
              <button onClick={save} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">{editId ? 'Save' : 'Add Office'}</button>
            </div>
          </div>
        </Modal>
      )}

      {contractSpace && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 pt-8">
            <div className="bg-white rounded-md w-full max-w-4xl shadow-2xl relative">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">New Contract — {contractSpace.unitNumber} · {floorLabel(contractSpace.floor)}</h2>
                <button onClick={() => setContractSpace(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
              </div>
              <ContractForm
                editLease={{ spaceId: contractSpace.id, monthlyRent: contractSpace.monthlyRate }}
                leases={leases} tenants={tenants} spaces={spaces}
                templates={templates ?? []} discounts={discounts ?? []} settings={settings}
                onSave={(data) => { addLease(data); setContractSpace(null); navigate('/leases') }}
                onCancel={() => setContractSpace(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
