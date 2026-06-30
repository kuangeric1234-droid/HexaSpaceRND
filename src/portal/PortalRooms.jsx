import { Page, PageHeader, Empty } from './ui.jsx'
import PortalCalendar from './PortalCalendar.jsx'
import { isFunctionSpace } from './functionSpace.js'

export default function PortalRooms({ spaces, allBookings, member, company }) {
  // Function Space is booked via its own (approval-based) tab — keep it out of the hourly calendar.
  const rooms = (spaces ?? []).filter(s => s.type === 'meeting' && !isFunctionSpace(s))
    .sort((a, b) => (a.hourlyRate ?? a.rate ?? 0) - (b.hourlyRate ?? b.rate ?? 0))

  return (
    <Page>
      <PageHeader kicker="Book · By the hour" title="Meeting Rooms">
        Pick an open slot on the calendar to request a booking — recurring options available.
        Our team confirms availability.
      </PageHeader>
      {rooms.length === 0
        ? <Empty label="No rooms available." sub="Please check back soon." />
        : <PortalCalendar resources={rooms} allBookings={allBookings} member={member} company={company} />}
    </Page>
  )
}
