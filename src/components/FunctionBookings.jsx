import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { format } from 'date-fns'
import {
  Plus, X, Send, Copy, Check, Pencil, Trash2, CheckCircle2,
  CalendarDays, Users, ChevronRight, RefreshCw, DollarSign, UserPlus,
} from 'lucide-react'
import {
  ADDONS, STAGES, money, computeQuote, bufferedWindow,
  bookingSessions, sessionsLabel, seriesDateClashes, seriesCalendarClashes,
} from '../lib/functionBooking.js'
import { findFunctionSpace } from '../portal/functionSpace.js'
import { approveFunctionBooking, confirmDepositPaid, resolveDeposit, declineFunctionBooking, askAmendDate, sendBrochure, sendBookingInvite, updatePricing, reissueDeposit } from '../lib/functionActions.js'

const today = () => new Date().toISOString().split('T')[0]
const nowIso = () => new Date().toISOString()
const randToken = () => Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')

function StageBadge({ stage }) {
  const s = STAGES[stage] ?? { label: stage, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(`${d}T00:00:00`), 'EEE d MMM yyyy') } catch { return d }
}

const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
const lab = 'block text-xs font-medium text-muted-foreground mb-1'

// ── Quote breakdown (shared by form + detail) ────────────────────────────────
function QuoteBreakdown({ booking }) {
  const q = booking.quote || computeQuote({ ...booking, bookedOn: today() })
  const addonLines = ADDONS.filter((a) => booking.addons?.[a.key])
  const line = (l, v, cls = '') => (
    <div className={`flex justify-between py-1 text-sm ${cls}`}><span>{l}</span><span className="tabular-nums">{money(v)}</span></div>
  )
  const multi = (q.sessionCount ?? 1) > 1
  return (
    <div className="text-foreground">
      {multi ? (
        <>
          {q.sessions.map((s, i) => (
            <div key={`${s.date}-${i}`}>
              {line(`${fmtDate(s.date)} ${s.startTime}–${s.endTime} — ${s.hours} hrs @ ${money(s.rate)}/hr ${s.isWeekend ? '(weekend)' : '(weekday)'}`, s.rental)}
            </div>
          ))}
          {line(`Cleaning fee — ${q.sessionCount} sessions @ ${money(q.sessions[0]?.cleaning ?? 200)}`, q.cleaning)}
        </>
      ) : (
        <>
          {line(`Venue hire — ${q.hours} hrs @ ${money(q.rate)}/hr ${q.isWeekend ? '(weekend)' : '(weekday)'}`, q.rental)}
          {line('Cleaning fee', q.cleaning)}
        </>
      )}
      {q.staffApplies ? line(`F&B & AV staff (80+ pax) — ${q.hours} hrs`, q.staff) : null}
      {addonLines.map((a) => <div key={a.key}>{line(a.label, a.price)}</div>)}
      {(q.extras ?? []).map((l, i) => <div key={`x${i}`}>{line(l.description, l.amount)}</div>)}
      {q.lateFee ? line('Late booking surcharge', q.lateFee) : null}
      {q.discount > 0 && (
        <div className="flex justify-between py-1 text-sm text-green-700">
          <span>Discount{q.discountPct ? ` (${q.discountPct}%)` : ''}{q.discountReason ? ` — ${q.discountReason}` : ''}</span>
          <span className="tabular-nums">−{money(q.discount)}</span>
        </div>
      )}
      <div className="border-t border-border mt-1 pt-1">
        {line('GST (10%)', q.gst, 'text-muted-foreground')}
        {line('Total (inc GST)', q.total, 'font-bold')}
      </div>
      <div className="mt-3 bg-muted/50 border border-border rounded-md p-3">
        {line(`Payable now — 50% deposit + ${money(q.securityDeposit ?? 300)} security`, q.dueNow, 'font-semibold')}
        {line('Balance (14 days before event)', q.balanceDue, 'text-muted-foreground')}
      </div>
    </div>
  )
}

// ── Adjust pricing (negotiated proposals) ────────────────────────────────────
// Writes booking.priceOverrides; the shared quote engine applies them on every
// recompute, so the negotiated price survives approve/confirm and shows
// identically in the portal, agreement emails and invoices.
function PricingBox({ booking, onApply, busy }) {
  const o = booking.priceOverrides || {}
  const [f, setF] = useState({
    rate: o.rate ?? '', cleaningFee: o.cleaningFee ?? '', securityDeposit: o.securityDeposit ?? '',
    discountPct: o.discountPct ?? '', discountAmount: o.discountAmount ?? '', discountReason: o.discountReason ?? '',
    waiveLateFee: !!o.waiveLateFee,
    extraLines: (o.extraLines || []).map((l) => ({ ...l })),
  })
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setLine = (i, k, v) => setF((p) => ({ ...p, extraLines: p.extraLines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)) }))

  const cleaned = (() => {
    const out = {}
    if (f.rate !== '') out.rate = Number(f.rate)
    if (f.cleaningFee !== '') out.cleaningFee = Number(f.cleaningFee)
    if (f.securityDeposit !== '') out.securityDeposit = Number(f.securityDeposit)
    if (Number(f.discountPct) > 0) { out.discountPct = Number(f.discountPct); out.discountReason = f.discountReason }
    else if (Number(f.discountAmount) > 0) { out.discountAmount = Number(f.discountAmount); out.discountReason = f.discountReason }
    if (f.waiveLateFee) out.waiveLateFee = true
    const lines = f.extraLines.filter((l) => (l.description || '').trim() && Number(l.amount))
    if (lines.length) out.extraLines = lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount) }))
    return Object.keys(out).length ? out : null
  })()
  const preview = computeQuote({ ...booking, priceOverrides: cleaned, bookedOn: today() })

  // Deposit raised but unpaid → saving should re-issue the invoice at the new amount.
  const reissue = booking.stage === 'awaiting_deposit' && !booking.depositPaid

  return (
    <div className="bg-muted/50 border border-border rounded-md p-3 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lab}>Hourly rate ($/hr ex-GST)</label><input type="number" min={0} step="0.01" className={inp} value={f.rate} onChange={set('rate')} placeholder="250 wk / 325 w-end" /></div>
        <div><label className={lab}>Cleaning fee (per session)</label><input type="number" min={0} step="0.01" className={inp} value={f.cleaningFee} onChange={set('cleaningFee')} placeholder="200" /></div>
        <div><label className={lab}>Discount %</label><input type="number" min={0} max={100} step="0.1" className={inp} value={f.discountPct} onChange={set('discountPct')} placeholder="—" /></div>
        <div><label className={lab}>or Discount $ (ex-GST)</label><input type="number" min={0} step="0.01" className={inp} value={f.discountAmount} onChange={set('discountAmount')} placeholder="—" disabled={Number(f.discountPct) > 0} /></div>
        <div className="col-span-2"><label className={lab}>Discount reason (client sees this)</label><input className={inp} value={f.discountReason} onChange={set('discountReason')} placeholder="e.g. Repeat client — negotiated Jul 2026" /></div>
        <div><label className={lab}>Security deposit ($)</label><input type="number" min={0} step="1" className={inp} value={f.securityDeposit} onChange={set('securityDeposit')} placeholder="300" /></div>
        <label className="flex items-center gap-2 text-sm text-foreground mt-5">
          <input type="checkbox" checked={f.waiveLateFee} onChange={set('waiveLateFee')} /> Waive late surcharge
        </label>
      </div>

      <div>
        <label className={lab}>Extra lines (ex-GST — e.g. AV technician, furniture)</label>
        {f.extraLines.map((l, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input className={inp} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Description" />
            <input type="number" step="0.01" className={`${inp} w-28`} value={l.amount} onChange={(e) => setLine(i, 'amount', e.target.value)} placeholder="$" />
            <button type="button" onClick={() => setF((p) => ({ ...p, extraLines: p.extraLines.filter((_, idx) => idx !== i) }))}
              className="text-muted-foreground hover:text-destructive px-1"><X size={14} /></button>
          </div>
        ))}
        <button type="button" onClick={() => setF((p) => ({ ...p, extraLines: [...p.extraLines, { description: '', amount: '' }] }))}
          className="text-xs text-foreground underline">+ Add line</button>
      </div>

      <div className="border-t border-border pt-2 text-sm space-y-0.5">
        <div className="flex justify-between"><span className="text-muted-foreground">New total (inc GST)</span><strong className="tabular-nums">{money(preview.total)}</strong></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Deposit due now</span><span className="tabular-nums">{money(preview.dueNow)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="tabular-nums">{money(preview.balanceDue)}</span></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => onApply(cleaned, reissue)}
          className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
          {busy ? 'Saving…' : reissue ? 'Save & re-issue deposit invoice' : 'Save pricing'}
        </button>
        {booking.priceOverrides && (
          <button disabled={busy} onClick={() => onApply(null, reissue)}
            className="px-3 py-2 rounded-md text-sm border border-input text-muted-foreground hover:text-foreground disabled:opacity-40">
            Reset to standard
          </button>
        )}
      </div>
      {reissue && <p className="text-[11px] text-muted-foreground">The pending deposit invoice will be voided and a fresh one raised &amp; emailed at the new amount.</p>}
      {booking.depositPaid && <p className="text-[11px] text-amber-700">Deposit already paid — changes here adjust the balance invoice when the venue is secured.</p>}
    </div>
  )
}

// ── New / edit form ──────────────────────────────────────────────────────────
const BLANK = {
  name: '', organisation: '', email: '', phone: '',
  eventName: '', eventType: 'Corporate', eventDate: '', startTime: '18:00', endTime: '22:00', guests: '',
  catering: false, addons: { parking: false, nameTags: false, photographer: false }, additionalRequirements: '',
}

function BookingForm({ booking, onSave, onClose }) {
  const [f, setF] = useState(booking ? { ...BLANK, ...booking, addons: { ...BLANK.addons, ...(booking.addons || {}) } } : { ...BLANK })
  // Session rows: seeded from the saved series, the legacy single date, or one blank row.
  const [sessions, setSessions] = useState(() => {
    const existing = bookingSessions(booking || {})
    return existing.length ? existing.map((s) => ({ ...s })) : [{ date: '', startTime: '18:00', endTime: '22:00' }]
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setAddon = (k, v) => setF((p) => ({ ...p, addons: { ...p.addons, [k]: v } }))
  const setSession = (i, k, v) => setSessions((prev) => prev.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)))
  const addSession = () => setSessions((prev) => [...prev, { date: '', startTime: prev[prev.length - 1]?.startTime || '18:00', endTime: prev[prev.length - 1]?.endTime || '22:00' }])
  const removeSession = (i) => setSessions((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  const completeSessions = sessions.filter((s) => s.date && s.startTime && s.endTime)
  const quote = computeQuote({ ...f, sessions: completeSessions, bookedOn: today() })

  async function submit(e) {
    e.preventDefault()
    if (!f.name && !f.organisation) { alert('Enter a contact name or organisation.'); return }
    if (!f.email) { alert('Email is required.'); return }
    if (completeSessions.length === 0) { alert('At least one session with a date and times is required.'); return }
    setSaving(true)
    try {
      // eventDate/startTime/endTime always mirror the FIRST session so legacy
      // consumers (reminders, sorting, portal cards) keep working.
      const sorted = [...completeSessions].sort((a, z) => `${a.date}T${a.startTime}`.localeCompare(`${z.date}T${z.startTime}`))
      const first = sorted[0]
      await onSave({ ...f, sessions: sorted, eventDate: first.date, startTime: first.startTime, endTime: first.endTime, quote })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end">
      <div className="w-full max-w-md bg-card h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-bold text-foreground">{booking?.id ? 'Edit Booking' : 'New Function Booking'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</h3>
            <div><label className={lab}>Contact name</label><input className={inp} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><label className={lab}>Organisation</label><input className={inp} value={f.organisation} onChange={(e) => set('organisation', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab}>Email *</label><input type="email" className={inp} value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
              <div><label className={lab}>Phone</label><input className={inp} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab}>Event name</label><input className={inp} value={f.eventName} onChange={(e) => set('eventName', e.target.value)} /></div>
              <div><label className={lab}>Type</label>
                <select className={inp} value={f.eventType} onChange={(e) => set('eventType', e.target.value)}>
                  <option>Corporate</option><option>Conference / Seminar</option><option>Launch</option><option>Dinner</option><option>Celebration</option><option>Wedding</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className={lab}>Session{sessions.length > 1 ? 's' : ''} (date &amp; times)</label>
              {sessions.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <input type="date" className={inp} value={s.date} onChange={(e) => setSession(i, 'date', e.target.value)} />
                  <input type="time" className={`${inp} w-24`} value={s.startTime} onChange={(e) => setSession(i, 'startTime', e.target.value)} />
                  <input type="time" className={`${inp} w-24`} value={s.endTime} onChange={(e) => setSession(i, 'endTime', e.target.value)} />
                  <button type="button" onClick={() => removeSession(i)} disabled={sessions.length === 1}
                    className="p-1.5 text-muted-foreground hover:text-red-600 disabled:opacity-30" title="Remove session">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSession} className="flex items-center gap-1.5 text-xs text-blue-700 hover:underline">
                <Plus size={12} /> Add another session
              </button>
              {sessions.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Series of {completeSessions.length} session{completeSessions.length !== 1 ? 's' : ''} — each priced at its own weekday/weekend rate,
                  cleaning per session; one $300 security deposit; 50% deposit &amp; balance across the whole series.
                </p>
              )}
            </div>
            <div><label className={lab}>Estimated guests</label><input type="number" min={1} className={inp} value={f.guests} onChange={(e) => set('guests', e.target.value)} placeholder="e.g. 60" /></div>
          </section>
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add-ons</h3>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.catering} onChange={(e) => set('catering', e.target.checked)} /> Catering required <span className="text-muted-foreground text-xs">(quoted separately)</span></label>
            {ADDONS.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.addons[a.key]} onChange={(e) => setAddon(a.key, e.target.checked)} /> {a.label} — {money(a.price)}</label>
            ))}
            {Number(f.guests) > 80 && <p className="text-xs text-amber-600">80+ guests — F&B & AV staff ($40/hr) auto-added.</p>}
            <div><label className={lab}>Additional requirements</label><textarea rows={2} className={inp} value={f.additionalRequirements} onChange={(e) => set('additionalRequirements', e.target.value)} /></div>
          </section>
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Live Quote</h3>
            <div className="border border-border rounded-md p-3"><QuoteBreakdown booking={{ ...f, quote }} /></div>
          </section>
        </form>
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Post-event security deposit resolution ───────────────────────────────────
function RefundBox({ booking, onResolve }) {
  const [damage, setDamage] = useState('0')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const dmg = Number(damage) || 0
  const refund = Math.max(0, 300 - dmg)
  const overflow = Math.max(0, dmg - 300)
  return (
    <div className="bg-muted/50 border border-border rounded-md p-3 space-y-2">
      <div className="text-xs font-semibold text-foreground">Resolve $300 security deposit</div>
      <div><label className={lab}>Damage / excess cleaning to withhold ($)</label><input type="number" min={0} className={inp} value={damage} onChange={(e) => setDamage(e.target.value)} /></div>
      <div><label className={lab}>Notes</label><textarea rows={2} className={inp} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for any withholding" /></div>
      <div className="text-xs text-muted-foreground">Refund to client: <strong className="text-foreground">{money(refund)}</strong>{overflow > 0 && <> · extra billed: <strong className="text-foreground">{money(overflow)}</strong></>}</div>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await onResolve({ damage: dmg, refund, overflow, notes }) } finally { setBusy(false) } }}
        className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
        {busy ? 'Processing…' : dmg > 0 ? `Withhold ${money(dmg)} & refund ${money(refund)}` : 'Refund full deposit'}
      </button>
    </div>
  )
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function Detail({ booking, onClose, onEdit, onDelete, actions, busy, clash, calClash }) {
  const b = booking
  const [showPricing, setShowPricing] = useState(false)
  const [resent, setResent] = useState(false)
  const sessions = bookingSessions(b)
  const lastDate = sessions[sessions.length - 1]?.date ?? b.eventDate
  const passed = lastDate && lastDate < today()
  const anyClash = (clash?.length || 0) + (calClash?.length || 0)
  return (
    <div className="w-full md:w-[420px] border-l border-border bg-card flex flex-col h-full shrink-0">
      <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs text-muted-foreground">{b.ref}</span><StageBadge stage={b.stage} /></div>
          <div className="text-base font-bold text-foreground">{b.eventName || 'Function booking'}</div>
          <div className="text-sm text-muted-foreground">{b.organisation || b.name}</div>
        </div>
        <div className="flex items-center gap-1">
          {!['cancelled'].includes(b.stage) && <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><Pencil size={13} /></button>}
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><X size={16} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {sessions.length > 1 ? (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground uppercase">Sessions ({sessions.length})</dt>
              <dd className="text-foreground mt-1 space-y-0.5">
                {sessions.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-muted-foreground shrink-0" />
                    <span>{fmtDate(s.date)}</span>
                    <span className="text-muted-foreground">{s.startTime}–{s.endTime}</span>
                  </div>
                ))}
              </dd>
            </div>
          ) : (
            <>
              <div><dt className="text-xs text-muted-foreground uppercase">Date</dt><dd className="text-foreground flex items-center gap-1"><CalendarDays size={12} />{fmtDate(b.eventDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground uppercase">Time</dt><dd className="text-foreground">{b.startTime}–{b.endTime}</dd></div>
            </>
          )}
          <div><dt className="text-xs text-muted-foreground uppercase">Guests</dt><dd className="text-foreground flex items-center gap-1"><Users size={12} />{b.guests || '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground uppercase">Source</dt><dd className="text-foreground capitalize">{b.source || '—'}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted-foreground uppercase">Contact</dt><dd className="text-foreground">{b.email}{b.phone ? ` · ${b.phone}` : ''}</dd></div>
        </dl>

        {b.eventDate && sessions.length === 1 && <p className="text-xs text-muted-foreground">Calendar hold reserves {bufferedWindow(b.startTime, b.endTime).blockStart}–{bufferedWindow(b.startTime, b.endTime).blockEnd} (incl. 30-min buffer each side).</p>}
        {sessions.length > 1 && <p className="text-xs text-muted-foreground">Each session gets its own calendar hold with a 30-min buffer each side. One $300 security deposit covers the series; balance is due 14 days before the first session.</p>}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quote
              {b.priceOverrides && <span className="ml-2 normal-case tracking-normal font-semibold text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">Adjusted</span>}
            </h3>
            {!['completed', 'refunded', 'cancelled', 'declined'].includes(b.stage) && (
              <button onClick={() => setShowPricing((v) => !v)} className="flex items-center gap-1 text-xs text-foreground underline">
                <DollarSign size={11} /> {showPricing ? 'Close' : 'Adjust pricing'}
              </button>
            )}
          </div>
          <QuoteBreakdown booking={b} />
          {showPricing && (
            <PricingBox booking={b} busy={busy}
              onApply={async (overrides, reissue) => { await actions.adjustPricing(b, overrides, reissue); setShowPricing(false) }} />
          )}
        </div>

        {b.additionalRequirements && (
          <div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Requirements</h3><p className="text-sm text-foreground whitespace-pre-wrap">{b.additionalRequirements}</p></div>
        )}

        {b.signedAt && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-md px-3 py-2.5 text-xs text-yellow-800">
            Signed by {b.signerName}{b.signerTitle ? ` (${b.signerTitle})` : ''} · {format(new Date(b.signedAt), 'dd MMM yyyy')}
          </div>
        )}
        {b.confirmedAt && (
          <div className="bg-green-50 border border-green-100 rounded-md px-3 py-2.5 text-xs text-green-800 space-y-1">
            <div>Confirmed {format(new Date(b.confirmedAt), 'dd MMM yyyy')} — deposit, security &amp; balance invoices raised.</div>
            <div>Deposit paid: {b.depositPaid ? 'Yes' : 'Not yet'}</div>
          </div>
        )}
        {b.refundedAt && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2.5 text-xs text-emerald-800">
            Security deposit resolved — refunded {money(b.refundAmount)}{b.damageAmount ? `, withheld ${money(b.damageAmount)}` : ''}. {b.damageNotes}
          </div>
        )}

        {/* Calendar / booking clash warning — shown while the date isn't locked in yet */}
        {anyClash > 0 && !['confirmed', 'completed', 'refunded', 'cancelled', 'declined'].includes(b.stage) && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2.5 text-xs text-red-700 space-y-1">
            <div className="font-semibold">⚠ Possible clash{sessions.length > 1 ? ' in this series' : ` on ${fmtDate(b.eventDate)}`}</div>
            {calClash?.map((c, i) => (
              <div key={i}>{c.clashDate ? `${fmtDate(c.clashDate)} — ` : ''}Calendar: {c.title || c.type || 'Booking'} {c.startTime}–{c.endTime}{c.functionRef ? ` (${c.functionRef})` : ''}</div>
            ))}
            {clash?.map((c, i) => (
              <div key={`${c.id}-${i}`}>{c.clashDate ? `${fmtDate(c.clashDate)} — ` : ''}Function: {c.eventName || c.ref} {c.startTime}–{c.endTime} · {STAGES[c.stage]?.label || c.stage}</div>
            ))}
            <div className="text-red-600/80">Windows include the 30-min buffer each side. Ask them to amend, or approve if it's fine.</div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {['enquiry', 'quoted'].includes(b.stage) && (
            <>
              <button onClick={() => actions.brochure(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40">
                <Send size={14} /> {busy ? 'Sending…' : b.brochureSentAt ? 'Resend brochure' : 'Send brochure & info'}
              </button>
              <button onClick={() => actions.invite(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
                <UserPlus size={14} /> Send booking invite
              </button>
            </>
          )}
          {b.stage === 'requested' && (
            <>
              <button onClick={() => actions.approve(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
                <CheckCircle2 size={14} /> {busy ? 'Working…' : 'Approve'}
              </button>
              <button onClick={() => actions.amend(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40">
                <CalendarDays size={14} /> Ask to amend date
              </button>
            </>
          )}
          {b.stage === 'invited' && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-md px-3 py-2.5 text-xs text-indigo-800">
              Portal invite sent{b.inviteSentAt ? ` ${format(new Date(b.inviteSentAt), 'dd MMM · h:mm a')}` : ''}. Waiting for the client to complete their details &amp; deposit in the portal.
              {resent ? (
                <div className="flex items-center gap-1.5 mt-2 text-green-700 font-semibold">
                  <CheckCircle2 size={13} /> Invite re-sent to {b.email}
                </div>
              ) : (
                <button disabled={busy}
                  onClick={async () => { await actions.invite(b); setResent(true); setTimeout(() => setResent(false), 6000) }}
                  className="block mt-2 underline disabled:opacity-50 disabled:no-underline">
                  {busy ? 'Resending…' : 'Resend invite'}
                </button>
              )}
            </div>
          )}
          {b.stage === 'awaiting_deposit' && (
            <>
              <div className="bg-orange-50 border border-orange-100 rounded-md px-3 py-2.5 text-xs text-orange-800">Deposit &amp; security invoices raised. The venue is secured once the deposit is paid.</div>
              <button onClick={() => actions.markPaid(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
                <DollarSign size={14} /> {busy ? 'Securing…' : 'Mark deposit paid → secure venue'}
              </button>
            </>
          )}
          {b.stage === 'confirmed' && (
            <>
              <div className="bg-green-50 border border-green-100 rounded-md px-3 py-2.5 text-xs text-green-800">Confirmed — venue secured and on the calendar (±30-min buffer). Balance due 14 days before the event.</div>
              {passed && <button onClick={() => actions.complete(b)} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50"><Check size={14} /> Mark event completed</button>}
            </>
          )}
          {b.stage === 'completed' && <RefundBox booking={b} onResolve={(r) => actions.resolveDeposit(b, r)} />}
          {b.stage === 'declined' && <div className="text-xs text-muted-foreground">This request was declined.</div>}

          {!['cancelled', 'refunded', 'declined'].includes(b.stage) && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => actions.decline(b)} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-100"><X size={12} /> Decline</button>
              <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-100"><Trash2 size={12} /> Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'enquiry', label: 'Enquiries' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function FunctionBookings() {
  const store = useOutletContext()
  const { deleteBooking, settings, bookings: calendarBookings, spaces } = store
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [filter, setFilter] = useState('active')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('function_bookings').select('data').order('updated_at', { ascending: false })
    setRows((data ?? []).map((r) => r.data).filter(Boolean))
    setLoading(false)
  }

  async function save(record) {
    const item = { ...record, updatedAt: nowIso() }
    await supabase.from('function_bookings').upsert({ id: item.id, data: item, updated_at: item.updatedAt })
    setRows((prev) => { const ex = prev.some((r) => r.id === item.id); return ex ? prev.map((r) => (r.id === item.id ? item : r)) : [item, ...prev] })
    if (selected?.id === item.id) setSelected(item)
    return item
  }

  async function handleFormSave(form) {
    let record
    if (form.id) {
      record = { ...form, stage: form.stage === 'enquiry' ? 'quoted' : form.stage }
    } else {
      record = {
        ...form, id: `fn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ref: `FN-${Math.floor(100000 + Math.random() * 900000)}`, source: 'admin', stage: 'quoted',
        createdAt: today(),
      }
    }
    const saved = await save(record)
    setShowForm(false); setEditData(null); setSelected(saved)
  }

  const apply = (rec) => { if (rec) { setRows((prev) => (prev.some((r) => r.id === rec.id) ? prev.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...prev])); if (selected?.id === rec.id) setSelected(rec) } return rec }

  const run = async (fn) => { setBusy(true); try { apply(await fn()) } finally { setBusy(false) } }
  const actions = {
    brochure: (b) => run(() => sendBrochure({ booking: b, settings })),
    invite: (b) => run(() => sendBookingInvite({ store, booking: b, settings })),
    approve: (b) => run(() => approveFunctionBooking({ store, booking: b, settings })),
    amend: (b) => run(() => askAmendDate({ booking: b, settings })),
    markPaid: (b) => run(() => confirmDepositPaid({ store, booking: b, findFunctionSpace })),
    complete: (b) => save({ ...b, stage: 'completed', completedAt: nowIso() }),
    async resolveDeposit(b, r) { apply(await resolveDeposit({ store, booking: b, ...r })) },
    async decline(b) {
      if (!confirm('Decline this booking? Any calendar hold will be released.')) return
      apply(await declineFunctionBooking({ store, booking: b }))
    },
    // Negotiated pricing: save the overrides, and — when the deposit invoice is
    // out but unpaid — void + re-raise it at the new amount and email the client.
    async adjustPricing(b, overrides, reissue) {
      setBusy(true)
      try {
        let rec = await updatePricing({ booking: b, overrides })
        if (reissue) rec = await reissueDeposit({ store, booking: rec })
        apply(rec)
      } catch (e) {
        alert(e.message)
      } finally { setBusy(false) }
    },
  }

  async function handleDelete(b) {
    if (!confirm('Delete this booking permanently?')) return
    const holds = b.calendarBookingIds ?? (b.calendarBookingId ? [b.calendarBookingId] : [])
    holds.forEach((id) => deleteBooking(id))
    await supabase.from('function_bookings').delete().eq('id', b.id)
    setRows((prev) => prev.filter((r) => r.id !== b.id))
    setSelected(null)
  }

  const filtered = rows.filter((b) => {
    if (filter === 'all') return true
    if (filter === 'active') return !['cancelled', 'refunded', 'completed', 'declined'].includes(b.stage)
    if (filter === 'enquiry') return ['enquiry', 'quoted', 'requested', 'invited', 'awaiting_deposit', 'pending_approval', 'signed'].includes(b.stage)
    return b.stage === filter
  })
  const pendingCount = rows.filter((b) => ['requested', 'awaiting_deposit', 'pending_approval'].includes(b.stage)).length

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-foreground">Function Space Bookings</h1>
          <button onClick={() => { setEditData(null); setShowForm(true) }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90"><Plus size={15} /> New Booking</button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Function hire — enquiries, digital agreements, deposits &amp; the calendar hold.{pendingCount > 0 && <span className="ml-2 text-amber-600 font-medium">{pendingCount} awaiting action</span>}</p>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTERS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)} className={`px-3 py-1 rounded-full text-xs font-semibold border ${filter === t.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-input hover:border-muted-foreground'}`}>{t.label}</button>
          ))}
          <button onClick={load} className="ml-auto p-1.5 text-muted-foreground hover:text-foreground" title="Refresh"><RefreshCw size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto border border-border rounded-lg bg-card">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">No bookings in this view.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase border-b border-border">
                <tr><th className="text-left px-4 py-2.5 font-medium">Event</th><th className="text-left px-4 py-2.5 font-medium">Client</th><th className="text-left px-4 py-2.5 font-medium">Date</th><th className="text-right px-4 py-2.5 font-medium">Total</th><th className="text-left px-4 py-2.5 font-medium">Stage</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const q = b.quote || computeQuote({ ...b, bookedOn: today() })
                  return (
                    <tr key={b.id} onClick={() => setSelected(b)} className={`border-b border-border/60 cursor-pointer hover:bg-muted/40 ${selected?.id === b.id ? 'bg-muted/60' : ''}`}>
                      <td className="px-4 py-3"><div className="font-medium text-foreground">{b.eventName || 'Function'}</div><div className="text-xs text-muted-foreground">{b.ref}</div></td>
                      <td className="px-4 py-3 text-foreground">{b.organisation || b.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{bookingSessions(b).length > 1 ? sessionsLabel(b) : fmtDate(b.eventDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{money(q.total)}</td>
                      <td className="px-4 py-3"><StageBadge stage={b.stage} /></td>
                      <td className="px-2"><ChevronRight size={14} className="text-muted-foreground" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && (
        <Detail booking={selected} onClose={() => setSelected(null)} onEdit={() => { setEditData(selected); setShowForm(true) }} onDelete={() => handleDelete(selected)} actions={actions} busy={busy}
          clash={seriesDateClashes(rows, selected)}
          calClash={seriesCalendarClashes(calendarBookings, findFunctionSpace(spaces)?.id, selected)} />
      )}
      {showForm && <BookingForm booking={editData} onSave={handleFormSave} onClose={() => { setShowForm(false); setEditData(null) }} />}
    </div>
  )
}
