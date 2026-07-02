import { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { parseISO, differenceInCalendarDays } from 'date-fns'
import { Plus, X, Pencil, Trash2, UserPlus, Mail, Phone, CheckCircle2 } from 'lucide-react'

const SOURCES = ['website', 'walk-in', 'referral', 'phone', 'email', 'other']

const TONE = {
  gray:   'border-t-gray-400',
  blue:   'border-t-blue-500',
  orange: 'border-t-orange-500',
  green:  'border-t-green-500',
  red:    'border-t-red-500',
}

// The workspace offerings a lead can enquire about (from the website), used to
// populate the filter dropdown even before leads of that type exist.
const INTEREST_TYPES = [
  'Virtual Office', 'Flexible Desk', 'Dedicated Desk', 'Private Office',
  'Enterprise Suites', 'Meeting Rooms', 'The Function Space',
  'Media Studios', 'The Podcast Studio', 'Membership', 'Private tour',
]

// What a lead is enquiring about — the structured type from the website
// (enquiryType/interest), or "Private tour" for tour bookings.
function interestOf(lead) {
  return lead.enquiryType || lead.interest || (lead.source === 'book-tour' ? 'Private tour' : '')
}

const EMPTY = {
  name: '', businessName: '', email: '', phone: '',
  spaceId: '', source: 'website', stageId: '', value: '', notes: '',
}

export default function LeadsBoard({ store }) {
  const {
    leads = [], pipelineStages = [], spaces = [], tenants = [],
    addLead, updateLead, deleteLead, moveLeadToStage, convertLeadToTenant,
  } = store

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [activeId, setActiveId] = useState(null)
  const [interest, setInterest] = useState('all')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const stages = [...pipelineStages].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  // Enquiry-type filter — canonical offerings plus any extra types seen on leads.
  const interestOptions = [...new Set([...INTEREST_TYPES, ...leads.map(interestOf).filter(Boolean)])]
  const visibleLeads = interest === 'all' ? leads : leads.filter((l) => interestOf(l) === interest)

  function openAdd() {
    setEditId(null)
    setForm({ ...EMPTY, stageId: stages[0]?.id ?? '' })
    setShowForm(true)
  }

  function openEdit(lead) {
    setEditId(lead.id)
    setForm({
      name: lead.name ?? '', businessName: lead.businessName ?? '', email: lead.email ?? '',
      phone: lead.phone ?? '', spaceId: lead.spaceId ?? '', source: lead.source ?? 'website',
      stageId: lead.stageId ?? stages[0]?.id ?? '', value: lead.value ?? '', notes: lead.notes ?? '',
    })
    setShowForm(true)
  }

  function handleSave(e) {
    e.preventDefault()
    const payload = { ...form, value: form.value === '' ? 0 : Number(form.value) }
    if (editId) updateLead(editId, payload)
    else addLead(payload)
    setShowForm(false)
  }

  function handleDelete(id) {
    if (window.confirm('Delete this lead?')) deleteLead(id)
  }

  function handleConvert(lead) {
    const space = spaces.find((s) => s.id === lead.spaceId)
    if (!window.confirm(`Convert "${lead.businessName || lead.name}" into a tenant?${space ? `\n\nThey can then be leased ${space.unitNumber}.` : ''}`)) return
    convertLeadToTenant(lead.id)
  }

  function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const lead = leads.find((l) => l.id === active.id)
    if (lead && lead.stageId !== over.id) moveLeadToStage(lead.id, over.id)
  }

  // Space options: vacant spaces + the lead's current space (so editing still resolves it)
  const vacantSpaces = spaces.filter((s) => s.status === 'vacant')
  const spaceOptions = (() => {
    const ids = new Set(vacantSpaces.map((s) => s.id))
    const extra = form.spaceId && !ids.has(form.spaceId) ? spaces.filter((s) => s.id === form.spaceId) : []
    return [...vacantSpaces, ...extra]
  })()

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null
  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Enquiring about</label>
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">All enquiry types</option>
            {interestOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> Add Lead
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageLeads = visibleLeads.filter((l) => l.stageId === stage.id)
            return (
              <Column key={stage.id} stage={stage} count={stageLeads.length}>
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id} lead={lead} spaces={spaces} tenants={tenants}
                    onEdit={() => openEdit(lead)} onDelete={() => handleDelete(lead.id)}
                    onConvert={() => handleConvert(lead)}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">Drop leads here</p>
                )}
              </Column>
            )
          })}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} spaces={spaces} tenants={tenants} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Add / edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-semibold text-foreground">{editId ? 'Edit Lead' : 'Add Lead'}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Contact name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Priya Nair" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Business name</label>
                  <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                    placeholder="e.g. Nair Imports" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Space of interest</label>
                  <select value={form.spaceId} onChange={(e) => setForm({ ...form, spaceId: e.target.value })} className={input}>
                    <option value="">— Select vacant unit —</option>
                    {spaceOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.unitNumber} — {s.address ?? s.type} (${s.monthlyRate?.toLocaleString('en-AU')}/mo)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Est. value ($/mo)</label>
                  <input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="e.g. 4708" className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={`${input} capitalize`}>
                    {SOURCES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
                  <select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })} className={input}>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                  <textarea value={form.notes} rows={3} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Context, requirements, next steps…" className={`${input} resize-none`} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
                <button type="submit"
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">
                  {editId ? 'Save Changes' : 'Add Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Column({ stage, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div className="w-72 shrink-0">
      <div className={`bg-muted/50 rounded-md border-t-2 ${TONE[stage.tone] ?? 'border-t-gray-400'} border border-border`}>
        <div className="px-3 py-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{stage.name}</span>
          <span className="text-xs font-medium text-muted-foreground bg-card border border-border rounded-full px-2 py-0.5">{count}</span>
        </div>
        <div ref={setNodeRef} className={`px-2 pb-2 space-y-2 min-h-[120px] transition-colors ${isOver ? 'bg-muted' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

function LeadCard({ lead, spaces, tenants, onEdit, onDelete, onConvert, dragging }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, disabled: dragging })
  const space = spaces.find((s) => s.id === lead.spaceId)
  const about = interestOf(lead)
  const converted = lead.tenantId && tenants.some((t) => t.id === lead.tenantId)
  const days = lead.stageEnteredAt ? differenceInCalendarDays(new Date(), parseISO(lead.stageEnteredAt)) : null

  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging && !dragging ? 0.4 : 1 }
  const stop = (e) => e.stopPropagation()

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`bg-card border border-border rounded-md p-3 shadow-sm cursor-grab active:cursor-grabbing ${dragging ? 'shadow-lg rotate-1' : 'hover:shadow'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{lead.businessName || lead.name}</p>
          {lead.businessName && <p className="text-xs text-muted-foreground truncate">{lead.name}</p>}
        </div>
        {!dragging && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onPointerDown={stop} onClick={onEdit} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={12} /></button>
            <button onPointerDown={stop} onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={12} /></button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {about && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">{about}</span>}
        {space && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{space.unitNumber}</span>}
        {lead.value > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700">${Number(lead.value).toLocaleString('en-AU')}/mo</span>}
        {lead.source && <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground capitalize border border-border">{lead.source}</span>}
      </div>

      {(lead.email || lead.phone) && (
        <div className="flex flex-col gap-0.5 mt-2 text-xs text-muted-foreground">
          {lead.email && <span className="flex items-center gap-1 truncate"><Mail size={11} /> {lead.email}</span>}
          {lead.phone && <span className="flex items-center gap-1"><Phone size={11} /> {lead.phone}</span>}
        </div>
      )}

      {!dragging && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">{days != null ? `${days}d in stage` : ''}</span>
          {converted ? (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} /> Tenant</span>
          ) : (
            <button onPointerDown={stop} onClick={onConvert}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium">
              <UserPlus size={12} /> Convert
            </button>
          )}
        </div>
      )}
    </div>
  )
}
