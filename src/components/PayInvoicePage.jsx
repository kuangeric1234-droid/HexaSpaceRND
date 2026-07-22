import { useEffect, useState } from 'react'

// Public pay-this-invoice page (/pay/<invoiceId>?t=<token>) — the landing for
// the "Pay this invoice online" button in invoice/reminder emails. Token-gated
// (invoice.payToken), no login: shows the invoice summary, a card-pay button
// (Stripe Checkout via api/pay-invoice.js) and the bank details fallback.
const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—')
const aud = (n) => `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`

function totals(invoice) {
  let taxable = 0, exempt = 0
  for (const li of invoice?.lineItems ?? []) {
    const price = Number(li.unitPrice ?? 0) * Number(li.qty ?? 1)
    const net = price * (1 - Number(li.discountPct ?? 0) / 100)
    if (li.vatExempt) exempt += net; else taxable += net
  }
  const gst = invoice?.vatEnabled ? taxable * 0.1 : 0
  return { subtotal: taxable + exempt, gst, total: taxable + exempt + gst }
}

export default function PayInvoicePage({ invoiceId }) {
  const token = new URLSearchParams(window.location.search).get('t') ?? ''
  const backFromStripe = new URLSearchParams(window.location.search).get('paid') === '1'
  const [state, setState] = useState('loading') // loading | ready | invalid
  const [data, setData] = useState(null)
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/pay-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'load', invoiceId, token }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setState('ready') })
      .catch(() => setState('invalid'))
  }, [invoiceId, token])

  async function payByCard() {
    setPaying(true); setErr('')
    try {
      const r = await fetch('/api/pay-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', invoiceId, token }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Online payment is unavailable right now.')
      window.location.href = d.url
    } catch (e) {
      setErr(e.message)
      setPaying(false)
    }
  }

  const shell = (children) => (
    <div className="min-h-screen bg-[#f4f2ee] flex items-center justify-center p-5 font-sans text-[#1a1a1a]">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <span className="text-lg font-black tracking-[0.3em]">HEXA SPACE</span>
        </div>
        {children}
        <p className="text-center text-[11px] text-gray-400 mt-6">
          Payments are processed securely by Stripe — card details never touch our servers.
        </p>
      </div>
    </div>
  )

  if (state === 'loading') return shell(<div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-sm text-gray-500">Loading invoice…</div>)
  if (state === 'invalid') {
    return shell(
      <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
        <p className="font-semibold">This payment link is not valid.</p>
        <p className="text-sm text-gray-500 mt-2">It may have been superseded — please use the link in your most recent invoice email, or contact info@hexaspace.com.au.</p>
      </div>
    )
  }

  const { invoice, tenantName, settings, paymentsEnabled } = data
  const { subtotal, gst, total } = totals(invoice)
  const payable = invoice.status === 'pending' || invoice.status === 'overdue'
  const paid = invoice.status === 'paid'
  const b = settings?.billing ?? {}

  return shell(
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-gray-400">Tax invoice</div>
            <div className="text-xl font-bold mt-1">{invoice.number}</div>
            <div className="text-sm text-gray-500 mt-1">{tenantName}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-light">{aud(total)}</div>
            <div className="text-[12px] text-gray-500 mt-1">Due {dmy(invoice.dueDate)}</div>
          </div>
        </div>
        {(backFromStripe || paid) && (
          <div className="mt-5 border border-green-300 bg-green-50 rounded px-4 py-3 text-sm text-green-900">
            {paid
              ? '✓ This invoice has been paid — thank you. No further action is needed.'
              : '✓ Payment received — thank you. The invoice will show as paid within a few minutes.'}
          </div>
        )}
        {invoice.status === 'voided' && (
          <div className="mt-5 border border-gray-200 bg-gray-50 rounded px-4 py-3 text-sm text-gray-600">
            This invoice has been voided — nothing is owing on it.
          </div>
        )}
      </div>

      <div className="px-8 py-6">
        <table className="w-full text-sm">
          <tbody>
            {(invoice.lineItems ?? []).map((li, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2.5 pr-3 text-gray-700">
                  {li.description}
                  {Number(li.qty ?? 1) !== 1 && <span className="text-gray-400"> × {li.qty}</span>}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {aud(Number(li.unitPrice ?? 0) * Number(li.qty ?? 1) * (1 - Number(li.discountPct ?? 0) / 100))}
                </td>
              </tr>
            ))}
            <tr><td className="py-2 text-gray-500">Subtotal</td><td className="py-2 text-right">{aud(subtotal)}</td></tr>
            {invoice.vatEnabled && <tr><td className="py-1 text-gray-500">GST 10%</td><td className="py-1 text-right">{aud(gst)}</td></tr>}
            <tr className="border-t border-gray-200">
              <td className="py-3 font-semibold">Amount due</td>
              <td className="py-3 text-right font-semibold">{payable ? aud(total) : aud(0)}</td>
            </tr>
          </tbody>
        </table>

        {payable && !backFromStripe && (
          <>
            {err && <div className="mt-2 mb-1 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            {paymentsEnabled ? (
              <button
                onClick={payByCard}
                disabled={paying}
                className="mt-4 w-full bg-[#1a1a1a] text-white rounded-md py-3.5 text-[13px] font-semibold tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {paying ? 'Opening secure checkout…' : 'Pay by card'}
              </button>
            ) : (
              <p className="mt-4 text-[12px] text-gray-500">
                Card payments aren't available right now — please pay by bank transfer below.
              </p>
            )}
          </>
        )}

        <div className="mt-6 bg-[#f4f2ee] rounded-md px-5 py-4">
          <div className="text-[10px] tracking-[0.22em] uppercase text-gray-400 mb-2">Or pay by bank transfer</div>
          <div className="text-[13px] text-gray-700 leading-relaxed">
            Account Name: {b.businessName || settings?.company?.name || 'Hexa Space Pty Ltd'}<br />
            BSB: {b.bsb || '—'} · ACC: {b.acc || '—'}<br />
            Reference: {invoice.number}
          </div>
        </div>
      </div>
    </div>
  )
}
