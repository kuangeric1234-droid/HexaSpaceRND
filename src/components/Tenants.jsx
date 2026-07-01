import { useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import TenantProfile from './TenantProfile.jsx'

const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  businessName: '', email: '', url: '', twitter: '', moreInfo: '',
  startDate: today(), status: 'Active', description: '',
  contactName: '', phone: '', industry: '',
  address: '', city: '', state: '', zip: '', country: 'Australia',
  billBusinessName: '', abn: '', currency: 'AUD', taxRate: 'GST 10%',
  paymentMethod: '', billingPeriodStart: '1', poMembership: '', poOneOff: '',
}

const STATUS_STYLE = {
  Active: 'bg-green-100 text-green-800',
  Lead: 'bg-blue-100 text-blue-800',
  'Drop In': 'bg-gray-800 text-white',
  Former: 'bg-red-100 text-red-700',
}

export default function Tenants() {
  const { tenants, addTenant, updateTenant, deleteTenant, leases = [], invoices = [], spaces = [], settings, addInvoice,
    members = [], addMember, updateMember, deleteMember, addLease, updateLease } = useOutletContext()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [search, setSearch] = useState('')

  const activeLeases = (tid) => leases.filter((l) => l.tenantId === tid && l.status === 'active')
  const spaceName = (id) => spaces.find((s) => s.id === id)?.unitNumber

  const filtered = tenants.filter((t) =>
    [t.businessName, t.contactName, t.email, t.industry].join(' ').toLowerCase().includes(search.toLowerCase())
  )

  function openAdd() { setEditId(null); setForm({ ...EMPTY_FORM, startDate: today() }); setShowForm(true) }
  function openEdit(t) { setEditId(t.id); setForm({ ...EMPTY_FORM, ...t }); setShowForm(true) }
  function handleSubmit() {
    if (editId) updateTenant(editId, form); else addTenant(form)
    setShowForm(false)
    if (selectedTenant && editId) setSelectedTenant(tenants.find((t) => t.id === editId) ?? { ...selectedTenant, ...form })
  }
  function handleDelete(id) {
    if (window.confirm('Delete this company? Any associated contracts will remain.')) deleteTenant(id)
  }

  if (selectedTenant) {
    return (
      <>
        <TenantProfile
          tenant={selectedTenant}
          leases={leases} invoices={invoices} spaces={spaces} settings={settings}
          members={members} addMember={addMember} updateMember={updateMember} deleteMember={deleteMember}
          addLease={addLease} updateLease={updateLease} updateTenant={updateTenant}
          onBack={() => setSelectedTenant(null)}
          onEdit={() => openEdit(selectedTenant)}
          onSelectContract={(lease) => navigate('/leases', { state: { openLeaseId: lease.id } })}
          onAddInvoice={(data) => addInvoice({ ...data, tenantId: selectedTenant.id })}
        />
        <CompanyModal open={showForm} editId={editId} form={form} setForm={setForm} onClose={() => setShowForm(false)} onSubmit={handleSubmit} />
      </>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <div className="flex items-center gap-2">
          <BulkPortalInviteButton tenants={tenants} />
          <button onClick={openAdd} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800">
            <Plus size={15} /> Add Company
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-5">{tenants.length} companies</p>

      <input type="text" placeholder="Search companies…" value={search} onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black mb-5" />

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Location', 'Email', 'Status', 'Start Date', 'Active Memberships', 'Members', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No companies found.</td></tr>
            )}
            {filtered.map((t) => {
              const al = activeLeases(t.id)
              return (
                <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedTenant(t)}>
                  <td className="px-4 py-3 font-medium text-blue-700 hover:underline">{t.businessName}</td>
                  <td className="px-4 py-3 text-gray-500">Hexa Space</td>
                  <td className="px-4 py-3 text-gray-600">{t.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[t.status] || 'bg-green-100 text-green-800'}`}>{t.status || 'Active'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.startDate ? format(parseISO(t.startDate), 'dd/MM/yyyy') : (t.createdAt ? format(parseISO(t.createdAt), 'dd/MM/yyyy') : '—')}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {al.length === 0 ? <span className="text-gray-300">—</span> : al.map((l) => (
                      <div key={l.id}>{spaceName(l.spaceId) || 'Membership'}{l.monthlyRent != null ? ` · A$${Number(l.monthlyRent).toLocaleString('en-AU')}` : ''}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.contactName || t.email ? 1 : 0}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <CompanyModal open={showForm} editId={editId} form={form} setForm={setForm} onClose={() => setShowForm(false)} onSubmit={handleSubmit} />
    </div>
  )
}

// ── Add/Edit Company modal — General / Address / Billing tabs (OfficeRND-style) ──
const TABS = ['General', 'Address', 'Billing']
const inputCls = 'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black'

function Field({ label, children, required }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  )
}

function CompanyModal({ open, editId, form, setForm, onClose, onSubmit }) {
  const [tab, setTab] = useState('General')
  if (!open) return null
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{editId ? 'Edit Company' : 'Add Company'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="flex gap-5 px-6 pt-3 border-b border-gray-200">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`pb-2 text-sm border-b-2 -mb-px ${tab === t ? 'border-black text-black font-medium' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>{t}</button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {tab === 'General' && (
            <>
              <Field label="Name" required><input required value={form.businessName} onChange={up('businessName')} placeholder="Company Name" className={inputCls} /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={up('email')} placeholder="Contact Email" className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Contact Name"><input value={form.contactName} onChange={up('contactName')} className={inputCls} /></Field>
                <Field label="Phone"><input value={form.phone} onChange={up('phone')} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="URL"><input value={form.url} onChange={up('url')} placeholder="URL" className={inputCls} /></Field>
                <Field label="Start Date" required><input type="date" value={form.startDate} onChange={up('startDate')} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Status"><select value={form.status} onChange={up('status')} className={inputCls}><option>Active</option><option>Lead</option><option>Drop In</option><option>Former</option></select></Field>
                <Field label="Industry"><input value={form.industry} onChange={up('industry')} className={inputCls} /></Field>
              </div>
              <Field label="Description / More Info"><textarea rows={2} value={form.moreInfo} onChange={up('moreInfo')} className={inputCls} /></Field>
            </>
          )}
          {tab === 'Address' && (
            <>
              <Field label="Address"><textarea rows={2} value={form.address} onChange={up('address')} placeholder="Address" className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City"><input value={form.city} onChange={up('city')} className={inputCls} /></Field>
                <Field label="State"><input value={form.state} onChange={up('state')} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Zip"><input value={form.zip} onChange={up('zip')} className={inputCls} /></Field>
                <Field label="Country"><input value={form.country} onChange={up('country')} className={inputCls} /></Field>
              </div>
            </>
          )}
          {tab === 'Billing' && (
            <>
              <Field label="Business Name"><input value={form.billBusinessName} onChange={up('billBusinessName')} placeholder="Registered name" className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ABN"><input value={form.abn} onChange={up('abn')} placeholder="Registration Number" className={inputCls} /></Field>
                <Field label="Currency"><select value={form.currency} onChange={up('currency')} className={inputCls}><option>AUD</option><option>USD</option><option>NZD</option></select></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tax Rate"><select value={form.taxRate} onChange={up('taxRate')} className={inputCls}><option>GST 10%</option><option>Not Selected</option><option>GST Free</option></select></Field>
                <Field label="Payment Method"><input value={form.paymentMethod} onChange={up('paymentMethod')} placeholder="e.g. Direct Debit" className={inputCls} /></Field>
              </div>
              <Field label="Billing Period Start Date"><select value={form.billingPeriodStart} onChange={up('billingPeriodStart')} className={inputCls}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={String(d)}>{d}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="PO Number (Memberships)"><input value={form.poMembership} onChange={up('poMembership')} className={inputCls} /></Field>
                <Field label="PO Number (One-Off Fees)"><input value={form.poOneOff} onChange={up('poOneOff')} className={inputCls} /></Field>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">Close</button>
          <button type="button" onClick={() => { if (!form.businessName) { setTab('General'); return } onSubmit() }} className="px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800">{editId ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

function BulkPortalInviteButton({ tenants }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  async function run() {
    const withEmail = tenants.filter((t) => t.email)
    if (!withEmail.length) return alert('No companies have email addresses.')
    if (!window.confirm(`Check all ${withEmail.length} companies and invite any not yet on the portal?`)) return
    setRunning(true); setResult(null)
    const statuses = await Promise.all(withEmail.map(async (t) => {
      try { const res = await fetch(`/api/portal/status?email=${encodeURIComponent(t.email)}`); const data = await res.json(); return { tenant: t, status: data.status } }
      catch { return { tenant: t, status: 'error' } }
    }))
    const toInvite = statuses.filter((s) => s.status === 'not_invited')
    const invited = [], failed = []
    for (const { tenant } of toInvite) {
      try { const res = await fetch('/api/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: tenant.email }) }); if (res.ok) invited.push(tenant.businessName); else failed.push(tenant.businessName) }
      catch { failed.push(tenant.businessName) }
    }
    setResult({ invited, failed, alreadyActive: statuses.filter((s) => s.status === 'active').length, alreadyInvited: statuses.filter((s) => s.status === 'invited').length })
    setRunning(false)
  }

  return (
    <>
      <button onClick={run} disabled={running} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
        {running ? 'Checking…' : '✉ Bulk Portal Invite'}
      </button>
      {result && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 mb-4">Bulk Portal Invite — Done</h3>
            <div className="space-y-3 text-sm">
              {result.invited.length > 0 ? (
                <div><div className="font-medium text-green-700 mb-1">✓ {result.invited.length} invite(s) sent</div>{result.invited.map((n) => <div key={n} className="text-gray-600 pl-3">{n}</div>)}</div>
              ) : result.failed.length === 0 && <p className="text-gray-500">No new companies to invite.</p>}
              {result.alreadyActive > 0 && <div className="text-gray-400">— {result.alreadyActive} already active</div>}
              {result.alreadyInvited > 0 && <div className="text-gray-400">— {result.alreadyInvited} already invited</div>}
              {result.failed.length > 0 && <div><div className="font-medium text-red-600 mb-1">✗ {result.failed.length} failed</div>{result.failed.map((n) => <div key={n} className="text-red-500 pl-3">{n}</div>)}</div>}
            </div>
            <button onClick={() => setResult(null)} className="mt-5 w-full bg-black text-white text-sm font-semibold py-2 rounded hover:bg-gray-800">Done</button>
          </div>
        </div>
      )}
    </>
  )
}
