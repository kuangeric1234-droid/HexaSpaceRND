import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { format, parseISO } from 'date-fns'
import {
  Plus, ChevronRight, X, Send, Copy, Check,
  Pencil, Trash2, CheckCircle, ClipboardList, MapPin, Bell, Mail,
  Download, FileText, Settings, Users,
} from 'lucide-react'
import SignatureCanvas from './SignatureCanvas.jsx'
import { generateAgreementPdf } from '../lib/generateAgreementPdf.js'

// ── June 7 event constants ────────────────────────────────────────────────────
const EVENT = {
  name: 'Found Underground',
  date: '2026-06-07',
  venue: 'The Hub, 18 Logistic Court, Huntingdale VIC 3166',
  bumpInTime: '11:00',
  startTime: '15:00',
  finishTime: '21:00',
  bumpOutTime: '22:00',
}

const STATUS = {
  draft:              { label: 'Draft',              cls: 'bg-gray-100 text-gray-600' },
  sent:               { label: 'Docs Sent',          cls: 'bg-blue-100 text-blue-700' },
  signed:             { label: 'Signed',             cls: 'bg-yellow-100 text-yellow-700' },
  insurance_pending:  { label: 'Insurance Pending',  cls: 'bg-orange-100 text-orange-700' },
  insurance_received: { label: 'Complete',           cls: 'bg-green-100 text-green-700' },
  cancelled:          { label: 'Cancelled',          cls: 'bg-red-100 text-red-600' },
}

const VENDOR_TYPES = [
  'Food & Beverage',
  'Products / Retail',
  'Brand Activation',
  'Car Display',
  'Services',
  'Sponsor',
  'Other',
]

function StatusBadge({ status }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
}

function Field({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}

// ── Inline space editor ───────────────────────────────────────────────────────

function SpaceEditor({ booking, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(booking.allocatedSpace || '')
  const [saving, setSaving] = useState(false)

  const current = booking.allocatedSpace || null

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const updated = { ...booking, allocatedSpace: value.trim(), spaceAssignedAt: now, updatedAt: now }
      await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
      onUpdate(updated)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          className="flex-1 border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="e.g. Stall 3, Space B, Zone A"
        />
        <button onClick={handleSave} disabled={saving || !value.trim()} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold hover:bg-primary/90 disabled:opacity-40">
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => { setEditing(false); setValue(booking.allocatedSpace || '') }} className="text-muted-foreground hover:text-foreground p-1">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 flex items-center gap-1.5 text-sm ${current ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        <MapPin size={12} className="shrink-0 text-muted-foreground" />
        {current || 'TBA — not yet assigned'}
      </div>
      <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">
        {current ? 'Change' : 'Assign'}
      </button>
    </div>
  )
}

// ── Licensor signature modal ─────────────────────────────────────────────────

function LicensorSignatureModal({ current, onSave, onClose }) {
  const sigRef = useRef(null)
  const [name, setName] = useState(current?.signerName || '')
  const [title, setTitle] = useState(current?.signerTitle || '')
  const [saving, setSaving] = useState(false)
  const [cleared, setCleared] = useState(false)

  async function handleSave() {
    if (!name.trim()) { alert('Enter the licensor name.'); return }
    const isNew = !current?.signatureData || !sigRef.current?.isEmpty() || cleared
    const signatureData = !sigRef.current?.isEmpty()
      ? sigRef.current.toDataURL()
      : (current?.signatureData ?? null)
    if (!signatureData) { alert('Please draw the licensor signature.'); return }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const data = {
        id: 'hexaspace_licensor_sig',
        type: 'admin_config',
        signatureData,
        signerName: name.trim(),
        signerTitle: title.trim(),
        updatedAt: now,
      }
      await supabase.from('event_bookings').upsert({ id: 'hexaspace_licensor_sig', data, updated_at: now })
      onSave(data)
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const lab = 'block text-xs font-medium text-muted-foreground mb-1'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">Licensor Signature</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Applied to all vendor signing certificates</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div><label className={lab}>Name *</label><input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></div>
          <div><label className={lab}>Title</label><input className={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Director, Hexa Space Pty Ltd" /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={lab} style={{ marginBottom: 0 }}>Signature</label>
              <button
                onClick={() => { sigRef.current?.clear(); setCleared(true) }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >Clear</button>
            </div>
            {current?.signatureData && !cleared && (
              <div className="mb-2 border border-border rounded-md p-2 bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Current signature — draw below to replace</p>
                <img src={current.signatureData} alt="Current signature" className="h-12 object-contain" />
              </div>
            )}
            <SignatureCanvas ref={sigRef} height={100} />
            <p className="text-xs text-muted-foreground mt-1">Draw using mouse or finger. Leave blank to keep existing.</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <button onClick={onClose} className="flex-1 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Countersign modal ─────────────────────────────────────────────────────────

function CountersignModal({ booking, adminSigDefault, onDone, onClose }) {
  const sigRef = useRef(null)
  const [name, setName] = useState(adminSigDefault?.signerName || '')
  const [title, setTitle] = useState(adminSigDefault?.signerTitle || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('') // '', 'generating', 'uploading', 'emailing'

  async function handleComplete() {
    if (!name.trim()) { alert('Enter your name.'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw your signature.'); return }
    setSaving(true)
    try {
      const signatureData = sigRef.current.toDataURL()
      const now = new Date().toISOString()
      const licensorSig = { signatureData, signerName: name.trim(), signerTitle: title.trim() }

      let updated = {
        ...booking,
        status: 'insurance_received',
        insuranceReceivedAt: now,
        licensorSignatureData: signatureData,
        licensorSignerName: name.trim(),
        licensorSignerTitle: title.trim(),
        licensorSignedAt: now,
        updatedAt: now,
      }

      // Generate + upload PDF
      setStatus('generating')
      const pdfBlob = generateAgreementPdf(updated, licensorSig)
      const pdfPath = `agreements/${booking.id}.pdf`
      setStatus('uploading')
      const { error: uploadError } = await supabase.storage
        .from('event-insurance')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('event-insurance').getPublicUrl(pdfPath)
        updated = { ...updated, agreementPdfUrl: publicUrl }
      } else {
        alert(`PDF upload failed: ${uploadError.message}`)
      }

      await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })

      // Email vendor the fully executed agreement
      if (updated.agreementPdfUrl && updated.vendorEmail) {
        setStatus('emailing')
        await fetch('/api/event-bookings/send-signing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking: updated, mode: 'executed_agreement' }),
        }).catch(() => {})
      }

      onDone(updated)
    } catch (err) {
      console.error(err)
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
      setStatus('')
    }
  }

  const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const lab = 'block text-xs font-medium text-muted-foreground mb-1'

  const statusLabel = status === 'generating' ? 'Generating PDF…'
    : status === 'uploading' ? 'Uploading PDF…'
    : status === 'emailing' ? 'Emailing vendor…'
    : 'Countersigning…'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-foreground">Countersign &amp; Complete</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{booking.vendorBusiness || booking.vendorName} · {booking.ref}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={18} /></button>
        </div>

        {saving ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 gap-4">
            <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">{statusLabel}</p>
            <p className="text-xs text-muted-foreground">Generating PDF &amp; emailing vendor their executed copy</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="bg-green-50 border border-green-100 rounded-md px-4 py-3 text-xs text-green-800">
                <strong>Ready to finalise.</strong> Your countersignature will be added to the agreement,
                a fully executed PDF will be generated, and {booking.vendorName} will be emailed their copy automatically.
              </div>
              <div><label className={lab}>Your Name *</label><input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></div>
              <div><label className={lab}>Title</label><input className={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Director, Hexa Space Pty Ltd" /></div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={lab} style={{ marginBottom: 0 }}>Signature *</label>
                  <button onClick={() => sigRef.current?.clear()} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
                </div>
                <SignatureCanvas ref={sigRef} height={110} />
                <p className="text-xs text-muted-foreground mt-1">Draw using mouse or finger</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
              <button onClick={onClose} className="flex-1 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">Cancel</button>
              <button onClick={handleComplete} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90">
                Countersign &amp; Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function VendorDetail({
  booking, onClose, onEdit, onDelete,
  onSendForSigning, onCountersignAndComplete, onMarkCompleteDirectly, onCopyLink,
  onSendReminder, onSendInsuranceReminder, onRegeneratePdf,
  sending, copied, onUpdate,
}) {
  const [notifying, setNotifying] = useState(false)
  const [notified, setNotified] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [reminded, setReminded] = useState(false)
  const [insuranceReminding, setInsuranceReminding] = useState(false)
  const [insuranceReminded, setInsuranceReminded] = useState(false)
  const [regenPdf, setRegenPdf] = useState(false)
  const [pdfOk, setPdfOk] = useState(null) // null=checking, true=exists, false=missing

  // Verify the stored PDF URL actually resolves (could be stale if bucket wasn't ready)
  useEffect(() => {
    if (!booking.agreementPdfUrl) { setPdfOk(false); return }
    setPdfOk(null)
    fetch(booking.agreementPdfUrl, { method: 'HEAD' })
      .then(r => setPdfOk(r.ok))
      .catch(() => setPdfOk(false))
  }, [booking.agreementPdfUrl])

  async function notifySpace() {
    setNotifying(true)
    try {
      const now = new Date().toISOString()
      const logEntry = { type: 'space_assigned', label: `Space notification sent — ${booking.allocatedSpace}`, sentAt: now }
      const emailLog = [...(booking.emailLog || []), logEntry]
      const updated = { ...booking, updatedAt: now, emailLog }
      await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
      await fetch('/api/event-bookings/send-signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, mode: 'space_assigned' }),
      })
      onUpdate(updated)
      setNotified(true)
      setTimeout(() => setNotified(false), 3000)
    } finally {
      setNotifying(false)
    }
  }

  async function handleReminder() {
    setReminding(true)
    try {
      await onSendReminder(booking)
      setReminded(true)
      setTimeout(() => setReminded(false), 3000)
    } finally {
      setReminding(false)
    }
  }

  async function handleInsuranceReminder() {
    setInsuranceReminding(true)
    try {
      await onSendInsuranceReminder(booking)
      setInsuranceReminded(true)
      setTimeout(() => setInsuranceReminded(false), 3000)
    } finally {
      setInsuranceReminding(false)
    }
  }
  async function markCancelled() {
    if (!confirm('Cancel this vendor? This cannot be undone.')) return
    const now = new Date().toISOString()
    const updated = { ...booking, status: 'cancelled', updatedAt: now }
    await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
    onUpdate(updated)
  }

  const canSend = booking.status === 'draft' && booking.vendorEmail
  const isSent = booking.status === 'sent'
  const isSigned = ['signed', 'insurance_pending'].includes(booking.status)
  const isComplete = booking.status === 'insurance_received'
  const isCancelled = booking.status === 'cancelled'

  const statusOrder = ['draft', 'sent', 'signed', 'insurance_received']
  const effectiveStatus = booking.status === 'insurance_pending' ? 'signed' : booking.status
  const currentIdx = statusOrder.indexOf(effectiveStatus)

  return (
    <div className="w-full md:w-[400px] border-l border-border bg-card flex flex-col h-full shrink-0">
      <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{booking.ref}</span>
            <StatusBadge status={booking.status} />
          </div>
          <div className="text-base font-bold text-foreground">{booking.vendorName || 'Unnamed Vendor'}</div>
          {booking.vendorBusiness && <div className="text-sm text-muted-foreground">{booking.vendorBusiness}</div>}
          {booking.vendorType && <div className="text-xs text-muted-foreground mt-0.5">{booking.vendorType}</div>}
        </div>
        <div className="flex items-center gap-1">
          {!isCancelled && !isComplete && (
            <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
              <Pencil size={13} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-3 border-b border-border bg-muted/50 shrink-0">
        <div className="flex items-center gap-0.5 text-xs">
          {[
            { label: 'Added' },
            { label: 'Sent' },
            { label: 'Signed' },
            { label: 'Complete' },
          ].map((step, i) => {
            const done = currentIdx >= i
            return (
              <div key={i} className="flex items-center gap-0.5 flex-1 min-w-0">
                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {done ? <Check size={9} /> : <span className="text-[10px]">{i + 1}</span>}
                </div>
                <span className={`truncate ${done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
                {i < 3 && <div className={`flex-1 h-px mx-0.5 ${done ? 'bg-muted-foreground' : 'bg-muted'}`} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Allocated space — always visible, inline editable */}
      <div className="px-5 py-3 border-b border-border shrink-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Allocated Space</div>
        <SpaceEditor booking={booking} onUpdate={onUpdate} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Actions */}
        <div className="space-y-2">
          {canSend && (
            <button
              onClick={onSendForSigning}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40"
            >
              <Send size={14} />
              {sending ? 'Sending…' : 'Send Vendor Agreement'}
            </button>
          )}
          {booking.status === 'draft' && !booking.vendorEmail && (
            <div className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded px-3 py-2">
              Add vendor email to send documents.
            </div>
          )}

          {/* Notify vendor of their space once allocated */}
          {booking.allocatedSpace && booking.vendorEmail && !isCancelled && (
            <button
              onClick={notifySpace}
              disabled={notifying}
              className="w-full flex items-center justify-center gap-2 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
            >
              {notified
                ? <><Check size={14} className="text-green-500" /> Vendor Notified!</>
                : <><Bell size={14} /> {notifying ? 'Sending…' : `Notify Vendor — ${booking.allocatedSpace}`}</>
              }
            </button>
          )}
          {isSent && (
            <div className="space-y-2">
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2.5 text-xs text-blue-700">
                Agreement sent {booking.sentAt ? format(parseISO(booking.sentAt), 'dd MMM, h:mm a') : ''}. Awaiting vendor signature.
              </div>
              <button
                onClick={handleReminder}
                disabled={reminding}
                className="w-full flex items-center justify-center gap-2 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40"
              >
                {reminded
                  ? <><Check size={14} className="text-green-500" /> Reminder Sent!</>
                  : <><Mail size={14} /> {reminding ? 'Sending…' : 'Resend Agreement Reminder'}</>
                }
              </button>
            </div>
          )}
          {isSigned && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-md px-3 py-2.5 space-y-1">
              <div className="text-xs font-semibold text-yellow-800">Signed ✓</div>
              {booking.signedAt && (
                <div className="text-xs text-yellow-700">
                  By {booking.signerName}{booking.signerTitle ? ` (${booking.signerTitle})` : ''} · {format(parseISO(booking.signedAt), 'dd MMM yyyy')}
                </div>
              )}
              {booking.status === 'insurance_pending' && (
                <div className="text-xs text-orange-600 font-medium">Insurance certificate not yet received</div>
              )}
            </div>
          )}
          {isSigned && (
            <>
              {booking.insuranceUrl ? (
                <>
                  <a
                    href={booking.insuranceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 border border-input text-foreground py-2.5 rounded-md text-sm hover:bg-muted/50 font-medium"
                  >
                    <CheckCircle size={14} className="text-green-500" />
                    View Certificate — {booking.insuranceFileName || 'Certificate of Currency'}
                  </a>
                  {/* Insurance is in — countersign is now the right action */}
                  <button
                    onClick={onCountersignAndComplete}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90"
                  >
                    <Pencil size={14} /> Countersign &amp; Send Agreement
                  </button>
                  <button
                    onClick={onMarkCompleteDirectly}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
                  >
                    Mark complete without signing →
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded px-3 py-2">
                      Waiting for insurance certificate (upload or email).
                    </div>
                    {booking.vendorEmail && (
                      <button
                        onClick={handleInsuranceReminder}
                        disabled={insuranceReminding}
                        className="w-full flex items-center justify-center gap-2 border border-orange-200 text-orange-700 py-2.5 rounded-md text-sm font-medium hover:bg-orange-50 disabled:opacity-40"
                      >
                        {insuranceReminded
                          ? <><Check size={14} className="text-green-500" /> Reminder Sent!</>
                          : <><Bell size={14} /> {insuranceReminding ? 'Sending…' : 'Send Insurance Reminder'}</>
                        }
                      </button>
                    )}
                  </div>
                  {/* Allow countersign even before insurance if needed */}
                  <button
                    onClick={onCountersignAndComplete}
                    className="w-full flex items-center justify-center gap-2 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50"
                  >
                    <Pencil size={14} /> Countersign &amp; Send Agreement
                  </button>
                  <button
                    onClick={onMarkCompleteDirectly}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
                  >
                    Mark complete without signing →
                  </button>
                </>
              )}
            </>
          )}
          {isComplete && (
            <div className="space-y-2">
              {booking.licensorSignatureData ? (
                <div className="bg-green-50 border border-green-100 rounded-md px-3 py-2.5 space-y-0.5">
                  <div className="text-xs font-semibold text-green-800">✓ Fully executed</div>
                  <div className="text-xs text-green-700">
                    Countersigned by {booking.licensorSignerName}{booking.licensorSignerTitle ? ` — ${booking.licensorSignerTitle}` : ''}
                    {booking.licensorSignedAt ? ` · ${format(parseISO(booking.licensorSignedAt), 'dd MMM yyyy')}` : ''}
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-md px-3 py-2.5 text-xs text-yellow-800">
                    Insurance confirmed — ready for your countersignature.
                  </div>
                  <button
                    onClick={onCountersignAndComplete}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90"
                  >
                    <Pencil size={14} /> Countersign &amp; Send Agreement
                  </button>
                </>
              )}
              {booking.insuranceUrl && (
                <a
                  href={booking.insuranceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 border border-input text-muted-foreground py-2 rounded-md text-xs hover:bg-muted/50"
                >
                  View Insurance Certificate
                </a>
              )}
            </div>
          )}
          {/* Signed agreement PDF */}
          {(isSigned || isComplete) && (
            <div className="space-y-1.5">
              {pdfOk === true && (
                <a
                  href={booking.agreementPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 border border-input text-foreground py-2.5 rounded-md text-sm hover:bg-muted/50 font-medium"
                >
                  <Download size={14} /> Download Signed Agreement
                </a>
              )}
              <button
                onClick={async () => {
                  setRegenPdf(true)
                  try { await onRegeneratePdf(booking); setPdfOk(true) } finally { setRegenPdf(false) }
                }}
                disabled={regenPdf}
                className="w-full flex items-center justify-center gap-2 border border-input text-muted-foreground py-2 rounded-md text-xs hover:bg-muted/50 disabled:opacity-40"
              >
                <FileText size={12} />
                {regenPdf ? 'Generating…' : pdfOk ? 'Regenerate PDF' : 'Generate Signed PDF'}
              </button>
            </div>
          )}

          {booking.signingToken && !isCancelled && (
            <button
              onClick={onCopyLink}
              className="w-full flex items-center justify-center gap-2 border border-input text-muted-foreground py-2 rounded-md text-xs hover:bg-muted/50"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy Signing Link'}
            </button>
          )}
        </div>

        <hr className="border-border" />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Vendor Details</h3>
          <dl className="space-y-3">
            <Field label="Contact Name" value={booking.vendorName} />
            <Field label="Business" value={booking.vendorBusiness} />
            <Field label="ABN" value={booking.vendorAbn} />
            <Field label="Email" value={booking.vendorEmail} />
            <Field label="Phone" value={booking.vendorPhone} />
            {booking.instagramHandle && (
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Instagram</dt>
                <dd className="text-sm text-foreground">
                  <a href={`https://instagram.com/${booking.instagramHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    @{booking.instagramHandle.replace(/^@/, '')}
                  </a>
                </dd>
              </div>
            )}
            <Field label="Vendor Type" value={booking.vendorType} />
            <Field label="Description" value={booking.vendorDescription} />
            <Field label="Car(s) Bringing" value={booking.carDetails} />
          </dl>
        </div>

        <hr className="border-border" />

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Event Details</h3>
          <dl className="space-y-2">
            <Field label="Event" value={EVENT.name} />
            <Field label="Date" value="Sunday 7 June 2026" />
            <Field label="Venue" value={EVENT.venue} />
          </dl>
        </div>

        {(booking.participationFee || booking.bond || booking.specialConditions) && (
          <>
            <hr className="border-border" />
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Terms</h3>
              <dl className="space-y-3">
                <Field label="Participation Fee" value={booking.participationFee ? `$${Number(booking.participationFee).toLocaleString()}` : 'Nil — by invitation'} />
                <Field label="Bond" value={booking.bond ? `$${Number(booking.bond).toLocaleString()}` : null} />
                <Field label="Special Conditions" value={booking.specialConditions} />
              </dl>
            </div>
          </>
        )}

        {/* Activity Log */}
        {(booking.emailLog?.length > 0 || booking.sentAt) && (
          <>
            <hr className="border-border" />
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Activity Log</h3>
              <div className="space-y-2.5">
                {/* Show initial sentAt as first entry if emailLog is empty (legacy bookings) */}
                {(!booking.emailLog || booking.emailLog.length === 0) && booking.sentAt && (
                  <div className="flex items-start gap-2.5 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <div>
                      <span className="text-foreground font-medium">Agreement sent</span>
                      <span className="text-muted-foreground ml-1.5">{format(parseISO(booking.sentAt), 'dd MMM yyyy, h:mm a')}</span>
                    </div>
                  </div>
                )}
                {(booking.emailLog || []).map((entry, i) => {
                  const dotColor =
                    entry.type === 'signing_sent' ? 'bg-blue-400' :
                    entry.type === 'signing_reminder' ? 'bg-blue-300' :
                    entry.type === 'space_assigned' ? 'bg-purple-400' :
                    entry.type === 'insurance_reminder' ? 'bg-orange-400' :
                    'bg-gray-300'
                  return (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                      <div>
                        <span className="text-foreground font-medium">{entry.label}</span>
                        <span className="text-muted-foreground ml-1.5">{format(parseISO(entry.sentAt), 'dd MMM yyyy, h:mm a')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {!isCancelled && !isComplete && (
          <div className="flex gap-2 pt-1">
            {booking.status === 'draft' && (
              <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-100 hover:border-red-200">
                <Trash2 size={12} /> Delete
              </button>
            )}
            {!['draft', 'cancelled', 'insurance_received'].includes(booking.status) && (
              <button onClick={markCancelled} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-100 hover:border-red-200">
                <X size={12} /> Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vendor form ───────────────────────────────────────────────────────────────

const BLANK = {
  vendorName: '', vendorBusiness: '', vendorEmail: '', vendorPhone: '', vendorAbn: '',
  vendorType: VENDOR_TYPES[0], vendorDescription: '', allocatedSpace: '',
  participationFee: '', bond: '', specialConditions: '',
}

function VendorForm({ booking, onSave, onClose }) {
  const [form, setForm] = useState(booking ? { ...BLANK, ...booking } : { ...BLANK })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.vendorEmail) { alert('Email is required.'); return }
    if (!form.vendorName) { alert('Name is required.'); return }
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const lab = 'block text-xs font-medium text-muted-foreground mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end">
      <div className="w-full max-w-md bg-card h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-foreground">{booking?.id ? 'Edit Booking' : 'Add Booking'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Lonsdale 369 Pop-up</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Required — admin fills these */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact Details</h3>
            <p className="text-xs text-muted-foreground mb-3">Only name and email are required. The vendor will fill in their business details when they open the signing link.</p>
            <div className="space-y-3">
              <div><label className={lab}>Name *</label><input className={inp} value={form.vendorName} onChange={e => set('vendorName', e.target.value)} placeholder="First and last name" required /></div>
              <div><label className={lab}>Email *</label><input type="email" className={inp} value={form.vendorEmail} onChange={e => set('vendorEmail', e.target.value)} required /></div>
              <div><label className={lab}>Phone <span className="text-gray-300">(optional)</span></label><input className={inp} value={form.vendorPhone} onChange={e => set('vendorPhone', e.target.value)} /></div>
            </div>
          </section>

          {/* Optional — admin can pre-fill if known */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Pre-fill (optional)</h3>
            <p className="text-xs text-muted-foreground mb-3">If you already know these, add them. Otherwise the vendor fills them in themselves.</p>
            <div className="space-y-3">
              <div><label className={lab}>Business / Trading Name</label><input className={inp} value={form.vendorBusiness} onChange={e => set('vendorBusiness', e.target.value)} /></div>
              <div><label className={lab}>ABN</label><input className={inp} value={form.vendorAbn} onChange={e => set('vendorAbn', e.target.value)} placeholder="00 000 000 000" /></div>
              <div>
                <label className={lab}>Vendor Type</label>
                <select className={inp} value={form.vendorType} onChange={e => set('vendorType', e.target.value)}>
                  <option value="">— vendor will select —</option>
                  {VENDOR_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={lab}>Allocated Space / Stall</label><input className={inp} value={form.allocatedSpace} onChange={e => set('allocatedSpace', e.target.value)} placeholder="e.g. Stall 3, Space B" /></div>
            </div>
          </section>

          {/* Internal notes */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Terms (optional)</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lab}>Fee $</label><input type="number" className={inp} value={form.participationFee} onChange={e => set('participationFee', e.target.value)} min={0} step={50} placeholder="Nil" /></div>
                <div><label className={lab}>Bond $</label><input type="number" className={inp} value={form.bond} onChange={e => set('bond', e.target.value)} min={0} step={50} placeholder="Nil" /></div>
              </div>
              <div><label className={lab}>Special Conditions</label><textarea className={inp} rows={2} value={form.specialConditions} onChange={e => set('specialConditions', e.target.value)} /></div>
            </div>
          </section>
        </form>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
            {saving ? 'Saving…' : booking?.id ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Send Docs modal ───────────────────────────────────────────────────────────

const EVENT_DOCS_FILES = [
  { key: 'rundown', label: 'Event Rundown', note: '.docx' },
  { key: 'map',     label: 'Vendor Map',    note: '.pdf'  },
]

function SendDocsModal({ bookings, onClose }) {
  const defaultEnabled = new Set(['sent', 'signed', 'insurance_pending', 'insurance_received'])
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null) // null | { sent, failed }

  function toggleStatus(key) {
    setEnabled(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const recipients = bookings.filter(b => b.vendorEmail && enabled.has(b.status))

  async function handleSend() {
    if (recipients.length === 0) return
    if (!confirm(`Send event documents to ${recipients.length} vendor${recipients.length === 1 ? '' : 's'}?`)) return
    setSending(true)
    let sent = 0, failed = 0
    for (const booking of recipients) {
      try {
        const res = await fetch('/api/event-bookings/send-signing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking, mode: 'event_docs' }),
        })
        res.ok ? sent++ : failed++
      } catch {
        failed++
      }
    }
    setSending(false)
    setResults({ sent, failed })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-foreground">Send Event Documents</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sends rundown + vendor map to selected vendors via email</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {results ? (
            <div className={`rounded-md px-4 py-4 text-sm ${results.failed === 0 ? 'bg-green-50 border border-green-100 text-green-800' : 'bg-yellow-50 border border-yellow-100 text-yellow-800'}`}>
              {results.failed === 0 ? (
                <><strong>All sent!</strong> {results.sent} vendor{results.sent === 1 ? '' : 's'} received their event documents.</>
              ) : (
                <><strong>{results.sent} sent, {results.failed} failed.</strong> Check vendor emails and retry failed ones individually.</>
              )}
            </div>
          ) : (
            <>
              {/* Files being sent */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Files included</div>
                <div className="space-y-2">
                  {EVENT_DOCS_FILES.map(f => (
                    <div key={f.key} className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{f.label}</div>
                        <div className="text-xs text-muted-foreground">{f.note}</div>
                      </div>
                      <Check size={13} className="text-green-500 ml-auto shrink-0" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Status filter */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Send to vendors with status</div>
                <div className="flex flex-wrap gap-2">
                  {SEND_ALL_STATUSES.map(s => {
                    const active = enabled.has(s.key)
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleStatus(s.key)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-input hover:border-muted-foreground'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Recipient list */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Recipients ({recipients.length})</div>
                {recipients.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-3">
                    No vendors match the selected statuses.
                  </div>
                ) : (
                  <div className="border border-border rounded-md divide-y divide-border max-h-44 overflow-y-auto">
                    {recipients.map(b => (
                      <div key={b.id} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <span className="text-sm text-foreground font-medium">{b.vendorName}</span>
                          {b.vendorBusiness && <span className="text-xs text-muted-foreground ml-1.5">{b.vendorBusiness}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{b.vendorEmail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">
            {results ? 'Close' : 'Cancel'}
          </button>
          {!results && (
            <button
              onClick={handleSend}
              disabled={sending || recipients.length === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40"
            >
              {sending ? (
                <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
              ) : (
                <><Send size={14} /> Send to {recipients.length} Vendor{recipients.length === 1 ? '' : 's'}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Send All modal ────────────────────────────────────────────────────────────

const SEND_ALL_STATUSES = [
  { key: 'sent',               label: 'Docs Sent' },
  { key: 'signed',             label: 'Signed' },
  { key: 'insurance_pending',  label: 'Insurance Pending' },
  { key: 'insurance_received', label: 'Confirmed' },
]

function SendAllModal({ bookings, onClose }) {
  const defaultEnabled = new Set(['sent', 'signed', 'insurance_pending', 'insurance_received'])
  const [enabled, setEnabled] = useState(defaultEnabled)
  const [subject, setSubject] = useState(`Found Underground — Sunday 7 June 2026`)
  const [body, setBody] = useState(
    `Hi everyone,\n\nThank you for being part of the Found Underground on Sunday 7 June 2026.\n\nThe event runs from 3:00 PM – 9:00 PM at 18 Logistic Court, Huntingdale. Bump-in is from 11:00 AM.\n\nPlease don't hesitate to reach out if you have any questions.\n\nSee you there!\n\nThe Hexa Space Team`
  )
  const [copied, setCopied] = useState(false)

  function toggleStatus(key) {
    setEnabled(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const recipients = bookings.filter(b => b.vendorEmail && enabled.has(b.status))

  function buildMailto() {
    const bcc = recipients.map(b => b.vendorEmail).join(',')
    const params = new URLSearchParams()
    params.set('subject', subject)
    params.set('body', body)
    if (bcc) params.set('bcc', bcc)
    return `mailto:?${params.toString()}`
  }

  function copyEmails() {
    const emails = recipients.map(b => b.vendorEmail).join(', ')
    navigator.clipboard.writeText(emails)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
  const lab = 'block text-xs font-medium text-muted-foreground mb-1'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-foreground">Send Email to All Vendors</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Opens in your email client with vendors in BCC</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Status filter */}
          <div>
            <label className={lab}>Include vendors with status</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {SEND_ALL_STATUSES.map(s => {
                const active = enabled.has(s.key)
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleStatus(s.key)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-input hover:border-muted-foreground'
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recipient preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={lab} style={{ marginBottom: 0 }}>
                Recipients ({recipients.length})
              </label>
              {recipients.length > 0 && (
                <button onClick={copyEmails} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
                  {copied ? <><Check size={11} className="text-green-500" /> Copied!</> : <><Copy size={11} /> Copy addresses</>}
                </button>
              )}
            </div>
            {recipients.length === 0 ? (
              <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-3">
                No vendors match the selected statuses.
              </div>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border max-h-44 overflow-y-auto">
                {recipients.map(b => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-sm text-foreground font-medium">{b.vendorName}</span>
                      {b.vendorBusiness && <span className="text-xs text-muted-foreground ml-1.5">{b.vendorBusiness}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{b.vendorEmail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className={lab}>Subject</label>
            <input
              className={inp}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject…"
            />
          </div>

          {/* Body */}
          <div>
            <label className={lab}>Body</label>
            <textarea
              className={inp}
              rows={8}
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-input text-foreground py-2.5 rounded-md text-sm font-medium hover:bg-muted/50">
            Cancel
          </button>
          <a
            href={recipients.length > 0 ? buildMailto() : undefined}
            onClick={recipients.length === 0 ? e => e.preventDefault() : undefined}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              recipients.length > 0
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            <Mail size={14} /> Open in Email ({recipients.length})
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [licensorSig, setLicensorSig] = useState(null)
  const [showSigModal, setShowSigModal] = useState(false)
  const [countersignBooking, setCountersignBooking] = useState(null)
  const [showSendAll, setShowSendAll] = useState(false)
  const [showSendDocs, setShowSendDocs] = useState(false)

  useEffect(() => { loadBookings(); loadLicensorSig() }, [])

  async function loadBookings() {
    const { data } = await supabase
      .from('event_bookings')
      .select('data')
      .order('updated_at', { ascending: false })
    // Filter out admin config records (licensor signature, etc.)
    setBookings((data ?? []).map(r => r.data).filter(b => b && b.type !== 'admin_config'))
    setLoading(false)
  }

  async function loadLicensorSig() {
    const { data } = await supabase
      .from('event_bookings')
      .select('data')
      .eq('id', 'hexaspace_licensor_sig')
      .single()
    if (data?.data) setLicensorSig(data.data)
  }

  async function regeneratePdf(booking) {
    const pdfBlob = generateAgreementPdf(booking, licensorSig)
    const pdfPath = `agreements/${booking.id}.pdf`
    const { error: uploadError } = await supabase.storage.from('event-insurance').upload(pdfPath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (uploadError) {
      alert(`PDF upload failed: ${uploadError.message}\n\nMake sure the "event-insurance" Storage bucket exists in Supabase (Dashboard → Storage → New Bucket, public = ON).`)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('event-insurance').getPublicUrl(pdfPath)
    const now = new Date().toISOString()
    const updated = { ...booking, agreementPdfUrl: publicUrl, updatedAt: now }
    await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
    setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
    setSelected(updated)
  }

  async function saveBooking(formData) {
    const isNew = !editData?.id
    const id = editData?.id || `eb${Date.now()}`
    const ref = editData?.ref || `VND-${String(bookings.length + 1).padStart(3, '0')}`
    const now = new Date().toISOString()
    const item = {
      ...editData,
      ...formData,
      id,
      ref,
      status: editData?.status || 'draft',
      updatedAt: now,
      createdAt: editData?.createdAt || now,
    }
    await supabase.from('event_bookings').upsert({ id, data: item, updated_at: now })
    if (isNew) {
      setBookings(prev => [item, ...prev])
      setSelected(item)
    } else {
      setBookings(prev => prev.map(b => b.id === id ? item : b))
      if (selected?.id === id) setSelected(item)
    }
    setShowForm(false)
    setEditData(null)
  }

  async function deleteBooking(id) {
    if (!confirm('Permanently delete this vendor entry?')) return
    await supabase.from('event_bookings').delete().eq('id', id)
    setBookings(prev => prev.filter(b => b.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function sendForSigning(booking) {
    setSending(true)
    try {
      const token = crypto.randomUUID()
      const now = new Date().toISOString()
      const signingUrl = `${window.location.origin}/sign/event/${token}`
      const emailLog = [...(booking.emailLog || []), { type: 'signing_sent', label: 'Agreement sent', sentAt: now }]
      const updated = { ...booking, status: 'sent', signingToken: token, sentAt: now, updatedAt: now, emailLog }

      await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })

      const res = await fetch('/api/event-bookings/send-signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: updated, signingUrl }),
      })
      if (!res.ok) throw new Error('Send failed')

      setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
      setSelected(updated)
    } catch {
      alert('Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function sendSigningReminder(booking) {
    const now = new Date().toISOString()
    const signingUrl = `${window.location.origin}/sign/event/${booking.signingToken}`
    const emailLog = [...(booking.emailLog || []), { type: 'signing_reminder', label: `Agreement reminder sent — ${format(parseISO(now), 'dd MMM yyyy, h:mm a')}`, sentAt: now }]
    const updated = { ...booking, updatedAt: now, emailLog }
    await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
    await fetch('/api/event-bookings/send-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking: updated, signingUrl, mode: 'signing_reminder' }),
    })
    setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
    setSelected(updated)
  }

  async function sendInsuranceReminder(booking) {
    const now = new Date().toISOString()
    const signingUrl = booking.signingToken ? `${window.location.origin}/sign/event/${booking.signingToken}` : null
    const emailLog = [...(booking.emailLog || []), { type: 'insurance_reminder', label: `Insurance reminder sent — ${format(parseISO(now), 'dd MMM yyyy, h:mm a')}`, sentAt: now }]
    const updated = { ...booking, updatedAt: now, emailLog }
    await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
    await fetch('/api/event-bookings/send-signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking: updated, signingUrl, mode: 'insurance_reminder' }),
    })
    setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
    setSelected(updated)
  }

  async function markInsuranceReceived(booking) {
    const now = new Date().toISOString()
    const updated = { ...booking, status: 'insurance_received', insuranceReceivedAt: now, updatedAt: now }
    await supabase.from('event_bookings').upsert({ id: booking.id, data: updated, updated_at: now })
    setBookings(prev => prev.map(b => b.id === booking.id ? updated : b))
    setSelected(updated)
  }

  function copySigningLink(booking) {
    navigator.clipboard.writeText(`${window.location.origin}/sign/event/${booking.signingToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stats = {
    total: bookings.length,
    sent: bookings.filter(b => b.status === 'sent').length,
    signed: bookings.filter(b => ['signed', 'insurance_pending'].includes(b.status)).length,
    complete: bookings.filter(b => b.status === 'insurance_received').length,
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* List */}
      <div className={`flex-1 flex flex-col min-w-0 ${selected ? 'hidden md:flex' : 'flex'}`}>

        {/* Event banner */}
        <div className="bg-black text-white px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">Pop-up Licence Agreements</div>
              <h1 className="text-lg font-bold tracking-tight">Lonsdale 369 Pop-up Bookings</h1>
              <p className="text-xs text-gray-400 mt-0.5">369 Lonsdale Street, Melbourne VIC 3000 · Short-term pop-up space — Lonsdale CBD</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowSigModal(true)}
                title={licensorSig ? 'Licensor signature set ✓' : 'Set licensor signature'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border ${licensorSig ? 'border-green-500/50 bg-green-900/20 text-green-400' : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'}`}
              >
                <Settings size={13} />
                {licensorSig ? 'Sig Set ✓' : 'Set Sig'}
              </button>
              <button
                onClick={() => setShowSendDocs(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400"
                title="Send rundown + vendor map to all vendors"
              >
                <FileText size={13} /> Send Docs
              </button>
              <button
                onClick={() => setShowSendAll(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400"
              >
                <Users size={13} /> Send All
              </button>
              <button
                onClick={() => { setEditData(null); setShowForm(true) }}
                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-100"
              >
                <Plus size={15} /> Add Vendor
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 border-b border-border bg-card shrink-0">
          {[
            { label: 'Total Vendors', value: stats.total },
            { label: 'Agreement Sent', value: stats.sent, color: 'text-blue-600' },
            { label: 'Signed', value: stats.signed, color: 'text-yellow-600' },
            { label: 'Confirmed', value: stats.complete, color: 'text-green-600' },
          ].map((s, i) => (
            <div key={i} className={`px-6 py-4 ${i < 3 ? 'border-r border-border' : ''}`}>
              <div className={`text-2xl font-bold ${s.color || 'text-foreground'}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <ClipboardList size={40} className="mb-3 opacity-25" />
              <p className="text-sm font-medium text-muted-foreground">No vendors added yet</p>
              <p className="text-xs mt-1">Click Add Vendor to get started</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ref</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Space</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => setSelected(b)}
                    className={`cursor-pointer transition-colors ${selected?.id === b.id ? 'bg-muted/50' : 'hover:bg-muted/50'}`}
                  >
                    <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">{b.ref}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground">{b.vendorName || '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.vendorBusiness || ''}
                        {b.instagramHandle && <span className="ml-1 text-gray-300">· @{b.instagramHandle.replace(/^@/, '')}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs hidden lg:table-cell">{b.vendorType || '—'}</td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs hidden lg:table-cell">{b.allocatedSpace || '—'}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3.5"><ChevronRight size={14} className="text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail */}
      {selected && (
        <VendorDetail
          booking={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditData(selected); setShowForm(true) }}
          onDelete={() => deleteBooking(selected.id)}
          onSendForSigning={() => sendForSigning(selected)}
          onCountersignAndComplete={() => setCountersignBooking(selected)}
          onMarkCompleteDirectly={() => markInsuranceReceived(selected)}
          onCopyLink={() => copySigningLink(selected)}
          onSendReminder={sendSigningReminder}
          onSendInsuranceReminder={sendInsuranceReminder}
          onRegeneratePdf={regeneratePdf}
          sending={sending}
          copied={copied}
          onUpdate={updated => {
            setBookings(prev => prev.map(b => b.id === updated.id ? updated : b))
            setSelected(updated)
          }}
        />
      )}

      {/* Form */}
      {showForm && (
        <VendorForm
          booking={editData}
          onSave={saveBooking}
          onClose={() => { setShowForm(false); setEditData(null) }}
        />
      )}

      {/* Licensor signature modal */}
      {showSigModal && (
        <LicensorSignatureModal
          current={licensorSig}
          onSave={sig => { setLicensorSig(sig); setShowSigModal(false) }}
          onClose={() => setShowSigModal(false)}
        />
      )}

      {/* Countersign modal */}
      {countersignBooking && (
        <CountersignModal
          booking={countersignBooking}
          adminSigDefault={licensorSig}
          onDone={updated => {
            setBookings(prev => prev.map(b => b.id === updated.id ? updated : b))
            setSelected(updated)
            setCountersignBooking(null)
          }}
          onClose={() => setCountersignBooking(null)}
        />
      )}

      {/* Send Docs modal */}
      {showSendDocs && (
        <SendDocsModal
          bookings={bookings}
          onClose={() => setShowSendDocs(false)}
        />
      )}

      {/* Send All modal */}
      {showSendAll && (
        <SendAllModal
          bookings={bookings}
          onClose={() => setShowSendAll(false)}
        />
      )}
    </div>
  )
}
