import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { format } from 'date-fns'
import { Mail, UserPlus, CheckCircle2, X, RefreshCw, CalendarDays, Users, ExternalLink } from 'lucide-react'
import { STAGES, money, computeQuote, dateClashes, RATES } from '../lib/functionBooking.js'
import { sendBrochure, sendBookingInvite, approveFunctionBooking, declineFunctionBooking, askAmendDate, updatePricing } from '../lib/functionActions.js'

const today = () => new Date().toISOString().split('T')[0]
function StageBadge({ stage }) {
  const s = STAGES[stage] ?? { label: stage, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
}
function fmtDate(d) { if (!d) return '—'; try { return format(new Date(`${d}T00:00:00`), 'EEE d MMM yyyy') } catch { return d } }

export default function FunctionEnquiries({ store }) {
  const settings = store?.settings
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('function_bookings').select('data').order('updated_at', { ascending: false })
    setRows((data ?? []).map((r) => r.data).filter(Boolean))
    setLoading(false)
  }
  function replace(rec) {
    setRows((prev) => prev.map((r) => (r.id === rec.id ? rec : r)))
    if (selected?.id === rec.id) setSelected(rec)
  }
  async function open(b) {
    setSelected(b)
    if (!b.read) { const upd = { ...b, read: true }; await supabase.from('function_bookings').update({ data: upd, updated_at: new Date().toISOString() }).eq('id', b.id); replace(upd) }
  }

  const funnel = rows.filter((b) => ['enquiry', 'quoted', 'requested', 'invited', 'awaiting_deposit', 'pending_approval', 'signed'].includes(b.stage))
  const unread = rows.filter((b) => !b.read && ['enquiry', 'requested', 'awaiting_deposit', 'pending_approval', 'signed'].includes(b.stage)).length

  async function run(key, fn) {
    setBusy(key)
    try { const updated = await fn(); if (updated) replace(updated) } finally { setBusy('') }
  }

  async function applyDiscount(overrides) {
    await run('pricing', () => updatePricing({ booking: selected, overrides }))
  }

  return (
    <div className="flex gap-0 -m-1">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{funnel.length} in the funnel{unread > 0 && <span className="ml-2 text-blue-600 font-medium">{unread} new</span>}</p>
          <button onClick={load} className="p-1.5 text-muted-foreground hover:text-foreground" title="Refresh"><RefreshCw size={15} /></button>
        </div>
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {loading ? <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
            : funnel.length === 0 ? <div className="p-10 text-center text-muted-foreground text-sm">No function enquiries yet.</div>
            : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                  <tr><th className="text-left px-4 py-2.5 font-medium">Enquirer</th><th className="text-left px-4 py-2.5 font-medium">Event</th><th className="text-left px-4 py-2.5 font-medium">Date</th><th className="text-left px-4 py-2.5 font-medium">Stage</th></tr>
                </thead>
                <tbody>
                  {funnel.map((b) => (
                    <tr key={b.id} onClick={() => open(b)} className={`border-b border-border/60 cursor-pointer hover:bg-muted/40 ${selected?.id === b.id ? 'bg-muted/60' : ''}`}>
                      <td className="px-4 py-3"><div className="font-medium text-foreground flex items-center gap-2">{!b.read && ['enquiry', 'pending_approval', 'signed'].includes(b.stage) && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}{b.organisation || b.name || '—'}</div><div className="text-xs text-muted-foreground">{b.email}</div></td>
                      <td className="px-4 py-3 text-foreground">{b.eventName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.eventDate)}</td>
                      <td className="px-4 py-3"><StageBadge stage={b.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {selected && (
        <div className="w-full md:w-[380px] border-l border-border bg-card ml-4 rounded-lg flex flex-col self-start max-h-[75vh] overflow-hidden">
          <div className="flex items-start justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs text-muted-foreground">{selected.ref}</span><StageBadge stage={selected.stage} /></div>
              <div className="font-bold text-foreground">{selected.organisation || selected.name || 'Enquiry'}</div>
              <div className="text-sm text-muted-foreground">{selected.email}{selected.phone ? ` · ${selected.phone}` : ''}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-muted-foreground uppercase">Event</dt><dd className="text-foreground">{selected.eventName || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Type</dt><dd className="text-foreground">{selected.eventType || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Date</dt><dd className="text-foreground flex items-center gap-1"><CalendarDays size={12} />{fmtDate(selected.eventDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Time</dt><dd className="text-foreground">{selected.startTime || '—'}{selected.endTime ? `–${selected.endTime}` : ''}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Guests</dt><dd className="text-foreground flex items-center gap-1"><Users size={12} />{selected.guests || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Source</dt><dd className="text-foreground capitalize">{selected.source || '—'}</dd></div>
            </dl>
            {selected.eventDate && selected.startTime && selected.endTime && (
              <div className="text-sm text-muted-foreground">Indicative total: <strong className="text-foreground">{money((selected.quote || computeQuote({ ...selected, bookedOn: today() })).total)}</strong></div>
            )}
            {selected.additionalRequirements && <div><dt className="text-xs text-muted-foreground uppercase mb-1">Requirements</dt><dd className="text-foreground whitespace-pre-wrap">{selected.additionalRequirements}</dd></div>}
            {['enquiry', 'quoted', 'requested'].includes(selected.stage) && (
              <DiscountEditor booking={selected} disabled={!!busy} onApply={applyDiscount} onClear={() => applyDiscount(null)} />
            )}
            {selected.brochureSentAt && <div className="text-xs text-muted-foreground">Brochure sent {format(new Date(selected.brochureSentAt), 'dd MMM')}</div>}
            {selected.inviteSentAt && <div className="text-xs text-indigo-600">Portal invite sent {format(new Date(selected.inviteSentAt), 'dd MMM')}</div>}
            {selected.signedAt && <div className="text-xs text-yellow-700">Signed {format(new Date(selected.signedAt), 'dd MMM')} by {selected.signerName}</div>}

            <div className="space-y-2 pt-1">
              {['enquiry', 'quoted'].includes(selected.stage) && (
                <>
                  <button disabled={busy} onClick={() => run('brochure', () => sendBrochure({ booking: selected, settings }))} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40"><Mail size={14} /> {busy === 'brochure' ? 'Sending…' : selected.brochureSentAt ? 'Resend brochure' : 'Send brochure & info'}</button>
                  <button disabled={busy} onClick={() => run('invite', () => sendBookingInvite({ store, booking: selected, settings }))} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40"><UserPlus size={14} /> {busy === 'invite' ? 'Sending…' : 'Send booking invite'}</button>
                </>
              )}
              {selected.stage === 'requested' && (
                <>
                  {dateClashes(rows, selected.eventDate, selected.id).length > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-md px-3 py-2 text-xs text-red-700">⚠ {dateClashes(rows, selected.eventDate, selected.id).length} other booking(s) already hold {selected.eventDate}.</div>
                  )}
                  <button disabled={busy} onClick={() => run('approve', () => approveFunctionBooking({ store, booking: selected, settings }))} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40"><CheckCircle2 size={14} /> {busy === 'approve' ? 'Working…' : 'Approve'}</button>
                  <button disabled={busy} onClick={() => run('amend', () => askAmendDate({ booking: selected, settings }))} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40"><CalendarDays size={14} /> Ask to amend date</button>
                  <button disabled={busy} onClick={() => { if (confirm('Decline this booking?')) run('decline', () => declineFunctionBooking({ store, booking: selected })) }} className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-600 py-2.5 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-40"><X size={14} /> Decline</button>
                </>
              )}
              {selected.stage === 'invited' && <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-2.5">Invite sent — awaiting the client to complete details &amp; deposit in the portal. <button onClick={() => run('invite', () => sendBookingInvite({ store, booking: selected, settings }))} className="underline ml-1">Resend</button></div>}
              {selected.stage === 'awaiting_deposit' && <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-md px-3 py-2.5">Deposit invoice raised — mark it paid in Function Space Bookings to secure the venue.</div>}
              {['pending_approval', 'signed'].includes(selected.stage) && (
                <button disabled={busy} onClick={() => run('approve', () => approveFunctionBooking({ store, booking: selected, settings }))} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40"><CheckCircle2 size={14} /> {busy === 'approve' ? 'Working…' : 'Approve'}</button>
              )}
              <a href="/function-bookings" className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground py-1"><ExternalLink size={12} /> Manage in Function Space Bookings</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Set a negotiated discount before sending the brochure / booking invite. Writes
// booking.priceOverrides; the brochure keeps RRP, but the emailed proposal, the
// sign page and the members portal all show the discounted venue hire.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
function DiscountEditor({ booking, disabled, onApply, onClear }) {
  const o = booking.priceOverrides || {}
  const [rate, setRate] = useState(o.rate ?? '')
  const [pct, setPct] = useState(o.discountPct ?? '')
  const [reason, setReason] = useState(o.discountReason ?? '')
  useEffect(() => {
    const oo = booking.priceOverrides || {}
    setRate(oo.rate ?? ''); setPct(oo.discountPct ?? ''); setReason(oo.discountReason ?? '')
  }, [booking.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasRate = rate !== '' && Number(rate) > 0
  const hasPct = !hasRate && pct !== '' && Number(pct) > 0
  const effWk = hasRate ? Number(rate) : hasPct ? round2(RATES.weekday * (1 - Number(pct) / 100)) : RATES.weekday
  const effWe = hasRate ? Number(rate) : hasPct ? round2(RATES.weekend * (1 - Number(pct) / 100)) : RATES.weekend
  const dirty = hasRate || hasPct

  function build() {
    const out = {}
    if (hasRate) out.rate = Number(rate)
    else if (hasPct) out.discountPct = Number(pct)
    if (dirty && reason.trim()) out.discountReason = reason.trim()
    return Object.keys(out).length ? out : null
  }

  const isActive = !!(o.rate || o.discountPct)
  const inp = 'w-full border border-input rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring'
  return (
    <div className="border border-border rounded-md p-3 bg-muted/30 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Venue-hire discount</span>
        {isActive && <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">Applied</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-muted-foreground mb-0.5">Discounted rate $/hr</label>
          <input type="number" min={0} step="0.01" className={inp} value={rate} onChange={(e) => setRate(e.target.value)} placeholder={`${RATES.weekday}/${RATES.weekend}`} />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-0.5">or Discount %</label>
          <input type="number" min={0} max={100} step="0.1" className={inp} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="—" disabled={hasRate} />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-muted-foreground mb-0.5">Reason (client sees this)</label>
        <input className={inp} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeat client — negotiated rate" />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {dirty
          ? <>Venue hire → <span className="font-semibold text-foreground">{money(effWk)}/hr</span> weekday · <span className="font-semibold text-foreground">{money(effWe)}/hr</span> weekend <span className="text-muted-foreground/70 line-through">was {money(RATES.weekday)}/{money(RATES.weekend)}</span></>
          : <>Standard RRP: {money(RATES.weekday)}/hr weekday · {money(RATES.weekend)}/hr weekend</>}
      </div>
      <div className="flex items-center gap-2">
        <button disabled={disabled || !dirty} onClick={() => onApply(build())} className="flex-1 bg-primary text-primary-foreground py-1.5 rounded text-xs font-semibold hover:bg-primary/90 disabled:opacity-40">Apply discount</button>
        {isActive && <button disabled={disabled} onClick={onClear} className="border border-input py-1.5 px-3 rounded text-xs font-medium hover:bg-muted/50 disabled:opacity-40">Clear</button>}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">The brochure keeps standard RRP — this discount shows on the emailed proposal and their members portal.</p>
    </div>
  )
}
