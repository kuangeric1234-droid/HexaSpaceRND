import { useState, useEffect } from 'react'
import { Rocket, RefreshCw, Send, BellRing, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { authHeaders } from '../lib/apiFetch.js'

// Migration blast board — who should have portal access, who's been invited,
// who has actually registered (signed in at least once). Invites go out in
// batches via POST /api/auth/bulk-invite; each member is stamped so batches
// never double-send. Copy lives in settings.emailTemplates.portal_invite /
// portal_invite_reminder ({{firstName}} / {{businessName}} placeholders).

export default function MigrationPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null) // 'invite' | 'remind'
  const [result, setResult] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/auth/adoption', { headers: await authHeaders() })
      const d = await r.json().catch(() => null)
      if (r.ok) setData(d)
    } finally { setLoading(false) }
  }

  async function run(mode) {
    const label = mode === 'invite' ? 'portal invites' : 'reminders'
    if (!confirm(`Send the next batch of ${label} (up to 60 emails)?`)) return
    setBusy(mode); setResult(null)
    try {
      const r = await fetch('/api/auth/bulk-invite', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ mode, limit: 60 }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Send failed.')
      setResult({ mode, ...d })
      await load()
    } catch (e) {
      setResult({ error: e.message })
    } finally { setBusy(null) }
  }

  if (loading && !data) return null
  if (!data) return null
  const { counts, rows } = data
  const pending = rows.filter((r) => !r.signedInAt)
  const pct = counts.active ? Math.round((counts.registered / counts.active) * 100) : 0

  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Rocket size={16} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground">Portal migration</h2>
          <p className="text-xs text-muted-foreground">Invite every active member ahead of the 1 Aug cutover — batched, tracked, no double-sends.</p>
        </div>
        <button onClick={load} className="p-1.5 text-muted-foreground hover:text-foreground" title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          ['Active members', counts.active, 'text-foreground'],
          [`Registered (${pct}%)`, counts.registered, 'text-green-600'],
          ['Invited, awaiting', counts.invited, 'text-amber-600'],
          ['Not yet invited', counts.notInvited, 'text-muted-foreground'],
        ].map(([label, n, cls]) => (
          <div key={label} className="bg-muted/50 border border-border rounded-md px-4 py-3">
            <div className={`text-2xl font-bold tabular-nums ${cls}`}>{n}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => run('invite')} disabled={!!busy || counts.notInvited === 0}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
          <Send size={14} /> {busy === 'invite' ? 'Sending…' : `Invite next batch (${Math.min(60, counts.notInvited)})`}
        </button>
        <button onClick={() => run('remind')} disabled={!!busy || counts.invited === 0}
          className="flex items-center gap-2 border border-input px-4 py-2 rounded-md text-sm font-medium hover:bg-muted/50 disabled:opacity-40">
          <BellRing size={14} /> {busy === 'remind' ? 'Sending…' : 'Remind un-registered'}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {pending.length} outstanding
        </button>
      </div>

      {result && (
        result.error
          ? <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{result.error}</div>
          : <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              <CheckCircle2 size={14} /> Sent {result.sent} {result.mode === 'invite' ? 'invites' : 'reminders'}
              {result.failed?.length ? ` · ${result.failed.length} failed (${result.failed.map((f) => f.email).join(', ')})` : ''}
              {result.remaining ? ` · ${result.remaining} left for the next batch` : ' · all done'}
            </div>
      )}

      {open && (
        <div className="mt-4 border border-border rounded-md overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground sticky top-0">
              <tr>{['Member', 'Company', 'Invited', 'Reminded', 'Status'].map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-foreground">{r.name}<div className="text-muted-foreground">{r.email}</div></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.company}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.invitedAt ? r.invitedAt.slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.remindedAt ? r.remindedAt.slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${r.invitedAt ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                      {r.invitedAt ? 'Awaiting sign-up' : 'Not invited'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
