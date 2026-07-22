import { useState, useEffect } from 'react'
import { MonitorPlay, Plus, Trash2, ArrowUp, ArrowDown, Copy, ExternalLink, Check, RefreshCw, Wand2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { cloneBoard } from '../lib/directoryData.js'
import { buildDirectoryBoard } from '../lib/directoryAuto.js'

const nowIso = () => new Date().toISOString()
const LEVELS = ['4', '2']

// Where the TVs live. Prefer the real deployment host; fall back to whatever
// origin the admin is browsing from (e.g. localhost during dev).
function publicOrigin() {
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return window.location.origin
  return 'https://portal.hexaspace.com.au'
}

export default function Directory() {
  const [level, setLevel] = useState('4')
  const [boards, setBoards] = useState({ '4': cloneBoard('4'), '2': cloneBoard('2') })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)   // level that was just saved
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('directory_boards').select('id, data')
      const next = { '4': cloneBoard('4'), '2': cloneBoard('2') }
      ;(data ?? []).forEach((row) => { if (row.data && next[row.id]) next[row.id] = row.data })
      setBoards(next)
    } catch { /* keep seed */ }
    setLoading(false)
  }

  const board = boards[level]
  // The TV-safe standalone page (plain HTML, renders on old Samsung/Tizen
  // browsers that white-screen on the React bundle). /directory/<level> still
  // works too, for previewing on a normal computer.
  const link = `${publicOrigin()}/tv.html?level=${level}`

  function patchBoard(patch) {
    setBoards((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }))
    setSavedAt(null)
  }
  function patchSuite(idx, patch) {
    const suites = board.suites.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    patchBoard({ suites })
  }
  function addSuite() {
    const last = board.suites[board.suites.length - 1]
    const nextNum = last ? String((parseInt(last.suite, 10) || board.suites.length) + 1) : '1'
    patchBoard({ suites: [...board.suites, { suite: nextNum, name: '' }] })
  }
  function removeSuite(idx) {
    patchBoard({ suites: board.suites.filter((_, i) => i !== idx) })
  }
  function moveSuite(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= board.suites.length) return
    const suites = [...board.suites]
    ;[suites[idx], suites[j]] = [suites[j], suites[idx]]
    patchBoard({ suites })
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const { error } = await supabase
        .from('directory_boards')
        .upsert({ id: level, data: board, updated_at: nowIso() })
      if (error) throw error
      setSavedAt(level)
    } catch (e) {
      setError(e?.message || 'Could not save. Has the directory_boards table been created in Supabase?')
    }
    setSaving(false)
  }

  function copyLink() {
    navigator.clipboard?.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // Pull live occupancy into the editor: suites from active office contracts,
  // community from VO/desk memberships. Existing display text is kept where
  // the occupant hasn't changed. Nothing is saved until you hit Save.
  async function fillFromLive() {
    setSyncing(true)
    setError('')
    try {
      const [t, l, s] = await Promise.all(
        ['tenants', 'leases', 'spaces'].map((tb) => supabase.from(tb).select('data'))
      )
      const live = {
        tenants: (t.data ?? []).map((r) => r.data),
        leases: (l.data ?? []).map((r) => r.data),
        spaces: (s.data ?? []).map((r) => r.data),
      }
      patchBoard(buildDirectoryBoard(level, board, live))
    } catch (e) {
      setError(e?.message || 'Could not load live data.')
    }
    setSyncing(false)
  }

  const communityText = (board.community || []).join('\n')

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><MonitorPlay size={22} /> Directory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit the lobby TV boards. Names here are what shows on the screen — set a clean display
            name (drop the "Pty Ltd" if you like). Hit <span className="font-medium text-foreground">Save &amp; Generate</span>,
            paste the link into the TV once, and it updates itself whenever you edit.
          </p>
        </div>
        <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-md" title="Reload"><RefreshCw size={15} /></button>
      </div>

      {/* level toggle */}
      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {LEVELS.map((lv) => (
          <button
            key={lv}
            onClick={() => { setLevel(lv); setCopied(false) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${level === lv ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Level {lv}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          {/* link card */}
          <div className="border border-border rounded-lg bg-card p-4 mb-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">TV link — Level {level}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 truncate text-sm bg-muted/60 rounded px-3 py-2 text-foreground">{link}</code>
              <button onClick={copyLink} className="flex items-center gap-1.5 border border-input rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/50">
                {copied ? <><Check size={14} className="text-green-600" /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border border-input rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/50">
                <ExternalLink size={14} /> Open display
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-2">This link never changes. Editing and re-saving refreshes the board on any TV already showing it (within ~30s).</p>
          </div>

          {/* live-data sync */}
          <div className="border border-border rounded-lg bg-card p-4 mb-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <label className="flex items-start gap-2.5 text-sm cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!board.autoSync}
                  onChange={(e) => patchBoard({ autoSync: e.target.checked })}
                />
                <span>
                  <span className="font-medium text-foreground">Auto-update this board from live data</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Refreshes every morning with the daily reconcile: suites from active office contracts,
                    community members from virtual office &amp; desk memberships. Your polished display names
                    (bilingual lines, shared-suite pairings) are kept while the occupant stays the same.
                  </span>
                </span>
              </label>
              <button
                onClick={fillFromLive}
                disabled={syncing}
                className="flex items-center gap-1.5 text-sm border border-input rounded-md px-3 py-2 font-medium hover:bg-muted/50 disabled:opacity-50 shrink-0"
              >
                <Wand2 size={14} /> {syncing ? 'Loading…' : 'Refresh from live data now'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The refresh fills the editor below — review it, fix anything odd, then Save. Tip: run this once and
              compare against the current board before ticking auto-update; differences usually mean a contract on
              the platform needs correcting.
            </p>
          </div>

          {/* suites editor */}
          <div className="border border-border rounded-lg bg-card overflow-hidden mb-6">
            <div className="flex items-center px-4 py-2.5 text-xs text-muted-foreground uppercase border-b border-border font-medium">
              <div className="w-20">Suite</div>
              <div className="flex-1">Business name shown on board</div>
              <div className="w-24 text-right">Order</div>
            </div>
            {board.suites.map((s, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0">
                <input
                  value={s.suite}
                  onChange={(e) => patchSuite(i, { suite: e.target.value })}
                  className="w-16 border border-border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <textarea
                  value={s.name}
                  onChange={(e) => patchSuite(i, { name: e.target.value })}
                  rows={s.name?.includes('\n') ? 2 : 1}
                  placeholder="Display name (Enter for a second line, e.g. a Chinese name)"
                  className="flex-1 border border-border rounded px-2.5 py-1.5 text-sm bg-background resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex items-center gap-1 pt-0.5">
                  <button onClick={() => moveSuite(i, -1)} disabled={i === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ArrowUp size={14} /></button>
                  <button onClick={() => moveSuite(i, 1)} disabled={i === board.suites.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ArrowDown size={14} /></button>
                  <button onClick={() => removeSuite(i)} className="p-1.5 text-muted-foreground hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            <div className="px-4 py-3">
              <button onClick={addSuite} className="flex items-center gap-1.5 text-sm text-foreground border border-input rounded-md px-3 py-1.5 font-medium hover:bg-muted/50">
                <Plus size={14} /> Add suite
              </button>
            </div>
          </div>

          {/* community members (Level 4 style boards) */}
          <div className="border border-border rounded-lg bg-card p-4 mb-6">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!board.showCommunity}
                onChange={(e) => patchBoard({ showCommunity: e.target.checked })}
              />
              Show a “{board.communityHeading || 'Community Members'}” list under the suites
            </label>
            {board.showCommunity && (
              <>
                <p className="text-xs text-muted-foreground mb-2">One business per line. They’re laid out into three columns automatically.</p>
                <textarea
                  value={communityText}
                  onChange={(e) => patchBoard({ community: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
                  rows={12}
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-background font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="text-xs text-muted-foreground mt-1">{(board.community || []).length} businesses</div>
              </>
            )}
          </div>

          {/* save bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save & Generate'}
            </button>
            {savedAt === level && !error && (
              <span className="flex items-center gap-1.5 text-sm text-green-600"><Check size={15} /> Saved — the TV will update within ~30s.</span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  )
}
