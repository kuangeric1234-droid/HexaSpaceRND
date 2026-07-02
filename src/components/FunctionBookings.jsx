import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { format } from 'date-fns'
import {
  Plus, X, Send, Copy, Check, Pencil, Trash2, CheckCircle2,
  CalendarDays, Users, ChevronRight, RefreshCw, DollarSign,
} from 'lucide-react'
import {
  ADDONS, STAGES, money, computeQuote, bufferedWindow, balanceDueDate,
} from '../lib/functionBooking.js'
import { findFunctionSpace } from '../portal/functionSpace.js'

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
  return (
    <div className="text-foreground">
      {line(`Venue hire — ${q.hours} hrs @ ${money(q.rate)}/hr ${q.isWeekend ? '(weekend)' : '(weekday)'}`, q.rental)}
      {line('Cleaning fee', q.cleaning)}
      {q.staffApplies ? line(`F&B & AV staff (80+ pax) — ${q.hours} hrs`, q.staff) : null}
      {addonLines.map((a) => <div key={a.key}>{line(a.label, a.price)}</div>)}
      {q.lateFee ? line('Late booking surcharge', q.lateFee) : null}
      <div className="border-t border-border mt-1 pt-1">
        {line('GST (10%)', q.gst, 'text-muted-foreground')}
        {line('Total (inc GST)', q.total, 'font-bold')}
      </div>
      <div className="mt-3 bg-muted/50 border border-border rounded-md p-3">
        {line('Payable now — 50% deposit + $300 security', q.dueNow, 'font-semibold')}
        {line('Balance (14 days before event)', q.balanceDue, 'text-muted-foreground')}
      </div>
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
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setAddon = (k, v) => setF((p) => ({ ...p, addons: { ...p.addons, [k]: v } }))
  const quote = computeQuote({ ...f, bookedOn: today() })

  async function submit(e) {
    e.preventDefault()
    if (!f.name && !f.organisation) { alert('Enter a contact name or organisation.'); return }
    if (!f.email) { alert('Email is required.'); return }
    if (!f.eventDate || !f.startTime || !f.endTime) { alert('Event date and times are required.'); return }
    setSaving(true)
    try { await onSave({ ...f, quote }) } finally { setSaving(false) }
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
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lab}>Date</label><input type="date" className={inp} value={f.eventDate} onChange={(e) => set('eventDate', e.target.value)} required /></div>
              <div><label className={lab}>From</label><input type="time" className={inp} value={f.startTime} onChange={(e) => set('startTime', e.target.value)} required /></div>
              <div><label className={lab}>To</label><input type="time" className={inp} value={f.endTime} onChange={(e) => set('endTime', e.target.value)} required /></div>
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
function Detail({ booking, onClose, onEdit, onDelete, actions, busy, copied, onCopyLink }) {
  const b = booking
  const passed = b.eventDate && b.eventDate < today()
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
          <div><dt className="text-xs text-muted-foreground uppercase">Date</dt><dd className="text-foreground flex items-center gap-1"><CalendarDays size={12} />{fmtDate(b.eventDate)}</dd></div>
          <div><dt className="text-xs text-muted-foreground uppercase">Time</dt><dd className="text-foreground">{b.startTime}–{b.endTime}</dd></div>
          <div><dt className="text-xs text-muted-foreground uppercase">Guests</dt><dd className="text-foreground flex items-center gap-1"><Users size={12} />{b.guests || '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground uppercase">Source</dt><dd className="text-foreground capitalize">{b.source || '—'}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted-foreground uppercase">Contact</dt><dd className="text-foreground">{b.email}{b.phone ? ` · ${b.phone}` : ''}</dd></div>
        </dl>

        {b.eventDate && <p className="text-xs text-muted-foreground">Calendar hold reserves {bufferedWindow(b.startTime, b.endTime).blockStart}–{bufferedWindow(b.startTime, b.endTime).blockEnd} (incl. 30-min buffer each side).</p>}

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quote</h3>
          <QuoteBreakdown booking={b} />
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

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {['enquiry', 'quoted', 'agreement_sent'].includes(b.stage) && (
            <button onClick={() => actions.sendAgreement(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
              <Send size={14} /> {busy ? 'Sending…' : b.stage === 'agreement_sent' ? 'Resend Agreement' : 'Send Agreement to Sign'}
            </button>
          )}
          {b.signingToken && !['cancelled'].includes(b.stage) && (
            <button onClick={() => onCopyLink(b)} className="w-full flex items-center justify-center gap-2 border border-input py-2 rounded-md text-xs hover:bg-muted/50 text-muted-foreground">
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />} {copied ? 'Copied!' : 'Copy signing link'}
            </button>
          )}
          {b.stage === 'pending_approval' && (
            <button onClick={() => actions.confirm(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
              <CheckCircle2 size={14} /> {busy ? 'Confirming…' : 'Approve & Confirm Booking'}
            </button>
          )}
          {b.stage === 'signed' && (
            <button onClick={() => actions.confirm(b)} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
              <CheckCircle2 size={14} /> {busy ? 'Confirming…' : 'Confirm & Raise Invoices'}
            </button>
          )}
          {b.stage === 'confirmed' && (
            <>
              <button onClick={() => actions.toggleDepositPaid(b)} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">
                <DollarSign size={14} /> Mark deposit {b.depositPaid ? 'unpaid' : 'paid'}
              </button>
              {passed && <button onClick={() => actions.complete(b)} className="w-full flex items-center justify-center gap-2 border border-input py-2.5 rounded-md text-sm font-medium hover:bg-muted/50"><Check size={14} /> Mark event completed</button>}
            </>
          )}
          {b.stage === 'completed' && <RefundBox booking={b} onResolve={(r) => actions.resolveDeposit(b, r)} />}

          {!['cancelled', 'refunded'].includes(b.stage) && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => actions.cancel(b)} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-100"><X size={12} /> Cancel</button>
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
  const { addInvoice, addBooking, updateBooking, deleteBooking, spaces } = store
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

  const actions = {
    async sendAgreement(b) {
      setBusy(true)
      try {
        const token = b.signingToken || randToken()
        const quote = computeQuote({ ...b, bookedOn: today() })
        const updated = await save({ ...b, signingToken: token, quote, stage: 'agreement_sent', agreementSentAt: nowIso() })
        const signUrl = `${window.location.origin}/book/function/${token}`
        await fetch('/api/function-bookings/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking: updated, signUrl, mode: 'agreement' }) }).catch(() => {})
      } finally { setBusy(false) }
    },
    async confirm(b) {
      setBusy(true)
      try {
        const q = computeQuote({ ...b, bookedOn: today() })
        const fn = findFunctionSpace(spaces)
        const clientName = b.organisation || b.name || 'Function client'
        const tenantId = b.companyId || null
        const base = { tenantId, source: 'function', status: 'pending', sentStatus: 'not_sent', functionRef: b.ref, clientName, clientEmail: b.email, issueDate: today() }
        // 50% venue-hire deposit (GST)
        addInvoice({ ...base, invoiceType: 'function_deposit', dueDate: today(), vatEnabled: true,
          lineItems: [{ description: `Function venue hire — 50% deposit · ${b.eventName || 'Function'} (${b.eventDate})`, revenueAccount: 'Function Space Hire', unitPrice: q.rentalDeposit, qty: 1, discountPct: 0 }] })
        // Refundable security deposit (no GST)
        addInvoice({ ...base, invoiceType: 'deposit', dueDate: today(), vatEnabled: false,
          lineItems: [{ description: `Refundable security deposit · ${b.eventName || 'Function'}`, revenueAccount: 'Security Deposit', unitPrice: q.securityDeposit, qty: 1, discountPct: 0 }] })
        // Balance (remaining 50% + cleaning + addons + late fee), due 14 days before event
        const lines = [
          { description: `Function venue hire — balance (50%) · ${b.eventDate}`, revenueAccount: 'Function Space Hire', unitPrice: q.rentalBalance, qty: 1, discountPct: 0 },
          { description: 'Cleaning fee', revenueAccount: 'Function Space Hire', unitPrice: q.cleaning, qty: 1, discountPct: 0 },
        ]
        if (q.staff) lines.push({ description: `F&B & AV staff — ${q.hours} hrs @ $40/hr`, revenueAccount: 'Function Space Hire', unitPrice: q.staff, qty: 1, discountPct: 0 })
        ADDONS.forEach((a) => { if (b.addons?.[a.key]) lines.push({ description: a.label, revenueAccount: 'Function Space Hire', unitPrice: a.price, qty: 1, discountPct: 0 }) })
        if (q.lateFee) lines.push({ description: 'Late booking surcharge', revenueAccount: 'Function Space Hire', unitPrice: q.lateFee, qty: 1, discountPct: 0 })
        addInvoice({ ...base, invoiceType: 'function_balance', dueDate: balanceDueDate(b.eventDate) || today(), vatEnabled: true, lineItems: lines })

        // Calendar hold with ±30-min buffer
        let calendarBookingId = b.calendarBookingId
        if (fn && b.eventDate && !calendarBookingId) {
          const { blockStart, blockEnd } = bufferedWindow(b.startTime, b.endTime)
          const item = addBooking({
            type: 'function', resourceId: fn.id, date: b.eventDate, startTime: blockStart, endTime: blockEnd,
            title: `${b.eventName || 'Function'} (incl. buffer)`, eventType: b.eventType, guests: Number(b.guests) || null,
            status: 'Confirmed', approval: 'approved', source: 'Function Bookings', functionRef: b.ref, repeat: 'none', createdBy: 'Admin',
          })
          calendarBookingId = item?.id
        }
        const updated = await save({ ...b, stage: 'confirmed', confirmedAt: nowIso(), quote: q, calendarBookingId, depositPaid: false })
        await fetch('/api/function-bookings/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking: updated, mode: 'confirmed' }) }).catch(() => {})
      } finally { setBusy(false) }
    },
    toggleDepositPaid(b) { save({ ...b, depositPaid: !b.depositPaid }) },
    complete(b) { save({ ...b, stage: 'completed', completedAt: nowIso() }) },
    resolveDeposit(b, { damage, refund, overflow, notes }) {
      const clientName = b.organisation || b.name || 'Function client'
      const tenantId = b.companyId || null
      if (refund > 0) addInvoice({ tenantId, source: 'function', invoiceType: 'bond_refund', status: 'pending', sentStatus: 'not_sent', functionRef: b.ref, clientName, clientEmail: b.email, issueDate: today(), dueDate: today(), vatEnabled: false, lineItems: [{ description: `Security deposit refund · ${b.eventName || 'Function'}`, revenueAccount: 'Security Deposit', unitPrice: -refund, qty: 1, discountPct: 0 }] })
      if (overflow > 0) addInvoice({ tenantId, source: 'function', invoiceType: 'function_damage', status: 'pending', sentStatus: 'not_sent', functionRef: b.ref, clientName, clientEmail: b.email, issueDate: today(), dueDate: today(), vatEnabled: true, lineItems: [{ description: `Damage / excess cleaning · ${b.eventName || 'Function'} — ${notes || ''}`, revenueAccount: 'Function Space Hire', unitPrice: overflow, qty: 1, discountPct: 0 }] })
      return save({ ...b, stage: 'refunded', refundedAt: nowIso(), refundAmount: refund, damageAmount: damage, damageNotes: notes, securityStatus: damage >= 300 ? 'withheld' : damage > 0 ? 'partial' : 'refunded' })
    },
    cancel(b) {
      if (!confirm('Cancel this function booking? Any calendar hold will be released.')) return
      if (b.calendarBookingId) deleteBooking(b.calendarBookingId)
      save({ ...b, stage: 'cancelled', calendarBookingId: null })
    },
  }

  async function handleDelete(b) {
    if (!confirm('Delete this booking permanently?')) return
    if (b.calendarBookingId) deleteBooking(b.calendarBookingId)
    await supabase.from('function_bookings').delete().eq('id', b.id)
    setRows((prev) => prev.filter((r) => r.id !== b.id))
    setSelected(null)
  }

  function copyLink(b) {
    navigator.clipboard.writeText(`${window.location.origin}/book/function/${b.signingToken}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const filtered = rows.filter((b) => {
    if (filter === 'all') return true
    if (filter === 'active') return !['cancelled', 'refunded', 'completed'].includes(b.stage)
    if (filter === 'enquiry') return ['enquiry', 'quoted', 'agreement_sent'].includes(b.stage)
    return b.stage === filter
  })
  const pendingCount = rows.filter((b) => ['signed', 'pending_approval'].includes(b.stage)).length

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
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.eventDate)}</td>
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
        <Detail booking={selected} onClose={() => setSelected(null)} onEdit={() => { setEditData(selected); setShowForm(true) }} onDelete={() => handleDelete(selected)} actions={actions} busy={busy} copied={copied} onCopyLink={copyLink} />
      )}
      {showForm && <BookingForm booking={editData} onSave={handleFormSave} onClose={() => { setShowForm(false); setEditData(null) }} />}
    </div>
  )
}
