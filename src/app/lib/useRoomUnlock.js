import { useState } from 'react'
import { apiUrl } from './native.js'
import { authHeaders } from '../../lib/apiFetch.js'
import { saltoWebUrl } from './doorAccess.js'

// One-tap unlock for a live meeting-room booking. POSTs straight to
// /api/salto/open with the booking's room door id (the server re-resolves and
// authorizes it) — no GET round-trip. If the room isn't linked to a Salto lock
// (or remote unlock is off), we fall back to opening the Salto app so the tap
// still gets the member through the door.
//   phase: 'idle' | 'unlocking' | 'open'
export function useRoomUnlock(booking, settings) {
  const [phase, setPhase] = useState('idle')

  async function unlock() {
    if (!booking || phase === 'unlocking' || phase === 'open') return
    setPhase('unlocking')
    try {
      const r = await fetch(apiUrl('/api/salto/open'), {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ doorId: `room:${booking.id}` }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && (d.dispatched || d.opened || d.mock)) {
        setPhase('open'); if (navigator.vibrate) navigator.vibrate(30)
        setTimeout(() => setPhase('idle'), 6000)
        return
      }
      if (r.status === 429) { setPhase('idle'); alert(d.error || 'Daily unlock limit reached — use your pass or the Salto app.'); return }
      // Not linked to a lock / remote-open disabled → hand off to the Salto app.
      setPhase('idle'); window.open(saltoWebUrl(settings), '_blank', 'noopener')
    } catch {
      setPhase('idle'); window.open(saltoWebUrl(settings), '_blank', 'noopener')
    }
  }

  return { phase, unlock }
}
