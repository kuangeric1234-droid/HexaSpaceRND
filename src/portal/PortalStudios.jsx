import { Page, PageHeader, Empty } from './ui.jsx'
import PortalCalendar from './PortalCalendar.jsx'

export default function PortalStudios({ spaces, allBookings, member, company }) {
  const studios = (spaces ?? []).filter(s => s.type === 'studio' || s.type === 'podcast')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'studio' ? -1 : 1))

  return (
    <Page>
      <PageHeader kicker="Create · Media & Podcast" title="Studios">
        Media studios and a broadcast-ready podcast room. Choose a slot to request your session —
        recurring bookings welcome.
      </PageHeader>
      {studios.length === 0
        ? <Empty label="No studios available." sub="Please check back soon." />
        : <PortalCalendar resources={studios} allBookings={allBookings} member={member} company={company} />}
    </Page>
  )
}
