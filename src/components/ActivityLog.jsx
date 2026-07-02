import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Reads the audit_log table (written by lib/audit.js) and renders recent activity.
export default function ActivityLog() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, data, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (live) { setRows(data ?? []); setLoading(false) }
    })()
    return () => { live = false }
  }, [])

  const fmt = (r) => {
    const d = r.data || {}
    const when = d.at || r.created_at
    return {
      when: when ? new Date(when).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—',
      user: d.user || d.actor || d.by || 'System',
      operation: d.operation || d.action || d.type || '—',
      collection: d.collection || d.entity || d.resource || '—',
      target: d.target || d.summary || d.name || '',
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-2">Activity Log</h1>
      <p className="text-sm text-muted-foreground mb-6">Recent changes across the system{rows.length ? ` · ${rows.length} entries` : ''}.</p>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Date', 'User', 'Operation', 'Collection', 'Target'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">No activity recorded yet.</td></tr>
            )}
            {rows.map((r) => {
              const a = fmt(r)
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{a.when}</td>
                  <td className="px-4 py-3 text-foreground">{a.user}</td>
                  <td className="px-4 py-3"><span className="text-blue-700">{a.operation}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{a.collection}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.target}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
