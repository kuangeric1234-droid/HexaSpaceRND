import { useState } from 'react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import {
  X, Mail, StickyNote, Activity as ActivityIcon, User, Phone, Building2, Tag, DollarSign,
  UserPlus, CheckCircle2, Send, Loader2, ArrowRight, Sparkles, Trash2,
} from 'lucide-react'
import { sendEmail } from '../lib/sendEmail.js'

const TABS = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'activity', label: 'Activity', icon: ActivityIcon },
]

function rel(iso) { try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }) } catch { return '' } }

export default function LeadDetail({ lead, store, onClose }) {
  const { appendLeadActivity, updateLead, convertLeadToTenant, deleteLead, recordDealClose, commissions = [], pipelineStages = [], spaces = [], tenants = [], referrers = [], settings = {} } = store
  const referrer = lead.referrerId ? referrers.find((r) => r.id === lead.referrerId) : null
  const commission = commissions.find((c) => c.leadId === lead.id)
  const [tab, setTab] = useState('overview')

  const space = spaces.find((s) => s.id === lead.spaceId)
  const stage = pipelineStages.find((s) => s.id === lead.stageId)
  const converted = lead.tenantId && tenants.some((t) => t.id === lead.tenantId)
  const dealClosed = lead.dealClosed || !!commission
  const stageName = (id) => pipelineStages.find((s) => s.id === id)?.name ?? 'stage'

  // Close-deal / commission
  const [showClose, setShowClose] = useState(false)
  const [dealType, setDealType] = useState('lease')
  const [dealValue, setDealValue] = useState('')
  const [closing, setClosing] = useState(false)
  const [closeMsg, setCloseMsg] = useState('')

  const previewAmount = referrer ? Math.round((Number(dealValue) || 0) * (Number(referrer.commissionRate) || 0)) / 100 : 0

  async function closeDeal() {
    const val = Number(dealValue)
    if (!val || val <= 0) { setCloseMsg('Enter the deal value.'); return }
    setClosing(true); setCloseMsg('')
    try {
      const res = recordDealClose(lead.id, { dealType, dealValue: val })
      if (res?.referrer?.email && res?.commission) {
        try {
          const html = commissionEmailHtml({ referrer: res.referrer, commission: res.commission, settings })
          await sendEmail({ to: res.referrer.email, subject: `Your Hexa Space referral closed — $${res.commission.amount.toLocaleString('en-AU')} commission`, html, settings, emailType: 'commission' })
          appendLeadActivity(lead.id, { type: 'email', text: `Commission notification emailed to ${res.referrer.name}` })
        } catch { /* email failure must not block the close */ }
      }
      setShowClose(false); setDealValue(''); setTab('activity')
    } catch (e) { setCloseMsg(e.message) } finally { setClosing(false) }
  }

  // Email compose
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  // Notes
  const [note, setNote] = useState('')

  async function send() {
    if (!lead.email) { setMsg('No email address on this lead.'); return }
    if (!subject.trim() || !body.trim()) { setMsg('Add a subject and message.'); return }
    setSending(true); setMsg('')
    try {
      const company = settings?.company?.name ?? 'Hexa Space'
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
        <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
          <div style="background:#000;padding:18px 28px"><span style="color:#fff;font-weight:bold;letter-spacing:2px">${company.toUpperCase()}</span></div>
          <div style="padding:28px;font-size:14px;line-height:1.6;white-space:pre-wrap">${body.replace(/</g, '&lt;')}</div>
        </div></body></html>`
      await sendEmail({ to: lead.email, subject, html, settings, emailType: 'lead' })
      appendLeadActivity(lead.id, { type: 'email', text: `Email sent: ${subject}`, meta: { subject, body } })
      setSubject(''); setBody(''); setMsg('Sent ✓'); setTab('activity')
    } catch (e) { setMsg(e.message) } finally { setSending(false) }
  }

  function addNote() {
    if (!note.trim()) return
    appendLeadActivity(lead.id, { type: 'note', text: note.trim() })
    setNote('')
  }

  // Full timeline (synthesize the capture event from createdAt)
  const timeline = [
    { id: 'created', type: 'created', text: 'Lead captured', createdAt: lead.createdAt ? `${lead.createdAt}T00:00:00.000Z` : new Date().toISOString() },
    ...(lead.activity ?? []),
  ].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const notes = (lead.activity ?? []).filter((a) => a.type === 'note').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const emails = (lead.activity ?? []).filter((a) => a.type === 'email').sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const input = 'w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-muted/50 h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">{lead.name || lead.businessName || 'Lead'}</h2>
              {lead.businessName && lead.name && <p className="text-sm text-muted-foreground">{lead.businessName}</p>}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {stage && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{stage.name}</span>}
                {lead.source && <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground capitalize border border-border">{lead.source}</span>}
                {space && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{space.unitNumber}</span>}
                {lead.createdAt && <span className="text-xs text-muted-foreground">added {lead.createdAt}</span>}
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
          </div>
          {converted ? (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={15} /> Converted to a tenant.
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={() => convertLeadToTenant(lead.id)} className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90">
                <UserPlus size={14} /> Convert to tenant
              </button>
              <button onClick={() => { if (window.confirm('Delete this lead?')) { deleteLead(lead.id); onClose() } }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-600 px-2 py-1.5">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}

          {/* Deal close / commission */}
          {dealClosed ? (
            <div className="mt-2 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm flex items-center gap-2">
              <DollarSign size={15} />
              <span>
                Deal closed{lead.dealValue ? ` — $${Number(lead.dealValue).toLocaleString('en-AU')}` : ''}
                {commission && <> · commission <span className="font-semibold">${Number(commission.amount).toLocaleString('en-AU')}</span> to {commission.referrerName} <span className="capitalize text-primary-foreground/70">({commission.status})</span></>}
              </span>
            </div>
          ) : (
            <div className="mt-2">
              <button onClick={() => { setDealType('lease'); setDealValue(''); setCloseMsg(''); setShowClose(true) }}
                className="flex items-center gap-1.5 text-sm font-medium border border-input text-foreground px-3 py-1.5 rounded-md hover:bg-muted/50">
                <DollarSign size={14} /> Close deal{referrer ? ' & pay commission' : ''}
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-card border-b border-border px-6 flex">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Contact</h3>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <Prop icon={User} label="Name" value={lead.name} />
                  <Prop icon={Building2} label="Business" value={lead.businessName} />
                  <Prop icon={Mail} label="Email" value={lead.email} />
                  <Prop icon={Phone} label="Phone" value={lead.phone} />
                  <Prop icon={Tag} label="Source" value={lead.source} />
                  <Prop icon={User} label="Referred by" value={referrer ? `${referrer.name}${lead.referralIntent ? ` (${lead.referralIntent === 'list' ? 'seller' : 'tenant'})` : ''}` : (lead.referralCode || null)} />
                  <Prop icon={Building2} label="Unit" value={space?.unitNumber} />
                  <Prop icon={DollarSign} label="Est. value" value={lead.value ? `$${Number(lead.value).toLocaleString('en-AU')}/mo` : null} />
                  <Prop icon={Tag} label="Stage" value={stage?.name} />
                </div>
              </div>
              {lead.notes && (
                <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Original message</h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'email' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <div className="text-xs text-muted-foreground mb-3">To: <span className="text-foreground font-medium">{lead.email || '— no email on file —'}</span></div>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={`${input} mb-3`} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="Write your message…" className={`${input} resize-none`} />
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={send} disabled={sending || !lead.email}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send email
                  </button>
                  {msg && <span className={`text-xs ${msg.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
                </div>
              </div>
              {emails.length > 0 && (
                <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Sent</h3>
                  <div className="space-y-2">
                    {emails.map((e) => (
                      <div key={e.id} className="text-sm border-b border-border pb-2 last:border-0">
                        <div className="font-medium text-foreground">{e.meta?.subject ?? e.text}</div>
                        <div className="text-xs text-muted-foreground">{rel(e.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a follow-up note…" className={`${input} resize-none`} />
                <button onClick={addNote} disabled={!note.trim()}
                  className="mt-2 flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
                  <StickyNote size={13} /> Add note
                </button>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {notes.map((nt) => (
                    <div key={nt.id} className="bg-card border border-border rounded-xl shadow-sm p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{nt.text}</p>
                      <div className="text-xs text-muted-foreground mt-1">{rel(nt.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-4">
              <ol className="relative border-l border-border ml-2">
                {timeline.map((a) => {
                  const meta = ACT[a.type] ?? ACT.note
                  const Icon = meta.icon
                  const text = a.type === 'stage' ? `Moved to ${stageName(a.stageId)}` : a.text
                  return (
                    <li key={a.id} className="ml-5 mb-4">
                      <span className={`absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full ${meta.bg}`}><Icon size={11} className={meta.fg} /></span>
                      <p className="text-sm text-foreground">{text}</p>
                      <p className="text-xs text-muted-foreground">{a.createdAt ? format(parseISO(a.createdAt), 'dd MMM yyyy, h:mm a') : ''} · {rel(a.createdAt)}</p>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Close-deal modal */}
      {showClose && (
        <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowClose(false) }}>
          <div className="bg-card rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2"><DollarSign size={16} /> Close deal</h3>
              <button onClick={() => setShowClose(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Deal type</label>
                <select value={dealType} onChange={(e) => setDealType(e.target.value)} className={input}>
                  <option value="lease">Lease</option>
                  <option value="sale">Sale</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {dealType === 'lease' ? 'Annual lease value (rent × 12)' : 'Sale price'} (AUD)
                </label>
                <input type="number" min="0" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0" className={input} autoFocus />
              </div>
              {referrer ? (
                <div className="bg-muted/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  Commission to <span className="font-medium">{referrer.name}</span> ({referrer.commissionRate}%):
                  <span className="font-semibold"> ${previewAmount.toLocaleString('en-AU')}</span>
                  {referrer.email ? <div className="text-xs text-muted-foreground mt-0.5">They'll be emailed at {referrer.email}.</div>
                    : <div className="text-xs text-amber-600 mt-0.5">No email on referrer — they won't be notified.</div>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This lead wasn't referred — no commission will be created.</p>
              )}
              {closeMsg && <p className="text-xs text-red-600">{closeMsg}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowClose(false)} className="px-4 py-2 text-sm text-foreground border border-input rounded-md hover:bg-muted/50">Cancel</button>
              <button onClick={closeDeal} disabled={closing}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium disabled:opacity-40">
                {closing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Close deal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function commissionEmailHtml({ referrer, commission, settings }) {
  const company = settings?.company?.name ?? 'Hexa Space'
  const amount = `$${Number(commission.amount).toLocaleString('en-AU')}`
  const deal = `$${Number(commission.dealValue).toLocaleString('en-AU')}`
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;background:#f5f5f5;margin:0;padding:0">
    <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
      <div style="background:#000;padding:18px 28px"><span style="color:#fff;font-weight:bold;letter-spacing:2px">${company.toUpperCase()}</span></div>
      <div style="padding:28px;font-size:14px;line-height:1.6">
        <p style="margin:0 0 14px">Hi ${referrer.name},</p>
        <p style="margin:0 0 14px">Great news — a deal you referred to ${company} has closed.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px">
          <tr style="background:#f5f5f5"><td style="padding:9px 12px;font-weight:bold">Deal value</td><td style="padding:9px 12px">${deal} (${commission.dealType})</td></tr>
          <tr><td style="padding:9px 12px;font-weight:bold">Your rate</td><td style="padding:9px 12px">${commission.rate}%</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:9px 12px;font-weight:bold">Your commission</td><td style="padding:9px 12px;font-size:18px;font-weight:bold">${amount} AUD</td></tr>
        </table>
        <p style="margin:0 0 14px;color:#555">We'll be in touch shortly to arrange payment. Thank you for the referral!</p>
        <p style="margin:0;font-size:12px;color:#888">${company} &middot; hexaspace.com.au</p>
      </div>
    </div></body></html>`
}

const ACT = {
  created: { icon: Sparkles, bg: 'bg-gray-100', fg: 'text-gray-500' },
  note: { icon: StickyNote, bg: 'bg-amber-100', fg: 'text-amber-600' },
  email: { icon: Mail, bg: 'bg-blue-100', fg: 'text-blue-600' },
  stage: { icon: ArrowRight, bg: 'bg-purple-100', fg: 'text-purple-600' },
  convert: { icon: CheckCircle2, bg: 'bg-green-100', fg: 'text-green-600' },
  commission: { icon: DollarSign, bg: 'bg-emerald-100', fg: 'text-emerald-600' },
}

function Prop({ icon: Icon, label, value }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon size={11} /> {label}</div>
      <div className="text-foreground mt-0.5">{value || '—'}</div>
    </div>
  )
}
