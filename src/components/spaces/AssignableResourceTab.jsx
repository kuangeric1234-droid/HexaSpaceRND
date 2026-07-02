import { useState } from 'react'
import { Plus, Pencil, Trash2, UserPlus, UserMinus } from 'lucide-react'
import {
  FLOORS, floorLabel, StatusPill, money, Field, Modal, ic,
  memberOptions, assignmentFor, nextUnitNumber,
} from './shared.jsx'

// Generic manager for assignable, auto-numbered resources:
// Media Studios, Podcast Room, Parking Slots, Dedicated Desks, Virtual Offices.
// Behaviour is driven by `config` passed from the Spaces shell.
export default function AssignableResourceTab({ ctx, config }) {
  const {
    type, noun, prefix, start = 1,
    rateLabel = 'Monthly Rate', ratePer = '/mo',
    note, autoAssignOnAdd = false,
  } = config
  const { spaces, members, tenants, addSpace, updateSpace, deleteSpace } = ctx

  const [editId, setEditId] = useState(undefined) // undefined=closed, null=new
  const [form, setForm] = useState({})
  const [assignFor, setAssignFor] = useState(null)
  const [assignMember, setAssignMember] = useState('')

  const items = spaces.filter((s) => s.type === type)
  const assigned = items.filter((s) => s.assignedMemberId).length
  const memberOpts = memberOptions(members, tenants)

  function blank() {
    const { unitNumber } = nextUnitNumber(spaces, type, prefix, start)
    return { unitNumber, floor: 'l4', size: '', rate: '', attributes: '' }
  }
  function openNew() {
    if (autoAssignOnAdd) {
      // Virtual-office style: instantly create the next number, then offer to assign.
      const created = create({ ...blank() })
      setAssignFor(created); setAssignMember('')
      return
    }
    setEditId(null); setForm(blank())
  }
  function openEdit(s) {
    setEditId(s.id)
    setForm({ unitNumber: s.unitNumber ?? '', floor: s.floor ?? 'l4', size: s.size ?? '', rate: s.rate ?? s.monthlyRate ?? '', attributes: s.attributes ?? '' })
  }

  function create(f) {
    const data = {
      type, unitNumber: f.unitNumber, floor: f.floor, size: f.size || undefined,
      monthlyRate: f.rate !== '' ? Number(f.rate) : 0, rate: f.rate !== '' ? Number(f.rate) : 0,
      attributes: f.attributes || undefined, status: 'vacant',
      location: 'whitehorse', address: '830 Whitehorse Rd, Box Hill',
    }
    return addSpace(data)
  }
  function save() {
    if (!form.unitNumber) return
    const data = {
      unitNumber: form.unitNumber, floor: form.floor, size: form.size || undefined,
      monthlyRate: form.rate !== '' ? Number(form.rate) : 0, rate: form.rate !== '' ? Number(form.rate) : 0,
      attributes: form.attributes || undefined,
    }
    if (editId) updateSpace(editId, data)
    else create(form)
    setEditId(undefined)
  }

  function doAssign() {
    const m = members.find((x) => x.id === assignMember)
    updateSpace(assignFor.id, {
      assignedMemberId: assignMember || undefined,
      assignedCompanyId: m?.companyId || undefined,
      status: assignMember ? 'occupied' : 'vacant',
    })
    setAssignFor(null)
  }
  function unassign(s) {
    updateSpace(s.id, { assignedMemberId: undefined, assignedCompanyId: undefined, status: 'vacant' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-muted-foreground">
          {items.length} {noun.toLowerCase()}{items.length === 1 ? '' : 's'} · {assigned} assigned · {items.length - assigned} available
        </p>
        <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> Add {noun}
        </button>
      </div>
      {note && <p className="text-xs text-muted-foreground mb-4">{note}</p>}
      {!note && <div className="mb-4" />}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {[noun, 'Floor', rateLabel && rateLabel, 'Assigned to', 'Status', ''].filter((h) => h !== '' && h != null).map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">No {noun.toLowerCase()}s yet.</td></tr>
            )}
            {items.map((s) => {
              const a = assignmentFor(s, members, tenants)
              return (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.unitNumber}</div>
                    {s.size && <div className="text-xs text-muted-foreground">{s.size}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{floorLabel(s.floor)}</td>
                  {rateLabel && (
                    <td className="px-4 py-3 font-medium text-foreground">
                      {(s.rate ?? s.monthlyRate) ? `${money(s.rate ?? s.monthlyRate)}${ratePer}` : 'Free'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {a ? (
                      <div>
                        <div className="text-foreground">{a.name}</div>
                        {a.company && <div className="text-xs text-muted-foreground">{a.company}</div>}
                      </div>
                    ) : <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {s.assignedMemberId ? (
                        <button onClick={() => unassign(s)} title="Unassign" className="flex items-center gap-1 text-xs text-foreground border border-input px-2.5 py-1.5 rounded-md hover:bg-muted/50">
                          <UserMinus size={12} /> Unassign
                        </button>
                      ) : (
                        <button onClick={() => { setAssignFor(s); setAssignMember('') }} className="flex items-center gap-1 text-xs text-primary-foreground bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-md font-medium">
                          <UserPlus size={12} /> Assign
                        </button>
                      )}
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm(`Delete this ${noun.toLowerCase()}?`)) deleteSpace(s.id) }} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editId !== undefined && (
        <Modal title={editId ? `Edit ${noun}` : `Add ${noun}`} onClose={() => setEditId(undefined)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name *"><input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} className={ic} /></Field>
              <Field label="Floor">
                <select value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className={ic}>
                  {FLOORS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Size / detail"><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="optional" className={ic} /></Field>
              {rateLabel && <Field label={`${rateLabel} (AUD)`}><input type="number" min="0" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className={ic} /></Field>}
            </div>
            <Field label="Notes"><textarea rows={2} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} className={`${ic} resize-none`} /></Field>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setEditId(undefined)} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
              <button onClick={save} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">{editId ? 'Save' : `Add ${noun}`}</button>
            </div>
          </div>
        </Modal>
      )}

      {assignFor && (
        <Modal title={`Assign — ${assignFor.unitNumber}`} onClose={() => setAssignFor(null)}>
          <div className="space-y-4">
            <Field label="Member">
              <select value={assignMember} onChange={(e) => setAssignMember(e.target.value)} className={ic}>
                <option value="">Unassigned</option>
                {memberOpts.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <p className="text-xs text-muted-foreground">Assigning sets this {noun.toLowerCase()} to occupied and records which member it belongs to.</p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setAssignFor(null)} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
              <button onClick={doAssign} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
