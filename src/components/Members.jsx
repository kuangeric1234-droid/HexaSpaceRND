import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import MemberProfile from './MemberProfile.jsx'

const today = () => new Date().toISOString().split('T')[0]

const EMPTY = {
  name: '', companyId: '', email: '', phone: '', twitter: '', bio: '',
  startDate: today(), status: 'Auto',
  contactPerson: false, billingPerson: false, portalAccess: true, hideFromPortal: false,
  address: '', city: '', state: '', zip: '', country: 'Australia',
  billBusinessName: '', abn: '', currency: 'AUD', taxRate: 'GST 10%',
  paymentMethod: '', billingPeriodStart: '1', poMembership: '', poOneOff: '',
  eInvoiceId: '', eInvoiceScheme: '',
}

const STATUS_STYLE = {
  Active: 'bg-green-100 text-green-800',
  'Drop In': 'bg-gray-800 text-white',
  Former: 'bg-red-100 text-red-700',
  Pending: 'bg-amber-100 text-amber-800',
}

export function displayStatus(m) {
  return m.status && m.status !== 'Auto' ? m.status : 'Active'
}
export function accessRoles(m) {
  return [
    m.contactPerson && 'Contact Person',
    m.billingPerson && 'Billing Person',
    m.portalAccess && 'Member Portal User',
  ].filter(Boolean)
}

export default function Members() {
  const ctx = useOutletContext()
  const { members = [], tenants = [], addMember, updateMember } = ctx
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const companyName = (id) => tenants.find((t) => t.id === id)?.businessName ?? ''

  const counts = {
    active: members.filter((m) => displayStatus(m) === 'Active').length,
    dropin: members.filter((m) => displayStatus(m) === 'Drop In').length,
    pending: members.filter((m) => displayStatus(m) === 'Pending').length,
    portal: members.filter((m) => m.portalAccess).length,
  }

  const filtered = members.filter((m) => {
    if (filter === 'Active' && displayStatus(m) !== 'Active') return false
    if (filter === 'Drop In' && displayStatus(m) !== 'Drop In') return false
    if (filter === 'Pending' && displayStatus(m) !== 'Pending') return false
    if (filter === 'portal' && !m.portalAccess) return false
    return [m.name, companyName(m.companyId), m.email].join(' ').toLowerCase().includes(search.toLowerCase())
  })

  function openAdd() { setEditId(null); setForm({ ...EMPTY, startDate: today() }); setShowForm(true) }
  function openEdit(m) { setEditId(m.id); setForm({ ...EMPTY, ...m }); setShowForm(true) }
  function submit() {
    if (!form.name) return
    if (editId) { updateMember(editId, form); if (selected?.id === editId) setSelected({ ...selected, ...form }) }
    else addMember(form)
    setShowForm(false)
  }

  if (selected) {
    return (
      <>
        <MemberProfile member={selected} ctx={ctx} onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} />
        <MemberModal open={showForm} editId={editId} form={form} setForm={setForm} tenants={tenants} onClose={() => setShowForm(false)} onSubmit={submit} />
      </>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <div className="flex items-center gap-2">
          <button disabled className="px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-400 cursor-not-allowed">Invite</button>
          <button disabled className="px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-400 cursor-not-allowed">Import</button>
          <button disabled className="px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-400 cursor-not-allowed">Export</button>
          <button onClick={openAdd} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"><Plus size={15} /> Add Member</button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-5 mt-3">
        <input type="text" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        <div className="flex gap-2 text-xs">
          {[['all', `All ${members.length}`], ['Active', `Active (${counts.active})`], ['Drop In', `Drop-in (${counts.dropin})`], ['Pending', `Pending (${counts.pending})`], ['portal', `Portal Users (${counts.portal})`]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-md border ${filter === v ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Company', 'Location', 'Status', 'Access', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400 text-sm">No members yet. Click <strong>Add Member</strong> to create one.</td></tr>
            )}
            {filtered.map((m) => {
              const st = displayStatus(m)
              return (
                <tr key={m.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(m)}>
                  <td className="px-4 py-3 font-medium text-blue-700 hover:underline">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{companyName(m.companyId)}</td>
                  <td className="px-4 py-3 text-gray-500">Hexa Space</td>
                  <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[st] || 'bg-gray-100 text-gray-600'}`}>{st}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {accessRoles(m).map((a) => (
                        <span key={a} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${a === 'Contact Person' ? 'bg-blue-600 text-white' : a === 'Billing Person' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-white'}`}>{a}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setSelected(m)} className="text-sm border border-gray-200 rounded px-3 py-1 hover:bg-gray-50">View Details</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <MemberModal open={showForm} editId={editId} form={form} setForm={setForm} tenants={tenants} onClose={() => setShowForm(false)} onSubmit={submit} />
    </div>
  )
}

// ── Add/Edit Member modal — General / Address / Billing / E-Invoicing ──
const TABS = ['General', 'Address', 'Billing Details', 'E-Invoicing']
const ic = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'

function F({ label, children, required }) {
  return <label className="block"><span className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>{children}</label>
}

function MemberModal({ open, editId, form, setForm, tenants, onClose, onSubmit }) {
  const [tab, setTab] = useState('General')
  if (!open) return null
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const tog = (k) => (e) => setForm({ ...form, [k]: e.target.checked })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{editId ? 'Edit Member' : 'Add Member'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="flex gap-5 px-6 pt-3 border-b border-gray-200 text-sm overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`pb-2 whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-black text-black font-medium' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>{t}</button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {tab === 'General' && (
            <>
              <F label="Name" required><input required value={form.name} onChange={up('name')} placeholder="Full Name" className={ic} /></F>
              <F label="Company"><select value={form.companyId} onChange={up('companyId')} className={ic}><option value="">Select company</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.businessName}</option>)}</select></F>
              <div className="grid grid-cols-2 gap-4">
                <F label="Email"><input type="email" value={form.email} onChange={up('email')} placeholder="Contact Email" className={ic} /></F>
                <F label="Phone"><input value={form.phone} onChange={up('phone')} className={ic} /></F>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <F label="Twitter"><input value={form.twitter} onChange={up('twitter')} className={ic} /></F>
                <F label="Start Date" required><input type="date" value={form.startDate} onChange={up('startDate')} className={ic} /></F>
              </div>
              <F label="Bio"><textarea rows={2} value={form.bio} onChange={up('bio')} className={ic} /></F>
              <F label="Status"><select value={form.status} onChange={up('status')} className={ic}><option>Auto</option><option>Active</option><option>Drop In</option><option>Pending</option><option>Former</option></select>
                <span className="text-[11px] text-gray-400">Auto = calculated from the member’s memberships.</span></F>
              <div className="border-t border-gray-100 pt-3">
                <span className="block text-xs font-medium text-gray-600 mb-2">Access</span>
                {[['contactPerson', 'Contact Person'], ['billingPerson', 'Billing Person'], ['portalAccess', 'Member Portal User']].map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" checked={!!form[k]} onChange={tog(k)} /> {label}</label>
                ))}
              </div>
            </>
          )}
          {tab === 'Address' && (
            <>
              <F label="Address"><textarea rows={2} value={form.address} onChange={up('address')} className={ic} /></F>
              <div className="grid grid-cols-2 gap-4"><F label="City"><input value={form.city} onChange={up('city')} className={ic} /></F><F label="State"><input value={form.state} onChange={up('state')} className={ic} /></F></div>
              <div className="grid grid-cols-2 gap-4"><F label="Zip"><input value={form.zip} onChange={up('zip')} className={ic} /></F><F label="Country"><input value={form.country} onChange={up('country')} className={ic} /></F></div>
            </>
          )}
          {tab === 'Billing Details' && (
            <>
              <F label="Business Name"><input value={form.billBusinessName} onChange={up('billBusinessName')} className={ic} /></F>
              <div className="grid grid-cols-2 gap-4"><F label="ABN"><input value={form.abn} onChange={up('abn')} className={ic} /></F><F label="Currency"><select value={form.currency} onChange={up('currency')} className={ic}><option>AUD</option><option>USD</option><option>NZD</option></select></F></div>
              <div className="grid grid-cols-2 gap-4"><F label="Tax Rate"><select value={form.taxRate} onChange={up('taxRate')} className={ic}><option>GST 10%</option><option>Not Selected</option><option>GST Free</option></select></F><F label="Payment Method"><input value={form.paymentMethod} onChange={up('paymentMethod')} className={ic} /></F></div>
              <F label="Billing Period Start Date"><select value={form.billingPeriodStart} onChange={up('billingPeriodStart')} className={ic}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}</option>)}</select></F>
              <div className="grid grid-cols-2 gap-4"><F label="PO Number (Memberships)"><input value={form.poMembership} onChange={up('poMembership')} className={ic} /></F><F label="PO Number (One-Off Fees)"><input value={form.poOneOff} onChange={up('poOneOff')} className={ic} /></F></div>
            </>
          )}
          {tab === 'E-Invoicing' && (
            <>
              <p className="text-xs text-gray-400">E-invoicing (PEPPOL) identifiers — optional.</p>
              <div className="grid grid-cols-2 gap-4"><F label="Endpoint ID"><input value={form.eInvoiceId} onChange={up('eInvoiceId')} className={ic} /></F><F label="Scheme"><input value={form.eInvoiceScheme} onChange={up('eInvoiceScheme')} placeholder="e.g. 0151 (ABN)" className={ic} /></F></div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
          <button type="button" onClick={() => { if (!form.name) { setTab('General'); return } onSubmit() }} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">{editId ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}
