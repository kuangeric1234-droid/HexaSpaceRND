import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { Minus, Plus, Send, Download, CheckCircle2 } from 'lucide-react'
import { logAudit } from '../lib/audit.js'

// Fob Order — orders new FOBs/REMOTEs from the building manager. Fills out
// MAXA's official order form (828 Whitehorse Rd — Panorama Box Hill) as a PDF
// and emails it to Maxa OC + Pro Facility Management, cc'ing the Hexa team.
// Pricing is fixed by the form: FOB $49.10 · REMOTE $94.60 · $33.00 admin
// charge per order (all incl. GST).

export const FOB_PRICE = 49.10
export const REMOTE_PRICE = 94.60
export const ADMIN_CHARGE = 33.00

const TO = ['info@maxaoc.com.au', 'pbh@profacilitymanagement.com.au']
const CC = ['eric@hexaspace.com.au', 'info@hexaspace.com.au', 'scarlett@hexaspace.com.au', 'brittany@hexaspace.com.au']

const money = (n) => `$${Number(n).toFixed(2)}`
const inp = 'w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
const lab = 'block text-xs font-medium text-muted-foreground mb-1'

function buildOrderPdf(f, totals) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 18
  let y = 20

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20)
  doc.text('Fob / Remote Order Form — 828 Whitehorse Rd, Box Hill — Panorama Box Hill', W / 2, y, { align: 'center', maxWidth: W - M * 2 })
  y += 12
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70, 70, 70)
  doc.text(`Submitted by Hexa Space Pty Ltd · ${new Date().toLocaleDateString('en-AU')} · per Maxa OC order process (payment on receipt of details)`, M, y)
  y += 10

  // Details block
  doc.setDrawColor(30, 30, 30); doc.rect(M, y, W - M * 2, 44)
  doc.setTextColor(20, 20, 20); doc.setFontSize(10)
  const line = (label, value, dy) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, M + 4, y + dy)
    doc.setFont('helvetica', 'normal'); doc.text(String(value || ''), M + 4 + doc.getTextWidth(label) + 2, y + dy)
  }
  line('Apartment/Retail Lot Number:', `U ${f.lot} /828 Whitehorse Road Box Hill`, 8)
  line('Owner requesting these items:', f.requester === 'owner' ? 'Y' : 'N', 16)
  doc.setFont('helvetica', 'bold'); doc.text('Agent requesting these items:', M + 95, y + 16)
  doc.setFont('helvetica', 'normal'); doc.text(f.requester === 'agent' ? 'Y' : 'N', M + 95 + doc.getTextWidth('Agent requesting these items:') + 2, y + 16)
  line('Owner/Agent Name:', f.name, 24)
  line('Owner/Agent Phone Number:', f.phone, 32)
  line('Reason for the order:', f.reason, 40)
  y += 52

  // Items table
  const cols = [M, M + 32, M + 92, M + 138, M + 160, W - M]
  const row = (cells, h = 9, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9)
    cells.forEach((c, i) => {
      doc.rect(cols[i], y, cols[i + 1] - cols[i], h)
      doc.text(String(c), cols[i] + 2, y + 5.5, { maxWidth: cols[i + 1] - cols[i] - 4 })
    })
    y += h
  }
  row(['ITEM', 'ACCESS AREA', 'COST PER ITEM (INCL. GST)', 'QUANTITY', 'TOTAL (INCL. GST)'], 9, true)
  row(['FOB', 'Door entry / permitted lift levels', money(FOB_PRICE), String(f.fobs), f.fobs ? money(totals.fobs) : '—'], 11)
  row(['REMOTE', 'Door entry, lift levels & car park entry', money(REMOTE_PRICE), String(f.remotes), f.remotes ? money(totals.remotes) : '—'], 11)
  row(['ADMINISTRATIVE CHARGE', 'N/A', money(ADMIN_CHARGE), '1', money(ADMIN_CHARGE)], 9)
  row(['TOTAL COST', 'N/A', 'N/A', 'N/A', money(totals.total)], 9, true)

  y += 10
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
  doc.text('Collection from the Building Manager — no delivery. Lost or misplaced devices are reported to the Building Manager /', M, y)
  doc.text('OC Manager for immediate deactivation.', M, y + 4)
  return doc
}

export default function FobOrderTab({ settings }) {
  const [f, setF] = useState({
    fobs: 0, remotes: 0,
    lot: '402', requester: 'owner',
    name: settings?.company?.name || 'Hexa Space Pty Ltd',
    phone: settings?.company?.phone || '',
    reason: 'Additional access devices for new members',
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const step = (k, d) => setF((p) => ({ ...p, [k]: Math.max(0, (p[k] || 0) + d) }))

  const totals = {
    fobs: Math.round(f.fobs * FOB_PRICE * 100) / 100,
    remotes: Math.round(f.remotes * REMOTE_PRICE * 100) / 100,
    total: Math.round((f.fobs * FOB_PRICE + f.remotes * REMOTE_PRICE + ADMIN_CHARGE) * 100) / 100,
  }
  const valid = (f.fobs > 0 || f.remotes > 0) && f.lot.trim() && f.name.trim()

  function downloadPdf() {
    buildOrderPdf(f, totals).save(`Fob-order-U${f.lot}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  async function send() {
    if (!valid) return
    if (!confirm(`Send this order (${f.fobs} fob${f.fobs === 1 ? '' : 's'}, ${f.remotes} remote${f.remotes === 1 ? '' : 's'} — ${money(totals.total)}) to Maxa OC and Pro Facility Management?`)) return
    setSending(true); setError('')
    try {
      const pdf = buildOrderPdf(f, totals)
      const b64 = pdf.output('datauristring').split(',')[1]
      const html = `
        <p>Hi team,</p>
        <p>Please find attached our fob/remote order for <strong>U ${f.lot}/828 Whitehorse Road, Box Hill</strong>:</p>
        <ul>
          ${f.fobs ? `<li>${f.fobs} × FOB @ ${money(FOB_PRICE)} = ${money(totals.fobs)}</li>` : ''}
          ${f.remotes ? `<li>${f.remotes} × REMOTE @ ${money(REMOTE_PRICE)} = ${money(totals.remotes)}</li>` : ''}
          <li>Administrative charge = ${money(ADMIN_CHARGE)}</li>
        </ul>
        <p><strong>Total (incl. GST): ${money(totals.total)}</strong></p>
        <p>Please send through your payment details and we'll arrange payment right away.</p>
        <p>Kind regards,<br/>${f.name}<br/>Hexa Space · 402/830 Whitehorse Road, Box Hill${f.phone ? ` · ${f.phone}` : ''}</p>`
      const r = await fetch('/api/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: TO, cc: CC,
          from: 'Hexa Space <info@hexaspace.com.au>',
          replyTo: 'info@hexaspace.com.au',
          subject: `Fob / Remote order — U ${f.lot}/828 Whitehorse Rd (${f.fobs} fob, ${f.remotes} remote)`,
          html,
          attachments: [{ filename: `Fob-order-U${f.lot}.pdf`, content: b64 }],
        }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Send failed.')
      logAudit('create', 'fob_order', `U${f.lot}`, `${f.fobs} fobs, ${f.remotes} remotes`, money(totals.total))
      setSent({ ...totals, fobs: f.fobs, remotes: f.remotes })
      setF((p) => ({ ...p, fobs: 0, remotes: 0 }))
    } catch (e) {
      setError(e.message)
    } finally { setSending(false) }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 max-w-4xl">
      <div className="bg-card border border-border rounded-lg p-5 space-y-5">
        {/* Quantities */}
        <div className="grid sm:grid-cols-2 gap-4">
          {[['fobs', 'Fobs', FOB_PRICE], ['remotes', 'Remotes', REMOTE_PRICE]].map(([k, label, price]) => (
            <div key={k} className="border border-border rounded-md p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-foreground">{label}</div>
                  <div className="text-xs text-muted-foreground">{money(price)} each incl. GST</div>
                </div>
                <div className="flex items-center border border-input rounded-md">
                  <button onClick={() => step(k, -1)} className="h-9 w-9 grid place-items-center hover:bg-muted"><Minus size={14} /></button>
                  <span className="w-10 text-center font-semibold tabular-nums">{f[k]}</span>
                  <button onClick={() => step(k, 1)} className="h-9 w-9 grid place-items-center hover:bg-muted"><Plus size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Form details */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={lab}>Lot number (U __ /828 Whitehorse Rd)</label>
            <input value={f.lot} onChange={set('lot')} className={inp} />
          </div>
          <div>
            <label className={lab}>Requesting as</label>
            <select value={f.requester} onChange={set('requester')} className={inp}>
              <option value="owner">Owner</option>
              <option value="agent">Managing agent</option>
            </select>
          </div>
          <div>
            <label className={lab}>Owner/Agent name</label>
            <input value={f.name} onChange={set('name')} className={inp} />
          </div>
          <div>
            <label className={lab}>Phone</label>
            <input value={f.phone} onChange={set('phone')} className={inp} placeholder="e.g. 0479 128 955" />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Reason for the order</label>
            <input value={f.reason} onChange={set('reason')} className={inp} />
          </div>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        {sent && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <CheckCircle2 size={14} /> Order sent to Maxa OC & Pro Facility Management ({sent.fobs} fobs, {sent.remotes} remotes — {money(sent.total)}). They'll reply with payment details.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={send} disabled={!valid || sending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
            <Send size={14} /> {sending ? 'Sending…' : 'Send order'}
          </button>
          <button onClick={downloadPdf} disabled={!valid}
            className="flex items-center gap-2 border border-input px-4 py-2 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40">
            <Download size={14} /> Preview PDF
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sends the filled Maxa order form to {TO.join(' and ')}, cc {CC.join(', ')}. Payment is arranged
          once Maxa replies with their details; collection is from the Building Manager (no delivery).
        </p>
      </div>

      {/* Totals */}
      <div className="bg-card border border-border rounded-lg p-5 h-fit">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order total</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span>{f.fobs} × Fob @ {money(FOB_PRICE)}</span><span className="tabular-nums">{money(totals.fobs)}</span></div>
          <div className="flex justify-between"><span>{f.remotes} × Remote @ {money(REMOTE_PRICE)}</span><span className="tabular-nums">{money(totals.remotes)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Administrative charge</span><span className="tabular-nums">{money(ADMIN_CHARGE)}</span></div>
          <div className="flex justify-between font-bold border-t border-border pt-2 mt-2"><span>Total (incl. GST)</span><span className="tabular-nums">{money(totals.total)}</span></div>
        </div>
      </div>
    </div>
  )
}
