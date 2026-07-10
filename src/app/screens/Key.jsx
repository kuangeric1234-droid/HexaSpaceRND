import { useState, useEffect, useRef, useCallback } from 'react'
import { KeyRound, Check, ArrowUpRight, DoorOpen, Building2, CalendarClock } from 'lucide-react'
import { useApp } from '../context.js'
import { Screen, BackHeader, Label, Card, Rule } from '../ui.jsx'
import { apiUrl } from '../lib/native.js'
import { authHeaders } from '../../lib/apiFetch.js'
import { saltoWebUrl } from '../lib/doorAccess.js'

// My key — tap-to-unlock the doors a member may open right now. The server
// decides the list (own office from an active lease · building entry for their
// floor · a meeting room they've booked, live in its window) and authorizes each
// open; this screen just renders the tiles and fires the unlock. Building entry
// used to be fob-only — now a member's floor entries appear here too.

const GROUPS = [
  { kind: 'office', title: 'Your office', icon: DoorOpen, empty: null },
  { kind: 'entry', title: 'Building entry', icon: Building2, empty: null },
  { kind: 'room', title: 'Open now — your booking', icon: CalendarClock, empty: null },
]

export default function Key() {
  const { data } = useApp()
  const [info, setInfo] = useState(null) // { enabled, doors, remaining }

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/salto/open'), { headers: await authHeaders() })
      const d = r.ok ? await r.json() : null
      setInfo(d ?? { enabled: false, doors: [] })
    } catch { setInfo({ enabled: false, doors: [] }) }
  }, [])

  // Refetch on focus too — a booked room's tile appears when its window opens.
  useEffect(() => {
    let alive = true
    ;(async () => { await load(); if (!alive) return })()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  const doors = info?.doors ?? []
  const hasKey = info?.enabled && doors.length > 0

  // POST an unlock; returns updated remaining or throws with a message.
  async function unlock(door) {
    const r = await fetch(apiUrl('/api/salto/open'), {
      method: 'POST', headers: await authHeaders(),
      body: JSON.stringify({ doorId: door.id }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Could not unlock — try your fob or the Salto app.')
    if (Number.isFinite(d.remaining)) setInfo((p) => (p ? { ...p, remaining: d.remaining } : p))
    return d
  }

  return (
    <Screen>
      <BackHeader title="My key" />

      {!info && (
        <Card className="p-6 mt-4"><p className="hx-prose text-[13px]">Checking your access…</p></Card>
      )}

      {info && hasKey && (
        <div className="mt-4 space-y-8">
          {GROUPS.map(({ kind, title, icon: Icon }) => {
            const group = doors.filter((d) => d.kind === kind)
            if (!group.length) return null
            return (
              <section key={kind}>
                <Label className="mb-3 flex items-center gap-2">
                  <Icon size={13} strokeWidth={1.6} /> {title}
                </Label>
                <div className="space-y-2.5">
                  {group.map((door) => (
                    <DoorTile key={door.id} door={door} onUnlock={() => unlock(door)} />
                  ))}
                </div>
              </section>
            )
          })}

          {Number.isFinite(info.remaining) && info.remaining <= 3 && (
            <p className="text-center hx-prose text-[11px]">
              {info.remaining} unlock{info.remaining === 1 ? '' : 's'} left today
            </p>
          )}
        </div>
      )}

      {info && !hasKey && (
        <Card className="p-6 mt-6 text-center">
          <KeyRound size={20} strokeWidth={1.4} className="mx-auto text-portal-muted" />
          <p className="hx-prose text-[13px] mt-3">
            In-app unlock isn’t set up for your membership yet — your key lives in the Salto app below.
          </p>
        </Card>
      )}

      {/* Fallback — the Salto BLE key, always available at the reader */}
      <Rule className="mt-10 mb-6" />
      <Label className="mb-3">Your mobile key</Label>
      <Card className="p-5">
        <p className="hx-prose text-[13px] text-ink">
          Every door also opens with your access pass, or the Salto app held at the reader —
          including after hours if your membership has 24/7 access.
        </p>
      </Card>
      <button onClick={() => window.open(saltoWebUrl(data.settings), '_blank', 'noopener')}
        className="mt-4 w-full min-h-[48px] border border-ink/15 font-heading uppercase tracking-nav text-[11px] text-ink flex items-center justify-center gap-2 active:bg-bone">
        <ArrowUpRight size={14} /> Open the Salto app
      </button>
    </Screen>
  )
}

// A single openable door. Manages its own tap → unlocking → open/error lifecycle
// and resets to idle after a few seconds.
function DoorTile({ door, onUnlock }) {
  const [phase, setPhase] = useState('idle') // idle | unlocking | open | error
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function tap() {
    if (phase === 'unlocking' || phase === 'open') return
    setPhase('unlocking'); setError('')
    try {
      await onUnlock()
      setPhase('open')
      if (navigator.vibrate) navigator.vibrate(30)
      timer.current = setTimeout(() => setPhase('idle'), 6000)
    } catch (e) {
      setPhase('error'); setError(e.message)
      timer.current = setTimeout(() => setPhase('idle'), 6000)
    }
  }

  const open = phase === 'open'
  const unlocking = phase === 'unlocking'
  const isErr = phase === 'error'

  return (
    <button onClick={tap} disabled={unlocking} aria-label={`Unlock ${door.label}`}
      className={`w-full text-left flex items-center gap-4 p-4 border transition-all active:scale-[0.99]
        ${open ? 'bg-hexa-green border-hexa-green text-paper'
          : unlocking ? 'bg-ink border-ink text-paper animate-pulse'
          : isErr ? 'bg-paper border-red-300'
          : 'bg-paper border-ink/15 text-ink active:bg-bone'}`}>
      <span className={`h-11 w-11 shrink-0 rounded-full border flex items-center justify-center
        ${open ? 'border-paper/40' : unlocking ? 'border-paper/40' : 'border-ink/20'}`}>
        {open ? <Check size={20} strokeWidth={1.6} />
          : unlocking ? <DoorOpen size={20} strokeWidth={1.4} />
          : <KeyRound size={20} strokeWidth={1.4} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display font-extralight text-xl leading-tight block truncate">{door.label}</span>
        <span className={`hx-prose text-[12px] block truncate ${open || unlocking ? 'text-paper/80' : isErr ? 'text-red-700' : 'text-portal-muted'}`}>
          {open ? 'Unlocked — give it a few seconds, then push.'
            : unlocking ? 'Unlocking…'
            : isErr ? error
            : (door.sublabel || 'Tap to unlock')}
        </span>
      </span>
    </button>
  )
}
