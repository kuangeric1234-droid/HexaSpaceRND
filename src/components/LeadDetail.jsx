import { useState } from 'react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import {
  X, Mail, StickyNote, Activity as ActivityIcon, User, Phone, Building2, Tag, DollarSign,
  UserPlus, CheckCircle2, Send, Loader2, ArrowRight, Sparkles, Trash2, FileText, FileDown,
} from 'lucide-react'
import { sendEmail, renderProposalTemplate, messageEmailHtml, brandShell } from '../lib/sendEmail.js'
import { buildProposalPdf } from '../lib/proposalPdf.js'

const TABS = [
  { key: 'overview', label: 'Overview', icon: User },
  { key: 'proposal', label: 'Proposal', icon: FileText },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'activity', label: 'Activity', icon: ActivityIcon },
]

function rel(iso) { try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }) } catch { return '' } }

const MEMBERSHIP_TYPES = [
  { key: 'office', label: 'Private Office' },
  { key: 'virtual', label: 'Virtual Office' },
  { key: 'flexi', label: 'Flexible Desk' },
  { key: 'dedicated', label: 'Dedicated Desk' },
]

// Virtual Office packages.
const VIRTUAL_PACKAGES = {
  address: { key: 'address', label: 'Virtual Office — Business Address', price: 75, includes: ['Registered business address', 'Mail handling'] },
  plus: { key: 'plus', label: 'Virtual Office Plus', price: 150, includes: ['Registered business address & mail handling', '9am–5pm lounge access with tea & coffee', '2 hours free daily in our 4-pax office'] },
}

// Term + incentive rules. Free months are the client's LAST months and only apply
// to new members.
function computeMembershipOffer(type, price, term, newClient, pkg) {
  if (type === 'virtual') {
    const p = VIRTUAL_PACKAGES[pkg] || VIRTUAL_PACKAGES.plus
    return { type, typeLabel: p.label, price, termLabel: '12-month minimum term', notice: null, minTerm: '12 months', freeMonths: 0, includes: p.includes, gst: true }
  }
  if (type === 'flexi' || type === 'dedicated') {
    const typeLabel = type === 'flexi' ? 'Flexible Desk' : 'Dedicated Desk'
    if (term === '12mo') return { type, typeLabel, price, termLabel: '12-month term', notice: null, freeMonths: newClient ? 2 : 0, gst: true }
    if (term === '6mo') return { type, typeLabel, price, termLabel: '6-month term', notice: null, freeMonths: newClient ? 1 : 0, gst: true }
    return { type, typeLabel, price, termLabel: 'Month-to-month', notice: '1 month', freeMonths: 0, gst: true }
  }
  // private office
  if (term === '12mo') return { type, typeLabel: 'Private Office', price, termLabel: '12-month term', notice: null, freeMonths: newClient ? 3 : 0 }
  if (term === '6mo') return { type, typeLabel: 'Private Office', price, termLabel: '6-month term', notice: null, freeMonths: newClient ? 1 : 0 }
  return { type, typeLabel: 'Private Office', price, termLabel: 'Month-to-month', notice: '1 month', freeMonths: 0 }
}

export default function LeadDetail({ lead, store, onClose }) {
  const { appendLeadActivity, updateLead, convertLeadToTenant, deleteLead, recordDealClose, commissions = [], pipelineStages = [], spaces = [], leases = [], tenants = [], templates = [], referrers = [], settings = {} } = store
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

  // ── Proposal ──────────────────────────────────────────────────────────────
  const officeHasOccupant = (s) => !!(s.occupantTenantId || s.occupantName || leases.some((l) => l.spaceId === s.id && (l.status === 'active' || l.status === 'pending')))
  const daysTo = (d) => { try { return Math.ceil((parseISO(d) - new Date()) / 86400000) } catch { return null } }
  const floorLabel = { l2: 'Level 2', l4: 'Level 4', l5: 'Level 5' }
  // Offices to offer: vacant now, plus occupied ones whose lease ends within 90 days.
  const officeOptions = spaces
    .filter((s) => s.type === 'office')
    .map((s) => {
      const occupied = officeHasOccupant(s)
      const l = leases.find((x) => x.spaceId === s.id && x.status === 'active')
      const endDays = l?.endDate ? daysTo(l.endDate) : null
      const becoming = occupied && endDays != null && endDays >= 0 && endDays <= 90
      return { space: s, occupied, becoming, availableFrom: becoming ? l.endDate : null }
    })
    .filter((o) => !o.occupied || o.becoming)
    .sort((a, b) => (a.occupied === b.occupied ? 0 : a.occupied ? 1 : -1) || String(a.space.unitNumber).localeCompare(String(b.space.unitNumber), undefined, { numeric: true }))

  const [picked, setPicked] = useState({}) // spaceId -> { on, price, note }
  const [proposalMsg, setProposalMsg] = useState('')
  const [validityDays, setValidityDays] = useState(14)
  const [sendingProposal, setSendingProposal] = useState(false)
  const [downloadingProposal, setDownloadingProposal] = useState(false)
  const [compressPdf, setCompressPdf] = useState(false)
  const [proposalResult, setProposalResult] = useState('')

  // ── Membership proposals (Virtual Office / Flexible Desk / Dedicated Desk) ──
  const [propType, setPropType] = useState('office') // office | virtual | flexi | dedicated
  const [m, setM] = useState({ price: '', term: 'mtm', newClient: true, pkg: 'plus' })
  function selectType(t) {
    setPropType(t)
    setProposalResult('')
    if (t === 'virtual') setM({ price: VIRTUAL_PACKAGES.plus.price, term: '12mo', newClient: true, pkg: 'plus' })
    else if (t === 'dedicated') setM({ price: 500, term: 'mtm', newClient: true })
    else if (t === 'flexi') setM({ price: 350, term: 'mtm', newClient: true })
  }
  const mOffer = () => computeMembershipOffer(propType, Number(m.price) || 0, m.term, m.newClient, m.pkg)

  // Private-office term + incentive (6mo → 1 free, 12mo → 3 free; new members).
  const [officeTerm, setOfficeTerm] = useState('12mo')
  const [officeNewClient, setOfficeNewClient] = useState(true)

  async function sendMembershipProposal() {
    if (!lead.email) { setProposalResult('No email address on this lead.'); return }
    if (!(Number(m.price) > 0)) { setProposalResult('Enter a monthly price.'); return }
    setSendingProposal(true); setProposalResult('')
    try {
      const offer = mOffer()
      const token = (crypto?.randomUUID?.() || `${lead.id}-${Date.now()}`)
      const acceptLink = `${window.location.origin}/proposal/${token}`
      const html = buildMembershipProposalHtml({ lead, settings, offer, coverMsg: proposalMsg.trim(), acceptLink, validityDays })
      const subject = `Your ${offer.typeLabel} proposal — ${settings?.company?.name || 'Hexa Space'}`
      await sendEmail({ to: lead.email, subject, html, settings, emailType: 'proposal' })
      const quoted = pipelineStages.find((s) => /quote/i.test(s.name || '') || s.category === 'quoted')
      updateLead(lead.id, {
        proposal: { token, status: 'sent', sentAt: new Date().toISOString(), membershipType: propType, typeLabel: offer.typeLabel, price: Number(m.price), term: m.term, vpkg: m.pkg, freeMonths: offer.freeMonths, newClient: m.newClient, validityDays, message: proposalMsg },
        ...(quoted ? { stageId: quoted.id, stageEnteredAt: new Date().toISOString().split('T')[0] } : {}),
      })
      appendLeadActivity(lead.id, { type: 'email', text: `Proposal sent — ${offer.typeLabel}, ${offer.termLabel} ($${Number(m.price).toLocaleString('en-AU')}/mo${offer.freeMonths ? `, ${offer.freeMonths} mo free` : ''})` })
      setProposalResult('Sent ✓'); setTab('activity')
    } catch (e) { setProposalResult(e.message) } finally { setSendingProposal(false) }
  }
  const togglePick = (o) => setPicked((p) => ({
    ...p,
    [o.space.id]: p[o.space.id]?.on
      ? { ...p[o.space.id], on: false }
      : { on: true, price: p[o.space.id]?.price ?? (o.space.monthlyRate ?? ''), note: p[o.space.id]?.note ?? (o.availableFrom ? `Available from ${format(parseISO(o.availableFrom), 'd MMM yyyy')}` : '') },
  }))
  const setPick = (id, k, v) => setPicked((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const selectedList = () => officeOptions.filter((o) => picked[o.space.id]?.on).map((o) => ({ ...o, price: Number(picked[o.space.id]?.price || 0), note: picked[o.space.id]?.note || '' }))

  // Map a picked office into the shape the branded PDF builder expects.
  const toOffice = (o) => ({ unit: o.space.unitNumber, floor: o.space.floor, pax: o.space.pax, price: o.price, note: o.note })
  const proposalArgs = (sel) => ({ offices: sel.map(toOffice), coverMsg: proposalMsg.trim(), validityDays, lead, settings, dateStr: format(new Date(), 'd MMMM yyyy'), compress: compressPdf })

  async function downloadProposal() {
    const sel = selectedList()
    if (sel.length === 0) { setProposalResult('Tick at least one office first.'); return }
    setDownloadingProposal(true); setProposalResult('')
    try {
      const doc = await buildProposalPdf(proposalArgs(sel))
      doc.save(`Proposal_${(lead.name || lead.businessName || 'lead').replace(/\s+/g, '_')}.pdf`)
    } catch (e) { setProposalResult(e.message) } finally { setDownloadingProposal(false) }
  }

  async function sendProposal() {
    const sel = selectedList()
    if (sel.length === 0) { setProposalResult('Tick at least one office first.'); return }
    if (!lead.email) { setProposalResult('No email address on this lead.'); return }
    setSendingProposal(true); setProposalResult('')
    try {
      const doc = await buildProposalPdf(proposalArgs(sel))
      const pdfBase64 = doc.output('base64')
      const token = (crypto?.randomUUID?.() || `${lead.id}-${Date.now()}`)
      const acceptLink = `${window.location.origin}/proposal/${token}`
      const tpl = (templates ?? []).find((t) => t.category === 'email' && t.emailType === 'proposal' && t.content)
      const oOffer = computeMembershipOffer('office', sel.reduce((s, o) => s + o.price, 0), officeTerm, officeNewClient)
      const { subject: subj, html } = renderProposalTemplate({ template: tpl, lead, settings, acceptLink, offer: buildOfficeOfferHtml(oOffer) })
      await sendEmail({ to: lead.email, subject: subj, html, settings, emailType: 'proposal', attachments: [{ filename: `Proposal_${(lead.businessName || lead.name || 'lead').replace(/\s+/g, '_')}.pdf`, content: pdfBase64 }] })
      const quoted = pipelineStages.find((s) => /quote/i.test(s.name || '') || s.category === 'quoted')
      const offices = sel.map((o) => ({ spaceId: o.space.id, unit: o.space.unitNumber, price: o.price, note: o.note }))
      updateLead(lead.id, { proposal: { token, status: 'sent', sentAt: new Date().toISOString(), offices, term: officeTerm, freeMonths: oOffer.freeMonths, newClient: officeNewClient, validityDays, message: proposalMsg }, ...(quoted ? { stageId: quoted.id, stageEnteredAt: new Date().toISOString().split('T')[0] } : {}) })
      appendLeadActivity(lead.id, { type: 'email', text: `Proposal sent — ${offices.length} office${offices.length !== 1 ? 's' : ''} ($${sel.reduce((s, o) => s + o.price, 0).toLocaleString('en-AU')}/mo)` })
      setProposalResult('Sent ✓'); setTab('activity')
    } catch (e) { setProposalResult(e.message) } finally { setSendingProposal(false) }
  }

  async function send() {
    if (!lead.email) { setMsg('No email address on this lead.'); return }
    if (!subject.trim() || !body.trim()) { setMsg('Add a subject and message.'); return }
    setSending(true); setMsg('')
    try {
      const html = messageEmailHtml({ body, company: settings?.company?.name, website: settings?.company?.website })
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

          {tab === 'proposal' && (
            <div className="space-y-4">
              {/* Membership type selector */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-3">
                <div className="flex flex-wrap gap-1.5">
                  {MEMBERSHIP_TYPES.map((t) => (
                    <button key={t.key} onClick={() => selectType(t.key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${propType === t.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-input hover:border-muted-foreground'}`}>{t.label}</button>
                  ))}
                </div>
              </div>

              {propType === 'office' && (<>
              <div className="bg-card border border-border rounded-xl shadow-sm p-4">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-1">Offices to propose</h3>
                <p className="text-xs text-muted-foreground mb-3">Tick the offices to include. Available now and those becoming available (lease ending within 90 days) are listed — edit the price for a negotiated rate.</p>
                {officeOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No available or soon-to-be-available offices.</p>
                ) : (
                  <div className="space-y-2">
                    {officeOptions.map((o) => {
                      const p = picked[o.space.id] || {}
                      return (
                        <div key={o.space.id} className={`border rounded-lg p-3 ${p.on ? 'border-foreground bg-muted/40' : 'border-border'}`}>
                          <div className="flex items-center gap-3">
                            <input type="checkbox" checked={!!p.on} onChange={() => togglePick(o)} className="h-4 w-4 rounded border-gray-300" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">{o.space.unitNumber} <span className="text-muted-foreground font-normal">· {floorLabel[o.space.floor] || ''}{o.space.pax ? ` · ${o.space.pax} pax` : ''}</span></div>
                              <div className="text-xs">{o.becoming ? <span className="text-amber-600">Available from {format(parseISO(o.availableFrom), 'd MMM yyyy')}</span> : <span className="text-green-600">Available now</span>}</div>
                            </div>
                            <div className="text-xs text-muted-foreground">list ${Number(o.space.monthlyRate ?? 0).toLocaleString('en-AU')}</div>
                          </div>
                          {p.on && (
                            <div className="grid grid-cols-3 gap-2 mt-3 pl-7">
                              <label className="col-span-1"><span className="block text-[11px] text-muted-foreground mb-0.5">Monthly price</span><input type="number" value={p.price ?? ''} onChange={(e) => setPick(o.space.id, 'price', e.target.value)} className={input} /></label>
                              <label className="col-span-2"><span className="block text-[11px] text-muted-foreground mb-0.5">Note</span><input value={p.note ?? ''} onChange={(e) => setPick(o.space.id, 'note', e.target.value)} className={input} /></label>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="block text-xs text-muted-foreground mb-1">Term</span>
                    <select value={officeTerm} onChange={(e) => setOfficeTerm(e.target.value)} className={input}>
                      <option value="mtm">Month-to-month</option>
                      <option value="6mo">6 months</option>
                      <option value="12mo">12 months</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground self-end pb-2 cursor-pointer select-none">
                    <input type="checkbox" checked={officeNewClient} onChange={(e) => setOfficeNewClient(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" /> New member (rent-free incentive)
                  </label>
                </div>
                {officeNewClient && officeTerm !== 'mtm' && (
                  <div className="text-xs text-green-600">Includes {officeTerm === '12mo' ? '3 months' : '1 month'} rent-free — applied to the last month(s) of the term.</div>
                )}
                <label className="block"><span className="block text-xs text-muted-foreground mb-1">Cover message (optional — appears on the PDF)</span><textarea rows={3} value={proposalMsg} onChange={(e) => setProposalMsg(e.target.value)} className={`${input} resize-none`} /></label>
                <label className="block w-32"><span className="block text-xs text-muted-foreground mb-1">Valid for (days)</span><input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value) || 14)} className={input} /></label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={compressPdf} onChange={(e) => setCompressPdf(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                  Compress PDF — smaller file, best for emailing
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={downloadProposal} disabled={downloadingProposal} className="flex items-center gap-1.5 border border-input text-foreground px-3 py-2 rounded-md text-sm hover:bg-muted/50 disabled:opacity-40">{downloadingProposal ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Preview PDF</button>
                  <button onClick={sendProposal} disabled={sendingProposal || !lead.email} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">{sendingProposal ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send proposal</button>
                  {proposalResult && <span className={`text-xs ${proposalResult.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{proposalResult}</span>}
                </div>
              </div>
              </>)}

              {propType !== 'office' && (
                <MembershipProposal type={propType} m={m} setM={setM} offer={mOffer()} proposalMsg={proposalMsg} setProposalMsg={setProposalMsg} validityDays={validityDays} setValidityDays={setValidityDays} onSend={sendMembershipProposal} sending={sendingProposal} result={proposalResult} hasEmail={!!lead.email} input={input} />
              )}

              {lead.proposal && (
                <div className="bg-card border border-border rounded-xl shadow-sm p-4 text-sm">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Last proposal</h3>
                  <p className="text-muted-foreground text-xs mb-2">Sent {lead.proposal.sentAt ? format(parseISO(lead.proposal.sentAt), 'd MMM yyyy, h:mm a') : ''}</p>
                  {lead.proposal.membershipType ? (
                    <div className="text-foreground">
                      <div className="flex justify-between"><span>{lead.proposal.typeLabel || lead.proposal.membershipType}</span><span>${Number(lead.proposal.price || 0).toLocaleString('en-AU')}/mo</span></div>
                      <div className="text-xs text-muted-foreground mt-0.5">{computeMembershipOffer(lead.proposal.membershipType, lead.proposal.price, lead.proposal.term, lead.proposal.newClient, lead.proposal.vpkg).termLabel}{lead.proposal.freeMonths ? ` · ${lead.proposal.freeMonths} month${lead.proposal.freeMonths > 1 ? 's' : ''} rent-free` : ''}</div>
                    </div>
                  ) : (
                    (lead.proposal.offices || []).map((o) => <div key={o.spaceId} className="flex justify-between text-foreground"><span>{o.unit}</span><span>${Number(o.price).toLocaleString('en-AU')}/mo</span></div>)
                  )}
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

function MembershipProposal({ type, m, setM, offer, proposalMsg, setProposalMsg, validityDays, setValidityDays, onSend, sending, result, hasEmail, input }) {
  const isDesk = type === 'flexi' || type === 'dedicated'
  const isVirtual = type === 'virtual'
  const priceNum = Number(m.price) || 0
  const OfferRow = ({ label, value, strong }) => (
    <div className={`flex justify-between py-0.5 ${strong ? 'font-semibold text-foreground' : 'text-foreground'}`}><span className="text-muted-foreground">{label}</span><span>{value}</span></div>
  )
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 space-y-3">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">{offer.typeLabel} proposal</h3>
      {isVirtual && (
        <div>
          <span className="block text-[11px] text-muted-foreground mb-1">Package</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(VIRTUAL_PACKAGES).map((p) => (
              <button type="button" key={p.key} onClick={() => setM({ ...m, pkg: p.key, price: p.price })}
                className={`text-left border rounded-md p-2.5 ${m.pkg === p.key ? 'border-foreground bg-muted/40' : 'border-input hover:border-muted-foreground'}`}>
                <div className="text-sm font-medium text-foreground">{p.label}</div>
                <div className="text-xs text-muted-foreground">${p.price} + GST / mo</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label><span className="block text-[11px] text-muted-foreground mb-0.5">Monthly price ($)</span><input type="number" value={m.price} onChange={(e) => setM({ ...m, price: e.target.value })} className={input} placeholder="e.g. 500" /></label>
        {isDesk && (
          <label><span className="block text-[11px] text-muted-foreground mb-0.5">Term</span>
            <select value={m.term} onChange={(e) => setM({ ...m, term: e.target.value })} className={input}>
              <option value="mtm">Month-to-month (1 month notice)</option>
              <option value="6mo">6 months</option>
              <option value="12mo">12 months</option>
            </select>
          </label>
        )}
        {isVirtual && (
          <div><span className="block text-[11px] text-muted-foreground mb-0.5">Term</span><div className="border border-input rounded px-3 py-2 text-sm text-muted-foreground bg-muted/40">12-month minimum</div></div>
        )}
      </div>
      {isDesk && (
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
          <input type="checkbox" checked={m.newClient} onChange={(e) => setM({ ...m, newClient: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300" />
          New member — eligible for the rent-free incentive
        </label>
      )}
      <div className="bg-muted/40 border border-border rounded-md p-3 text-sm">
        <OfferRow label="Membership" value={offer.typeLabel} />
        <OfferRow label="Monthly" value={`$${priceNum.toLocaleString('en-AU')}${offer.gst ? ' + GST' : ''}`} />
        <OfferRow label="Term" value={offer.termLabel} />
        {offer.notice && <OfferRow label="Notice period" value={offer.notice} />}
        {offer.freeMonths > 0 && <OfferRow label="New-member offer" value={`Final ${offer.freeMonths} month${offer.freeMonths > 1 ? 's' : ''} rent-free`} strong />}
        {offer.includes?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="text-[11px] text-muted-foreground mb-1">Includes</div>
            <ul className="list-disc list-inside space-y-0.5 text-foreground">{offer.includes.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
      </div>
      <label className="block"><span className="block text-xs text-muted-foreground mb-1">Cover message (optional)</span><textarea rows={2} value={proposalMsg} onChange={(e) => setProposalMsg(e.target.value)} className={`${input} resize-none`} /></label>
      <label className="block w-32"><span className="block text-xs text-muted-foreground mb-1">Valid for (days)</span><input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value) || 14)} className={input} /></label>
      <div className="flex items-center gap-3 pt-1">
        <button onClick={onSend} disabled={sending || !hasEmail} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send proposal</button>
        {result && <span className={`text-xs ${result.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>{result}</span>}
      </div>
      <p className="text-xs text-muted-foreground">The offer, term and any rent-free months are included in the emailed proposal. (PDF attachments are handled separately.)</p>
    </div>
  )
}

// Small term + rent-free block injected into the office proposal email ({{offer}}).
function buildOfficeOfferHtml(offer) {
  if (!offer) return ''
  const SANS = "'HexaGT','Helvetica Neue',Arial,sans-serif"
  const cell = `padding:10px 15px;font-family:${SANS};font-size:14px`
  const r = (l, v, alt, strong) => `<tr${alt ? ' style="background:#EFEDF2"' : ''}><td style="${cell};font-weight:600;color:#1a1a1a">${l}</td><td style="${cell}${strong ? ';color:#7F8B2F;font-weight:600' : ''}">${v}</td></tr>`
  const rows = [
    r('Term', offer.termLabel, true),
    offer.freeMonths > 0 ? r('New-member offer', `Your final ${offer.freeMonths} month${offer.freeMonths > 1 ? 's' : ''} rent-free`, false, true) : '',
  ].join('')
  const note = offer.freeMonths > 0 ? `<p style="font-family:${SANS};font-size:13px;color:#6b6b6b;margin:0 0 16px">The rent-free months are applied to the end of your term.</p>` : ''
  return `<table style="width:100%;border-collapse:collapse;margin:4px 0 12px">${rows}</table>${note}`
}

function buildMembershipProposalHtml({ lead, settings, offer, coverMsg, acceptLink, validityDays }) {
  const company = settings?.company?.name || 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const name = lead?.name || lead?.contactName || 'there'
  const SANS = "'HexaGT','Helvetica Neue',Arial,sans-serif"
  const cell = `padding:11px 15px;font-family:${SANS};font-size:14px`
  const row = (l, v, alt, strong) => `<tr${alt ? ' style="background:#EFEDF2"' : ''}><td style="${cell};font-weight:600;color:#1a1a1a">${l}</td><td style="${cell}${strong ? ';color:#7F8B2F;font-weight:600' : ''}">${v}</td></tr>`
  const rows = [
    row('Membership', offer.typeLabel, true),
    row('Monthly fee', `$${Number(offer.price).toLocaleString('en-AU')}${offer.gst ? ' + GST' : ''} / month`, false),
    row('Term', offer.termLabel, true),
    offer.notice ? row('Notice period', offer.notice, false) : '',
    offer.freeMonths > 0 ? row('New-member offer', `Your final ${offer.freeMonths} month${offer.freeMonths > 1 ? 's' : ''} rent-free`, true, true) : '',
  ].join('')
  const incLine = offer.includes?.length
    ? `<p style="font-family:${SANS};font-size:13px;color:#6b6b6b;margin:0 0 6px;font-weight:600">Includes</p><ul style="font-family:${SANS};font-size:14px;color:#3a3a3a;line-height:1.7;margin:0 0 16px;padding-left:18px">${offer.includes.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''
  const freeLine = offer.freeMonths > 0
    ? `<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:#6b6b6b;margin:0 0 16px">The rent-free ${offer.freeMonths > 1 ? 'months are' : 'month is'} applied to the end of your term.</p>` : ''
  const cover = coverMsg ? `<p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">${String(coverMsg).replace(/</g, '&lt;')}</p>` : ''
  const inner = `
      <div style="font-family:'HexaRework','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.28em;color:#7F8B2F;text-transform:uppercase;margin:0 0 14px">Your Proposal</div>
      <h1 style="font-family:'HexaBig',Georgia,serif;font-weight:400;font-size:30px;line-height:1.12;margin:0 0 18px;color:#1a1a1a">Your ${offer.typeLabel} at ${company}.</h1>
      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">Hi ${name},</p>
      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">Thanks so much for your interest in ${company}. Here are the details of your membership:</p>
      ${cover}
      <table style="width:100%;border-collapse:collapse;margin:6px 0 14px">${rows}</table>
      ${incLine}
      ${freeLine}
      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">If you're happy to go ahead, review and accept online below — you'll then complete your details and choose your start date.</p>
      <div style="text-align:center;margin:24px 0"><a href="${acceptLink}" style="display:inline-block;background:#7F8B2F;color:#fff;text-decoration:none;padding:13px 34px;font-family:'HexaRework','Helvetica Neue',Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;border-radius:6px">Review &amp; accept proposal</a></div>
      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:#6b6b6b;margin:0">This proposal is valid for ${validityDays || 14} days. Any questions at all, just reply to this email.</p>`
  return brandShell(inner, { company, website })
}

function commissionEmailHtml({ referrer, commission, settings }) {
  const company = settings?.company?.name ?? 'Hexa Space'
  const website = settings?.company?.website || 'hexaspace.com.au'
  const amount = `$${Number(commission.amount).toLocaleString('en-AU')}`
  const deal = `$${Number(commission.dealValue).toLocaleString('en-AU')}`
  const SANS = "'HexaGT','Helvetica Neue',Arial,sans-serif"
  const cell = `padding:11px 15px;font-family:${SANS};font-size:14px`
  const inner = `
      <div style="font-family:'HexaRework','Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:.28em;color:#7F8B2F;text-transform:uppercase;margin:0 0 14px">Referral closed</div>
      <h1 style="font-family:'HexaBig',Georgia,serif;font-weight:400;font-size:30px;line-height:1.12;margin:0 0 18px;color:#1a1a1a">A deal you referred just closed.</h1>
      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">Hi ${referrer.name},</p>
      <p style="font-family:${SANS};font-size:15px;line-height:1.65;color:#3a3a3a;margin:0 0 16px">Great news — a deal you referred to ${company} has closed.</p>
      <table style="width:100%;border-collapse:collapse;margin:6px 0 18px">
        <tr style="background:#EFEDF2"><td style="${cell};font-weight:600;color:#1a1a1a">Deal value</td><td style="${cell}">${deal} (${commission.dealType})</td></tr>
        <tr><td style="${cell};font-weight:600;color:#1a1a1a">Your rate</td><td style="${cell}">${commission.rate}%</td></tr>
        <tr style="background:#EFEDF2"><td style="${cell};font-weight:600;color:#1a1a1a">Your commission</td><td style="${cell};font-family:'HexaBig',Georgia,serif;font-size:22px;color:#7F8B2F">${amount} AUD</td></tr>
      </table>
      <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:#6b6b6b;margin:0">We'll be in touch shortly to arrange payment. Thank you for the referral!</p>`
  return brandShell(inner, { company, website })
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
