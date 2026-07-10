import { useState, useEffect } from 'react'
import { authHeaders } from '../lib/apiFetch.js'
import { jsPDF } from 'jspdf'
import { Download, CreditCard, Plus } from 'lucide-react'
import { Page, PageHeader, Card, SubTabs, Segmented, StatusBadge, Empty, Eyebrow, Field, fmt, money } from './ui.jsx'
import { supabase } from '../lib/supabase.js'
import { CARD_AUTHORITY_TEXT, cardAuthorityFields } from '../lib/cardAuthority.js'
import { canViewBilling } from '../lib/billingAccess.js'

function calcTotals(invoice) {
  let taxable = 0, exempt = 0
  for (const li of invoice.lineItems ?? []) {
    const price = (li.unitPrice ?? 0) * (li.qty ?? 1)
    const disc = price * ((li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += price - disc; else taxable += price - disc
  }
  const gst = invoice.vatEnabled ? taxable * 0.1 : 0
  return { subtotal: taxable + exempt, gst, total: taxable + exempt + gst }
}

// Clean, Xero-style TAX INVOICE (no black banner) with our bank details in the
// footer. Reads company + bank details from the public settings subset.
function downloadPDF(invoice, company, settings = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, M = 18, right = W - M
  const b = settings.billing || {}
  const businessName = b.businessName || settings.company?.name || 'Hexa Space Pty Ltd'
  const addressParts = String(b.address || '402/830 Whitehorse Road, Box Hill VIC 3128')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const taxRate = Number(settings.billingRules?.taxRate ?? 10)
  const aud = (v) => `${(Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AUD`
  const INK = [26, 26, 26], MUTE = [110, 110, 110], HAIR = [205, 205, 205]

  // Totals (self-contained so "Taxable Amount" can be shown alongside subtotal).
  let taxable = 0, exempt = 0
  for (const li of invoice.lineItems ?? []) {
    const gross = (li.unitPrice ?? 0) * (li.qty ?? 1)
    const net = gross - gross * ((li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += net; else taxable += net
  }
  const gst = invoice.vatEnabled ? taxable * (taxRate / 100) : 0
  const subtotal = taxable + exempt
  const total = subtotal + gst
  const amountDue = /paid/i.test(invoice.status ?? '') ? 0 : total

  // Header — TAX INVOICE + client (left), company + address (right).
  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...INK)
  doc.text('TAX INVOICE', M, 26)
  doc.setFont('helvetica', 'normal').setFontSize(12).setTextColor(...MUTE)
  doc.text(company?.businessName || invoice.clientName || '', M, 34)

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...INK)
  doc.text(businessName.toUpperCase(), right, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE)
  let hy = 28
  ;[businessName, ...addressParts].forEach((line) => { doc.text(line, right, hy, { align: 'right' }); hy += 5 })

  // Invoice meta (right column).
  let my = 52
  ;[['Invoice Date', fmt(invoice.issueDate)], ['Due Date', fmt(invoice.dueDate)], ['Invoice Number', invoice.number ?? '']]
    .forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
      doc.text(label, 150, my, { align: 'right' })
      doc.setFont('helvetica', 'normal').setTextColor(...INK)
      doc.text(String(val ?? ''), right, my, { align: 'right' })
      my += 6
    })

  // Line-items table.
  const cQty = 120, cUnit = 150, cGst = 168, cAmt = right
  let y = 82
  doc.setDrawColor(...HAIR).setLineWidth(0.3).line(M, y - 5, right, y - 5)
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK)
  doc.text('Description', M, y)
  doc.text('Qty', cQty, y, { align: 'right' })
  doc.text('Unit Price', cUnit, y, { align: 'right' })
  doc.text('GST', cGst, y, { align: 'right' })
  doc.text('Amount AUD', cAmt, y, { align: 'right' })
  y += 3
  doc.setDrawColor(...HAIR).setLineWidth(0.3).line(M, y, right, y)
  y += 7

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK)
  ;(invoice.lineItems ?? []).forEach((li) => {
    const gross = (li.unitPrice ?? 0) * (li.qty ?? 1)
    const net = gross - gross * ((li.discountPct ?? 0) / 100)
    const desc = doc.splitTextToSize(li.description ?? '', 96)
    doc.text(desc, M, y)
    doc.text(String(li.qty ?? 1), cQty, y, { align: 'right' })
    doc.text(aud(li.unitPrice ?? 0), cUnit, y, { align: 'right' })
    doc.text(li.vatExempt ? '—' : String(taxRate), cGst, y, { align: 'right' })
    doc.text(aud(net), cAmt, y, { align: 'right' })
    y += Math.max(7, desc.length * 4.5 + 3)
  })
  doc.setDrawColor(...HAIR).setLineWidth(0.3).line(M, y - 3, right, y - 3)

  // Totals (right-aligned block).
  y += 6
  const totRow = (label, val, strong) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 10.5 : 9)
    doc.setTextColor(...(strong ? INK : MUTE))
    doc.text(label, 150, y, { align: 'right' })
    doc.setTextColor(...INK)
    doc.text(aud(val), cAmt, y, { align: 'right' })
    y += strong ? 7 : 6
  }
  totRow('Subtotal', subtotal)
  totRow('Taxable Amount', taxable)
  if (invoice.vatEnabled) totRow(`Total GST ${taxRate.toFixed(2)} %`, gst)
  y += 1; doc.setDrawColor(...INK).setLineWidth(0.4).line(110, y - 3, right, y - 3); y += 2
  totRow('TOTAL AUD', total, true)
  totRow('Amount Due AUD', amountDue, true)

  // Payment details footer.
  let py = Math.max(y + 16, 248)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK)
  doc.text(`Please make payments to ${businessName}`, M, py); py += 7
  doc.setFont('helvetica', 'normal').setTextColor(...MUTE)
  ;[`Account Name: ${businessName}`, b.bsb ? `BSB: ${b.bsb}` : '', b.acc ? `ACC: ${b.acc}` : '']
    .filter(Boolean)
    .forEach((line) => { doc.text(line, M, py); py += 6 })

  doc.save(`${invoice.number ?? 'invoice'}.pdf`)
}

const FILTERS = ['all', 'pending', 'paid', 'overdue']

function InvoicesTab({ invoices, company, settings }) {
  const [filter, setFilter] = useState('all')
  const [payingId, setPayingId] = useState(null)
  // Stripe Checkout redirects back with ?paid=<invoice number>. The webhook
  // marks the invoice paid server-side, so the list may lag a few seconds —
  // show a confirmation instead of a stale "pending" with no explanation.
  const [justPaid] = useState(() => new URLSearchParams(window.location.search).get('paid'))
  useEffect(() => {
    if (justPaid) window.history.replaceState({}, '', window.location.pathname)
  }, [justPaid])
  const filtered = [...invoices]
    .filter(i => filter === 'all' || i.status === filter)
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))

  async function payNow(inv) {
    setPayingId(inv.id)
    try {
      const r = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ invoiceId: inv.id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Online payment is unavailable right now.')
      window.location.href = data.url
    } catch (e) {
      alert(e.message)
      setPayingId(null)
    }
  }
  return (
    <>
      {justPaid && (
        <div className="mb-6 border border-hexa-green/40 bg-hexa-green/10 rounded px-4 py-3">
          <p className="hx-prose text-[13px] text-ink">
            ✓ Payment received for invoice <span className="font-heading uppercase tracking-nav text-[11px]">{justPaid}</span> — thank you.
            Your invoice will show as paid within a few minutes.
          </p>
        </div>
      )}
      <div className="mb-6"><Segmented options={FILTERS} active={filter} onChange={setFilter} /></div>
      {filtered.length === 0 ? <Empty label="No invoices to show." /> : (
        <Card className="overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bone border-b border-ink/10">
                  {['Invoice', 'Period', 'Due', 'Amount', 'Status', ''].map((h, i) => (
                    <th key={i} className={`px-5 py-3 hx-eyebrow ${i === 3 ? 'text-right' : i === 4 ? 'text-center' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map(inv => {
                  const { total } = calcTotals(inv)
                  return (
                    <tr key={inv.id} className="hover:bg-bone">
                      <td className="px-5 py-4 font-heading uppercase tracking-nav text-[11px] text-ink">{inv.number}</td>
                      <td className="px-5 py-4 hx-prose text-[13px]">{inv.periodStart ? `${fmt(inv.periodStart)} – ${fmt(inv.periodEnd)}` : '—'}</td>
                      <td className="px-5 py-4 hx-prose text-[13px]">{fmt(inv.dueDate)}</td>
                      <td className="px-5 py-4 text-right font-display font-extralight text-lg">{money(total)}</td>
                      <td className="px-5 py-4 text-center"><StatusBadge status={inv.status} /></td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-4">
                          {(inv.status === 'pending' || inv.status === 'overdue') && (
                            <button
                              onClick={() => payNow(inv)}
                              disabled={payingId === inv.id}
                              className="inline-flex items-center gap-1.5 text-ink hover:opacity-70 transition-opacity disabled:opacity-40"
                            >
                              <CreditCard size={13} />
                              <span className="font-heading uppercase tracking-nav text-[10px]">{payingId === inv.id ? 'Opening…' : 'Pay'}</span>
                            </button>
                          )}
                          <button onClick={() => downloadPDF(inv, company, settings)} className="inline-flex items-center gap-1.5 text-portal-muted hover:text-ink transition-colors">
                            <Download size={13} /><span className="font-heading uppercase tracking-nav text-[10px]">PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function PaymentTab({ company }) {
  const [busy, setBusy] = useState(false)
  const [cardSaved] = useState(() => new URLSearchParams(window.location.search).get('card') === 'saved')
  const [authorityTicked, setAuthorityTicked] = useState(false)
  const hasCard = !!company.stripePaymentMethodId
  // Members on pre-authority contracts must opt in before a card is stored;
  // consent (text version + when + by whom) is recorded on the company record.
  const needsAuthority = !company.cardAuthorityAccepted

  async function startCardSetup() {
    if (needsAuthority && !authorityTicked) { alert('Please tick the payment authority first.'); return }
    setBusy(true)
    try {
      if (needsAuthority) {
        const consented = { ...company, ...cardAuthorityFields(company.email) }
        await supabase.from('tenants').update({ data: consented, updated_at: new Date().toISOString() }).eq('id', company.id)
      }
      const r = await fetch('/api/stripe/setup', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ tenantId: company.id, returnTo: '/billing' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Could not start card setup.')
      window.location.href = d.url
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Eyebrow className="mb-4">Saved card</Eyebrow>
        {cardSaved && !hasCard && (
          <div className="mb-4 border border-hexa-green/40 bg-hexa-green/10 rounded px-4 py-3">
            <p className="hx-prose text-[13px] text-ink">✓ Card verified — it will appear here within a few minutes.</p>
          </div>
        )}
        <Card className="p-8 text-center">
          <CreditCard size={22} className="mx-auto text-portal-muted" />
          {hasCard ? (
            <>
              <p className="font-heading uppercase tracking-nav text-[13px] text-ink mt-4">
                {(company.cardBrand || 'Card').toUpperCase()} •••• {company.cardLast4}
              </p>
              {company.cardExpMonth && (
                <p className="hx-prose text-[12px] text-portal-muted mt-1">Expires {String(company.cardExpMonth).padStart(2, '0')}/{company.cardExpYear}</p>
              )}
              <p className="hx-prose text-[12px] text-portal-muted mt-3">
                Held securely by Stripe and charged only for amounts owing under your agreement, per your signed payment authority.
              </p>
              <button onClick={startCardSetup} disabled={busy} className="hx-btn mt-6 inline-flex disabled:opacity-50">
                {busy ? 'Opening…' : 'Replace card'}
              </button>
            </>
          ) : (
            <>
              <p className="hx-prose mt-3">No payment method saved.</p>
              <p className="hx-prose text-[12px] text-portal-muted mt-2">Your card is verified and stored by Stripe — we never see the number.</p>
              {needsAuthority && (
                <label className="flex items-start gap-3 text-left mt-5 mx-auto max-w-md cursor-pointer">
                  <input type="checkbox" checked={authorityTicked} onChange={(e) => setAuthorityTicked(e.target.checked)} className="mt-1" />
                  <span className="hx-prose text-[12px]">{CARD_AUTHORITY_TEXT}</span>
                </label>
              )}
              <button onClick={startCardSetup} disabled={busy || (needsAuthority && !authorityTicked)} className="hx-btn mt-6 inline-flex disabled:opacity-50">
                <Plus size={13} /> {busy ? 'Opening…' : 'Add payment method'}
              </button>
            </>
          )}
        </Card>
      </div>
      <div>
        <Eyebrow className="mb-4">Billing details</Eyebrow>
        <Card className="p-7 grid sm:grid-cols-2 gap-6">
          <Field label="Billed to" value={company.billBusinessName || company.businessName} />
          <Field label="ABN" value={company.abn} />
          <Field label="Contact" value={company.contactName} />
          <Field label="Email" value={company.email} />
          <div className="sm:col-span-2 hx-prose text-[13px] border-t border-ink/10 pt-4">
            Invoices are payable by bank transfer using the reference on each invoice. To update billing
            details, contact <a href="mailto:info@hexaspace.com.au" className="text-hexa-green hover:text-ink">info@hexaspace.com.au</a>.
          </div>
        </Card>
      </div>
    </div>
  )
}

function MembershipTab({ leases, invoices, spaces, canBilling }) {
  const active = leases.filter(l => l.status === 'active')
  const nextBill = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]
  const nameFor = (id) => spaces.find(s => s.id === id)?.unitNumber
  if (active.length === 0) return <Empty label="No active membership." sub="Contact us to start a membership." />
  return (
    <div className="space-y-px bg-ink/10">
      {active.map(l => (
        <Card key={l.id} className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Eyebrow>{l.documentType || 'Membership'}</Eyebrow>
              <h3 className="hx-display text-2xl mt-2">{nameFor(l.spaceId) || l.contractNumber || 'Membership'}</h3>
            </div>
            {/* Monthly cost is commercially sensitive — billing/contact person only */}
            {canBilling && (
              <div className="text-right">
                <div className="hx-display text-2xl">{money(l.monthlyRent)}</div>
                <p className="hx-prose text-[12px]">per month + GST</p>
              </div>
            )}
          </div>
          <div className={`grid ${canBilling ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-5 mt-7 border-t border-ink/10 pt-6`}>
            <Field label="Started" value={fmt(l.startDate)} />
            <Field label="Renews / ends" value={fmt(l.endDate)} />
            {canBilling && (
              <Field label="Next bill" value={nextBill ? `${fmt(nextBill.dueDate)} · ${money(calcTotals(nextBill).total)}` : '—'} />
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

function FeesTab({ fees }) {
  const list = (fees ?? []).filter(f => f.active !== false)
  if (list.length === 0) return <Empty label="No one-off fees on file." />
  return (
    <div className="grid gap-px bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(f => (
        <Card key={f.id} className="p-6">
          <div className="font-heading uppercase tracking-nav text-[11px] text-ink">{f.name}</div>
          {f.description && <p className="hx-prose text-[13px] mt-2">{f.description}</p>}
          {f.price != null && <div className="hx-display text-xl mt-4">{money(f.price)}</div>}
        </Card>
      ))}
    </div>
  )
}

export default function PortalBilling({ data }) {
  const { company, invoices, leases, fees, spaces, member } = data
  // Invoices + payment details are limited to the company's billing/contact
  // person (server-enforced too). Teammates see only membership + fees.
  const canBilling = canViewBilling(member)
  const [tab, setTab] = useState(canBilling ? 'invoices' : 'membership')
  const tabs = [
    ...(canBilling
      ? [{ key: 'invoices', label: 'Invoices' }, { key: 'payment', label: 'Payment Details' }]
      : []),
    { key: 'membership', label: 'Membership' },
    { key: 'fees', label: 'One-Off Fees' },
  ]
  return (
    <Page>
      <PageHeader kicker="Billing" title="Billing & Membership" />
      <SubTabs tabs={tabs} active={tab} onChange={setTab} />
      {!canBilling && (
        <p className="hx-prose text-[13px] text-portal-muted mb-6">
          Invoices and payment details are managed by your company’s billing contact.
        </p>
      )}
      {tab === 'invoices' && canBilling && <InvoicesTab invoices={invoices} company={company} settings={data.settings} />}
      {tab === 'payment' && canBilling && <PaymentTab company={company} />}
      {tab === 'membership' && <MembershipTab leases={leases} invoices={invoices} spaces={spaces} canBilling={canBilling} />}
      {tab === 'fees' && <FeesTab fees={fees} />}
    </Page>
  )
}
