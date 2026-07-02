import { useState } from 'react'
import { Plus, X, Copy, Check, Trash2, ChevronDown, ChevronRight, Users, Link2, Percent, DollarSign } from 'lucide-react'

const SITE = 'https://www.hexaspace.com.au'
const APP = 'https://app.hexaspace.com.au'

const EMPTY = { name: '', email: '', phone: '', commissionRate: 5 }
const STAGE_TONE = { new: 'bg-gray-100 text-gray-600', engaged: 'bg-blue-50 text-blue-700', won: 'bg-green-50 text-green-700', lost: 'bg-red-50 text-red-600' }
const COMM_TONE = { pending: 'bg-amber-50 text-amber-700 border-amber-200', approved: 'bg-blue-50 text-blue-700 border-blue-200', paid: 'bg-green-50 text-green-700 border-green-200' }
const money = (n) => `$${Number(n || 0).toLocaleString('en-AU')}`

export default function ReferralsPanel({ store }) {
  const { referrers = [], leads = [], commissions = [], pipelineStages = [], addReferrer, updateReferrer, deleteReferrer, updateCommission } = store
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [openId, setOpenId] = useState(null)
  const [copied, setCopied] = useState('')

  function tenantLink(r) { return `${SITE}/?ref=${r.code}` }
  function sellerLink(r) { return `${SITE}/list-your-property?ref=${r.code}&intent=list` }
  function dashboardLink(r) { return `${APP}/refer/${r.token}` }
  function copy(key, text) { navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500) }) }

  function save(e) {
    e.preventDefault()
    addReferrer({ ...form, commissionRate: Number(form.commissionRate) || 0 })
    setForm(EMPTY); setShowForm(false)
  }

  const leadsFor = (r) => leads.filter((l) => l.referrerId === r.id)
  const commsFor = (r) => commissions.filter((c) => c.referrerId === r.id)
  const stageOf = (id) => pipelineStages.find((s) => s.id === id)

  const pendingTotal = commissions.filter((c) => c.status !== 'paid').reduce((s, c) => s + Number(c.amount || 0), 0)
  const paidTotal = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount || 0), 0)

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-xs text-blue-800 flex gap-2">
        <Link2 size={15} className="shrink-0 mt-0.5" />
        <div>Give each referrer their link. When someone enquires through it, the lead is tagged to them here. Close a referred lead's deal (from the lead panel) to create a commission — the referrer is emailed and you mark it paid below.</div>
      </div>

      {commissions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-card border border-border rounded-xl shadow-sm px-4 py-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign size={12} /> Pending / approved</div>
            <div className="text-xl font-bold text-foreground mt-0.5">{money(pendingTotal)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl shadow-sm px-4 py-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Check size={12} /> Paid out</div>
            <div className="text-xl font-bold text-foreground mt-0.5">{money(paidTotal)}</div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">{referrers.length} referrer{referrers.length === 1 ? '' : 's'}</p>
        <button onClick={() => { setForm(EMPTY); setShowForm(true) }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={15} /> Add referrer
        </button>
      </div>

      {referrers.length === 0 ? (
        <div className="bg-card border border-dashed border-input rounded-xl shadow-sm p-12 text-center">
          <Users size={26} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No referrers yet. Add one to generate their tracked link.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {referrers.map((r) => {
            const open = openId === r.id
            const rl = leadsFor(r)
            const rc = commsFor(r)
            const rcPending = rc.filter((c) => c.status !== 'paid').reduce((s, c) => s + Number(c.amount || 0), 0)
            const won = rl.filter((l) => stageOf(l.stageId)?.category === 'won').length
            return (
              <div key={r.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpenId(open ? null : r.id)} className="text-muted-foreground">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      {r.name}
                      {r.selfEnrolled && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 uppercase tracking-wide">Self-enrolled</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email} {r.code && <span className="ml-1 px-1.5 py-0.5 bg-muted rounded font-mono">{r.code}</span>}</div>
                  </div>
                  <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><Percent size={11} /> {r.commissionRate}%</span>
                  <span className="text-xs text-muted-foreground">{rl.length} lead{rl.length === 1 ? '' : 's'}{won ? ` · ${won} won` : ''}</span>
                  {rcPending > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{money(rcPending)} due</span>}
                  <button onClick={() => { if (window.confirm(`Delete referrer ${r.name}?`)) deleteReferrer(r.id) }}
                    className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                </div>

                {open && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Links */}
                    <div className="space-y-2">
                      <LinkRow label="Refer a tenant / buyer" url={tenantLink(r)} copied={copied === `t${r.id}`} onCopy={() => copy(`t${r.id}`, tenantLink(r))} />
                      <LinkRow label="Refer a seller / landlord" url={sellerLink(r)} copied={copied === `s${r.id}`} onCopy={() => copy(`s${r.id}`, sellerLink(r))} />
                      <LinkRow label="Their private dashboard (send to the referrer)" url={dashboardLink(r)} copied={copied === `d${r.id}`} onCopy={() => copy(`d${r.id}`, dashboardLink(r))} />
                    </div>

                    {/* Their leads */}
                    <div>
                      <div className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Referred leads</div>
                      {rl.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No referred leads yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {rl.map((l) => {
                            const st = stageOf(l.stageId)
                            return (
                              <div key={l.id} className="flex items-center justify-between text-sm border border-border rounded px-3 py-1.5">
                                <span className="text-foreground">{l.name || l.businessName || '—'} {l.referralIntent && <span className="text-xs text-muted-foreground">({l.referralIntent === 'list' ? 'seller' : 'tenant'})</span>}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${STAGE_TONE[st?.category] ?? 'bg-muted text-muted-foreground'}`}>{st?.name ?? '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Commissions */}
                    {rc.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Commissions</div>
                        <div className="space-y-1">
                          {rc.map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded px-3 py-1.5">
                              <span className="text-foreground min-w-0 truncate">{c.leadName || '—'} <span className="text-xs text-muted-foreground">· {money(c.dealValue)} {c.dealType}</span></span>
                              <span className="font-semibold text-foreground shrink-0">{money(c.amount)}</span>
                              <select value={c.status} onChange={(e) => updateCommission(c.id, { status: e.target.value })}
                                className={`text-xs rounded border px-1.5 py-0.5 capitalize shrink-0 ${COMM_TONE[c.status] ?? ''}`}>
                                <option value="pending">pending</option>
                                <option value="approved">approved</option>
                                <option value="paid">paid</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      Commission rate:
                      <input type="number" value={r.commissionRate} onChange={(e) => updateReferrer(r.id, { commissionRate: Number(e.target.value) })}
                        className="w-16 border border-input rounded px-2 py-1" />%
                      <select value={r.status} onChange={(e) => updateReferrer(r.id, { status: e.target.value })} className="border border-input rounded px-2 py-1 capitalize ml-2">
                        <option value="active">active</option><option value="paused">paused</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add referrer modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Add referrer</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={save} className="px-6 py-5 space-y-4">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} /></div>
                <div><label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} /></div>
              </div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">Commission rate (% of deal value)</label>
                <input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} className={input} /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium">Create & get link</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function LinkRow({ label, url, copied, onCopy }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input readOnly value={url} className="flex-1 border border-input rounded px-2 py-1.5 text-xs font-mono text-foreground bg-muted/50" />
        <button onClick={onCopy} className="flex items-center gap-1 text-xs font-medium border border-input text-foreground px-2.5 py-1.5 rounded hover:bg-muted/50">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
    </div>
  )
}
