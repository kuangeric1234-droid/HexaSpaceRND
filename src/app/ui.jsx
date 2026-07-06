// ─────────────────────────────────────────────────────────────────────────────
// Hexa Space member app — phone-first UI kit.
// Editorial members-club language: bone ground, charcoal ink, hairline rules,
// serif display, small tracked caps. Big tap targets throughout (44px+).
// Formatting helpers are reused from the portal kit — one brand, one voice.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export { fmt, money, money0, to12, bookingName, StatusBadge } from '../portal/ui.jsx'

/** Scrollable screen body — leaves room for the fixed tab bar. */
export function Screen({ children, className = '' }) {
  return <div className={`app-safe-top px-5 pb-32 ${className}`}>{children}</div>
}

/** Small tracked-caps label (the app's kicker). */
export function Label({ children, className = '' }) {
  return <p className={`hx-eyebrow ${className}`}>{children}</p>
}

/** Large serif display line — the Eclat-style greeting/headline. */
export function Display({ children, className = '' }) {
  return <h1 className={`font-display font-extralight leading-[1.05] text-ink text-[34px] ${className}`}>{children}</h1>
}

/** Hairline rule. */
export function Rule({ className = '' }) {
  return <div className={`border-t border-ink/10 ${className}`} />
}

/** Stack-screen header: back chevron + tracked title. */
export function BackHeader({ title, fallback = '/', right = null }) {
  const nav = useNavigate()
  const goBack = () => (window.history.length > 1 ? nav(-1) : nav(fallback))
  return (
    <div className="flex items-center justify-between pt-5 pb-4">
      <button onClick={goBack} aria-label="Back"
        className="-ml-2 h-11 w-11 flex items-center justify-center text-ink active:opacity-60">
        <ChevronLeft size={22} strokeWidth={1.5} />
      </button>
      <span className="font-heading uppercase tracking-nav text-[12px] text-ink">{title}</span>
      <span className="h-11 w-11 flex items-center justify-center">{right}</span>
    </div>
  )
}

/** White card on the bone ground. */
export function Card({ children, className = '', onClick }) {
  const cls = `bg-paper border border-ink/10 ${onClick ? 'active:bg-bone transition-colors text-left w-full' : ''} ${className}`
  return onClick
    ? <button onClick={onClick} className={cls}>{children}</button>
    : <div className={cls}>{children}</div>
}

/** Tappable list row — icon · label/sub · right slot. Min 56px tall. */
export function Row({ icon: Icon, label, sub, right, onClick, className = '' }) {
  const inner = (
    <>
      {Icon && <Icon size={17} strokeWidth={1.5} className="text-ink shrink-0" />}
      <span className="flex-1 min-w-0 text-left">
        <span className="block font-heading uppercase tracking-nav text-[11px] text-ink truncate">{label}</span>
        {sub && <span className="block hx-prose text-[12px] truncate mt-0.5">{sub}</span>}
      </span>
      {right}
    </>
  )
  const cls = `w-full flex items-center gap-4 min-h-[56px] py-3 ${className}`
  return onClick
    ? <button onClick={onClick} className={`${cls} active:opacity-60 transition-opacity`}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

/** Small chip — status / count / meta. */
export function Chip({ children, tone = 'ink', className = '' }) {
  const tones = {
    ink: 'border-ink/20 text-ink',
    green: 'border-hexa-green/50 text-hexa-green',
    paper: 'border-paper/30 text-paper',
    amber: 'border-amber-400 text-amber-700 bg-amber-50',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 font-heading uppercase tracking-label text-[9px] px-2.5 py-1 border ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

/** Full-width primary button (filled ink) — the app's main CTA. */
export function BigButton({ children, onClick, disabled, tone = 'ink', className = '' }) {
  const tones = {
    ink: 'bg-ink text-paper active:bg-charcoal',
    outline: 'border border-ink text-ink bg-transparent active:bg-ink active:text-paper',
  }
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full min-h-[52px] px-6 font-heading uppercase tracking-nav text-[11px] transition-colors disabled:opacity-40 ${tones[tone]} ${className}`}>
      {children}
    </button>
  )
}

/** Bottom sheet. */
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])
  if (!open) return null
  return (
    <div className="app-sheet-backdrop" onClick={onClose}>
      <div className="app-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-ink/15" />
        {title && <p className="hx-eyebrow text-center mt-4">{title}</p>}
        <div className="px-5 pb-8 pt-4">{children}</div>
      </div>
    </div>
  )
}

/**
 * Room/studio photo. Sources, in order: space.photo URL (set on the space
 * record), then /rooms/<space id>.jpg in public/. When neither exists,
 * falls back to the typographic monogram plate ('plate') or renders nothing
 * ('none' — for hero slots that shouldn't waste space empty).
 */
export function RoomPhoto({ room, className = '', fallback = 'plate' }) {
  const [failed, setFailed] = useState(false)
  const src = room.photo || `/rooms/${room.id}.jpg`
  const dark = room.type !== 'meeting'
  if (failed) {
    if (fallback === 'none') return null
    return (
      <span className={`flex items-center justify-center font-display font-extralight ${dark ? 'bg-charcoal text-paper/85' : 'bg-stone text-ink/70'} ${className}`}>
        {(room.unitNumber || '?').charAt(0).toUpperCase()}
      </span>
    )
  }
  return <img src={src} alt={room.unitNumber} onError={() => setFailed(true)} className={`block object-cover ${className}`} />
}

/** Centered empty note. */
export function EmptyNote({ label, sub }) {
  return (
    <div className="py-14 text-center">
      <p className="font-display font-extralight text-xl text-ink/60">{label}</p>
      {sub && <p className="hx-prose text-[13px] mt-2">{sub}</p>}
    </div>
  )
}
