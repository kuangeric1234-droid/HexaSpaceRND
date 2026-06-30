import { useState, useEffect } from 'react'
import { format, parseISO, isFuture, isToday } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { fetchSanityEvents } from '../lib/sanity.js'
import { Calendar, MapPin, ExternalLink } from 'lucide-react'
import { Page, PageHeader, Card, Eyebrow, Empty } from './ui.jsx'

function fmtDate(dateStr) {
  try { return format(parseISO(dateStr), 'EEEE, d MMMM yyyy') } catch { return dateStr }
}
function isUpcoming(dateStr) {
  try { const d = parseISO(dateStr); return isFuture(d) || isToday(d) } catch { return true }
}

export default function PortalEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [sanityEvents, localRes] = await Promise.all([
        fetchSanityEvents(),
        supabase.from('portal_events').select('data'),
      ])
      const localEvents = (localRes.data ?? []).map(r => ({ ...r.data, source: 'local' }))
      const all = [...sanityEvents, ...localEvents]
      all.sort((a, b) => new Date(a.date) - new Date(b.date))
      setEvents(all)
      setLoading(false)
    }
    load()
  }, [])

  const upcoming = events.filter(e => e.date && isUpcoming(e.date))
  const past = events.filter(e => e.date && !isUpcoming(e.date))

  return (
    <Page>
      <PageHeader
        kicker="Community · Programming"
        title="Events"
        action={
          <a href="https://www.hexaspace.com.au/events" target="_blank" rel="noopener noreferrer" className="hx-btn-ghost">
            <ExternalLink size={12} /> hexaspace.com.au/events
          </a>
        }
      />

      {loading ? (
        <p className="hx-prose text-center py-12">Loading events…</p>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <Empty label="No upcoming events." sub="Check hexaspace.com.au for the latest programming." />
      ) : (
        <div className="space-y-12">
          {upcoming.length > 0 && (
            <section>
              <Eyebrow className="mb-5">Upcoming</Eyebrow>
              <div className="grid gap-px bg-ink/10 sm:grid-cols-2">
                {upcoming.map(event => <EventCard key={event.id} event={event} />)}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <Eyebrow className="mb-5">Past events</Eyebrow>
              <div className="grid gap-px bg-ink/10 sm:grid-cols-2 opacity-70">
                {past.slice(0, 6).map(event => <EventCard key={event.id} event={event} past />)}
              </div>
            </section>
          )}
        </div>
      )}
    </Page>
  )
}

function EventCard({ event, past }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      {event.imageUrl && (
        <div className="relative aspect-[16/9] overflow-hidden">
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div className="p-6 flex-1 flex flex-col">
        <h3 className="font-display font-extralight text-2xl">{event.title}</h3>
        <div className="space-y-1.5 mt-3">
          {event.date && (
            <div className="flex items-center gap-2 hx-prose text-[13px]">
              <Calendar size={13} /> {fmtDate(event.date)}{event.time && event.time !== '12:00 am' ? ` · ${event.time}` : ''}
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2 hx-prose text-[13px]"><MapPin size={13} /> {event.location}</div>
          )}
        </div>
        {event.description && <p className="hx-prose text-[14px] mt-3 flex-1">{event.description}</p>}
        {event.link && !past && (
          <a href={event.link} target="_blank" rel="noopener noreferrer" className="hx-btn-ghost mt-5 self-start">
            Learn more <ExternalLink size={12} />
          </a>
        )}
      </div>
    </Card>
  )
}
