import { DollarSign } from 'lucide-react'

// Fees — one-off & recurring fee types (setup, booking, car parking, etc.).
// Phase 1 scaffold: structure in place, wired to billing in a later phase.
const PLANNED = [
  { name: 'Setup Fee', type: 'One-off', amount: '$150', appliesTo: 'New memberships' },
  { name: 'Booking Fee', type: 'Per booking', amount: 'Varies', appliesTo: 'Meeting rooms / function space' },
  { name: 'Car Parking', type: 'Recurring (monthly)', amount: '$350', appliesTo: 'Allocated bay' },
  { name: 'Late Payment', type: 'One-off', amount: '$80', appliesTo: 'Overdue invoices' },
]

export default function Fees() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Fees</h1>
        <button disabled className="flex items-center gap-2 bg-gray-200 text-gray-400 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed">
          <DollarSign size={15} /> Add Fee
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Fee types applied to members — setup, booking, car-parking and adjustments.
        These are scaffolded now and become editable + billable in the next phase.
      </p>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Type', 'Amount', 'Applies To'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLANNED.map((f) => (
              <tr key={f.name} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{f.name}</td>
                <td className="px-4 py-3 text-gray-600">{f.type}</td>
                <td className="px-4 py-3 text-gray-900">{f.amount}</td>
                <td className="px-4 py-3 text-gray-500">{f.appliesTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
