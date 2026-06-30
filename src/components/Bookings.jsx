import { useOutletContext, useNavigate } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'

// Bookings — meeting-room & function-space reservations. Phase 1 scaffold:
// lists the bookable rooms (from spaces of type 'meeting'); the calendar +
// booking flow comes in a later phase.
export default function Bookings() {
  const { spaces = [] } = useOutletContext()
  const navigate = useNavigate()
  const rooms = spaces.filter((s) => s.type === 'meeting')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <button disabled className="flex items-center gap-2 bg-gray-200 text-gray-400 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed">
          <CalendarCheck size={15} /> New Booking
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Meeting-room & function-space bookings. The calendar and booking flow
        (with member booking from the website) are scheduled for the next phase.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400 text-sm">
            No bookable rooms found. Add spaces of type “Meeting Room” to see them here.
          </div>
        )}
        {rooms.map((r) => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-md p-5">
            <div className="flex items-start justify-between">
              <span className="text-lg font-bold text-gray-900">{r.unitNumber}</span>
              {r.hourlyRate != null && (
                <span className="text-sm font-semibold text-gray-900">${r.hourlyRate}/hr</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">{r.size}</p>
            {r.attributes && <p className="text-xs text-gray-400 mt-2 leading-relaxed">{r.attributes}</p>}
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/spaces')} className="mt-6 text-sm text-blue-700 hover:underline">
        Manage rooms in Spaces →
      </button>
    </div>
  )
}
