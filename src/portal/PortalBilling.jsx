import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { Download, CreditCard, Plus } from 'lucide-react'
import { Page, PageHeader, Card, SubTabs, Segmented, StatusBadge, Empty, Eyebrow, Field, fmt, money } from './ui.jsx'

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

function downloadPDF(invoice, company) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const { subtotal, gst, total } = calcTotals(invoice)
  const W = 210, M = 20
  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 28, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
  doc.text('HEXA SPACE', M, 12)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180)
  doc.text('Hexa Space Pty Ltd  ·  Level 4, 830 Whitehorse Road, Box Hill VIC 3128', M, 19)
  doc.text('info@hexaspace.com.au  ·  hexaspace.com.au', M, 24)
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20)
  doc.text('INVOICE', M, 46)
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
  doc.text(invoice.number ?? '', M, 54)
  let y = 66
  doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  ;[['Issue Date', fmt(invoice.issueDate)], ['Due Date', fmt(invoice.dueDate)], ['Status', (invoice.status ?? '').toUpperCase()]]
    .forEach(([label, val]) => { doc.text(label, M, y); doc.setTextColor(20, 20, 20); doc.text(val, M + 28, y); doc.setTextColor(120, 120, 120); y += 6 })
  y = 66
  doc.text('Bill To', 120, y)
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold')
  doc.text(company.businessName ?? '', 120, y + 6)
  doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
  if (company.contactName) doc.text(company.contactName, 120, y + 12)
  if (company.email) doc.text(company.email, 120, y + 18)
  y = 100
  doc.setFillColor(20, 20, 20); doc.rect(M, y, W - M * 2, 7, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255)
  doc.text('Description', M + 3, y + 5); doc.text('Amount', W - M - 3, y + 5, { align: 'right' })
  y += 7
  ;(invoice.lineItems ?? []).forEach((li, idx) => {
    const price = (li.unitPrice ?? 0) * (li.qty ?? 1)
    const net = price - price * ((li.discountPct ?? 0) / 100)
    doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 250 : 255)
    doc.rect(M, y, W - M * 2, 8, 'F'); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
    const desc = doc.splitTextToSize(li.description ?? '', W - M * 2 - 30)[0]
    doc.text(desc, M + 3, y + 5.5)
    doc.text(`A$${net.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, W - M - 3, y + 5.5, { align: 'right' })
    y += 8
  })
  y += 4
  const tx = W - M - 70
  doc.setFontSize(8); doc.setTextColor(80, 80, 80)
  ;[['Subtotal', subtotal], ['GST (10%)', gst]].forEach(([label, val]) => {
    doc.text(label, tx, y); doc.text(`A$${val.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, W - M - 3, y, { align: 'right' }); y += 6
  })
  doc.setFillColor(0, 0, 0); doc.rect(tx - 2, y, W - M - tx + 2, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Total', tx + 1, y + 5.5)
  doc.text(`A$${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, W - M - 3, y + 5.5, { align: 'right' })
  doc.save(`${invoice.number ?? 'invoice'}.pdf`)
}

const FILTERS = ['all', 'pending', 'paid', 'overdue']

function InvoicesTab({ invoices, company }) {
  const [filter, setFilter] = useState('all')
  const filtered = [...invoices]
    .filter(i => filter === 'all' || i.status === filter)
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
  return (
    <>
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
                        <button onClick={() => downloadPDF(inv, company)} className="inline-flex items-center gap-1.5 text-muted hover:text-ink transition-colors">
                          <Download size={13} /><span className="font-heading uppercase tracking-nav text-[10px]">PDF</span>
                        </button>
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
  const [adding, setAdding] = useState(false)
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Eyebrow className="mb-4">Saved cards</Eyebrow>
        <Card className="p-8 text-center">
          <CreditCard size={22} className="mx-auto text-muted" />
          <p className="hx-prose mt-3">No payment method saved.</p>
          {adding ? (
            <div className="mt-6 text-left space-y-4 max-w-sm mx-auto">
              <div><label className="hx-eyebrow block mb-1.5">Card number</label><input className="hx-input" placeholder="1234 5678 9012 3456" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="hx-eyebrow block mb-1.5">Expiry</label><input className="hx-input" placeholder="MM / YY" /></div>
                <div><label className="hx-eyebrow block mb-1.5">CVC</label><input className="hx-input" placeholder="123" /></div>
              </div>
              <p className="hx-prose text-[12px]">Secure card payments are being set up. For now, our team will reach out to confirm your card on file.</p>
              <a href="mailto:info@hexaspace.com.au?subject=Add%20card%20on%20file" className="hx-btn w-full">Request card setup</a>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="hx-btn mt-6 inline-flex"><Plus size={13} /> Add payment method</button>
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

function MembershipTab({ leases, invoices, spaces }) {
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
            <div className="text-right">
              <div className="hx-display text-2xl">{money(l.monthlyRent)}</div>
              <p className="hx-prose text-[12px]">per month + GST</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 mt-7 border-t border-ink/10 pt-6">
            <Field label="Started" value={fmt(l.startDate)} />
            <Field label="Renews / ends" value={fmt(l.endDate)} />
            <Field label="Next bill" value={nextBill ? `${fmt(nextBill.dueDate)} · ${money(calcTotals(nextBill).total)}` : '—'} />
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
  const { company, invoices, leases, fees, spaces } = data
  const [tab, setTab] = useState('invoices')
  return (
    <Page>
      <PageHeader kicker="Billing" title="Billing & Membership" />
      <SubTabs
        tabs={[
          { key: 'invoices', label: 'Invoices' },
          { key: 'payment', label: 'Payment Details' },
          { key: 'membership', label: 'Membership' },
          { key: 'fees', label: 'One-Off Fees' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'invoices' && <InvoicesTab invoices={invoices} company={company} />}
      {tab === 'payment' && <PaymentTab company={company} />}
      {tab === 'membership' && <MembershipTab leases={leases} invoices={invoices} spaces={spaces} />}
      {tab === 'fees' && <FeesTab fees={fees} />}
    </Page>
  )
}
