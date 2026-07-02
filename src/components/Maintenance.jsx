import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus, X, Pencil, Trash2, CheckCircle2, Clock, AlertCircle, Circle } from 'lucide-react'

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES   = ['open', 'in-progress', 'resolved']

const PRIORITY_STYLE = {
  low:    { cls: 'bg-gray-100 text-gray-600',   label: 'Low' },
  medium: { cls: 'bg-blue-100 text-blue-700',   label: 'Medium' },
  high:   { cls: 'bg-orange-100 text-orange-700', label: 'High' },
  urgent: { cls: 'bg-red-100 text-red-700 font-bold', label: 'Urgent' },
}

const STATUS_STYLE = {
  open:        { cls: 'bg-red-50 text-red-700 border border-red-200',    icon: Circle,        label: 'Open' },
  'in-progress': { cls: 'bg-blue-50 text-blue-700 border border-blue-200', icon: Clock,         label: 'In Progress' },
  resolved:    { cls: 'bg-green-50 text-green-700 border border-green-200', icon: CheckCircle2, label: 'Resolved' },
}

const EMPTY = {
  spaceId: '', title: '', description: '', priority: 'medium',
  status: 'open', reportedDate: new Date().toISOString().split('T')[0],
  resolvedDate: '', assignee: '', notes: '',
}

export default function Maintenance() {
  const { maintenance, addMaintenanceIssue, updateMaintenanceIssue, deleteMaintenanceIssue, spaces } = useOutletContext()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = (maintenance ?? [])
    .filter((m) => filterStatus === 'all' || m.status === filterStatus)
    .filter((m) => filterPriority === 'all' || m.priority === filterPriority)
    .filter((m) => {
      if (!search) return true
      const q = search.toLowerCase()
      const space = spaces.find((s) => s.id === m.spaceId)
      return m.title?.toLowerCase().includes(q) || space?.unitNumber?.toLowerCase().includes(q) || m.assignee?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 }
      if (a.status === 'resolved' && b.status !== 'resolved') return 1
      if (b.status === 'resolved' && a.status !== 'resolved') return -1
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    })

  const counts = {
    open: (maintenance ?? []).filter((m) => m.status === 'open').length,
    'in-progress': (maintenance ?? []).filter((m) => m.status === 'in-progress').length,
    resolved: (maintenance ?? []).filter((m) => m.status === 'resolved').length,
  }

  function openAdd() { setEditId(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(issue) {
    setEditId(issue.id)
    setForm({ spaceId: issue.spaceId ?? '', title: issue.title ?? '', description: issue.description ?? '',
      priority: issue.priority ?? 'medium', status: issue.status ?? 'open',
      reportedDate: issue.reportedDate ?? '', resolvedDate: issue.resolvedDate ?? '',
      assignee: issue.assignee ?? '', notes: issue.notes ?? '' })
    setShowForm(true)
  }

  function handleSave(e) {
    e.preventDefault()
    if (editId) {
      updateMaintenanceIssue(editId, form)
    } else {
      addMaintenanceIssue(form)
    }
    setShowForm(false)
  }

  function handleDelete(id) {
    if (window.confirm('Delete this issue?')) deleteMaintenanceIssue(id)
  }

  function cycleStatus(issue) {
    const next = { open: 'in-progress', 'in-progress': 'resolved', resolved: 'open' }
    const updates = { status: next[issue.status] ?? 'open' }
    if (updates.status === 'resolved') updates.resolvedDate = new Date().toISOString().split('T')[0]
    updateMaintenanceIssue(issue.id, updates)
  }

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.open} open · {counts['in-progress']} in progress · {counts.resolved} resolved
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> Log Issue
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {['all', 'open', 'in-progress', 'resolved'].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors capitalize ${filterStatus === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'all' ? 'All' : s.replace('-', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {['all', ...PRIORITIES].map((p) => (
            <button key={p} onClick={() => setFilterPriority(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors capitalize ${filterPriority === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {p === 'all' ? 'All Priority' : p}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issues…"
          className="border border-input rounded px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 w-48" />
      </div>

      {/* Issue list */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-sm p-10 text-center text-muted-foreground text-sm">
          No issues found. <button onClick={openAdd} className="text-blue-600 hover:underline ml-1">Log one</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => {
            const space = spaces.find((s) => s.id === issue.spaceId)
            const pMeta = PRIORITY_STYLE[issue.priority] ?? PRIORITY_STYLE.medium
            const sMeta = STATUS_STYLE[issue.status] ?? STATUS_STYLE.open
            const SIcon = sMeta.icon
            return (
              <div key={issue.id} className="bg-card border border-border rounded-xl shadow-sm p-4 flex items-start gap-4 hover:shadow-sm transition-shadow">
                <button onClick={() => cycleStatus(issue)} title="Click to advance status"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground">
                  <SIcon size={18} className={issue.status === 'resolved' ? 'text-green-500' : issue.status === 'in-progress' ? 'text-blue-500' : 'text-red-400'} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${issue.status === 'resolved' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {issue.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {space && <span className="text-xs text-muted-foreground font-medium">{space.unitNumber}</span>}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${pMeta.cls}`}>{pMeta.label}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${sMeta.cls}`}>{sMeta.label}</span>
                        {issue.assignee && <span className="text-xs text-muted-foreground">→ {issue.assignee}</span>}
                      </div>
                      {issue.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{issue.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(issue)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(issue.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>Reported {issue.reportedDate ? format(parseISO(issue.reportedDate), 'dd/MM/yyyy') : '—'}</span>
                    {issue.resolvedDate && <span>· Resolved {format(parseISO(issue.resolvedDate), 'dd/MM/yyyy')}</span>}
                    {issue.notes && <span>· {issue.notes}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">{editId ? 'Edit Issue' : 'Log Maintenance Issue'}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Roller door motor fault" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Space / Unit</label>
                  <select value={form.spaceId} onChange={(e) => setForm({ ...form, spaceId: e.target.value })} className={input}>
                    <option value="">— Select space —</option>
                    {spaces.map((s) => <option key={s.id} value={s.id}>{s.unitNumber} {s.type ? `(${s.type})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={input}>
                    {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{PRIORITY_STYLE[p].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s]?.label ?? s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Assignee</label>
                  <input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    placeholder="Who is handling this?" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Date Reported</label>
                  <input type="date" value={form.reportedDate} onChange={(e) => setForm({ ...form, reportedDate: e.target.value })} className={input} />
                </div>
                {form.status === 'resolved' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Date Resolved</label>
                    <input type="date" value={form.resolvedDate} onChange={(e) => setForm({ ...form, resolvedDate: e.target.value })} className={input} />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                  <textarea value={form.description} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe the issue in detail…" className={`${input} resize-none`} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Any additional notes" className={input} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">
                  {editId ? 'Save Changes' : 'Log Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
