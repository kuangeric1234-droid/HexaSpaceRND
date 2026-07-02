import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase.js'
import { fetchSanityEvents } from '../lib/sanity.js'
import { Plus, Trash2, Edit2, X, Calendar, ExternalLink, RefreshCw } from 'lucide-react'

function fmt(dateStr) {
  try { return format(parseISO(dateStr), 'dd/MM/yyyy') } catch { return dateStr }
}

const EMPTY = {
  title: '',
  date: '',
  time: '',
  location: '',
  description: '',
  imageUrl: '',
  link: '',
}

export default function Events() {
  const [events, setEvents] = useState([])
  const [sanityEvents, setSanityEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | { mode: 'add' | 'edit', event }
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [localRes, sanity] = await Promise.all([
      supabase.from('portal_events').select('data'),
      fetchSanityEvents(),
    ])
    const all = (localRes.data ?? []).map(r => r.data)
    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    setEvents(all)
    setSanityEvents(sanity.sort((a, b) => new Date(b.date) - new Date(a.date)))
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY)
    setModal({ mode: 'add' })
  }

  function openEdit(ev) {
    setForm({ ...EMPTY, ...ev })
    setModal({ mode: 'edit', event: ev })
  }

  async function save() {
    if (!form.title || !form.date) return
    setSaving(true)
    const isNew = modal.mode === 'add'
    const id = isNew ? `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : modal.event.id
    const payload = { ...form, id }
    await supabase.from('portal_events').upsert({ id, data: payload })
    await load()
    setModal(null)
    setSaving(false)

    // Notify active portal members about new events only (not edits)
    if (isNew) {
      fetch('/api/portal/notify-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: payload }),
      }).catch(() => {})
    }
  }

  async function remove(id) {
    if (!confirm('Delete this event?')) return
    await supabase.from('portal_events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Synced from hexaspace.com.au + portal-only events</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-sm border border-input rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/50">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary/90">
            <Plus size={15} /> Add Portal Event
          </button>
        </div>
      </div>

      {/* Sanity events — live from hexaspace.com.au */}
      {sanityEvents.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">From hexaspace.com.au</h2>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Live from Sanity</span>
          </div>
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sanityEvents.map(ev => (
                  <tr key={ev.id} className="hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">{ev.title}</div>
                      {ev.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{ev.description}</div>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{ev.date ? fmt(ev.date) : '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{ev.location || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <a href={ev.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground justify-end">
                        <ExternalLink size={12} /> View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Portal-only local events */}
      <div className="mb-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Portal-Only Events</h2>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-12">Loading…</div>
      ) : events.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl shadow-sm py-10 text-center">
          <Calendar size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm mb-3">No portal-only events. Events from hexaspace.com.au appear above automatically.</p>
          <button onClick={openAdd} className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary/90">
            + Add Portal Event
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Link</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map(ev => (
                <tr key={ev.id} className="hover:bg-muted/50">
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">{ev.title}</div>
                    {ev.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{ev.description}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {fmt(ev.date)}{ev.time ? ` · ${ev.time}` : ''}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{ev.location || '—'}</td>
                  <td className="px-5 py-3">
                    {ev.link ? (
                      <a
                        href={ev.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink size={12} />
                        Link
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(ev)} className="text-muted-foreground hover:text-foreground p-1">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => remove(ev.id)} className="text-muted-foreground hover:text-red-500 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {modal.mode === 'add' ? 'Add Event' : 'Edit Event'}
              </h2>
              <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="Event title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Time</label>
                  <input
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder="e.g. 6:00 PM"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Location</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="7 Distribution Circuit, Huntingdale"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-none"
                  placeholder="Brief description of the event…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Image URL</label>
                <input
                  value={form.imageUrl}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Event Link</label>
                <input
                  value={form.link}
                  onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  className="w-full border border-input rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="https://www.hexaspace.com.au/events/..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-foreground border border-input rounded hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !form.title || !form.date}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving…' : modal.mode === 'add' ? 'Add Event' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
