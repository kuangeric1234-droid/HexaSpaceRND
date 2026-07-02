import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, X, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const TYPES = ['Booking Fee', 'Fob Key Order', 'PaperCut', 'One-Off']
const STATUSES = ['Not Paid', 'Paid', 'Waived', 'Invoiced', 'Awaiting Approval']
const TABS = ['All', 'Not Paid', 'Waived', 'Invoiced', 'Awaiting Approval']

const TYPE_STYLE = {
  'Booking Fee': 'bg-amber-100 text-amber-800',
  'Fob Key Order': 'bg-blue-100 text-blue-800',
  'PaperCut': 'bg-gray-200 text-gray-700',
  'One-Off': 'bg-gray-100 text-gray-600',
}
const STATUS_STYLE = {
  'Not Paid': 'bg-red-100 text-red-700',
  'Paid': 'bg-green-100 text-green-800',
  'Waived': 'bg-gray-100 text-gray-500',
  'Invoiced': 'bg-blue-100 text-blue-800',
  'Awaiting Approval': 'bg-amber-100 text-amber-800',
}
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { name: '', type: 'One-Off', memberId: '', companyId: '', date: today(), price: '', status: 'Not Paid', notes: '' }

export default function Fees() {
  const { fees = [], members = [], tenants = [], addFee, updateFee, deleteFee } = useOutletContext()
  const [tab, setTab] = useState('All')
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)

  const memberName = (id) => members.find((m) => m.id === id)?.name
  const companyName = (id) => tenants.find((t) => t.id === id)?.businessName
  const memberLabel = (f) => {
    const m = memberName(f.memberId)
    const c = companyName(f.companyId)
    return m && c ? `${m} at ${c}` : m || c || '—'
  }

  const filtered = fees.filter((f) => {
    if (tab !== 'All' && f.status !== tab) return false
    if (companyFilter && f.companyId !== companyFilter) return false
    return [f.name, memberLabel(f)].join(' ').toLowerCase().includes(search.toLowerCase())
  })

  const total = filtered.reduce((s, f) => s + (Number(f.price) || 0), 0)

  function openAdd() { setEditId(null); setForm({ ...EMPTY, date: today() }); setShowForm(true) }
  function openEdit(f) { setEditId(f.id); setForm({ ...EMPTY, ...f, price: String(f.price ?? '') }); setShowForm(true) }
  function submit() {
    if (!form.name) return
    const member = members.find((m) => m.id === form.memberId)
    const data = { ...form, price: Number(form.price) || 0, companyId: member?.companyId || form.companyId }
    if (editId) updateFee(editId, data); else addFee(data)
    setShowForm(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold text-foreground">Fees</h1>
        <div className="flex items-center gap-2">
          <button disabled className="px-3 py-2 text-sm border border-border rounded-md text-muted-foreground cursor-not-allowed">Export</button>
          <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"><Plus size={15} /> Add Fee</button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Booking fees, Fob key order fees, and PaperCut print fees charged to members.</p>

      {/* Tabs */}
      <div className="flex gap-5 border-b border-border mb-4 text-sm">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`pb-2 border-b-2 -mb-px ${tab === t ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search fees…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] max-w-sm border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-card">
          <option value="">All companies</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.businessName}</option>)}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">Total: <strong className="text-foreground">A${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</strong> · {filtered.length} fees</span>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Name', 'Member', 'Date', 'Price', ''].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No fees{tab !== 'All' ? ` (${tab})` : ''}. Click <strong>Add Fee</strong> to record one.</td></tr>
            )}
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{f.name}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_STYLE[f.type] || 'bg-gray-100 text-gray-600'}`}>{f.type}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{memberLabel(f)}</td>
                <td className="px-4 py-3">
                  <div className="text-foreground">{f.date ? format(parseISO(f.date), 'd MMM yyyy') : '—'}</div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[f.status] || 'bg-gray-100 text-gray-600'}`}>{f.status}</span>
                </td>
                <td className="px-4 py-3 font-medium text-foreground">A${(Number(f.price) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(f)} className="text-xs text-blue-600 hover:underline mr-3">Edit</button>
                  <button onClick={() => { if (confirm('Delete this fee?')) deleteFee(f.id) }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 inline-flex align-middle"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <FeeModal editId={editId} form={form} setForm={setForm} members={members} tenants={tenants} onClose={() => setShowForm(false)} onSubmit={submit} />}
    </div>
  )
}

const ic = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
function L({ label, children }) { return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>{children}</label> }

function FeeModal({ editId, form, setForm, members, tenants, onClose, onSubmit }) {
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{editId ? 'Edit Fee' : 'Add Fee'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <L label="Name"><input value={form.name} onChange={up('name')} placeholder="e.g. PaperCut fees, Fob Key Order" className={ic} /></L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Type"><select value={form.type} onChange={up('type')} className={ic}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></L>
            <L label="Price (A$)"><input type="number" step="0.01" value={form.price} onChange={up('price')} className={ic} /></L>
          </div>
          <L label="Member"><select value={form.memberId} onChange={up('memberId')} className={ic}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}{tenants.find((t) => t.id === m.companyId) ? ` — ${tenants.find((t) => t.id === m.companyId).businessName}` : ''}</option>)}</select></L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Date"><input type="date" value={form.date} onChange={up('date')} className={ic} /></L>
            <L label="Status"><select value={form.status} onChange={up('status')} className={ic}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></L>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Close</button>
          <button onClick={() => { if (!form.name) return; onSubmit() }} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">{editId ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}
