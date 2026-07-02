import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar, ChevronDown, ChevronRight, Mail, Phone, Users, Trash2, Download, Ticket, Bell, Loader2, Check, CalendarPlus } from 'lucide-react'
import { fetchSanityEvents } from '../lib/sanity.js'
import { calendarLinks, sendEventReminders } from '../lib/calendar.js'

function fmtDate(d) {
  if (!d) return ''
  try { return format(parseISO(d), 'dd MMM yyyy') } catch { return d }
}

export default function EventRegistrations({ store }) {
  const { eventRegistrations = [], settings = {}, markRegistrationRead, deleteEventRegistration, markRegistrationsReminded } = store
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState(null)
  const [sendingKey, setSendingKey] = useState(null)
  const [sendMsg, setSendMsg] = useState(null) // { key, text }
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const testEmail = settings?.emails?.notificationEmail || 'info@hexaspace.com.au'

  async function emailSample() {
    setTesting(true); setTestMsg('')
    try {
      const r = await sendEventReminders({ testEmail, eventSlug: events[0]?.slug })
      setTestMsg(`Sample reminder sent to ${r.to} (using "${r.event}"). Check your inbox.`)
    } catch (e) { setTestMsg(`Couldn't send: ${e.message}`) } finally { setTesting(false) }
  }

  useEffect(() => {
    fetchSanityEvents().then((evs) => { setEvents(evs); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Group registrations under their event (match by slug, fallback by name).
  function regsFor(ev) {
    return eventRegistrations.filter((r) =>
      (r.eventSlug && r.eventSlug === ev.slug) || (r.eventName && r.eventName === ev.title))
  }

  const matchedIds = new Set()
  const groups = events.map((ev) => {
    const regs = regsFor(ev)
    regs.forEach((r) => matchedIds.add(r.id))
    return { key: ev.id, title: ev.title, date: ev.date, regs, fromSanity: true, ev, slug: ev.slug }
  })

  async function sendReminders(group, e) {
    e.stopPropagation()
    setSendingKey(group.key); setSendMsg(null)
    try {
      const r = await sendEventReminders({ eventSlug: group.slug, eventName: group.title })
      markRegistrationsReminded(r.remindedIds ?? [])
      setSendMsg({ key: group.key, text: r.sent ? `Reminder emailed to ${r.sent}.` : 'No new recipients — everyone was already reminded.' })
    } catch (err) { setSendMsg({ key: group.key, text: err.message }) } finally { setSendingKey(null) }
  }

  // Registrations whose event isn't in the current Sanity list (past/removed).
  const orphans = eventRegistrations.filter((r) => !matchedIds.has(r.id))
  const orphanGroups = Object.values(
    orphans.reduce((acc, r) => {
      const k = r.eventName || r.eventSlug || 'Unknown event'
      acc[k] = acc[k] ?? { key: `orphan-${k}`, title: k, date: null, regs: [], fromSanity: false, ev: null, slug: null }
      acc[k].regs.push(r)
      return acc
    }, {})
  )

  const allGroups = [...groups, ...orphanGroups].filter((g) => g.fromSanity || g.regs.length > 0)

  function toggle(group) {
    setOpenKey(openKey === group.key ? null : group.key)
    group.regs.filter((r) => !r.read).forEach((r) => markRegistrationRead(r.id))
  }

  function exportCsv(group) {
    const header = ['Name', 'Business', 'Email', 'Phone', 'Guests', 'Message', 'Date']
    const lines = group.regs.map((r) => [r.name, r.businessName, r.email, r.phone, r.guests, (r.message ?? '').replace(/[\n,]/g, ' '), r.createdAt]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${group.title.replace(/\s+/g, '-').toLowerCase()}-registrations.csv`
    a.click()
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading events…</p>

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 flex gap-2 flex-1">
          <Calendar size={15} className="shrink-0 mt-0.5" />
          <div>Events from Sanity appear here. RSVPs are captured into Hexa Space, and a reminder auto-emails registrants the day before the event.</div>
        </div>
        <button onClick={emailSample} disabled={testing}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium border border-input px-3 py-2 rounded-md hover:bg-muted/50 disabled:opacity-40">
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Email me a sample
        </button>
      </div>
      {testMsg && <div className="mb-4 text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-2">{testMsg}</div>}

      {allGroups.length === 0 ? (
        <div className="bg-card border border-border rounded-xl shadow-sm p-12 text-center text-muted-foreground">
          <Ticket size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No events found in Sanity yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allGroups.map((group) => {
            const open = openKey === group.key
            const unread = group.regs.filter((r) => !r.read).length
            const reminded = group.regs.filter((r) => r.reminderSentAt).length
            const cal = group.ev?.startsAt ? calendarLinks({ title: group.ev.title, date: group.ev.startsAt, endDate: group.ev.endsAt, location: group.ev.location, summary: group.ev.description }) : null
            return (
              <div key={group.key} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div onClick={() => toggle(group)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50">
                  {open ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground">{group.title}</div>
                    {group.date && <div className="text-xs text-muted-foreground">{fmtDate(group.date)}</div>}
                  </div>
                  {unread > 0 && <span className="bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unread} new</span>}
                  {reminded > 0 && <span className="text-xs text-green-600 font-medium hidden sm:inline">{reminded} reminded</span>}
                  {group.regs.length > 0 && (
                    <button onClick={(e) => sendReminders(group, e)} disabled={sendingKey === group.key} title="Email a reminder to registrants now"
                      className="flex items-center gap-1 text-xs border border-input px-2 py-1 rounded hover:bg-muted/50 disabled:opacity-40">
                      {sendingKey === group.key ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Remind
                    </button>
                  )}
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users size={14} /> {group.regs.length}</span>
                  {group.regs.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); exportCsv(group) }} title="Export CSV"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Download size={14} /></button>
                  )}
                </div>

                {open && (
                  <div className="border-t border-border">
                    {cal && (
                      <div className="px-4 py-2.5 border-b border-border text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex items-center gap-1"><CalendarPlus size={13} /> Add to calendar:</span>
                        <a href={cal.google} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google</a><span>·</span>
                        <a href={cal.outlook} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Outlook</a><span>·</span>
                        <a href={cal.ical} className="text-blue-600 hover:underline">iCal</a><span>·</span>
                        <a href={cal.yahoo} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Yahoo</a>
                      </div>
                    )}
                    {sendMsg?.key === group.key && <div className="px-4 py-2 text-xs text-green-700 bg-green-50/50">{sendMsg.text}</div>}
                    {group.regs.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground">No registrations yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-border">
                          {group.regs.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).map((r) => (
                            <tr key={r.id} className={!r.read ? 'bg-blue-50/40' : ''}>
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-foreground">{r.name || '—'}</div>
                                {r.businessName && <div className="text-xs text-muted-foreground">{r.businessName}</div>}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">
                                <div className="flex flex-col gap-0.5 text-xs">
                                  {r.email && <span className="flex items-center gap-1"><Mail size={11} /> {r.email}</span>}
                                  {r.phone && <span className="flex items-center gap-1"><Phone size={11} /> {r.phone}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground text-xs">{r.guests ? `${r.guests} guest${r.guests > 1 ? 's' : ''}` : ''}</td>
                              <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                                {fmtDate(r.createdAt?.split('T')[0])}
                                {r.reminderSentAt && <div className="text-green-600 flex items-center gap-1 mt-0.5"><Check size={10} /> reminded</div>}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <button onClick={() => { if (window.confirm('Delete this registration?')) deleteEventRegistration(r.id) }}
                                  className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
