import { useState, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { KeyRound, Plus, RefreshCw, X, Search } from 'lucide-react'
import {
  DEVICE_TYPES, LOCATIONS, FOB_STATUS, DEPOSIT_STATUS, depositFor, normalizeSerial, money,
  openAssignment, depositPaid, depositState,
} from '../lib/fobs.js'

const today = () => new Date().toISOString().split('T')[0]
const nowIso = () => new Date().toISOString()
const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

function persist(table, row) {
  return supabase.from(table).upsert({ id: row.id, data: row, updated_at: nowIso() })
}

function Badge({ map, k }) {
  const s = map[k] ?? { label: k, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>
}

export default function Fobs() {
  const store = useOutletContext()
  const { members = [], tenants = [], invoices = [], addInvoice } = store
  const [fobs, setFobs] = useState([])
  const [assignments, setAssignments] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('devices')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // { kind:'issue'|'return'|'lost'|'add', fob?, member? }

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [f, a, r] = await Promise.all([
      supabase.from('fobs').select('data'),
      supabase.from('fob_assignments').select('data'),
      supabase.from('fob_requests').select('data'),
    ])
    setFobs((f.data ?? []).map((x) => x.data).filter(Boolean))
    setAssignments((a.data ?? []).map((x) => x.data).filter(Boolean))
    setRequests((r.data ?? []).map((x) => x.data).filter(Boolean))
    setLoading(false)
  }

  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const companyById = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants])
  const pendingRequests = requests.filter((r) => r.status === 'pending')

  const stats = useMemo(() => ({
    total: fobs.length,
    issued: fobs.filter((f) => f.status === 'assigned').length,
    available: fobs.filter((f) => f.status === 'available').length,
    lost: fobs.filter((f) => f.status === 'lost').length,
    requests: pendingRequests.length,
  }), [fobs, pendingRequests.length])

  const shownFobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fobs
      .filter((f) => {
        if (!q) return true
        const a = openAssignment(f.id, assignments)
        const holder = a ? `${a.memberName ?? ''} ${a.companyName ?? ''}` : ''
        return `${f.serial} ${f.type} ${holder}`.toLowerCase().includes(q)
      })
      .sort((a, b) => String(a.serial).localeCompare(String(b.serial)))
  }, [fobs, assignments, search])

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addDevice({ serial, type, location, notes }) {
    const s = normalizeSerial(serial)
    if (!s) return alert('Serial number is required.')
    if (fobs.some((x) => x.serial === s)) return alert(`Serial ${s} is already in inventory — use Issue to assign it.`)
    if (fobs.some((f) => f.serial === s)) return alert(`A device with serial ${s} already exists.`)
    const fob = { id: rid('fob'), serial: s, type, location, status: 'available', currentMemberId: null, currentCompanyId: null, currentAssignmentId: null, notes: notes || '', createdAt: today() }
    await persist('fobs', fob)
    setFobs((prev) => [fob, ...prev])
    setModal(null)
  }

  async function issueDevice({ fob, memberId, expectedReturnAt, notes }) {
    const member = memberById[memberId]
    if (!member) return alert('Pick a member.')
    const company = companyById[member.companyId]
    const deposit = depositFor(fob.type)
    const assignment = {
      id: rid('fa'), fobId: fob.id, serial: fob.serial, type: fob.type,
      memberId: member.id, memberName: member.name, companyId: member.companyId, companyName: company?.businessName ?? '',
      issuedAt: nowIso(), expectedReturnAt: expectedReturnAt || null, returnedAt: null,
      depositAmount: deposit, depositStatus: 'pending', lost: false, issueNotes: notes || '', createdAt: today(),
    }
    await persist('fob_assignments', assignment)
    setAssignments((prev) => [assignment, ...prev])
    const upFob = { ...fob, status: 'assigned', currentMemberId: member.id, currentCompanyId: member.companyId, currentAssignmentId: assignment.id }
    await persist('fobs', upFob)
    setFobs((prev) => prev.map((f) => (f.id === fob.id ? upFob : f)))
    // Refundable deposit invoice (billed to the member's company, no GST).
    if (member.companyId) addInvoice?.({
      tenantId: member.companyId, source: 'fob', invoiceType: 'fob_deposit', fobAssignmentId: assignment.id,
      status: 'pending', sentStatus: 'not_sent', clientName: company?.businessName ?? '', clientEmail: company?.email ?? '',
      issueDate: today(), dueDate: today(), vatEnabled: false, reference: `${fob.type} deposit — ${fob.serial}`,
      lineItems: [{ id: rid('li'), description: `Refundable ${fob.type} deposit — ${fob.serial}`, revenueAccount: 'Security Deposit', unitPrice: deposit, qty: 1, discountPct: 0, vatExempt: true }],
    })
    // Resolve any matching portal request.
    const req = requests.find((r) => r.status === 'pending' && r.memberId === member.id)
    if (req) await resolveRequest(req, 'issued')
    setModal(null)
  }

  async function returnDevice({ fob, assignment, notes, refund }) {
    const paid = depositPaid(assignment, invoices)
    const upA = { ...assignment, returnedAt: nowIso(), returnNotes: notes || '', depositStatus: refund && paid ? 'refunding' : (paid ? 'waived' : 'pending') }
    await persist('fob_assignments', upA)
    setAssignments((prev) => prev.map((a) => (a.id === assignment.id ? upA : a)))
    const upFob = { ...fob, status: 'available', currentMemberId: null, currentCompanyId: null, currentAssignmentId: null }
    await persist('fobs', upFob)
    setFobs((prev) => prev.map((f) => (f.id === fob.id ? upFob : f)))
    // Refund the deposit as a credit note → Billing "pending refunds" approval queue.
    if (refund && paid && assignment.companyId) addInvoice?.({
      tenantId: assignment.companyId, source: 'fob', invoiceType: 'bond_refund', approvalStatus: 'pending', fobAssignmentId: assignment.id,
      status: 'pending', sentStatus: 'not_sent', clientName: assignment.companyName ?? '',
      issueDate: today(), dueDate: today(), vatEnabled: false, reference: `${fob.type} deposit refund — ${fob.serial}`,
      lineItems: [{ id: rid('li'), description: `${fob.type} deposit refund — ${fob.serial}`, revenueAccount: 'Security Deposit', unitPrice: -Number(assignment.depositAmount || 0), qty: 1, discountPct: 0 }],
    })
    setModal(null)
  }

  async function markLost({ fob, assignment, notes }) {
    const upA = { ...assignment, returnedAt: nowIso(), lost: true, returnNotes: notes || 'Reported lost', depositStatus: 'forfeited' }
    await persist('fob_assignments', upA)
    setAssignments((prev) => prev.map((a) => (a.id === assignment.id ? upA : a)))
    const upFob = { ...fob, status: 'lost', currentMemberId: null, currentCompanyId: null, currentAssignmentId: null }
    await persist('fobs', upFob)
    setFobs((prev) => prev.map((f) => (f.id === fob.id ? upFob : f)))
    setModal(null)
  }

  async function resolveRequest(req, status) {
    const up = { ...req, status, resolvedAt: nowIso() }
    await persist('fob_requests', up)
    setRequests((prev) => prev.map((r) => (r.id === req.id ? up : r)))
  }

  const StatCard = ({ label, value, tone }) => (
    <div className="border border-border rounded-lg bg-card px-4 py-3">
      <div className={`text-2xl font-bold ${tone ?? 'text-foreground'}`}>{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  )

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><KeyRound size={22} /> Fobs & Remotes</h1>
          <p className="text-sm text-muted-foreground mt-1">After-hours access devices — inventory, deposits and returns.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-md" title="Refresh"><RefreshCw size={15} /></button>
          <button onClick={() => setModal({ kind: 'add' })} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"><Plus size={15} /> Add device</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <StatCard label="In circulation" value={stats.issued} tone="text-blue-700" />
        <StatCard label="Available" value={stats.available} tone="text-green-700" />
        <StatCard label="Lost" value={stats.lost} tone="text-red-700" />
        <StatCard label="Total devices" value={stats.total} />
        <StatCard label="Requests" value={stats.requests} tone={stats.requests ? 'text-amber-700' : undefined} />
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {[['devices', 'Devices'], ['requests', `Requests${pendingRequests.length ? ` (${pendingRequests.length})` : ''}`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === 'devices' && (
        <>
          <div className="relative mb-3 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search serial / holder…" className="pl-8 pr-3 py-1.5 border border-border rounded text-sm bg-background w-full focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            {loading ? <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
              : shownFobs.length === 0 ? <div className="p-10 text-center text-muted-foreground text-sm">No devices yet. Add your first fob or remote.</div>
              : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Serial</th>
                      <th className="text-left px-4 py-2.5 font-medium">Type</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium">Holder</th>
                      <th className="text-left px-4 py-2.5 font-medium">Deposit</th>
                      <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFobs.map((f) => {
                      const a = openAssignment(f.id, assignments)
                      return (
                        <tr key={f.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-mono text-foreground">{f.serial}</td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{f.type}</td>
                          <td className="px-4 py-3"><Badge map={FOB_STATUS} k={f.status} /></td>
                          <td className="px-4 py-3 text-foreground">{a ? <>{a.memberName}<span className="text-muted-foreground text-xs block">{a.companyName}</span></> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3">{a ? <Badge map={DEPOSIT_STATUS} k={depositState(a, invoices)} /> : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {f.status === 'available' && <button onClick={() => setModal({ kind: 'issue', fob: f })} className="text-xs bg-primary text-primary-foreground rounded px-2.5 py-1 font-medium hover:bg-primary/90">Issue</button>}
                              {f.status === 'assigned' && a && <>
                                <button onClick={() => setModal({ kind: 'return', fob: f, assignment: a })} className="text-xs border border-input rounded px-2.5 py-1 font-medium hover:bg-muted/50">Return</button>
                                <button onClick={() => setModal({ kind: 'lost', fob: f, assignment: a })} className="text-xs border border-red-200 text-red-600 rounded px-2.5 py-1 font-medium hover:bg-red-50">Lost</button>
                              </>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {tab === 'requests' && (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {pendingRequests.length === 0 ? <div className="p-10 text-center text-muted-foreground text-sm">No open fob requests.</div>
            : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                  <tr><th className="text-left px-4 py-2.5 font-medium">Member</th><th className="text-left px-4 py-2.5 font-medium">Type</th><th className="text-left px-4 py-2.5 font-medium">Note</th><th className="text-right px-4 py-2.5 font-medium">Actions</th></tr>
                </thead>
                <tbody>
                  {pendingRequests.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 text-foreground">{r.memberName}<span className="text-muted-foreground text-xs block">{r.companyName}</span></td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{r.type || 'fob'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.note || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setModal({ kind: 'issue', requestMemberId: r.memberId, requestType: r.type })} className="text-xs bg-primary text-primary-foreground rounded px-2.5 py-1 font-medium hover:bg-primary/90">Issue</button>
                          <button onClick={() => resolveRequest(r, 'declined')} className="text-xs border border-input rounded px-2.5 py-1 font-medium hover:bg-muted/50">Decline</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {modal?.kind === 'add' && <AddModal fobs={fobs} onClose={() => setModal(null)} onSave={addDevice} />}
      {modal?.kind === 'issue' && <IssueModal fobs={fobs} preFob={modal.fob} members={members} tenants={tenants} requestMemberId={modal.requestMemberId} requestType={modal.requestType} onClose={() => setModal(null)} onIssue={issueDevice} />}
      {modal?.kind === 'return' && <ReturnModal ctx={modal} paid={depositPaid(modal.assignment, invoices)} onClose={() => setModal(null)} onReturn={returnDevice} />}
      {modal?.kind === 'lost' && <LostModal ctx={modal} onClose={() => setModal(null)} onLost={markLost} />}
    </div>
  )
}

const field = 'w-full border border-border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring'
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-lg shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function AddModal({ fobs = [], onClose, onSave }) {
  const [f, setF] = useState({ serial: '', type: 'fob', location: 'hexa', notes: '' })
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })
  // Fobs only exist at Hexa; remotes can belong to any location.
  const setType = (e) => {
    const type = e.target.value
    setF({ ...f, type, location: type === 'fob' ? 'hexa' : f.location })
  }
  const locations = f.type === 'fob' ? ['hexa'] : LOCATIONS
  // Serial suggestions: every available (unassigned) device already in
  // inventory, so staff can see what exists while typing. Re-adding an
  // existing serial is blocked outright.
  const existing = fobs.find((x) => x.serial === normalizeSerial(f.serial))
  const availableSerials = fobs.filter((x) => x.status === 'available').map((x) => x.serial)
  return (
    <ModalShell title="Add device" onClose={onClose}>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Serial number</label>
        <input list="available-fob-serials" value={f.serial} onChange={up('serial')} className={`${field} font-mono`} placeholder="e.g. 807APD0A2B" />
        <datalist id="available-fob-serials">
          {availableSerials.map((s) => <option key={s} value={s} />)}
        </datalist>
        {existing && (
          <p className="text-xs text-red-600 mt-1">
            Already in inventory — {existing.type} at {existing.location}, status "{FOB_STATUS[existing.status]?.label ?? existing.status}". Use Issue to assign it.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-muted-foreground mb-1">Type</label><select value={f.type} onChange={setType} className={field}>{DEVICE_TYPES.map((t) => <option key={t} value={t}>{t} — {money(depositFor(t))} deposit</option>)}</select></div>
        <div><label className="block text-xs text-muted-foreground mb-1">Location</label><select value={f.location} onChange={up('location')} className={field}>{locations.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}</select></div>
      </div>
      <div><label className="block text-xs text-muted-foreground mb-1">Notes</label><input value={f.notes} onChange={up('notes')} className={field} /></div>
      <div className="flex justify-end pt-1"><button onClick={() => onSave(f)} disabled={!!existing} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50">Add device</button></div>
    </ModalShell>
  )
}

function IssueModal({ fobs, preFob, members, tenants, requestMemberId, requestType, onClose, onIssue }) {
  const available = fobs.filter((f) => f.status === 'available' && (requestType ? f.type === requestType : true))
  const [fobId, setFobId] = useState(preFob?.id || available[0]?.id || '')
  const [memberId, setMemberId] = useState(requestMemberId || '')
  const [expectedReturnAt, setExpectedReturnAt] = useState('')
  const [notes, setNotes] = useState('')
  const [mq, setMq] = useState('')
  const fob = fobs.find((f) => f.id === fobId) || preFob
  const memberOpts = members
    .filter((m) => { const q = mq.trim().toLowerCase(); if (!q) return true; const c = tenants.find((t) => t.id === m.companyId); return `${m.name} ${m.email ?? ''} ${c?.businessName ?? ''}`.toLowerCase().includes(q) })
    .slice(0, 50)
  return (
    <ModalShell title={`Issue ${fob?.type ?? 'device'}${fob ? ` — ${fob.serial}` : ''}`} onClose={onClose}>
      {!preFob && (
        <div><label className="block text-xs text-muted-foreground mb-1">Device</label>
          <select value={fobId} onChange={(e) => setFobId(e.target.value)} className={`${field} font-mono`}>
            <option value="">Select an available device…</option>
            {available.map((f) => <option key={f.id} value={f.id}>{f.serial} · {f.type}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Member</label>
        <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Search members…" className={`${field} mb-1.5`} />
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={field} size={5}>
          {memberOpts.map((m) => { const c = tenants.find((t) => t.id === m.companyId); return <option key={m.id} value={m.id}>{m.name}{c ? ` — ${c.businessName}` : ''}</option> })}
        </select>
      </div>
      <div><label className="block text-xs text-muted-foreground mb-1">Expected return (optional)</label><input type="date" value={expectedReturnAt} onChange={(e) => setExpectedReturnAt(e.target.value)} className={field} /></div>
      <div><label className="block text-xs text-muted-foreground mb-1">Issue notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></div>
      {fob && <p className="text-xs text-muted-foreground">A refundable <strong>{money(depositFor(fob.type))}</strong> deposit invoice will be raised to the member's company.</p>}
      <div className="flex justify-end pt-1"><button disabled={!fob || !memberId} onClick={() => onIssue({ fob, memberId, expectedReturnAt, notes })} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-40">Issue device</button></div>
    </ModalShell>
  )
}

function ReturnModal({ ctx, paid, onClose, onReturn }) {
  const { fob, assignment } = ctx
  const [notes, setNotes] = useState('')
  const [refund, setRefund] = useState(true)
  return (
    <ModalShell title={`Return ${fob.type} — ${fob.serial}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Returned by <strong className="text-foreground">{assignment.memberName}</strong> ({assignment.companyName}).</p>
      {paid ? (
        <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Refund the {money(assignment.depositAmount)} deposit (raises a credit note for approval)</label>
      ) : <p className="text-xs text-amber-700">No deposit payment recorded for this device — nothing to refund.</p>}
      <div><label className="block text-xs text-muted-foreground mb-1">Return notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></div>
      <div className="flex justify-end pt-1"><button onClick={() => onReturn({ fob, assignment, notes, refund })} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90">Mark returned</button></div>
    </ModalShell>
  )
}

function LostModal({ ctx, onClose, onLost }) {
  const { fob, assignment } = ctx
  const [notes, setNotes] = useState('')
  return (
    <ModalShell title={`Mark lost — ${fob.serial}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Held by <strong className="text-foreground">{assignment.memberName}</strong> ({assignment.companyName}).</p>
      <p className="text-xs text-red-700">The {money(assignment.depositAmount)} deposit is <strong>forfeited</strong> (kept to cover the lost device). Issue a replacement separately — it takes a fresh {money(depositFor(fob.type))} deposit.</p>
      <div><label className="block text-xs text-muted-foreground mb-1">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></div>
      <div className="flex justify-end pt-1"><button onClick={() => onLost({ fob, assignment, notes })} className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700">Mark lost &amp; forfeit deposit</button></div>
    </ModalShell>
  )
}
