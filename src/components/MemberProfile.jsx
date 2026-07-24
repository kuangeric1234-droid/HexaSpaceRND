import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authHeaders } from '../lib/apiFetch.js'
import { ArrowLeft, Pencil, Check, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { displayStatus, accessRoles, memberHasActiveMembership } from './Members.jsx'
import { FOB_STATUS, DEPOSIT_STATUS, depositState, money } from '../lib/fobs.js'

const TABS = ['Overview', 'Memberships', 'Bookings', 'Credits', 'One-off Fees', 'Invoices', 'Comments']

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className={`w-9 h-5 rounded-full transition-colors relative ${on ? 'bg-blue-600' : 'bg-muted'}`}>
      <span className={`absolute top-0.5 ${on ? 'left-4' : 'left-0.5'} w-4 h-4 bg-card rounded-full transition-all`} />
    </button>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between py-1.5 text-xs">
      <span className="text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-foreground text-right max-w-[60%]">{children || <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

function Section({ title, addLabel, onAdd, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-bold text-foreground">{title}</h3>
        {addLabel && <button onClick={onAdd} disabled={!onAdd} className={`text-xs px-2.5 py-1 rounded font-medium ${onAdd ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>{addLabel}</button>}
      </div>
      <div className="bg-card border border-border rounded-xl shadow-sm p-5 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

export default function MemberProfile({ member, ctx, onBack, onEdit }) {
  const { tenants = [], invoices = [], leases = [], bookings = [], spaces = [], fees = [],
    updateMember, addFee, updateFee, updateTenant, addInvoice, settings } = ctx
  const navigate = useNavigate()
  const [tab, setTab] = useState('Overview')
  const [inviting, setInviting] = useState(false)
  const [feeModal, setFeeModal] = useState(false)
  const [commentText, setCommentText] = useState('')
  // 'active' (signed in) | 'invited' | 'not_invited' | null (loading/unknown)
  const [portalStatus, setPortalStatus] = useState(null)

  useEffect(() => {
    if (!member.email) { setPortalStatus('not_invited'); return }
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`/api/portal/status?email=${encodeURIComponent(member.email)}`, { headers: await authHeaders() })
        const d = await r.json().catch(() => null)
        if (alive && d?.status) setPortalStatus(d.status)
      } catch { /* leave unknown */ }
    })()
    return () => { alive = false }
  }, [member.email])

  async function resendPortalInvite() {
    if (!member.email) { alert('This member has no email address.'); return }
    setInviting(true)
    try {
      const r = await fetch('/api/auth/invite', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ email: member.email }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Invite failed')
      updateMember(member.id, { portalAccess: true, portalInviteFailed: false })
      alert(`Portal invite sent to ${member.email}. The set-password link expires in 24 hours.`)
    } catch (e) {
      updateMember(member.id, { portalInviteFailed: true })
      alert(`Could not send the invite: ${e.message}`)
    } finally {
      setInviting(false)
    }
  }
  const company = tenants.find((t) => t.id === member.companyId)
  const memberInvoices = invoices.filter((i) => i.tenantId === member.companyId)
  // Their own bookings, plus company-level ones with no member attribution
  // (booked by a primary contact who has no member record) — newest first.
  const memberBookings = bookings
    .filter((b) => b.memberId === member.id ||
      (member.companyId && b.companyId === member.companyId && !b.memberId))
    .sort((a, b) => ((b.date || '') + (b.startTime || '')).localeCompare((a.date || '') + (a.startTime || '')))
  const st = displayStatus(member, memberHasActiveMembership(member, leases))
  const show = (s) => tab === 'Overview' || tab === s
  const set = (k, v) => updateMember(member.id, { [k]: v })

  // Company memberships / credit pool / fee charges for the sections below.
  const companyLeases = leases.filter((l) => l.tenantId === member.companyId)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const creditsRemaining = company
    ? (company.creditsPeriod === monthKey ? Number(company.creditsRemaining ?? 0) : Number(company.monthlyAllowance ?? company.creditsRemaining ?? 0))
    : 0
  const memberFees = fees.filter((f) => f.memberId === member.id || (member.companyId && f.companyId === member.companyId))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const feeBillable = (f) => f.companyId && Number(f.price) > 0 && !['Paid', 'Waived', 'Invoiced'].includes(f.status)

  function addCredits() {
    if (!company) { alert('This member has no company — credits live on the company pool.'); return }
    const raw = window.prompt(`Add credits to ${company.businessName}'s pool (current: ${creditsRemaining}). Amount to add (negative to deduct):`, '4')
    if (raw === null) return
    const n = Number(raw)
    if (!n || isNaN(n)) return
    updateTenant(company.id, { creditsRemaining: Math.max(0, Math.round((creditsRemaining + n) * 100) / 100), creditsPeriod: monthKey })
  }

  function invoiceFee(f) {
    if (!confirm(`Invoice ${company?.businessName ?? 'the company'} now for "${f.name}" (A$${Number(f.price).toFixed(2)} + GST)?`)) return
    const today = new Date().toISOString().split('T')[0]
    const due = new Date(); due.setDate(due.getDate() + (settings?.invoicing?.dueDateDays ?? 14))
    const inv = addInvoice({
      tenantId: f.companyId, invoiceType: 'fees', source: 'member-profile',
      status: 'pending', sentStatus: 'not_sent', vatEnabled: true,
      issueDate: today, dueDate: due.toISOString().split('T')[0],
      payments: [], comments: [],
      lineItems: [{
        id: `li_fee_${f.id}`,
        description: `${f.name}${f.date && f.type !== 'Booking Fee' ? ` (${f.date})` : ''}`,
        revenueAccount: 'Meeting Room & Booking Fees',
        unitPrice: Number(f.price) || 0, qty: 1, discountPct: 0,
      }],
    })
    updateFee(f.id, { status: 'Invoiced', invoiceId: inv?.id ?? null })
  }

  function addComment() {
    const text = commentText.trim()
    if (!text) return
    const comment = { id: `c_${Date.now()}`, text, at: new Date().toISOString(), by: 'Admin' }
    updateMember(member.id, { comments: [...(member.comments ?? []), comment] })
    setCommentText('')
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft size={15} /> Back to Members</button>

      <div className="flex gap-5 items-start">
        {/* Left sidebar */}
        <aside className="w-64 shrink-0 space-y-5">
          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Member</span>
              {onEdit && <button onClick={onEdit} className="flex items-center gap-1 text-xs border border-input rounded px-2 py-1 hover:bg-muted/50"><Pencil size={12} /> Edit Details</button>}
            </div>
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-2" />
            <div className="text-center">
              <div className="font-bold text-foreground">{member.name}</div>
              {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
              {company && <div className="text-xs text-muted-foreground mt-0.5">{company.businessName}</div>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">General</div>
            <Row label="Location">Hexa Space</Row>
            <Row label="Status"><span className="inline-flex gap-1">{[st, ...accessRoles(member).map((a) => a.split(' ')[0])].map((b, i) => <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground">{b}</span>)}</span></Row>
            <Row label="Phone">{member.phone}</Row>
            <Row label="Email">{member.email}</Row>
            <Row label="Credits">{Number(member.credits || 0)} · A${(Number(member.credits || 0) * 40).toLocaleString('en-AU')}</Row>
            <Row label="Address">{member.address}</Row>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-muted-foreground uppercase tracking-wide">Use Day Passes</span><Toggle on={!!member.useDayPasses} onClick={() => set('useDayPasses', !member.useDayPasses)} /></div>
            <Row label="Presence"><span className="text-muted-foreground">Not in</span></Row>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Member Apps</div>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-muted-foreground uppercase tracking-wide">Hide from Portal</span><Toggle on={!!member.hideFromPortal} onClick={() => set('hideFromPortal', !member.hideFromPortal)} /></div>
            <div className="flex items-center justify-between py-1.5 text-xs"><span className="text-muted-foreground uppercase tracking-wide">Portal Access</span><Toggle on={!!member.portalAccess} onClick={() => set('portalAccess', !member.portalAccess)} /></div>
            {member.portalInviteFailed && (
              <p className="text-[11px] text-red-600 mt-1">The portal invite email failed to send — resend it below.</p>
            )}
            {portalStatus === 'active' ? (
              // Signed up and signed in — nothing to resend.
              <div className="mt-2 w-full text-xs rounded px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 font-semibold text-center">
                ● Portal active — signed up
              </div>
            ) : (
              <button
                onClick={resendPortalInvite}
                disabled={inviting}
                className="mt-2 w-full text-xs border border-input rounded px-3 py-1.5 text-foreground hover:bg-muted/50 disabled:opacity-50"
              >
                {inviting ? 'Sending…' : portalStatus === 'invited' ? 'Resend portal invite' : 'Send portal invite'}
              </button>
            )}
          </div>

          <MemberFobsCard memberId={member.id} invoices={invoices} />

          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Integrations</div>
            <Row label="Door Access"><span className="text-muted-foreground">Salto — not linked</span></Row>
            <Row label="Accounting"><span className="text-muted-foreground">Xero — not connected</span></Row>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Billing Details</div>
            <Row label="Business Name">{member.billBusinessName}</Row>
            <Row label="ABN">{member.abn}</Row>
            <Row label="City">{member.city}</Row>
            <Row label="State">{member.state}</Row>
            <Row label="Country">{member.country}</Row>
            <Row label="Tax Rate">{member.taxRate}</Row>
            <Row label="Billing Date">{member.billingPeriodStart}</Row>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-5 border-b border-border mb-5 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`pb-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
            ))}
          </div>

          {(tab === 'Overview') && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-6 text-sm text-amber-800">
              <strong>Automated Bill Run Summary</strong> · upcoming period · auto-send
            </div>
          )}

          {show('Memberships') && (
            <Section title="Memberships" addLabel="Add membership" onAdd={() => navigate('/leases')}>
              {companyLeases.length === 0 ? 'No memberships to show.' : (
                <table className="w-full text-sm text-foreground">
                  <thead><tr className="text-xs text-muted-foreground uppercase"><th className="text-left pb-2">Plan</th><th className="text-left pb-2">Space</th><th className="text-left pb-2">Period</th><th className="text-left pb-2">Status</th><th className="text-right pb-2">Price</th></tr></thead>
                  <tbody>
                    {companyLeases.map((l) => {
                      const space = spaces.find((s) => s.id === l.spaceId)
                      return (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-2">{l.membershipType || l.planName || 'Membership'}</td>
                          <td className="py-2">{space?.unitNumber || l.resource || '—'}</td>
                          <td className="py-2 text-muted-foreground text-xs">{l.startDate?.split('-').reverse().join('/')} – {l.endDate?.split('-').reverse().join('/')}</td>
                          <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${l.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{l.status}</span></td>
                          <td className="py-2 text-right">A${Number(l.monthlyRent || 0).toLocaleString('en-AU')}/mo</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          )}
          {show('Bookings') && (
            <Section title="Bookings" addLabel="New booking" onAdd={() => navigate('/calendar')}>
              {memberBookings.length === 0 ? 'No bookings to show.' : (
                <table className="w-full text-sm text-foreground">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left pb-2">Date</th><th className="text-left pb-2">Time</th>
                      <th className="text-left pb-2">Room</th><th className="text-left pb-2">Title</th>
                      <th className="text-left pb-2">Status</th><th className="text-right pb-2">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberBookings.map((b) => {
                      const past = b.date < new Date().toISOString().split('T')[0]
                      return (
                        <tr key={b.id} className={`border-t border-border ${past ? 'text-muted-foreground' : ''}`}>
                          <td className="py-2 whitespace-nowrap">{b.date ? b.date.split('-').reverse().join('/') : '—'}</td>
                          <td className="py-2 whitespace-nowrap">{b.startTime}{b.endTime ? `–${b.endTime}` : ''}</td>
                          <td className="py-2">{spaces.find((s) => s.id === b.resourceId)?.unitNumber || b.resourceName || '—'}</td>
                          <td className="py-2">{b.title || '—'}{!b.memberId && <span className="text-xs text-muted-foreground"> · company booking</span>}</td>
                          <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${b.status === 'Confirmed' ? 'bg-green-50 text-green-700' : b.status === 'Cancelled' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{b.status || '—'}</span></td>
                          <td className="py-2 text-right tabular-nums">{b.creditsUsed ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          )}
          {show('Credits') && (
            <Section title="Credits" addLabel="Add credits" onAdd={addCredits}>
              {!company ? 'No company — credits live on the company pool.' : (
                <div className="flex items-center gap-8 text-sm">
                  <div><div className="text-2xl font-bold text-foreground tabular-nums">{creditsRemaining}</div><div className="text-xs text-muted-foreground">credits remaining this month</div></div>
                  <div><div className="text-2xl font-bold text-foreground tabular-nums">{Number(company.monthlyAllowance ?? 0)}</div><div className="text-xs text-muted-foreground">monthly allowance ({company.businessName})</div></div>
                  <div className="text-xs text-muted-foreground">1 credit = A$40 of room bookings · pool is shared across the company</div>
                </div>
              )}
            </Section>
          )}
          {show('One-off Fees') && (
            <Section title="One-off Fees" addLabel="Add fee" onAdd={() => setFeeModal(true)}>
              {memberFees.length === 0 ? 'No one-off fees to show.' : (
                <table className="w-full text-sm text-foreground">
                  <thead><tr className="text-xs text-muted-foreground uppercase"><th className="text-left pb-2">Charge</th><th className="text-left pb-2">Date</th><th className="text-left pb-2">Status</th><th className="text-right pb-2">Amount</th><th className="pb-2" /></tr></thead>
                  <tbody>
                    {memberFees.map((f) => (
                      <tr key={f.id} className="border-t border-border">
                        <td className="py-2 pr-3">{f.name}{f.type ? <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{f.type}</span> : null}</td>
                        <td className="py-2 whitespace-nowrap">{f.date ? f.date.split('-').reverse().join('/') : '—'}</td>
                        <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${f.status === 'Invoiced' ? 'bg-blue-50 text-blue-700' : f.status === 'Paid' ? 'bg-green-50 text-green-700' : f.status === 'Waived' ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-700'}`}>{f.status}</span></td>
                        <td className="py-2 text-right tabular-nums">A${(Number(f.price) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 text-right">{feeBillable(f) && <button onClick={() => invoiceFee(f)} className="text-xs font-semibold text-green-700 hover:underline">Invoice now</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
          {show('Invoices') && (
            <Section title="Invoices" addLabel="Add invoice" onAdd={() => navigate('/billing')}>
              {memberInvoices.length === 0 ? 'No invoices to show.' : (
                <table className="w-full text-sm text-foreground">
                  <thead><tr className="text-xs text-muted-foreground uppercase"><th className="text-left pb-2">Number</th><th className="text-left pb-2">Status</th><th className="text-right pb-2">Amount</th></tr></thead>
                  <tbody>{memberInvoices.map((i) => (
                    <tr key={i.id} className="border-t border-border"><td className="py-2">{i.number}</td><td className="py-2 capitalize">{i.status}</td><td className="py-2 text-right">A${Number((i.lineItems || []).reduce((s, l) => s + (l.unitPrice || 0) * (l.qty || 1), 0)).toLocaleString('en-AU')}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </Section>
          )}
          {show('Comments') && (
            <Section title="Comments">
              {(member.comments ?? []).length === 0 ? <p className="mb-3">No comments yet.</p> : (
                <div className="space-y-2 mb-4">
                  {(member.comments ?? []).map((c) => (
                    <div key={c.id} className="border border-border rounded-md px-3 py-2 bg-muted/30">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{c.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{c.by || 'Admin'} · {c.at ? new Date(c.at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addComment()}
                  placeholder="Add a note about this member…"
                  className="flex-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
                <button onClick={addComment} disabled={!commentText.trim()}
                  className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40">Add</button>
              </div>
            </Section>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-56 shrink-0 space-y-5 hidden xl:block">
          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Payment Details</div>
            {company?.cardLast4 || company?.stripePaymentMethodId ? (
              <div className="text-xs text-foreground space-y-1">
                <div className="font-medium">{(company.cardBrand || 'Card').toUpperCase()} •••• {company.cardLast4 || '????'}</div>
                {company.cardExpMonth && <div className="text-muted-foreground">Expires {String(company.cardExpMonth).padStart(2, '0')}/{company.cardExpYear}</div>}
                <div className={company.cardAuthorityAccepted ? 'text-green-600' : 'text-muted-foreground'}>
                  {company.cardAuthorityAccepted ? 'Charge authority on file' : 'No charge authority yet'}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No card on file.</p>
            )}
          </div>
          {['Attachments', 'Opportunities'].map((t) => (
            <div key={t} className="bg-card border border-border rounded-xl shadow-sm p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t}</div>
              <p className="text-xs text-muted-foreground">Nothing to show.</p>
            </div>
          ))}
          <div className="bg-card border border-border rounded-xl shadow-sm p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Activity</div>
            <button onClick={() => navigate('/activity')} className="text-xs text-blue-600 hover:underline">View member’s activity</button>
          </div>
        </aside>
      </div>

      {feeModal && (
        <AddFeeModal
          onClose={() => setFeeModal(false)}
          onSave={(data) => {
            addFee({ ...data, companyId: member.companyId || '', memberId: member.id, status: 'Not Paid' })
            setFeeModal(false)
          }}
        />
      )}
    </div>
  )
}

// Small inline add-fee form — lands on the fees table against the member's
// company, so it's invoiceable from here, the Fees page, or the bill run.
function AddFeeModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: '', type: 'One-off', price: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const up = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const lab = 'block text-xs font-medium text-muted-foreground mb-1'
  function submit(e) {
    e.preventDefault()
    if (!f.name.trim() || !(Number(f.price) > 0)) { alert('A name and a positive amount are required.'); return }
    onSave({ ...f, name: f.name.trim(), price: Math.round(Number(f.price) * 100) / 100 })
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} className="bg-card rounded-xl w-full max-w-md shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-foreground mb-4">Add fee</h2>
        <div className="space-y-3">
          <div><label className={lab}>Name</label><input value={f.name} onChange={up('name')} className={inp} autoFocus placeholder="e.g. Lost fob replacement" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lab}>Amount (A$ ex-GST)</label><input type="number" step="0.01" min="0" value={f.price} onChange={up('price')} className={inp} /></div>
            <div><label className={lab}>Type</label><select value={f.type} onChange={up('type')} className={inp}><option>One-off</option><option>Booking Fee</option><option>Damage</option><option>Storage</option></select></div>
            <div><label className={lab}>Date</label><input type="date" value={f.date} onChange={up('date')} className={inp} /></div>
          </div>
          <div><label className={lab}>Notes</label><input value={f.notes} onChange={up('notes')} className={inp} placeholder="Optional" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90">Add fee</button>
        </div>
      </form>
    </div>
  )
}

// Devices this member currently holds (fobs / remotes), read straight from the
// fob tracker. Admin-only view, so it reads all assignments and filters by member.
function MemberFobsCard({ memberId, invoices }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    supabase.from('fob_assignments').select('data').eq('data->>memberId', memberId).then(({ data }) => {
      if (!live) return
      setRows((data ?? []).map((r) => r.data).filter((a) => a && !a.returnedAt))
      setLoading(false)
    })
    return () => { live = false }
  }, [memberId])

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5"><KeyRound size={12} /> Fobs & Remotes</div>
      {loading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : rows.length === 0 ? <p className="text-xs text-muted-foreground">No devices on hand.</p>
        : (
          <div className="space-y-2">
            {rows.map((a) => {
              const ds = DEPOSIT_STATUS[depositState(a, invoices)] ?? {}
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-mono text-foreground">{a.serial}</span>
                    <span className="text-muted-foreground capitalize ml-1.5">{a.type}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${ds.cls || 'bg-gray-100 text-gray-600'}`}>{ds.label || 'Deposit'}</span>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}
