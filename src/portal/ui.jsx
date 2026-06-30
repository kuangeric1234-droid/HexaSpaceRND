// ─────────────────────────────────────────────────────────────────────────────
// Hexa Space member portal — shared UI kit.
// Quiet-luxury language mirrored from the marketing site (hexaspace.com.au):
// Rework Micro labels, Big Daily Short display, GT America body, hexa-green accent.
// ─────────────────────────────────────────────────────────────────────────────
import { format, parseISO } from 'date-fns'

export function fmt(dateStr) {
  if (!dateStr) return '—'
  try { return format(typeof dateStr === 'string' ? parseISO(dateStr) : dateStr, 'dd MMM yyyy') }
  catch { return '—' }
}

export function money(n) {
  return `A$${Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function money0(n) {
  return `A$${Number(n ?? 0).toLocaleString('en-AU')}`
}

/** 24h "14:00" → "2:00 pm" (booking times use the admin 24h format). */
export function to12(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return t
  const ap = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${ap}`
}

/** Resolve a booking's room/space label from the spaces list. */
export function bookingName(spaces, b) {
  return spaces?.find((s) => s.id === b.resourceId)?.unitNumber || b.resourceName || b.title || 'Booking'
}

/** Page wrapper — bone background, generous rhythm. */
export function Page({ children }) {
  return <div className="hx-rise px-5 md:px-10 py-8 md:py-12 max-w-6xl mx-auto">{children}</div>
}

/** Editorial page header: small kicker + large serif/heading title. */
export function PageHeader({ kicker, title, children, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-ink/10 pb-7 mb-9">
      <div>
        {kicker && <p className="hx-eyebrow mb-3">{kicker}</p>}
        <h1 className="hx-display">{title}</h1>
        {children && <p className="hx-prose mt-4 max-w-xl">{children}</p>}
      </div>
      {action}
    </div>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <p className={`hx-eyebrow ${className}`}>{children}</p>
}

export function Card({ children, className = '' }) {
  return <div className={`hx-card ${className}`}>{children}</div>
}

/** Underlined sub-tabs (Profile / Team Members / …) like the OfficeRND screens. */
export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-ink/10 mb-9">
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.key
        const label = typeof t === 'string' ? t : t.label
        const on = key === active
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative -mb-px pb-3 font-heading uppercase tracking-nav text-[11px] transition-colors ${
              on ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
            {on && <span className="absolute inset-x-0 -bottom-px h-px bg-hexa-green" />}
          </button>
        )
      })}
    </div>
  )
}

/** Soft segmented filter (All / Pending / …). */
export function Segmented({ options, active, onChange }) {
  return (
    <div className="inline-flex flex-wrap gap-1 border border-ink/10 p-1 bg-paper">
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.key
        const label = typeof o === 'string' ? o : o.label
        const on = key === active
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-4 py-1.5 font-heading uppercase tracking-nav text-[10px] transition-colors ${
              on ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

const STATUS_TONE = {
  paid: 'text-hexa-green border-hexa-green/40 bg-hexa-green/5',
  active: 'text-hexa-green border-hexa-green/40 bg-hexa-green/5',
  confirmed: 'text-hexa-green border-hexa-green/40 bg-hexa-green/5',
  pending: 'text-amber-700 border-amber-300 bg-amber-50',
  overdue: 'text-red-700 border-red-300 bg-red-50',
  cancelled: 'text-red-700 border-red-300 bg-red-50',
  voided: 'text-muted border-ink/15 bg-bone',
  draft: 'text-muted border-ink/15 bg-bone',
  completed: 'text-muted border-ink/15 bg-bone',
  expired: 'text-muted border-ink/15 bg-bone',
}

export function StatusBadge({ status }) {
  const key = String(status ?? '').toLowerCase()
  const tone = STATUS_TONE[key] ?? STATUS_TONE.draft
  return (
    <span className={`inline-block font-heading uppercase tracking-label text-[9px] px-2.5 py-1 border ${tone}`}>
      {status}
    </span>
  )
}

/** Empty state — centered hairline note. */
export function Empty({ label = 'Nothing here yet.', sub }) {
  return (
    <div className="hx-card py-16 px-6 text-center">
      <p className="font-display font-extralight text-2xl text-ink/70">{label}</p>
      {sub && <p className="hx-prose mt-2">{sub}</p>}
    </div>
  )
}

/** Two-column key/value field used across Account/Billing. */
export function Field({ label, value }) {
  return (
    <div>
      <div className="hx-eyebrow mb-1.5">{label}</div>
      <div className="font-body text-[15px] text-ink">{value || '—'}</div>
    </div>
  )
}

/** Monogram avatar (initials) — matches the OfficeRND member cards. */
export function Monogram({ name = '', className = '' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  return (
    <div className={`flex items-center justify-center bg-stone text-ink/50 font-heading tracking-label text-sm ${className}`}>
      {initials || '—'}
    </div>
  )
}
