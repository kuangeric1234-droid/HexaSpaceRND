import { useEffect, useState, useCallback } from 'react'
import { DoorOpen, RefreshCw } from 'lucide-react'
import { authHeaders } from '../lib/apiFetch.js'

// Access Log — who remote-opened which door, from the member app. Reads
// salto_open_log via the admin endpoint (the table is deny-all RLS, so it can't
// be read from the browser client directly). Rows are written 'dispatched' at tap
// and settled to 'opened'/'failed' by the zap's callback.

const KIND_LABEL = { office: 'Office', entry: 'Building entry', room: 'Meeting room' }
const RESULT_STYLE = {
  opened: 'bg-green-100 text-green-800',
  dispatched: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  mock: 'bg-muted text-muted-foreground',
}

export default function AccessLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const qs = new URLSearchParams()
      if (result) qs.set('result', result)
      qs.set('limit', '300')
      const r = await fetch(`/api/salto/open-log?${qs}`, { headers: await authHeaders() })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not load the access log.')
      setEntries(d.entries ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [result])

  useEffect(() => { load() }, [load])

  const fmtWhen = (at) =>
    at ? new Date(at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DoorOpen size={22} strokeWidth={1.6} /> Access Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Remote door unlocks from the member app{entries.length ? ` · ${entries.length} entries` : ''}.
          </p>
        </div>
        <button onClick={load}
          className="shrink-0 inline-flex items-center gap-2 border border-input rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <label className="text-xs text-muted-foreground">Result</label>
        <select value={result} onChange={(e) => setResult(e.target.value)}
          className="border border-input rounded-md px-2 py-1.5 text-sm bg-card">
          <option value="">All</option>
          <option value="opened">Opened</option>
          <option value="dispatched">Dispatched (unconfirmed)</option>
          <option value="failed">Failed</option>
          <option value="mock">Mock</option>
        </select>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {['Time', 'Member', 'Company', 'Door', 'Type', 'Result'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">Loading…</td></tr>}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No unlocks recorded yet.</td></tr>
            )}
            {!loading && entries.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtWhen(e.at)}</td>
                <td className="px-4 py-3 text-foreground">{e.member}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.company}</td>
                <td className="px-4 py-3 text-foreground">
                  {e.door}
                  {e.bookingRef && <span className="text-xs text-muted-foreground ml-1">· {e.bookingRef}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{KIND_LABEL[e.kind] || e.kind}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RESULT_STYLE[e.result] || 'bg-muted text-muted-foreground'}`}>
                    {e.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
