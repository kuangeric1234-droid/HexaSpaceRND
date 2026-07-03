import { format, parseISO } from 'date-fns'
import { buildPaymentSchedule, scheduleAmount } from '../lib/paymentSchedule.js'
import { requiresCardOnFile } from '../lib/onboarding.js'

const DEFAULT_BUSINESS = {
  name: 'Hexa Space Pty Ltd',
  line1: '402/830 Whitehorse Road',
  line2: 'Box Hill VIC 3128',
  country: 'Australia, Victoria',
}

function getBusinessAddress(settings) {
  if (!settings?.billing) return DEFAULT_BUSINESS
  const addr = settings.billing.address ?? '402/830 Whitehorse Road, Box Hill VIC 3128'
  const commaIdx = addr.indexOf(',')
  return {
    name: settings.billing.businessName || settings.company?.name || DEFAULT_BUSINESS.name,
    line1: commaIdx > -1 ? addr.slice(0, commaIdx).trim() : addr,
    line2: commaIdx > -1 ? addr.slice(commaIdx + 1).trim() : '',
    country: 'Australia, Victoria',
  }
}

function SigBlock({ party, name }) {
  return (
    <div className="text-xs">
      <p className="mb-4 text-sm text-gray-700">For and on behalf of {party}:</p>
      {['Name:', 'Title:', 'Date:', 'Signature:'].map((field) => (
        <div key={field} className="flex items-end gap-2 mb-3.5">
          <span className="w-20 shrink-0 text-gray-700">{field}</span>
          <div className="flex-1 border-b border-gray-400" />
        </div>
      ))}
    </div>
  )
}

export default function ContractTemplate({ lease, tenant, space, settings }) {
  const BUSINESS_ADDRESS = getBusinessAddress(settings)
  const contractNum = lease.contractNumber ?? `CON-${lease.id?.slice(-3).toUpperCase()}`
  const today = format(new Date(), 'dd/MM/yyyy')

  // Collect all pricing steps from items
  const items = lease.items ?? [{
    spaceId: lease.spaceId,
    deposit: lease.bondAmount ?? 0,
    steps: [{ startDate: lease.startDate, endDate: lease.endDate, listPrice: lease.monthlyRent ?? 0, qty: 1 }],
  }]
  const deposit = items[0]?.deposit ?? 0
  const schedule = buildPaymentSchedule(lease, settings)
  const taxRatePct = settings?.billingRules?.taxRate ?? 10
  const gst = Math.round(deposit * (taxRatePct / 100) * 100) / 100
  const totalInitial = Math.round((deposit + gst) * 100) / 100

  return (
    <div className="bg-white text-gray-800 font-sans text-sm px-12 py-10 max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-10">
        <h1 className="text-2xl font-bold tracking-widest text-gray-900">LICENCE AGREEMENT</h1>
        <div className="text-right">
          <div className="text-xl font-black tracking-widest text-gray-900">HEXA SPACE</div>
        </div>
      </div>

      {/* ── Agreement info + Address ── */}
      <div className="flex justify-between mb-6">
        <div className="text-sm space-y-0.5">
          <p>Agreement ID: <span className="font-medium">{contractNum}</span></p>
          <p>Date: <span className="font-medium">{today}</span></p>
        </div>
        <div className="text-sm text-right">
          <p className="font-semibold text-gray-900">Business Centre Address</p>
          <p className="text-gray-700">{BUSINESS_ADDRESS.line1}</p>
          <p className="text-gray-700">{BUSINESS_ADDRESS.line2}</p>
          <p className="text-gray-700">{BUSINESS_ADDRESS.country}</p>
        </div>
      </div>

      <hr className="border-gray-200 mb-8" />

      {/* ── Company + Primary Contact ── */}
      <div className="grid grid-cols-2 gap-10 mb-8">
        <div>
          <h2 className="font-bold uppercase text-gray-900 mb-4 tracking-wide">COMPANY</h2>
          <div className="space-y-1.5 text-sm text-gray-700">
            <p>Company: <span className="font-medium">{tenant?.businessName ?? '—'}</span></p>
            <p>Address:</p>
            <p>City/State:</p>
            <p>Post code:</p>
            <p>ABN: {tenant?.abn ?? ''}</p>
          </div>
        </div>
        <div>
          <h2 className="font-bold uppercase text-gray-900 mb-4 tracking-wide">PRIMARY CONTACT</h2>
          <div className="space-y-1.5 text-sm text-gray-700">
            <p>Name: <span className="font-medium">{tenant?.contactName ?? '—'}</span></p>
            <p>Number: {tenant?.phone ?? ''}</p>
            <p>Email: {tenant?.email ?? ''}</p>
          </div>
        </div>
      </div>

      {/* ── Licence Fee Details ── */}
      <h2 className="font-bold uppercase text-gray-900 mb-3 tracking-wide">LICENCE FEE DETAILS</h2>
      <table className="w-full text-xs border border-gray-300 mb-8">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-50">
            {['OFFICE', 'START DATE', 'END DATE', 'MONTHLY TOTAL'].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200 last:border-r-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.flatMap((item) =>
            (item.steps ?? []).map((step, si) => {
              const price = Number(step.listPrice ?? 0)
              const qty = Number(step.qty ?? 1)
              const monthly = price * qty
              return (
                <tr key={`${item.spaceId}-${si}`} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-3 py-2 border-r border-gray-200">{space?.unitNumber ?? '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-200">
                    {step.startDate ? format(parseISO(step.startDate), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-200">
                    {step.endDate ? format(parseISO(step.endDate), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {monthly.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-10 mb-10">
        {/* Left: periods */}
        <div className="text-xs space-y-0">
          {[
            ['Minimum Notice Period:', `${lease.noticePeriodMonths ?? 1} (M), 0 (W), 0 (D)`],
            ['Start Date:', lease.startDate ? format(parseISO(lease.startDate), 'dd/MM/yyyy') : '—'],
            ['End Date:', lease.endDate ? format(parseISO(lease.endDate), 'dd/MM/yyyy') : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 border-b border-gray-200">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="text-gray-700">{value}</span>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            *Minimum Term is subject to written notice from either party. Minimum notice period as specified above.
          </p>
        </div>

        {/* Right: payments */}
        <div className="text-xs space-y-0">
          {[
            ['Initial payment:', `${Number(deposit).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
            [`GST ${taxRatePct} %:`, `${gst.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
            ['Total initial payment:', `${totalInitial.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
            ['Deposit', `${Number(deposit).toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 border-b border-gray-200">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="text-gray-700">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Payment Schedule ── */}
      {schedule && (
        <>
          <h2 className="font-bold uppercase text-gray-900 mb-3 tracking-wide">PAYMENT SCHEDULE</h2>
          <table className="w-full text-xs border border-gray-300 mb-4">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-50">
                {['MONTH', 'OFFICE', 'SERVICES', 'MONTH TOTAL', 'MONTH TOTAL INCL. GST'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200 last:border-r-0 ${i === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((r) => (
                <tr key={r.key} className="border-b border-gray-200">
                  <td className="px-3 py-2 border-r border-gray-200">
                    {r.label}
                    {r.free && <span className="ml-2 text-[10px] font-semibold uppercase text-gray-500">Rent-free</span>}
                  </td>
                  <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(r.office)} AUD</td>
                  <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(r.services)} AUD</td>
                  <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(r.total)} AUD</td>
                  <td className="px-3 py-2 text-right font-medium">{scheduleAmount(r.incGst)} AUD</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-3 py-2 border-r border-gray-200">Total</td>
                <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(schedule.totals.office)} AUD</td>
                <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(schedule.totals.services)} AUD</td>
                <td className="px-3 py-2 text-right border-r border-gray-200">{scheduleAmount(schedule.totals.total)} AUD</td>
                <td className="px-3 py-2 text-right">{scheduleAmount(schedule.totals.incGst)} AUD</td>
              </tr>
            </tbody>
          </table>
          {schedule.rows.some((r) => r.free) && (
            <p className="text-xs text-gray-400 mb-8 leading-relaxed">
              *New-member offer — the rent-free month{schedule.rows.filter((r) => r.free).length > 1 ? 's are' : ' is'} applied
              to the end of the term as shown above.
            </p>
          )}
        </>
      )}

      {/* ── Payment authority (card-on-file memberships) ── */}
      {requiresCardOnFile(lease) && (
        <div className="mb-8">
          <h2 className="font-bold uppercase text-gray-900 mb-3 tracking-wide">PAYMENT AUTHORITY</h2>
          <p className="text-xs text-gray-700 leading-relaxed">
            As a condition of this membership, the Member will register a valid payment card, verified and
            securely stored by Stripe, at the time of signing this Agreement, and will keep a valid card
            registered for the duration of the membership. The Member authorises Hexa Space to charge this
            card for any amount that remains unpaid after its invoice due date, including membership fees
            and other amounts payable under this Agreement. Hexa Space will issue each invoice in the normal
            course before any charge is made, and a receipt is provided for every charge. Card numbers are
            held by Stripe — Hexa Space does not store or have access to full card details. The Member may
            update the registered card at any time via the member portal.
          </p>
        </div>
      )}

      {/* ── Signature blocks ── */}
      <div className="grid grid-cols-2 gap-12 mt-8 pt-6 border-t border-gray-200">
        <SigBlock party="You The Licensee" name={tenant?.businessName} />
        <SigBlock party="Us The Licensor" name={BUSINESS_ADDRESS.name} />
      </div>
    </div>
  )
}
